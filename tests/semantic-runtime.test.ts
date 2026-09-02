import { describe, expect, it } from "vitest";
import { SEMANTIC_COMMANDS } from "../apps/web/src/semantic/semanticCommands";
import { createSemanticRuntime } from "../apps/web/src/semantic/semanticRuntime";
import {
  SEMANTIC_RUNTIME_VERSION,
  type SemanticEditorAdapter,
  type SemanticObjectDescriptor
} from "../apps/web/src/semantic/semanticTypes";

function descriptor(objectId: string): SemanticObjectDescriptor {
  return {
    objectId,
    type: "shape",
    depth: 0,
    pathObjectIds: [objectId],
    bounds: { left: 0, top: 0, width: 10, height: 10 },
    position: { x: 0, y: 0 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    visible: true,
    selectable: true,
    style: {}
  };
}

function fakeAdapter(ready = true): SemanticEditorAdapter & {
  calls: string[];
  objectIds: string[];
  transactions: number;
} {
  const state = {
    calls: [] as string[],
    objectIds: [] as string[],
    transactions: 0
  };
  const adapter = {
    calls: state.calls,
    get objectIds() {
      return state.objectIds;
    },
    get transactions() {
      return state.transactions;
    },
    getProjectId: () => "project-1",
    isCanvasReady: () => ready,
    getCanvasSettings: () => ({
      width: 1000,
      height: 800,
      unit: "px",
      dpi: 96,
      background: "#ffffff",
      transparent: false
    }),
    getSelectionObjectIds: () => [],
    inspectScene: () => ({
      runtimeVersion: SEMANTIC_RUNTIME_VERSION,
      projectId: "project-1",
      canvasReady: ready,
      selectionObjectIds: [],
      objects: state.objectIds.map(descriptor),
      truncated: false,
      warnings: []
    }),
    inspectObject: (objectId) =>
      state.objectIds.includes(objectId) ? descriptor(objectId) : undefined,
    execute: async (command, input) => {
      state.calls.push(command);
      if (command === "create_shape") {
        const objectId = `object-${state.objectIds.length + 1}`;
        state.objectIds.push(objectId);
        return { data: { objectId }, changedObjectIds: [objectId] };
      }
      if (command === "move_objects") {
        const ids = input.objectIds as string[];
        if (!ids.every((id) => state.objectIds.includes(id))) {
          return { data: undefined, changedObjectIds: [] };
        }
        return { data: { objectIds: ids }, changedObjectIds: ids };
      }
      if (command === "delete_objects") {
        const ids = input.objectIds as string[];
        state.objectIds = state.objectIds.filter((id) => !ids.includes(id));
        return { data: { objectIds: ids }, changedObjectIds: ids };
      }
      if (command === "duplicate_objects") {
        return {
          data: { objectIds: ["copy-1", "copy-2"] },
          changedObjectIds: ["copy-1", "copy-2"]
        };
      }
      return { data: {}, changedObjectIds: [] };
    },
    runTransaction: async (operation) => {
      state.transactions += 1;
      await operation();
    }
  };
  return adapter;
}

describe("semantic command contracts", () => {
  it("has stable unique names and JSON-serializable strict metadata", () => {
    const names = SEMANTIC_COMMANDS.map((command) => command.name);
    expect(new Set(names).size).toBe(names.length);
    expect(SEMANTIC_COMMANDS.every((command) => command.version === SEMANTIC_RUNTIME_VERSION)).toBe(
      true
    );
    expect(() => JSON.stringify(SEMANTIC_COMMANDS)).not.toThrow();
    for (const command of SEMANTIC_COMMANDS) {
      expect(command.inputSchema.type).toBe("object");
      expect(command.inputSchema.additionalProperties).toBe(false);
      expect(command.outputSchema.type).toBe("object");
      expect(command.outputSchema.additionalProperties).toBe(false);
      expect(["read_only", "reversible_mutation", "sensitive_or_destructive"]).toContain(
        command.risk
      );
      expect(["none", "explicit"]).toContain(command.confirmation);
    }
  });
});

describe("semantic runtime", () => {
  it("fails closed for unknown commands, invalid properties, stale IDs, and unready canvases", async () => {
    const adapter = fakeAdapter(false);
    const runtime = createSemanticRuntime(adapter);

    expect((await runtime.execute("not_a_command")).error?.code).toBe("UNKNOWN_COMMAND");
    expect(
      (
        await runtime.execute("set_object_properties", {
          objectIds: ["missing"],
          properties: { objectId: "unsafe" }
        })
      ).error?.code
    ).toBe("INVALID_INPUT");
    expect((await runtime.execute("create_shape", { kind: "rectangle" })).error?.code).toBe(
      "EDITOR_NOT_READY"
    );

    const readyRuntime = createSemanticRuntime(fakeAdapter());
    expect(
      (await readyRuntime.execute("inspect_object", { objectId: "missing" })).error?.code
    ).toBe("STALE_OBJECT_ID");
    expect(
      (await readyRuntime.execute("delete_objects", { objectIds: ["missing"], confirmed: false }))
        .error?.code
    ).toBe("CONFIRMATION_REQUIRED");
  });

  it("supports explicit aliases and one transaction for bounded batches", async () => {
    const adapter = fakeAdapter();
    const runtime = createSemanticRuntime(adapter);
    const result = await runtime.execute("batch", {
      confirmed: true,
      operations: [
        { command: "create_shape", input: { kind: "rectangle" }, as: "shape" },
        { command: "move_objects", input: { objectIds: ["$shape"], dx: 12, dy: 8 } }
      ]
    });

    expect(result.ok).toBe(true);
    expect(adapter.transactions).toBe(1);
    expect(adapter.calls).toEqual(["create_shape", "move_objects"]);
    expect(result.changedObjectIds).toEqual(["object-1"]);
  });

  it("requires explicit confirmation for batches that can delete", async () => {
    const adapter = fakeAdapter();
    const runtime = createSemanticRuntime(adapter);
    const result = await runtime.execute("batch", {
      confirmed: false,
      operations: [{ command: "create_shape", input: { kind: "rectangle" } }]
    });

    expect(result).toMatchObject({ ok: false, error: { code: "CONFIRMATION_REQUIRED" } });
    expect(adapter.transactions).toBe(0);
  });

  it("validates each batch input against its declared command", async () => {
    const adapter = fakeAdapter();
    const runtime = createSemanticRuntime(adapter);
    const result = await runtime.execute("batch", {
      confirmed: true,
      operations: [{ command: "create_shape", input: { objectIds: ["missing"], dx: 12, dy: 8 } }]
    });

    expect(result).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(adapter.calls).toEqual([]);
  });

  it("resolves aliases only in identity fields", async () => {
    const adapter = fakeAdapter();
    const runtime = createSemanticRuntime(adapter);
    const literal = await runtime.execute("batch", {
      confirmed: true,
      operations: [{ command: "create_text", input: { kind: "point", text: "$literal" } }]
    });
    const unknown = await runtime.execute("batch", {
      confirmed: true,
      operations: [{ command: "move_objects", input: { objectIds: ["$missing"], dx: 1, dy: 1 } }]
    });

    expect(literal.ok).toBe(true);
    expect(unknown).toMatchObject({ ok: false, error: { code: "UNKNOWN_ALIAS" } });
  });

  it("rejects a collection alias in a single identity field", async () => {
    const adapter = fakeAdapter();
    const runtime = createSemanticRuntime(adapter);
    const result = await runtime.execute("batch", {
      confirmed: true,
      operations: [
        {
          command: "duplicate_objects",
          input: { objectIds: ["object-1"], offset: { x: 1, y: 1 } },
          as: "copies"
        },
        {
          command: "create_connector",
          input: {
            kind: "arrow",
            fromObjectId: "$copies",
            toObjectId: "object-1"
          }
        }
      ]
    });

    expect(result).toMatchObject({ ok: false, error: { code: "INVALID_ALIAS_USE" } });
  });
});
