import { expect, test } from "@playwright/test";

type Tool = {
  name: string;
  execute: (input: Record<string, unknown>) => Promise<unknown>;
};

type Result = {
  ok: boolean;
  data?: Record<string, unknown>;
  error?: { code: string; message?: string };
};

type Descriptor = {
  objectId: string;
  type: string;
  text?: string;
  parentObjectId?: string;
  children?: string[];
  semanticMetadata?: {
    semanticRole?: string;
    stageId?: string;
    stageIndex?: number;
  };
  connector?: {
    fromObjectId: string;
    toObjectId: string;
    pathShape?: string;
  };
  freeConnector?: unknown;
};

test("qualifies the cancer-immunity-cycle reference composition through real WebMCP calls", async ({
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
    (window as typeof window & { __webmcpCallCount?: number }).__webmcpCallCount = 0;
  });
  await page.goto("./?webmcpDemo=1");
  await page.getByRole("button", { name: "New figure" }).click();
  await expect(page.locator(".workspace-plane")).toHaveAttribute("data-canvas-ready", "true");
  await expect
    .poll(async () =>
      page.evaluate(() =>
        ((window as typeof window & { __webmcpTools?: Tool[] }).__webmcpTools ?? []).map(
          (tool) => tool.name
        )
      )
    )
    .toEqual(
      expect.arrayContaining([
        "search_assets",
        "inspect_asset",
        "insert_asset",
        "batch",
        "compose_labeled_group",
        "connect_sequence",
        "create_annotation",
        "export_figure"
      ])
    );

  const composition = await page.evaluate(async () => {
    const tools = (window as typeof window & { __webmcpTools?: Tool[] }).__webmcpTools ?? [];
    const call = async (name: string, input: Record<string, unknown>): Promise<Result> => {
      const tool = tools.find((candidate) => candidate.name === name);
      if (!tool) throw new Error(`Missing WebMCP tool: ${name}`);
      (window as typeof window & { __webmcpCallCount?: number }).__webmcpCallCount =
        ((window as typeof window & { __webmcpCallCount?: number }).__webmcpCallCount ?? 0) + 1;
      return (await tool.execute(input)) as Result;
    };
    const mustCall = async (name: string, input: Record<string, unknown>) => {
      const result = await call(name, input);
      if (!result.ok) {
        throw new Error(`${name} failed: ${JSON.stringify(result)}`);
      }
      return result;
    };
    const operationData = (result: Result, index: number): Record<string, unknown> => {
      const operations = result.data?.operations as Array<{ result: Result }> | undefined;
      const operation = operations?.[index];
      if (!operation?.result.ok || !operation.result.data) {
        throw new Error(`Missing successful batch operation ${index}: ${JSON.stringify(result)}`);
      }
      return operation.result.data;
    };
    const objectId = (result: Result | Record<string, unknown>): string => {
      const id = "data" in result ? result.data?.objectId : result.objectId;
      if (typeof id !== "string") throw new Error(`Missing object ID: ${JSON.stringify(result)}`);
      return id;
    };
    const search = await mustCall("search_assets", { query: "Arcadia Science", limit: 2 });
    const searchResults = search.data?.results as Array<{ familyId: string }> | undefined;
    const firstFamily = searchResults?.[0];
    const secondFamily = searchResults?.[1];
    if (!firstFamily || !secondFamily) {
      throw new Error("The bundled asset manifest needs two searchable organism families.");
    }
    const firstInspection = await mustCall("inspect_asset", { familyId: firstFamily.familyId });
    const secondInspection = await mustCall("inspect_asset", {
      familyId: secondFamily.familyId
    });
    const firstAssetFamily = firstInspection.data?.family as {
      selectedVariantId: string;
      variants: Array<{ id: string }>;
    };
    const secondAssetFamily = secondInspection.data?.family as {
      selectedVariantId: string;
      variants: Array<{ id: string }>;
    };
    const firstVariant = firstAssetFamily.selectedVariantId;
    const secondVariant = secondAssetFamily.selectedVariantId;
    const alternateVariant = firstAssetFamily.variants.find(
      (variant) => variant.id !== firstVariant
    )?.id;
    if (!alternateVariant)
      throw new Error(
        `The selected bundled asset has no variant to replace: ${JSON.stringify(firstAssetFamily)}`
      );

    const points = {
      stage1: { x: 1100, y: 240 },
      stage2: { x: 1640, y: 500 },
      stage3: { x: 1780, y: 900 },
      stage4: { x: 1400, y: 1260 },
      stage5: { x: 800, y: 1260 },
      stage6: { x: 420, y: 900 },
      stage7: { x: 560, y: 500 }
    };
    await mustCall("resize_canvas", { width: 2200, height: 1600 });
    await mustCall("set_project_metadata", {
      name: "Cancer-immunity cycle qualification",
      description: "WebMCP reference composition"
    });
    const seededBatch = await mustCall("batch", {
      confirmed: true,
      operations: [
        {
          command: "insert_asset",
          input: { familyId: firstFamily.familyId, variantId: firstVariant, ...points.stage1 },
          as: "antigenAsset"
        },
        {
          command: "insert_asset",
          input: { familyId: secondFamily.familyId, variantId: secondVariant, ...points.stage5 },
          as: "vesselAsset"
        },
        {
          command: "create_shape",
          input: { kind: "ellipse", ...points.stage2 },
          as: "presentation"
        },
        { command: "create_shape", input: { kind: "ellipse", x: 1740, y: 880 }, as: "apc" },
        { command: "create_shape", input: { kind: "ellipse", x: 1840, y: 880 }, as: "tCell" },
        {
          command: "create_shape",
          input: { kind: "ellipse", ...points.stage4 },
          as: "trafficking"
        },
        {
          command: "create_shape",
          input: { kind: "ellipse", ...points.stage6 },
          as: "recognition"
        },
        { command: "create_shape", input: { kind: "ellipse", ...points.stage7 }, as: "killing" },
        {
          command: "create_particle_field",
          input: {
            count: 16,
            distribution: "cloud",
            seed: "antigen-release",
            bounds: { left: 1020, top: 170, width: 160, height: 120 },
            semanticType: "antigen-release",
            role: "particle-field"
          },
          as: "antigenField"
        },
        {
          command: "create_particle_field",
          input: {
            count: 12,
            distribution: "gradient",
            seed: "cytokine-signals",
            bounds: { left: 1700, top: 800, width: 180, height: 120 },
            semanticType: "cytokine-signals",
            role: "particle-field"
          },
          as: "cytokineField"
        },
        {
          command: "create_particle_field",
          input: {
            count: 14,
            distribution: "gradient",
            seed: "chemokine-gradient",
            bounds: { left: 1320, top: 1170, width: 180, height: 120 },
            semanticType: "chemokine-gradient",
            role: "particle-field"
          },
          as: "chemokineField"
        },
        {
          command: "create_particle_field",
          input: {
            count: 14,
            distribution: "cloud",
            seed: "perforin-granzyme",
            bounds: { left: 480, top: 420, width: 180, height: 120 },
            semanticType: "perforin-granzyme",
            role: "particle-field"
          },
          as: "killingField"
        },
        { command: "create_shape", input: { kind: "circle", x: 1100, y: 800 }, as: "hub" },
        {
          command: "create_text",
          input: { kind: "point", text: "Cancer immunity", x: 1100, y: 770 },
          as: "hubTitle"
        },
        {
          command: "create_text",
          input: { kind: "point", text: "seven-stage cycle", x: 1100, y: 830 },
          as: "hubSubtitle"
        }
      ]
    });
    const antigenAsset = operationData(seededBatch, 0);
    const vesselAsset = operationData(seededBatch, 1);
    const presentation = operationData(seededBatch, 2);
    const apc = operationData(seededBatch, 3);
    const tCell = operationData(seededBatch, 4);
    const trafficking = operationData(seededBatch, 5);
    const recognition = operationData(seededBatch, 6);
    const killing = operationData(seededBatch, 7);
    const antigenField = operationData(seededBatch, 8);
    const cytokineField = operationData(seededBatch, 9);
    const chemokineField = operationData(seededBatch, 10);
    const killingField = operationData(seededBatch, 11);
    const hub = operationData(seededBatch, 12);
    const hubTitle = operationData(seededBatch, 13);
    const hubSubtitle = operationData(seededBatch, 14);
    const hubGroup = await mustCall("group_objects", {
      objectIds: [objectId(hub), objectId(hubTitle), objectId(hubSubtitle)]
    });
    await mustCall("set_object_semantics", {
      objectId: objectId(hubGroup),
      metadata: {
        version: 1,
        semanticRole: "hub",
        semanticType: "cycle-hub",
        semanticName: "cancer-immunity-hub",
        pinned: true
      }
    });
    await mustCall("fit_text", {
      objectId: objectId(hubTitle),
      maxWidth: 260,
      maxHeight: 40,
      minFontSize: 12,
      maxFontSize: 28,
      maxLines: 1
    });
    await mustCall("fit_text", {
      objectId: objectId(hubSubtitle),
      maxWidth: 260,
      maxHeight: 40,
      minFontSize: 10,
      maxFontSize: 20,
      maxLines: 1
    });
    await mustCall("replace_asset_variant", {
      objectId: objectId(antigenAsset),
      variantId: alternateVariant
    });
    const interaction = await mustCall("compose_interaction", {
      sourceObjectId: objectId(apc),
      targetObjectId: objectId(tCell),
      mode: "binding",
      relationId: "mhc-tcr-binding"
    });
    if ((interaction.data?.relation as { kind?: string } | undefined)?.kind !== "binds") {
      throw new Error(`The priming interaction was not a binding: ${JSON.stringify(interaction)}`);
    }
    const intervention = await mustCall("create_annotation", {
      targetObjectId: objectId(presentation),
      text: "anti-PD-1",
      placement: "right",
      gap: 24,
      leader: true
    });
    const bases = [
      { id: objectId(antigenAsset), field: objectId(antigenField) },
      { id: objectId(presentation) },
      { id: objectId(apc), field: objectId(cytokineField), second: objectId(tCell) },
      { id: objectId(trafficking), field: objectId(chemokineField) },
      { id: objectId(vesselAsset) },
      { id: objectId(recognition) },
      { id: objectId(killing), field: objectId(killingField) }
    ];
    const labels = [
      ["Antigen release", "Tumor antigen", "antigen enters cycle"],
      ["Antigen presentation", "MHC-I display", "presented peptide"],
      ["T-cell priming", "APC + T cell", "co-stimulation"],
      ["Trafficking", "Chemokine gradient", "toward tumor"],
      ["Extravasation", "Vessel crossing", "into tumor bed"],
      ["Recognition", "Checkpoint", "target engagement"],
      ["Killing", "Perforin + granzymes", "apoptosis"]
    ];
    const positions = [
      points.stage1,
      points.stage2,
      points.stage3,
      points.stage4,
      points.stage5,
      points.stage6,
      points.stage7
    ];
    const stages: Array<{ stageId: string; contentObjectId: string; labelObjectId: string }> = [];
    for (let index = 0; index < bases.length; index += 1) {
      const base = bases[index];
      const contentIds = [
        base.id,
        ...(base.field ? [base.field] : []),
        ...(base.second ? [base.second] : [])
      ];
      const group = await mustCall("compose_labeled_group", {
        objectIds: contentIds,
        label: labels[index][0],
        title: labels[index][1],
        subtitle: labels[index][2],
        placement: "outward",
        stageId: `cycle-stage-${index + 1}`,
        stageIndex: index + 1,
        ...positions[index]
      });
      stages.push({
        stageId: `cycle-stage-${index + 1}`,
        contentObjectId: objectId({
          data: group.data?.contentObjectId ? { objectId: group.data.contentObjectId } : undefined
        }),
        labelObjectId: objectId({
          data: group.data?.labelObjectId ? { objectId: group.data.labelObjectId } : undefined
        })
      });
    }
    const sequence = await mustCall("connect_sequence", {
      objectIds: stages.map((stage) => stage.contentObjectId),
      closed: true,
      routeType: "cycle-arc",
      center: { x: 1100, y: 800 },
      axes: { x: 700, y: 500 },
      direction: "clockwise"
    });
    const semanticOperations = stages.map((stage, index) => {
      const next = stages[(index + 1) % stages.length];
      const relation = {
        id: `cycle-flow-${index + 1}`,
        kind: "flow_to",
        sourceObjectId: stage.contentObjectId,
        targetObjectId: next.contentObjectId,
        direction: "forward"
      };
      const extra =
        index === 0
          ? {
              id: "antigen-release-emits",
              kind: "emits",
              sourceObjectId: baseId(bases[0]),
              targetObjectId: baseField(bases[0])
            }
          : index === 2
            ? {
                id: "priming-contacts",
                kind: "contacts",
                sourceObjectId: baseId(bases[2]),
                targetObjectId: baseSecond(bases[2])
              }
            : index === 3
              ? {
                  id: "trafficking-follows-gradient",
                  kind: "follows_gradient",
                  sourceObjectId: baseField(bases[3]),
                  targetObjectId: baseId(bases[3])
                }
              : index === 4
                ? {
                    id: "extravasation-crosses-vessel",
                    kind: "crosses",
                    sourceObjectId: baseId(bases[4]),
                    targetObjectId: stage.contentObjectId
                  }
                : index === 5
                  ? {
                      id: "checkpoint-inhibited-by",
                      kind: "intervention_targets",
                      sourceObjectId: stage.contentObjectId,
                      targetObjectId: objectId(intervention)
                    }
                  : index === 6
                    ? {
                        id: "killing-emits-granzyme",
                        kind: "emits",
                        sourceObjectId: stage.contentObjectId,
                        targetObjectId: baseField(bases[6])
                      }
                    : undefined;
      return {
        command: "set_object_semantics",
        input: {
          objectId: stage.contentObjectId,
          metadata: {
            version: 1,
            semanticRole: "stage-content",
            semanticType: "cycle-stage-content",
            stageId: stage.stageId,
            stageIndex: index + 1,
            preferredPortHint: "outgoing"
          },
          relations: [relation, ...(extra ? [extra] : [])]
        }
      };
    });
    await mustCall("batch", { confirmed: true, operations: semanticOperations });
    await mustCall("plan_layout", {
      mode: "cycle",
      objectIds: stages.map((stage) => stage.contentObjectId),
      center: { x: 1100, y: 800 },
      axes: { x: 700, y: 500 },
      direction: "clockwise",
      hubKeepOut: { left: 940, top: 640, width: 320, height: 320 }
    });
    await mustCall("normalize_styles", {
      roles: ["stage", "stage-label", "particle-field", "annotation"]
    });
    const analysis = await mustCall("analyze_composition", {
      profile: "scientific-diagram",
      maxFindings: 128,
      padding: 24
    });
    const validation = await mustCall("validate_figure", {
      profile: "cycle",
      maxFindings: 128,
      padding: 24
    });
    const scene = await mustCall("inspect_scene", { maxObjects: 256, maxDepth: 12 });
    const relations = await mustCall("inspect_relations", { limit: 256 });
    const beforeRollback = await mustCall("inspect_scene", { maxObjects: 256, maxDepth: 12 });
    const failedBatch = await call("batch", {
      confirmed: true,
      operations: [
        { command: "create_shape", input: { kind: "rectangle", x: 30, y: 30 }, as: "rolledBack" },
        { command: "move_objects", input: { objectIds: ["stale-rollback-id"], dx: 1, dy: 1 } }
      ]
    });
    const afterRollback = await mustCall("inspect_scene", { maxObjects: 256, maxDepth: 12 });
    return {
      stageCount: stages.length,
      connectorIds: (sequence.data?.connectorIds as string[] | undefined) ?? [],
      interventionId: objectId(intervention),
      analysis,
      validation,
      scene,
      relations,
      beforeRollback,
      failedBatch,
      afterRollback,
      callCount: (window as typeof window & { __webmcpCallCount?: number }).__webmcpCallCount ?? 0
    };

    function baseId(base: { id: string }) {
      return base.id;
    }
    function baseField(base: { field?: string }) {
      if (!base.field) throw new Error("Missing field alias");
      return base.field;
    }
    function baseSecond(base: { second?: string }) {
      if (!base.second) throw new Error("Missing second participant alias");
      return base.second;
    }
  });

  expect(composition.stageCount).toBe(7);
  expect(composition.connectorIds).toHaveLength(7);
  expect(composition.analysis.data?.counts).toMatchObject({ error: 0 });
  expect(composition.validation.data).toMatchObject({ profile: "cycle", pass: true });
  expect(composition.failedBatch).toMatchObject({ ok: false, error: { code: "STALE_OBJECT_ID" } });
  const beforeObjects = ((composition.beforeRollback.data?.objects ?? []) as Descriptor[]).map(
    (object) => object.objectId
  );
  const afterObjects = ((composition.afterRollback.data?.objects ?? []) as Descriptor[]).map(
    (object) => object.objectId
  );
  expect(afterObjects).toHaveLength(beforeObjects.length);
  const sceneShape = (objects: Descriptor[]) =>
    objects
      .map((object) =>
        JSON.stringify({
          type: object.type,
          text: object.text,
          role: object.semanticMetadata?.semanticRole,
          stageId: object.semanticMetadata?.stageId,
          stageIndex: object.semanticMetadata?.stageIndex,
          connector: object.connector
            ? [object.connector.fromObjectId, object.connector.toObjectId]
            : null
        })
      )
      .sort();
  expect(sceneShape(composition.afterRollback.data?.objects as Descriptor[])).toEqual(
    sceneShape(composition.beforeRollback.data?.objects as Descriptor[])
  );
  const descriptors = composition.scene.data?.objects as Descriptor[];
  const stages = descriptors.filter((object) => object.semanticMetadata?.semanticRole === "stage");
  expect(stages).toHaveLength(7);
  expect(
    stages.map((stage) => stage.semanticMetadata?.stageIndex).sort((a, b) => (a ?? 0) - (b ?? 0))
  ).toEqual([1, 2, 3, 4, 5, 6, 7]);
  const stageContents = descriptors.filter(
    (object) => object.semanticMetadata?.semanticRole === "stage-content"
  );
  const stageLabels = descriptors.filter(
    (object) => object.semanticMetadata?.semanticRole === "stage-label"
  );
  expect(stageContents).toHaveLength(7);
  expect(stageLabels).toHaveLength(14);
  expect(
    descriptors.filter((object) => object.semanticMetadata?.semanticRole === "hub")
  ).toHaveLength(1);
  for (const stage of stages) {
    expect(
      descriptors.filter(
        (object) =>
          object.parentObjectId === stage.objectId &&
          object.semanticMetadata?.semanticRole === "stage-content"
      )
    ).toHaveLength(1);
    expect(
      descriptors.filter(
        (object) =>
          object.parentObjectId === stage.objectId &&
          object.semanticMetadata?.semanticRole === "stage-label"
      )
    ).toHaveLength(1);
  }
  expect(
    descriptors.filter((object) => object.semanticMetadata?.semanticRole === "stage-title")
  ).toHaveLength(7);
  expect(
    descriptors.filter((object) => object.semanticMetadata?.semanticRole === "stage-subtitle")
  ).toHaveLength(7);
  const flowConnectors = descriptors.filter((object) => object.connector?.pathShape === "circular");
  expect(flowConnectors).toHaveLength(7);
  expect(flowConnectors.every((object) => object.connector && !object.freeConnector)).toBe(true);
  const relationList = (composition.relations.data?.relations ?? []) as Array<{ kind: string }>;
  expect([...new Set(relationList.map((relation) => relation.kind))]).toEqual(
    expect.arrayContaining([
      "flow_to",
      "binds",
      "contacts",
      "crosses",
      "emits",
      "follows_gradient",
      "intervention_targets"
    ])
  );

  await page.getByRole("button", { name: "Text", exact: true }).click();
  const artboard = await page.locator(".artboard-stage").boundingBox();
  if (!artboard) throw new Error("The artboard is not visible for the manual-edit check.");
  await page.mouse.click(artboard.x + artboard.width * 0.5, artboard.y + artboard.height * 0.5);
  await page.keyboard.type("manual editor proof");
  await page.keyboard.press("Escape");
  const manualScene = await page.evaluate(async () => {
    const tools = (window as typeof window & { __webmcpTools?: Tool[] }).__webmcpTools ?? [];
    const tool = tools.find((candidate) => candidate.name === "inspect_scene");
    if (!tool) throw new Error("Missing WebMCP tool: inspect_scene");
    return (await tool.execute({ maxObjects: 256, maxDepth: 12 })) as Result;
  });
  expect(manualScene.ok).toBe(true);
  const manualText = ((manualScene.data?.objects ?? []) as Descriptor[]).find(
    (object) => object.type === "text" && object.text === "manual editor proof"
  );
  expect(manualText).toBeDefined();
  if (!manualText) throw new Error("Manual text was not visible through WebMCP inspection.");
  const deleted = await page.evaluate(async (objectId) => {
    const tools = (window as typeof window & { __webmcpTools?: Tool[] }).__webmcpTools ?? [];
    const tool = tools.find((candidate) => candidate.name === "delete_objects");
    if (!tool) throw new Error("Missing WebMCP tool: delete_objects");
    return (await tool.execute({ objectIds: [objectId], confirmed: true })) as Result;
  }, manualText.objectId);
  expect(deleted).toMatchObject({ ok: true });

  await page.reload();
  await expect(page.locator(".workspace-plane")).toHaveAttribute("data-canvas-ready", "true");
  await expect
    .poll(async () =>
      page.evaluate(() =>
        ((window as typeof window & { __webmcpTools?: Tool[] }).__webmcpTools ?? []).map(
          (tool) => tool.name
        )
      )
    )
    .toContain("inspect_scene");
  const persisted = await page.evaluate(async () => {
    const tools = (window as typeof window & { __webmcpTools?: Tool[] }).__webmcpTools ?? [];
    const call = async (name: string, input: Record<string, unknown>) => {
      const tool = tools.find((candidate) => candidate.name === name);
      if (!tool) throw new Error(`Missing WebMCP tool: ${name}`);
      const result = (await tool.execute(input)) as Result;
      if (!result.ok) throw new Error(`${name} failed after reload: ${JSON.stringify(result)}`);
      return result;
    };
    return {
      scene: await call("inspect_scene", { maxObjects: 256, maxDepth: 12 }),
      relations: await call("inspect_relations", { limit: 256 }),
      validation: await call("validate_figure", {
        profile: "cycle",
        maxFindings: 128,
        padding: 24
      })
    };
  });
  expect(persisted.validation.data).toMatchObject({ profile: "cycle", pass: true });
  const persistedObjects = persisted.scene.data?.objects as Descriptor[];
  expect(
    persistedObjects.filter((object) => object.semanticMetadata?.semanticRole === "stage")
  ).toHaveLength(7);
  expect(
    persistedObjects.filter((object) => object.connector?.pathShape === "circular")
  ).toHaveLength(7);
  expect((persisted.relations.data?.relations ?? []) as unknown[]).toHaveLength(
    ((composition.relations.data?.relations ?? []) as unknown[]).length
  );

  for (const format of ["svg", "pdf", "png", "credits"] as const) {
    const downloadPromise = page.waitForEvent("download");
    const exported = await page.evaluate(async (requestedFormat) => {
      const tools = (window as typeof window & { __webmcpTools?: Tool[] }).__webmcpTools ?? [];
      const tool = tools.find((candidate) => candidate.name === "export_figure");
      if (!tool) throw new Error("Missing WebMCP tool: export_figure");
      return (await tool.execute({
        format: requestedFormat,
        title: "Cycle qualification"
      })) as Result;
    }, format);
    const download = await downloadPromise;
    expect(exported).toMatchObject({ ok: true, data: { format, started: true } });
    expect(download.suggestedFilename()).toContain(format);
  }
  expect(composition.callCount).toBeGreaterThanOrEqual(25);
  expect(composition.callCount).toBeLessThanOrEqual(35);
});
