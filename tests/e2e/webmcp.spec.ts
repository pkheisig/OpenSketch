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

  await page.goto("./");
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
    .toEqual(expect.arrayContaining(["search_assets", "inspect_provenance", "insert_asset"]));

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
    const initialScene = (await call("inspect_scene", { maxObjects: 50, maxDepth: 8 })) as {
      ok: boolean;
      data: { canvasReady: boolean };
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
});
