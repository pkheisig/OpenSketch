import { expect, test } from "@playwright/test";

test("registers a safe figure workflow through the browser model context", async ({ page }) => {
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
        "resize_canvas",
        "search_assets",
        "inspect_provenance",
        "insert_asset"
      ])
    );

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
  const commandLog = page.getByLabel("Live WebMCP command log");
  await expect(commandLog).toBeVisible();
  await expect(commandLog).toContainText("export_figure");
  await expect(commandLog).toContainText("inspect_provenance");
});

test("replays the reference prompt as visible semantic commands on the live canvas", async ({
  page
}) => {
  test.setTimeout(120000);
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

  await page.goto(
    "./?webmcpDemo=1&autoStart=1&promptReplay=1&focusCanvas=1&demoPace=0"
  );
  await expect(page.locator(".workspace-plane")).toHaveAttribute("data-canvas-ready", "true");
  await expect(page.getByRole("textbox", { name: "Document title" })).toHaveValue(
    "Untitled figure"
  );
  const promptReplay = page.getByLabel("WebMCP reference prompt replay");
  await expect(promptReplay).toBeVisible();
  await expect(promptReplay.getByLabel("Prompt shown in the demo")).toContainText(
    "publication-ready cancer-immunity cycle"
  );
  await promptReplay.getByRole("button", { name: "Replay live build" }).click();
  await expect(promptReplay).toHaveClass(/is-complete/, { timeout: 110000 });
  await expect(promptReplay).toContainText("Build complete");

  const commandLog = page.getByLabel("Live WebMCP command log");
  await expect(commandLog).toContainText("validate_figure");
  await expect(commandLog).toContainText("analyze_composition");
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
    const inspect = tools.find((tool) => tool.name === "inspect_scene");
    const find = tools.find((tool) => tool.name === "find_objects");
    if (!inspect || !find) throw new Error("Missing inspection tools");
    return {
      scene: await inspect.execute({ maxObjects: 160, maxDepth: 4 }),
      stage8: await find.execute({ text: "8  Cytotoxic killing", caseSensitive: true, limit: 4 })
    };
  });
  expect(result.scene).toMatchObject({
    ok: true,
    data: { canvas: { width: 1920, height: 1080 } }
  });
  expect(JSON.stringify(result.scene)).toContain("THE CANCER–IMMUNITY CYCLE");
  expect(result.stage8).toMatchObject({ ok: true, data: { total: 1 } });

  const countBeforeReplay = Number(
    await page.locator(".webmcp-command-log__count").textContent()
  );
  await promptReplay.getByRole("button", { name: /Reference prompt/i }).click();
  await promptReplay.getByRole("button", { name: "Replay live build" }).click();
  await expect(promptReplay).toHaveClass(/is-complete/, { timeout: 110000 });
  await expect
    .poll(async () => Number(await page.locator(".webmcp-command-log__count").textContent()))
    .toBeGreaterThan(countBeforeReplay + 100);
  await expect(promptReplay).toContainText("Build complete");
  await expect(page.getByRole("alert")).toHaveCount(0);
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
  await page.goto("./?webmcpDemo=1&autoStart=1");
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
