import { describe, expect, it, vi } from "vitest";
import { SEMANTIC_COMMANDS } from "../apps/web/src/semantic/semanticCommands";
import {
  createWebMcpAdapter,
  detectModelContext,
  WEBMCP_COMMAND_LOG_EVENT,
  type WebMcpCommandLogDetail,
  type WebMcpTool
} from "../apps/web/src/semantic/webmcp";
import type { SemanticRuntime } from "../apps/web/src/semantic/semanticRuntime";
import { SEMANTIC_RUNTIME_VERSION } from "../apps/web/src/semantic/semanticTypes";

function runtime(): SemanticRuntime & { execute: ReturnType<typeof vi.fn> } {
  const execute = vi.fn(async (name: string) => ({
    ok: true as const,
    runtimeVersion: SEMANTIC_RUNTIME_VERSION,
    data: { name },
    changedObjectIds: [],
    warnings: []
  }));
  return {
    version: SEMANTIC_RUNTIME_VERSION,
    commands: SEMANTIC_COMMANDS,
    listCommands: () => SEMANTIC_COMMANDS,
    getCapabilities: () => ({
      runtimeVersion: SEMANTIC_RUNTIME_VERSION,
      projectId: "project-1",
      canvasReady: true,
      commands: Object.fromEntries(
        SEMANTIC_COMMANDS.map((command) => [command.name, { available: true }])
      )
    }),
    execute
  };
}

describe("WebMCP adapter", () => {
  it("is a no-op when the experimental browser API is unavailable", async () => {
    const adapter = createWebMcpAdapter({ runtime: runtime(), documentLike: {} });
    await expect(adapter.sync()).resolves.toEqual({ supported: false, registered: 0, skipped: 0 });
  });

  it("registers the canonical commands and delegates to the current runtime", async () => {
    const tools: WebMcpTool[] = [];
    const registerTool = vi.fn((tool: WebMcpTool) => {
      tools.push(tool);
    });
    const current = runtime();
    const adapter = createWebMcpAdapter({
      runtime: current,
      documentLike: { modelContext: { registerTool } }
    });

    await expect(adapter.sync()).resolves.toMatchObject({
      supported: true,
      registered: SEMANTIC_COMMANDS.length
    });
    expect(tools.map((tool) => tool.name)).toEqual(
      SEMANTIC_COMMANDS.map((command) => command.name)
    );
    expect(tools.find((tool) => tool.name === "inspect_scene")?.annotations.readOnlyHint).toBe(
      true
    );
    expect(tools.find((tool) => tool.name === "delete_objects")?.annotations.destructiveHint).toBe(
      true
    );
    await tools.find((tool) => tool.name === "inspect_scene")!.execute({ maxObjects: 3 });
    expect(current.execute).toHaveBeenCalledWith(
      "inspect_scene",
      { maxObjects: 3 },
      { signal: expect.objectContaining({ aborted: false }) }
    );
    await expect(
      tools.find((tool) => tool.name === "inspect_scene")!.execute(null)
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "INVALID_INPUT" }
    });
  });

  it("emits a start and finish event for each WebMCP tool call", async () => {
    const tools: WebMcpTool[] = [];
    const events: WebMcpCommandLogDetail[] = [];
    const onCommand = (event: Event) => {
      events.push((event as CustomEvent<WebMcpCommandLogDetail>).detail);
    };
    window.addEventListener(WEBMCP_COMMAND_LOG_EVENT, onCommand);
    const adapter = createWebMcpAdapter({
      runtime: runtime(),
      documentLike: { modelContext: { registerTool: (tool: WebMcpTool) => tools.push(tool) } }
    });

    try {
      await adapter.sync();
      await tools.find((tool) => tool.name === "inspect_scene")!.execute({ maxObjects: 3 });
    } finally {
      window.removeEventListener(WEBMCP_COMMAND_LOG_EVENT, onCommand);
    }

    expect(events).toHaveLength(2);
    expect(events.map(({ phase }) => phase)).toEqual(["started", "finished"]);
    expect(events[1]).toMatchObject({ name: "inspect_scene", ok: true });
    expect(events[1].callId).toBe(events[0].callId);
  });

  it("continues after a registration failure and aborts the prior generation", async () => {
    const signals: AbortSignal[] = [];
    let count = 0;
    const registerTool = vi.fn((tool: WebMcpTool, options?: { signal?: AbortSignal }) => {
      count += 1;
      if (options?.signal) signals.push(options.signal);
      if (count === 2) throw new Error("unsupported tool shape");
      return undefined;
    });
    const adapter = createWebMcpAdapter({
      runtime: runtime(),
      documentLike: { modelContext: { registerTool } }
    });

    await expect(adapter.sync()).resolves.toMatchObject({ supported: true, skipped: 1 });
    expect(registerTool).toHaveBeenCalledTimes(SEMANTIC_COMMANDS.length);
    await adapter.sync();
    expect(signals[0].aborted).toBe(true);
    adapter.dispose();
    expect(signals.at(-1)?.aborted).toBe(true);
  });

  it("accounts for a tool registered just before a generation abort", async () => {
    let releaseFirst: (() => void) | undefined;
    let enteredFirst: (() => void) | undefined;
    const firstEntered = new Promise<void>((resolve) => {
      enteredFirst = resolve;
    });
    const firstRelease = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let count = 0;
    const registerTool = vi.fn(async () => {
      count += 1;
      if (count === 1) {
        enteredFirst?.();
        await firstRelease;
      }
    });
    const adapter = createWebMcpAdapter({
      runtime: runtime(),
      documentLike: { modelContext: { registerTool } }
    });

    const firstSync = adapter.sync();
    await firstEntered;
    const secondSync = adapter.sync();
    releaseFirst?.();

    await expect(firstSync).resolves.toEqual({
      supported: true,
      registered: 1,
      skipped: SEMANTIC_COMMANDS.length - 1
    });
    await expect(secondSync).resolves.toMatchObject({
      supported: true,
      registered: SEMANTIC_COMMANDS.length
    });
  });

  it("only detects a real registerTool implementation", () => {
    expect(detectModelContext({ modelContext: { registerTool: true } })).toBeNull();
    expect(detectModelContext({ modelContext: { registerTool: vi.fn() } })).not.toBeNull();
  });

  it("propagates host cancellation and fences tools after registration disposal", async () => {
    const execute = vi.fn(
      async (_name: string, _input: Record<string, unknown>, options?: { signal?: AbortSignal }) =>
        options?.signal?.aborted
          ? {
              ok: false as const,
              runtimeVersion: SEMANTIC_RUNTIME_VERSION,
              error: { code: "EXECUTION_ABORTED", message: "canceled" },
              changedObjectIds: [],
              warnings: []
            }
          : {
              ok: true as const,
              runtimeVersion: SEMANTIC_RUNTIME_VERSION,
              data: {},
              changedObjectIds: [],
              warnings: []
            }
    );
    const current = { ...runtime(), execute };
    const tools: WebMcpTool[] = [];
    const adapter = createWebMcpAdapter({
      runtime: current,
      documentLike: {
        modelContext: { registerTool: (tool: WebMcpTool) => tools.push(tool) }
      }
    });
    await adapter.sync();
    const tool = tools.find((candidate) => candidate.name === "inspect_scene")!;
    const hostAbort = new AbortController();
    hostAbort.abort();
    await expect(tool.execute({}, { signal: hostAbort.signal })).resolves.toMatchObject({
      ok: false,
      error: { code: "EXECUTION_ABORTED" }
    });
    expect(execute.mock.calls[0]?.[2]).toMatchObject({
      signal: expect.objectContaining({ aborted: true })
    });

    adapter.dispose();
    await expect(tool.execute({})).resolves.toMatchObject({
      ok: false,
      error: { code: "EXECUTION_ABORTED" }
    });
  });
});
