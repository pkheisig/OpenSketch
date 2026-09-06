import { expect, test } from "@playwright/test";

test("registers a safe figure workflow through the browser model context", async ({ page }) => {
  await page.addInitScript(() => {
    const tools: Array<{ name: string }> = [];
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: {
        registerTool(tool: { name: string }, options?: { signal?: AbortSignal }) {
          tools.push(tool);
          options?.signal?.addEventListener(
            "abort",
            () => {
              const index = tools.indexOf(tool);
              if (index >= 0) tools.splice(index, 1);
            },
            { once: true }
          );
        }
      }
    });
    (
      window as typeof window & {
        __webmcpTools?: Array<{ name: string }>;
        __webmcpStaleTool?: { execute: (input: Record<string, unknown>) => Promise<unknown> };
      }
    ).__webmcpTools = tools;
  });

  await page.goto("./?webmcpDemo=1");
  await expect
    .poll(async () =>
      page.evaluate(() =>
        (
          (window as typeof window & { __webmcpTools?: Array<{ name: string }> }).__webmcpTools ??
          []
        ).map((tool) => tool.name)
      )
    )
    .toEqual(
      expect.arrayContaining(["list_projects", "inspect_project", "create_project", "open_project"])
    );
  const coldStart = await page.evaluate(async () => {
    const tools =
      (
        window as typeof window & {
          __webmcpTools?: Array<{
            name: string;
            execute: (input: Record<string, unknown>) => Promise<unknown>;
          }>;
          __webmcpStaleTool?: { execute: (input: Record<string, unknown>) => Promise<unknown> };
        }
      ).__webmcpTools ?? [];
    const list = tools.find((tool) => tool.name === "list_projects");
    const create = tools.find((tool) => tool.name === "create_project");
    if (!list || !create) throw new Error("Missing cold-start project lifecycle tools.");
    (window as typeof window & { __webmcpStaleTool?: typeof list }).__webmcpStaleTool = list;
    const listed = await list.execute({});
    const created = await create.execute({ name: "Cold-start figure" });
    return { listed, created };
  });
  await expect(page.locator(".workspace-plane")).toHaveAttribute("data-canvas-ready", "true");
  expect(coldStart.listed).toMatchObject({ ok: true, data: { context: "project-library" } });
  expect(coldStart.created).toMatchObject({ ok: true, data: { created: true } });

  await expect
    .poll(async () =>
      page.evaluate(() =>
        (
          (window as typeof window & { __webmcpTools?: Array<{ name: string }> }).__webmcpTools ??
          []
        ).map((tool) => tool.name)
      )
    )
    .toEqual(
      expect.arrayContaining([
        "resize_canvas",
        "search_assets",
        "inspect_provenance",
        "insert_asset"
      ])
    );

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const tool = (window as typeof window & { __webmcpStaleTool?: { name?: string } })
          .__webmcpStaleTool;
        return tool?.name ?? null;
      })
    )
    .toBe("list_projects");
  await expect(
    page.evaluate(async () => {
      const tool = (
        window as typeof window & {
          __webmcpStaleTool?: { execute: (input: Record<string, unknown>) => Promise<unknown> };
        }
      ).__webmcpStaleTool;
      if (!tool) throw new Error("Missing retained cold-start tool.");
      return tool.execute({});
    })
  ).resolves.toMatchObject({ ok: false, error: { code: "EXECUTION_ABORTED" } });

  const sizing = await page.evaluate(async () => {
    type Tool = {
      name: string;
      execute(input: Record<string, unknown>): Promise<{
        ok: boolean;
        data?: { objectId?: string; object?: { bounds: { width: number; height: number } } };
        error?: { code: string };
      }>;
    };
    const tools = (window as typeof window & { __webmcpTools?: Tool[] }).__webmcpTools ?? [];
    (window as typeof window & { __savedSceneTool?: Tool }).__savedSceneTool = tools.find(
      (tool) => tool.name === "inspect_scene"
    );
    const call = async (name: string, input: Record<string, unknown>) => {
      const tool = tools.find((item) => item.name === name);
      if (!tool) throw new Error(`Missing tool: ${name}`);
      return tool.execute(input);
    };
    const first = await call("create_shape", { kind: "rectangle", x: 100, y: 100 });
    const second = await call("create_shape", { kind: "circle", x: 200, y: 100 });
    const group = await call("group_objects", {
      objectIds: [first.data!.objectId, second.data!.objectId]
    });
    const objectId = group.data!.objectId;
    const before = await call("inspect_object", { objectId });
    const rejected = await call("set_object_properties", {
      objectIds: [objectId],
      properties: { width: 400 }
    });
    const resized = await call("resize_objects", { objectIds: [objectId], width: 400 });
    const after = await call("inspect_object", { objectId });
    const undone = await call("undo", {});
    const restored = await call("inspect_object", { objectId });
    await call("delete_objects", { objectIds: [objectId], confirmed: true });
    return {
      before,
      rejected,
      resized,
      after,
      undone,
      restored,
      previewRegistered: tools.some((tool) => tool.name === "render_scene_preview")
    };
  });
  expect(sizing.previewRegistered).toBe(false);
  expect(sizing.rejected).toMatchObject({ ok: false, error: { code: "INVALID_PROPERTY_TARGET" } });
  expect(sizing.resized).toMatchObject({ ok: true });
  expect(sizing.after.data!.object!.bounds.width).toBeCloseTo(400, 1);
  expect(sizing.undone).toMatchObject({ ok: true });
  expect(sizing.restored.data!.object!.bounds.width).toBeCloseTo(
    sizing.before.data!.object!.bounds.width,
    1
  );

  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeEnabled();
  // Ordinary saves must retain the mounted editor, history and registered callbacks.
  expect(
    await page.evaluate(async () => {
      const tool = (
        window as typeof window & {
          __savedSceneTool?: { execute(input: Record<string, unknown>): Promise<unknown> };
        }
      ).__savedSceneTool;
      return tool!.execute({});
    })
  ).toMatchObject({ ok: true });

  const initialWorkflow = await page.evaluate(async () => {
    const tools =
      (
        window as typeof window & {
          __webmcpTools?: Array<{
            name: string;
            execute: (input: Record<string, unknown>) => Promise<unknown>;
          }>;
        }
      ).__webmcpTools ?? [];
    const call = (name: string, input: Record<string, unknown>) => {
      const tool = tools.find((candidate) => candidate.name === name);
      if (!tool) throw new Error(`Missing WebMCP tool: ${name}`);
      return tool.execute(input);
    };
    const introspection = (
      window as typeof window & {
        __OPENSKETCH_SEMANTIC?: {
          getCapabilities: () => { canvasReady: boolean };
          execute: (name: string, input: Record<string, unknown>) => Promise<unknown>;
        };
      }
    ).__OPENSKETCH_SEMANTIC;
    const capabilities = introspection?.getCapabilities() ?? null;
    const resize = (await call("resize_canvas", { width: 1200, height: 700 })) as {
      ok: boolean;
      data: { width: number; height: number };
    };
    const resizeUndo = await call("undo", {});
    const undoScene = (await call("inspect_scene", { maxObjects: 50, maxDepth: 8 })) as {
      ok: boolean;
      data: { canvas: { width: number; height: number } };
    };
    const resizeRedo = await call("redo", {});
    const redoScene = (await call("inspect_scene", { maxObjects: 50, maxDepth: 8 })) as {
      ok: boolean;
      data: { canvas: { width: number; height: number } };
    };
    const initialScene = (await call("inspect_scene", { maxObjects: 50, maxDepth: 8 })) as {
      ok: boolean;
      data: { canvasReady: boolean; canvas: { width: number; height: number } };
    };
    const search = (await call("search_assets", { query: "", limit: 2 })) as {
      data: { results: Array<{ familyId: string }> };
    };
    if (search.data.results.length < 2)
      throw new Error("The bundled asset manifest needs two assets.");
    const [family, secondFamily] = search.data.results;
    const inspect = (await call("inspect_asset", { familyId: family.familyId })) as {
      data: { family: { selectedVariantId: string } };
    };
    const secondInspect = (await call("inspect_asset", { familyId: secondFamily.familyId })) as {
      data: { family: { selectedVariantId: string } };
    };
    const variantId = inspect.data.family.selectedVariantId;
    const secondVariantId = secondInspect.data.family.selectedVariantId;
    const insert = (await call("insert_asset", {
      familyId: family.familyId,
      variantId,
      x: 240,
      y: 180
    })) as { ok: boolean; data: { objectId: string } };
    const secondInsert = (await call("insert_asset", {
      familyId: secondFamily.familyId,
      variantId: secondVariantId,
      x: 600,
      y: 180
    })) as { ok: boolean; data: { objectId: string } };
    const text = (await call("create_text", {
      kind: "point",
      text: "Agent label",
      x: 420,
      y: 360
    })) as { ok: boolean; data: { objectId: string } };
    const connector = (await call("create_connector", {
      kind: "arrow",
      fromObjectId: insert.data.objectId,
      toObjectId: secondInsert.data.objectId,
      fromAnchor: "right",
      toAnchor: "left"
    })) as { ok: boolean; data: { objectId: string } };
    const objectIds = [insert.data.objectId, secondInsert.data.objectId];
    const move = await call("move_objects", { objectIds, dx: 12, dy: 8 });
    const scale = await call("scale_objects", { objectIds, scaleX: 0.9, scaleY: 0.9 });
    const style = await call("set_object_properties", {
      objectIds,
      properties: { opacity: 0.9 }
    });
    const align = await call("align_objects", { objectIds, axis: "middle" });
    const group = (await call("group_objects", { objectIds })) as {
      ok: boolean;
      data: { objectId: string };
    };
    const groupedScene = await call("inspect_scene", { maxObjects: 50, maxDepth: 8 });
    const ungroup = await call("ungroup_objects", { objectIds: [group.data.objectId] });
    return {
      capabilities,
      resize,
      resizeUndo,
      undoScene,
      resizeRedo,
      redoScene,
      initialScene,
      insert,
      secondInsert,
      text,
      connector,
      move,
      scale,
      style,
      align,
      group,
      groupedScene,
      ungroup
    };
  });

  expect(
    initialWorkflow.capabilities?.canvasReady ?? initialWorkflow.initialScene.data.canvasReady
  ).toBe(true);
  expect(initialWorkflow.resize).toMatchObject({
    ok: true,
    data: { width: 1200, height: 700 }
  });
  expect(initialWorkflow.resizeUndo).toMatchObject({ ok: true, data: { applied: true } });
  expect(initialWorkflow.undoScene.data.canvas).not.toMatchObject({ width: 1200, height: 700 });
  expect(initialWorkflow.resizeRedo).toMatchObject({ ok: true, data: { applied: true } });
  expect(initialWorkflow.redoScene.data.canvas).toMatchObject({ width: 1200, height: 700 });
  expect(initialWorkflow.initialScene.data.canvas).toMatchObject({ width: 1200, height: 700 });
  expect(initialWorkflow.initialScene.ok).toBe(true);
  expect(initialWorkflow.insert.ok).toBe(true);
  expect(initialWorkflow.secondInsert.ok).toBe(true);
  expect(initialWorkflow.text.ok).toBe(true);
  expect(initialWorkflow.connector.ok).toBe(true);
  expect(initialWorkflow.move).toMatchObject({ ok: true });
  expect(initialWorkflow.scale).toMatchObject({ ok: true });
  expect(initialWorkflow.style).toMatchObject({ ok: true });
  expect(initialWorkflow.align).toMatchObject({ ok: true });
  expect(initialWorkflow.group.ok).toBe(true);
  expect(initialWorkflow.groupedScene).toMatchObject({ ok: true });
  expect(initialWorkflow.ungroup).toMatchObject({ ok: true });
  const textButton = page.getByRole("button", { name: "Text", exact: true });
  await expect(textButton).toBeVisible();
  await textButton.click();
  const stage = await page.locator(".artboard-stage").boundingBox();
  if (!stage) throw new Error("The artboard is not visible.");
  await page.mouse.click(stage.x + stage.width * 0.5, stage.y + stage.height * 0.7);

  const afterManualEdit = await page.evaluate(async () => {
    const tools =
      (
        window as typeof window & {
          __webmcpTools?: Array<{
            name: string;
            execute: (input: Record<string, unknown>) => Promise<unknown>;
          }>;
        }
      ).__webmcpTools ?? [];
    const call = (name: string, input: Record<string, unknown>) => {
      const tool = tools.find((candidate) => candidate.name === name);
      if (!tool) throw new Error(`Missing WebMCP tool: ${name}`);
      return tool.execute(input);
    };
    const scene = (await call("inspect_scene", { maxObjects: 50, maxDepth: 8 })) as {
      ok: boolean;
      data: { objects: Array<{ type: string }> };
    };
    const move = await call("move_objects", {
      objectIds: ["PLACEHOLDER"],
      dx: 1,
      dy: 1
    });
    return { scene, move };
  });
  expect(afterManualEdit.scene.ok).toBe(true);
  expect(afterManualEdit.scene.data.objects.some((object) => object.type === "text")).toBe(true);
  expect(afterManualEdit.move).toMatchObject({
    ok: false,
    error: { code: "STALE_OBJECT_ID" }
  });

  const historyWorkflow = await page.evaluate(async (assetObjectId: string) => {
    const tools =
      (
        window as typeof window & {
          __webmcpTools?: Array<{
            name: string;
            execute: (input: Record<string, unknown>) => Promise<unknown>;
          }>;
        }
      ).__webmcpTools ?? [];
    const call = (name: string, input: Record<string, unknown>) => {
      const tool = tools.find((candidate) => candidate.name === name);
      if (!tool) throw new Error(`Missing WebMCP tool: ${name}`);
      return tool.execute(input);
    };
    const move = await call("move_objects", { objectIds: [assetObjectId], dx: 18, dy: 0 });
    const undo = await call("undo", {});
    const redo = await call("redo", {});
    const scene = await call("inspect_scene", { maxObjects: 50, maxDepth: 8 });
    const provenance = await call("inspect_provenance", {});
    const staleReplacement = await call("replace_asset_variant", {
      objectId: "stale-object-id",
      variantId: "stale-variant-id"
    });
    return { move, undo, redo, scene, provenance, staleReplacement };
  }, initialWorkflow.insert.data.objectId);

  expect(historyWorkflow.move).toMatchObject({ ok: true });
  expect(historyWorkflow.undo).toMatchObject({ ok: true, data: { applied: true } });
  expect(historyWorkflow.redo).toMatchObject({ ok: true, data: { applied: true } });
  expect(historyWorkflow.scene).toMatchObject({ ok: true });
  expect(historyWorkflow.provenance).toMatchObject({ ok: true });
  expect(historyWorkflow.staleReplacement).toMatchObject({
    ok: false,
    error: { code: "STALE_OBJECT_ID" }
  });

  const downloadPromise = page.waitForEvent("download");
  const exportResult = await page.evaluate(async () => {
    const tools =
      (
        window as typeof window & {
          __webmcpTools?: Array<{
            name: string;
            execute: (input: Record<string, unknown>) => Promise<unknown>;
          }>;
        }
      ).__webmcpTools ?? [];
    const tool = tools.find((candidate) => candidate.name === "export_figure");
    if (!tool) throw new Error("Missing WebMCP tool: export_figure");
    return tool.execute({ format: "credits", title: "WebMCP qualification" });
  });
  const download = await downloadPromise;
  expect(exportResult).toMatchObject({ ok: true, data: { format: "credits", started: true } });
  expect(download.suggestedFilename()).toMatch(/credits|provenance/i);

  const transition = await page.evaluate(async (projectId: string) => {
    const tools =
      (
        window as typeof window & {
          __webmcpTools?: Array<{
            name: string;
            execute: (input: Record<string, unknown>) => Promise<unknown>;
          }>;
          __webmcpStaleTool?: { execute: (input: Record<string, unknown>) => Promise<unknown> };
        }
      ).__webmcpTools ?? [];
    const exit = tools.find((tool) => tool.name === "return_to_project_library");
    const staleEditorTool = tools.find((tool) => tool.name === "inspect_scene");
    if (!exit || !staleEditorTool) throw new Error("Missing editor lifecycle tools.");
    const result = await exit.execute({});
    (window as typeof window & { __webmcpStaleTool?: typeof staleEditorTool }).__webmcpStaleTool =
      staleEditorTool;
    return { result, projectId };
  }, coldStart.created.data.projectId);
  expect(transition.result).toMatchObject({
    ok: true,
    data: { requested: true }
  });
  await expect(page.locator(".home-shell")).toBeVisible();
  await expect(
    page.evaluate(async () => {
      const tool = (
        window as typeof window & {
          __webmcpStaleTool?: { execute: (input: Record<string, unknown>) => Promise<unknown> };
        }
      ).__webmcpStaleTool;
      if (!tool) throw new Error("Missing retained editor tool.");
      return tool.execute({ maxObjects: 1 });
    })
  ).resolves.toMatchObject({ ok: false, error: { code: "EXECUTION_ABORTED" } });
  await expect
    .poll(async () =>
      page.evaluate(() =>
        (
          (window as typeof window & { __webmcpTools?: Array<{ name: string }> }).__webmcpTools ??
          []
        ).map((tool) => tool.name)
      )
    )
    .toEqual(expect.arrayContaining(["list_projects", "open_project"]));
  const reopened = await page.evaluate(async (projectId: string) => {
    const tool = (
      window as typeof window & {
        __webmcpTools?: Array<{
          name: string;
          execute: (input: Record<string, unknown>) => Promise<unknown>;
        }>;
      }
    ).__webmcpTools?.find((candidate) => candidate.name === "open_project");
    if (!tool) throw new Error("Missing project open tool after return.");
    return tool.execute({ projectId });
  }, transition.projectId);
  expect(reopened).toMatchObject({ ok: true, data: { opened: true } });
  await expect(page.locator(".workspace-plane")).toHaveAttribute("data-canvas-ready", "true");
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const tools = (
          window as typeof window & {
            __webmcpTools?: Array<{
              name: string;
              execute: (input: Record<string, unknown>) => Promise<unknown>;
            }>;
          }
        ).__webmcpTools;
        return Boolean(tools?.some((candidate) => candidate.name === "inspect_scene"));
      })
    )
    .toBe(true);
  const reopenedScene = await page.evaluate(async () => {
    const tool = (
      window as typeof window & {
        __webmcpTools?: Array<{
          name: string;
          execute: (input: Record<string, unknown>) => Promise<unknown>;
        }>;
      }
    ).__webmcpTools?.find((candidate) => candidate.name === "inspect_scene");
    if (!tool) throw new Error("Missing inspect_scene tool after reopening.");
    return tool.execute({ maxObjects: 1, maxDepth: 1 });
  });
  expect(reopenedScene).toMatchObject({
    ok: true,
    data: { canvas: { width: 1200, height: 700 } }
  });
});

test("executes compound composition and analysis through registered WebMCP callbacks", async ({
  page
}) => {
  await page.addInitScript(() => {
    const tools: unknown[] = [];
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: {
        registerTool(tool: unknown) {
          tools.push(tool);
        }
      }
    });
    (window as typeof window & { __webmcpTools?: unknown[] }).__webmcpTools = tools;
  });
  await page.goto("./?webmcpDemo=1");
  await page.getByRole("button", { name: "New figure" }).click();
  await expect(page.locator(".workspace-plane")).toHaveAttribute("data-canvas-ready", "true");
  await expect
    .poll(async () =>
      page.evaluate(() =>
        (
          (window as typeof window & { __webmcpTools?: Array<{ name: string }> }).__webmcpTools ??
          []
        ).map((tool) => tool.name)
      )
    )
    .toEqual(
      expect.arrayContaining([
        "compose_labeled_group",
        "compose_interaction",
        "create_particle_field",
        "create_annotation",
        "fit_text",
        "normalize_styles",
        "analyze_composition",
        "validate_figure"
      ])
    );

  const result = await page.evaluate(async () => {
    const tools =
      (
        window as typeof window & {
          __webmcpTools?: Array<{
            name: string;
            execute: (input: Record<string, unknown>) => Promise<unknown>;
          }>;
        }
      ).__webmcpTools ?? [];
    const call = (name: string, input: Record<string, unknown>) => {
      const tool = tools.find((candidate) => candidate.name === name);
      if (!tool) throw new Error(`Missing WebMCP tool: ${name}`);
      return tool.execute(input);
    };
    const first = (await call("create_shape", { kind: "circle", x: 220, y: 220 })) as {
      data: { objectId: string };
    };
    const second = (await call("create_shape", { kind: "circle", x: 520, y: 220 })) as {
      data: { objectId: string };
    };
    const text = (await call("create_text", {
      kind: "box",
      text: "Bounded annotation text",
      x: 520,
      y: 500
    })) as { data: { objectId: string } };
    const labeled = await call("compose_labeled_group", {
      objectIds: [first.data.objectId],
      label: "Input",
      placement: "top"
    });
    const interaction = await call("compose_interaction", {
      sourceObjectId: second.data.objectId,
      targetObjectId: text.data.objectId,
      mode: "secretion"
    });
    const particles = await call("create_particle_field", {
      count: 12,
      distribution: "gradient",
      seed: "e2e-seed",
      bounds: { left: 640, top: 100, width: 240, height: 180 }
    });
    const annotation = await call("create_annotation", {
      targetObjectId: second.data.objectId,
      text: "Target",
      placement: "top",
      gap: 400,
      leader: false
    });
    const fit = await call("fit_text", {
      objectId: text.data.objectId,
      maxWidth: 220,
      maxHeight: 160,
      minFontSize: 8,
      maxFontSize: 60,
      maxLines: 4
    });
    const styles = await call("normalize_styles", {
      objectIds: [second.data.objectId],
      presetId: "scientific-asset"
    });
    const analysis = await call("analyze_composition", { maxFindings: 32 });
    const validation = await call("validate_figure", { profile: "publication", maxFindings: 32 });
    return { labeled, interaction, particles, annotation, fit, styles, analysis, validation };
  });
  expect(result.labeled, JSON.stringify(result.labeled)).toMatchObject({ ok: true });
  expect(result.interaction).toMatchObject({ ok: true, data: { relation: { kind: "emits" } } });
  expect(result.particles).toMatchObject({
    ok: true,
    data: { seed: "e2e-seed", particleIds: expect.any(Array) }
  });
  expect(result.annotation, JSON.stringify(result.annotation)).toMatchObject({ ok: true });
  expect(result.fit).toMatchObject({ ok: true, data: { objectId: expect.any(String) } });
  expect(result.styles).toMatchObject({ ok: true });
  expect(result.analysis).toMatchObject({ ok: true, data: { version: "opensketch.analysis.v1" } });
  expect(result.validation).toMatchObject({ ok: true, data: { profile: "publication" } });
});
