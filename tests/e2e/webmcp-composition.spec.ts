import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

type Tool = {
  name: string;
  execute: (input: Record<string, unknown>) => Promise<unknown>;
};

type Result = {
  ok: boolean;
  data?: Record<string, any>;
  error?: { code: string; message?: string };
};

type Descriptor = {
  objectId: string;
  type: string;
  name?: string;
  text?: string;
  parentObjectId?: string;
  bounds?: { left: number; top: number; width: number; height: number };
  position?: { x: number; y: number };
  geometry?: { center: { x: number; y: number }; visualBounds: Descriptor["bounds"] };
  asset?: { familyId?: string; variantId?: string };
  semanticMetadata?: Record<string, any>;
  connector?: {
    fromObjectId: string;
    toObjectId: string;
    pathShape?: string;
    routing?: string;
  };
  freeConnector?: unknown;
};

async function installRecorder(page: Page) {
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
    (window as typeof window & { __webmcpCalls?: string[] }).__webmcpCalls = [];
  });
  await page.goto("./?webmcpDemo=1");
  await page.getByRole("button", { name: "New figure" }).click();
  await expect(page.locator(".workspace-plane")).toHaveAttribute("data-canvas-ready", "true");
}

async function registeredToolNames(page: Page) {
  return page.evaluate(() =>
    ((window as typeof window & { __webmcpTools?: Tool[] }).__webmcpTools ?? []).map(
      (tool) => tool.name
    )
  );
}

test("rejects the historical false-pass baseline before qualifying the reference", async ({
  page
}) => {
  const baseline = JSON.parse(
    readFileSync(
      resolve(process.cwd(), "tests/fixtures/webmcp-composition/negative-baseline.json"),
      "utf8"
    )
  ) as {
    historicalValidation: { pass: boolean };
    correctedValidation: { pass: boolean; requiredFinding: string };
  };
  expect(baseline.historicalValidation.pass).toBe(true);
  expect(baseline.correctedValidation.pass).toBe(false);
  await installRecorder(page);
  const result = await page.evaluate(async () => {
    const tools = (window as typeof window & { __webmcpTools?: Tool[] }).__webmcpTools ?? [];
    const call = async (name: string, input: Record<string, unknown>) => {
      const tool = tools.find((candidate) => candidate.name === name);
      if (!tool) throw new Error(`Missing WebMCP tool: ${name}`);
      return (await tool.execute(input)) as Result;
    };
    const mustCall = async (name: string, input: Record<string, unknown>) => {
      const response = await call(name, input);
      if (!response.ok) throw new Error(`${name} failed: ${JSON.stringify(response)}`);
      return response;
    };
    await mustCall("resize_canvas", { width: 1200, height: 900 });
    const seeded = await mustCall("batch", {
      confirmed: true,
      operations: Array.from({ length: 7 }, (_, index) => ({
        command: "create_shape",
        input: { kind: "ellipse", x: 120 + index * 145, y: index % 2 ? 730 : 170 },
        as: `stage${index + 1}`
      }))
    });
    const operations = seeded.data?.operations as Array<{ result: Result }>;
    const objectIds = operations.map((operation) => operation.result.data?.objectId as string);
    const stages: string[] = [];
    for (let index = 0; index < objectIds.length; index += 1) {
      const group = await mustCall("compose_labeled_group", {
        objectIds: [objectIds[index]],
        label: `Stage ${index + 1}`,
        title: `Stage ${index + 1}`,
        placement: "outward",
        stageId: `negative-stage-${index + 1}`,
        stageIndex: index + 1,
        x: 120 + index * 145,
        y: index % 2 ? 730 : 170
      });
      stages.push(group.data?.contentObjectId as string);
    }
    const semantics = stages.map((objectId, index) => ({
      command: "set_object_semantics",
      input: {
        objectId,
        metadata: {
          version: 1,
          semanticRole: "stage-content",
          stageId: `negative-stage-${index + 1}`,
          stageIndex: index + 1
        },
        relations: [
          {
            id: `negative-flow-${index + 1}`,
            kind: "flow_to",
            sourceObjectId: objectId,
            targetObjectId: stages[(index + 1) % stages.length],
            direction: "forward"
          }
        ]
      }
    }));
    await mustCall("batch", { confirmed: true, operations: semantics });
    await mustCall("connect_sequence", {
      objectIds: stages,
      closed: true,
      routeType: "cycle-arc",
      center: { x: 600, y: 450 },
      axes: { x: 500, y: 360 },
      direction: "clockwise"
    });
    const validation = await mustCall("validate_figure", {
      profile: "publication",
      maxFindings: 128,
      padding: 48
    });
    const cycle = await mustCall("validate_figure", {
      profile: "cycle",
      maxFindings: 128,
      padding: 24
    });
    return { validation, cycle };
  });

  expect(result.validation.data?.pass).toBe(false);
  expect(result.cycle.data?.pass).toBe(false);
  const codes = [
    ...((result.validation.data?.findings ?? []) as Array<{ code: string }>),
    ...((result.cycle.data?.findings ?? []) as Array<{ code: string }>)
  ].map((finding) => finding.code);
  expect(codes).toContain(baseline.correctedValidation.requiredFinding);
});

test("qualifies a real-asset cancer-immunity reference through registered WebMCP", async ({
  page
}) => {
  test.setTimeout(120000);
  await installRecorder(page);
  await page.evaluate(async () => {
    await document.fonts.load('16px "Source Sans 3"');
    await document.fonts.ready;
  });
  await expect
    .poll(() => registeredToolNames(page))
    .toEqual(
      expect.arrayContaining([
        "search_assets",
        "inspect_asset",
        "insert_asset",
        "batch",
        "compose_labeled_group",
        "compose_interaction",
        "create_particle_field",
        "create_annotation",
        "connect_sequence",
        "plan_layout",
        "apply_layout_plan",
        "analyze_composition",
        "validate_figure",
        "export_figure"
      ])
    );

  const composition = await page.evaluate(async () => {
    const tools = (window as typeof window & { __webmcpTools?: Tool[] }).__webmcpTools ?? [];
    const calls = (window as typeof window & { __webmcpCalls?: string[] }).__webmcpCalls ?? [];
    const call = async (name: string, input: Record<string, unknown>): Promise<Result> => {
      const tool = tools.find((candidate) => candidate.name === name);
      if (!tool) throw new Error(`Missing WebMCP tool: ${name}`);
      calls.push(name);
      const result = (await tool.execute(input)) as Result;
      if (!result.ok) throw new Error(`${name} failed: ${JSON.stringify(result)}`);
      return result;
    };
    const objectId = (result: Result | Record<string, unknown>): string => {
      const data = "data" in result ? result.data : result;
      const id = data?.objectId;
      if (typeof id !== "string") throw new Error(`Missing object ID: ${JSON.stringify(result)}`);
      return id;
    };
    const operationData = (result: Result, index: number): Record<string, any> => {
      const operation = (result.data?.operations as Array<{ result: Result }>)[index];
      if (!operation?.result.ok || !operation.result.data)
        throw new Error(`Missing successful batch operation ${index}`);
      return operation.result.data;
    };
    const findFamily = async (query: string, title: string, category: string, familyId: string) => {
      const search = await call("search_assets", { query, category, limit: 32 });
      const results = (search.data?.results ?? []) as Array<{ familyId: string; title: string }>;
      const match = results.find(
        (candidate) => candidate.title === title && candidate.familyId === familyId
      );
      if (!match) throw new Error(`No exact ${title} family returned for ${query}`);
      const inspected = await call("inspect_asset", { familyId: match.familyId });
      const family = inspected.data?.family as {
        familyId: string;
        title: string;
        selectedVariantId: string;
        variants: Array<{ id: string }>;
      };
      return {
        familyId: family.familyId,
        variantId: family.selectedVariantId,
        variants: family.variants
      };
    };

    await call("resize_canvas", { width: 1800, height: 1350 });
    await call("set_project_metadata", {
      name: "Cancer-immunity cycle qualification",
      description: "Registered WebMCP reference workflow; negative baseline retained separately."
    });

    const [apoptosis, dendritic, lymphNode, cd8, tCell, venule, antibody, mhc, tumor] =
      await Promise.all([
        findFamily("Apoptosis", "Apoptosis", "Cellular processes", "nih-bioart-21"),
        findFamily("Dendritic Cell", "Dendritic Cell", "Cells", "nih-bioart-114"),
        findFamily("Lymph Node", "Lymph Node", "Anatomy", "nih-bioart-304"),
        findFamily("CD8 TCell", "CD8 TCell", "Cells", "nih-bioart-69"),
        findFamily("T Cell", "T Cell", "Cells", "nih-bioart-509"),
        findFamily("Venule Cross Section", "Venule Cross Section", "Anatomy", "nih-bioart-539"),
        findFamily("Antibody", "Antibody", "Proteins", "nih-bioart-17"),
        findFamily("MHC Class 1", "MHC Class 1", "Proteins", "nih-bioart-341"),
        findFamily("Tumor", "Tumor", "Cancer & pathology", "bioicons-tumor-480bc370")
      ]);
    const assetInput = (asset: { familyId: string; variantId: string }) => ({
      familyId: asset.familyId,
      variantId: asset.variantId
    });

    const seeded = await call("batch", {
      confirmed: true,
      operations: [
        {
          command: "insert_asset",
          input: { ...assetInput(tumor), x: 220, y: 180 },
          as: "stage1Living"
        },
        {
          command: "insert_asset",
          input: { ...assetInput(apoptosis), x: 300, y: 180 },
          as: "stage1Dying"
        },
        {
          command: "insert_asset",
          input: { ...assetInput(dendritic), x: 520, y: 180 },
          as: "stage2Dendritic"
        },
        {
          command: "insert_asset",
          input: { ...assetInput(lymphNode), x: 620, y: 180 },
          as: "stage2Lymph"
        },
        {
          command: "insert_asset",
          input: { ...assetInput(dendritic), x: 860, y: 270 },
          as: "stage3Apc"
        },
        { command: "insert_asset", input: { ...assetInput(cd8), x: 960, y: 270 }, as: "stage3Cd8" },
        {
          command: "insert_asset",
          input: { ...assetInput(mhc), x: 1020, y: 270 },
          as: "stage3Mhc"
        },
        {
          command: "insert_asset",
          input: { ...assetInput(tCell), x: 1210, y: 250 },
          as: "stage4T1"
        },
        {
          command: "insert_asset",
          input: { ...assetInput(tCell), x: 1270, y: 300 },
          as: "stage4T2"
        },
        {
          command: "insert_asset",
          input: { ...assetInput(tCell), x: 1490, y: 420 },
          as: "stage5TCell"
        },
        {
          command: "insert_asset",
          input: { ...assetInput(venule), x: 1550, y: 420 },
          as: "stage5Vessel"
        },
        {
          command: "insert_asset",
          input: { ...assetInput(tCell), x: 1530, y: 720 },
          as: "stage6TCell"
        },
        {
          command: "insert_asset",
          input: { ...assetInput(tumor), x: 1600, y: 720 },
          as: "stage6Tumor"
        },
        {
          command: "insert_asset",
          input: { ...assetInput(tCell), x: 1240, y: 980 },
          as: "stage7Effector"
        },
        {
          command: "insert_asset",
          input: { ...assetInput(tumor), x: 1160, y: 980 },
          as: "stage7Target"
        },
        {
          command: "insert_asset",
          input: { ...assetInput(apoptosis), x: 1080, y: 980 },
          as: "stage7Apoptosis"
        },
        {
          command: "insert_asset",
          input: { ...assetInput(antibody), x: 1540, y: 700 },
          as: "checkpoint"
        }
      ]
    });
    const seededIds = Array.from({ length: 17 }, (_, index) =>
      objectId(operationData(seeded, index))
    );
    const [
      stage1Living,
      stage1Dying,
      stage2Dendritic,
      stage2Lymph,
      stage3Apc,
      stage3Cd8,
      stage3Mhc,
      stage4T1,
      stage4T2,
      stage5TCell,
      stage5Vessel,
      stage6TCell,
      stage6Tumor,
      stage7Effector,
      stage7Target,
      stage7Apoptosis,
      checkpoint
    ] = seededIds;
    const alternate = tCell.variants.find((variant) => variant.id !== tCell.variantId)?.id;
    if (alternate)
      await call("replace_asset_variant", { objectId: stage7Effector, variantId: alternate });
    await call("scale_objects", { objectIds: seededIds, scaleX: 0.5, scaleY: 0.5 });
    const seededGeometry = await call("inspect_geometry", { objectIds: seededIds });
    const unevaluableSeeded = (
      seededGeometry.data?.objects as Array<{ objectId: string; geometry: { evaluable: boolean } }>
    ).filter((object) => object.geometry.evaluable === false);
    if (unevaluableSeeded.length > 0)
      throw new Error(
        `Unevaluable seeded assets: ${JSON.stringify(
          unevaluableSeeded.map((object) => ({
            index: seededIds.indexOf(object.objectId),
            familyId: [
              tumor,
              apoptosis,
              dendritic,
              lymphNode,
              dendritic,
              cd8,
              mhc,
              tCell,
              tCell,
              tCell,
              venule,
              tCell,
              tumor,
              tCell,
              tumor,
              apoptosis,
              antibody
            ][seededIds.indexOf(object.objectId)].familyId
          }))
        )}`
      );

    const antigenField = objectId(
      await call("create_particle_field", {
        count: 12,
        distribution: "cloud",
        seed: "tumor-antigens-v1",
        bounds: { left: 180, top: 120, width: 90, height: 60 },
        semanticType: "tumor-antigen",
        role: "particle-field"
      })
    );
    const captureField = objectId(
      await call("create_particle_field", {
        count: 10,
        distribution: "target-converging",
        seed: "tumor-antigen-capture-v1",
        bounds: { left: 430, top: 120, width: 90, height: 60 },
        targetObjectId: stage2Dendritic,
        semanticType: "tumor-antigen-capture",
        role: "particle-field"
      })
    );
    const chemokineField = objectId(
      await call("create_particle_field", {
        count: 14,
        distribution: "gradient",
        seed: "chemokine-gradient-v1",
        bounds: { left: 1260, top: 280, width: 120, height: 70 },
        semanticType: "chemokine-gradient",
        role: "particle-field"
      })
    );
    const granzymeField = objectId(
      await call("create_particle_field", {
        count: 10,
        distribution: "linear",
        seed: "perforin-granzyme-v1",
        bounds: { left: 1120, top: 900, width: 120, height: 70 },
        semanticType: "perforin-granzyme",
        role: "particle-field"
      })
    );

    const interactions = [
      [stage1Living, stage1Dying, "progression", "tumor-cell-death"],
      [stage3Apc, stage3Cd8, "binding", "priming-mhc-tcr"],
      [stage3Apc, stage3Mhc, "binding", "mhc-presentation"],
      [stage4T1, stage5TCell, "migration", "trafficking-tcell-migration"],
      [stage5TCell, stage5Vessel, "cross-boundary", "extravasation-vessel-crossing"],
      [stage6TCell, stage6Tumor, "contact", "recognition-contact"],
      [stage7Effector, stage7Target, "contact", "killing-contact"],
      [stage7Effector, stage7Apoptosis, "progression", "target-apoptosis"],
      [stage1Dying, antigenField, "secretion", "antigen-release-emits"],
      [stage7Effector, granzymeField, "secretion", "granzyme-emission"]
    ] as const;
    for (const [sourceObjectId, targetObjectId, mode, relationId] of interactions) {
      await call("compose_interaction", { sourceObjectId, targetObjectId, mode, relationId });
    }

    await call("batch", {
      confirmed: true,
      operations: [
        {
          command: "set_object_semantics",
          input: {
            objectId: captureField,
            metadata: { version: 1, semanticRole: "particle-field", semanticType: "tumor-antigen" },
            relations: [
              {
                id: "antigen-uptake",
                kind: "emits",
                sourceObjectId: captureField,
                targetObjectId: stage2Dendritic,
                direction: "forward",
                allowedOverlap: true
              }
            ]
          }
        },
        {
          command: "set_object_semantics",
          input: {
            objectId: checkpoint,
            metadata: { version: 1, semanticRole: "intervention", semanticType: "anti-pd1" },
            relations: [
              {
                id: "checkpoint-intervention",
                kind: "intervention_targets",
                sourceObjectId: checkpoint,
                targetObjectId: stage6TCell,
                direction: "forward"
              }
            ]
          }
        },
        {
          command: "set_object_semantics",
          input: {
            objectId: stage1Dying,
            metadata: { version: 1 },
            relations: [
              {
                id: "antigen-release-emits",
                kind: "emits",
                sourceObjectId: stage1Dying,
                targetObjectId: antigenField,
                direction: "forward",
                allowedOverlap: true
              }
            ]
          }
        },
        {
          command: "set_object_semantics",
          input: {
            objectId: stage3Apc,
            metadata: { version: 1 },
            relations: [
              {
                id: "priming-mhc-tcr",
                kind: "binds",
                sourceObjectId: stage3Apc,
                targetObjectId: stage3Cd8,
                direction: "forward",
                allowedOverlap: true
              },
              {
                id: "mhc-presentation",
                kind: "binds",
                sourceObjectId: stage3Apc,
                targetObjectId: stage3Mhc,
                direction: "forward",
                allowedOverlap: true
              }
            ]
          }
        },
        {
          command: "set_object_semantics",
          input: {
            objectId: chemokineField,
            metadata: { version: 1 },
            relations: [
              {
                id: "trafficking-gradient",
                kind: "follows_gradient",
                sourceObjectId: chemokineField,
                targetObjectId: stage5Vessel,
                direction: "forward"
              }
            ]
          }
        },
        {
          command: "set_object_semantics",
          input: {
            objectId: stage6TCell,
            metadata: { version: 1 },
            relations: [
              {
                id: "checkpoint-inhibition",
                kind: "inhibited_by",
                sourceObjectId: stage6TCell,
                targetObjectId: checkpoint,
                direction: "reverse"
              }
            ]
          }
        },
        {
          command: "set_object_semantics",
          input: {
            objectId: stage7Effector,
            metadata: { version: 1 },
            relations: [
              {
                id: "killing-contact",
                kind: "contacts",
                sourceObjectId: stage7Effector,
                targetObjectId: stage7Target,
                direction: "forward",
                allowedOverlap: true
              },
              {
                id: "granzyme-emission",
                kind: "emits",
                sourceObjectId: stage7Effector,
                targetObjectId: granzymeField,
                direction: "forward",
                allowedOverlap: true
              },
              {
                id: "target-apoptosis",
                kind: "flow_to",
                sourceObjectId: stage7Effector,
                targetObjectId: stage7Apoptosis,
                direction: "forward"
              }
            ]
          }
        }
      ]
    });

    const hubSeed = await call("batch", {
      confirmed: true,
      operations: [
        {
          command: "create_shape",
          input: { kind: "rounded-rectangle", x: 900, y: 680 },
          as: "hub-backdrop"
        },
        {
          command: "create_text",
          input: {
            kind: "point",
            text: "THE CANCER–IMMUNITY CYCLE",
            x: 900,
            y: 640,
            fontSize: 22,
            fontWeight: 700
          },
          as: "hub-title"
        },
        {
          command: "create_text",
          input: {
            kind: "point",
            text: "Antigen release to immune control",
            x: 900,
            y: 720,
            fontSize: 16,
            fontWeight: 600
          },
          as: "hub-subtitle"
        }
      ]
    });
    const hubBackdrop = objectId(operationData(hubSeed, 0));
    const hubTitle = objectId(operationData(hubSeed, 1));
    const hubSubtitle = objectId(operationData(hubSeed, 2));
    const hub = await call("group_objects", {
      objectIds: [hubBackdrop, hubTitle, hubSubtitle]
    });
    const hubId = objectId(hub);
    await call("batch", {
      confirmed: true,
      operations: [
        {
          command: "set_object_semantics",
          input: {
            objectId: hubId,
            metadata: { version: 1, semanticRole: "hub", semanticType: "cancer-immunity-hub" }
          }
        },
        {
          command: "set_object_semantics",
          input: {
            objectId: hubTitle,
            metadata: { version: 1, semanticRole: "decorative", semanticType: "hub-title" }
          }
        },
        {
          command: "set_object_semantics",
          input: {
            objectId: hubSubtitle,
            metadata: { version: 1, semanticRole: "decorative", semanticType: "hub-subtitle" }
          }
        }
      ]
    });

    const annotationIds = [
      objectId(
        await call("create_annotation", {
          targetObjectId: stage3Apc,
          text: "peptide-MHC-I / TCR-CD8",
          placement: "auto",
          gap: 8,
          maxWidth: 160,
          fontSize: 12,
          leader: true,
          relationId: "priming-mhc-tcr"
        })
      ),
      objectId(
        await call("create_annotation", {
          targetObjectId: chemokineField,
          text: "chemokine gradient",
          placement: "auto",
          gap: 8,
          maxWidth: 160,
          fontSize: 12,
          leader: true,
          relationId: "trafficking-gradient"
        })
      ),
      objectId(
        await call("create_annotation", {
          targetObjectId: checkpoint,
          text: "PD-1/PD-L1 checkpoint blockade — anti-PD-1",
          placement: "left",
          gap: 8,
          maxWidth: 160,
          fontSize: 12,
          leader: true,
          relationId: "checkpoint-intervention"
        })
      ),
      objectId(
        await call("create_annotation", {
          targetObjectId: stage7Apoptosis,
          text: "apoptosis",
          placement: "auto",
          gap: 8,
          maxWidth: 120,
          fontSize: 12,
          leader: true,
          relationId: "target-apoptosis"
        })
      )
    ];

    const stageInputs = [
      [stage1Living, stage1Dying, antigenField],
      [stage2Dendritic, stage2Lymph, captureField],
      [stage3Apc, stage3Cd8, stage3Mhc],
      [stage4T1, stage4T2, chemokineField],
      [stage5TCell, stage5Vessel],
      [stage6TCell, stage6Tumor, checkpoint],
      [stage7Effector, stage7Target, stage7Apoptosis, granzymeField]
    ];
    const labels = [
      ["Cancer-antigen release", "Tumor cell death", "antigen + danger"],
      ["Antigen presentation", "Dendritic-cell uptake", "lymph-node context"],
      ["Priming and activation", "APC + CD8 T cell", "MHC-I / TCR priming"],
      ["T-cell trafficking", "Chemokine-guided migration", "CXCL9 / CXCL10 / CXCL11"],
      ["Tumor infiltration", "T cell crosses endothelium", "extravasation"],
      ["Tumor recognition", "TCR/CD8 recognition", "PD-1 / PD-L1 checkpoint"],
      ["Cancer-cell killing", "Cytotoxic killing", "granzyme to apoptosis"]
    ];
    const stages: Array<{
      stageId: string;
      stageObjectId: string;
      contentObjectId: string;
      labelObjectId: string;
    }> = [];
    for (let index = 0; index < stageInputs.length; index += 1) {
      const group = await call("compose_labeled_group", {
        objectIds: stageInputs[index],
        label: labels[index][0],
        title: labels[index][1],
        subtitle: labels[index][2],
        placement: "outward",
        stageId: `cancer-cycle-stage-${index + 1}`,
        stageIndex: index + 1,
        x: 220 + (index % 4) * 430,
        y: 240 + Math.floor(index / 4) * 440
      });
      stages.push({
        stageId: `cancer-cycle-stage-${index + 1}`,
        stageObjectId: objectId(group),
        contentObjectId: group.data?.contentObjectId as string,
        labelObjectId: group.data?.labelObjectId as string
      });
    }
    const stageContents = stages.map((stage) => stage.contentObjectId);
    const flowRelations = stages.map((stage, index) => ({
      id: `cancer-cycle-flow-${index + 1}`,
      kind: "flow_to",
      sourceObjectId: stage.contentObjectId,
      targetObjectId: stages[(index + 1) % stages.length].contentObjectId,
      direction: "forward"
    }));
    await call("batch", {
      confirmed: true,
      operations: stages.map((stage, index) => ({
        command: "set_object_semantics",
        input: {
          objectId: stage.contentObjectId,
          metadata: {
            version: 1,
            semanticRole: "stage-content",
            semanticType: "cancer-cycle-stage",
            stageId: stage.stageId,
            stageIndex: index + 1
          },
          relations: [flowRelations[index]]
        }
      }))
    });
    await call("batch", {
      confirmed: true,
      operations: [
        {
          command: "set_object_semantics",
          input: {
            objectId: stages[2].contentObjectId,
            metadata: {
              version: 1,
              semanticRole: "stage-content",
              semanticType: "cancer-cycle-stage",
              stageId: stages[2].stageId,
              stageIndex: 3
            },
            relations: [flowRelations[2]]
          }
        },
        {
          command: "set_object_semantics",
          input: {
            objectId: stages[4].contentObjectId,
            metadata: {
              version: 1,
              semanticRole: "stage-content",
              semanticType: "cancer-cycle-stage",
              stageId: stages[4].stageId,
              stageIndex: 5
            },
            relations: [
              flowRelations[4],
              {
                id: "reference-gradient-stage5",
                kind: "follows_gradient",
                sourceObjectId: chemokineField,
                targetObjectId: stage5Vessel,
                direction: "forward"
              }
            ]
          }
        },
        {
          command: "set_object_semantics",
          input: {
            objectId: stages[6].contentObjectId,
            metadata: {
              version: 1,
              semanticRole: "stage-content",
              semanticType: "cancer-cycle-stage",
              stageId: stages[6].stageId,
              stageIndex: 7
            },
            relations: [flowRelations[6]]
          }
        }
      ]
    });
    await call("scale_objects", {
      objectIds: stages.map((stage) => stage.contentObjectId),
      scaleX: 0.24,
      scaleY: 0.24
    });
    const planResult = await call("plan_layout", {
      mode: "cycle",
      objectIds: stageContents,
      center: { x: 900, y: 700 },
      axes: { x: 420, y: 260 },
      preferredAxes: { x: 420, y: 260 },
      fixedAxes: false,
      direction: "clockwise",
      gap: 36,
      padding: 72,
      hubKeepOut: { left: 760, top: 595, width: 280, height: 170 },
      maxIterations: 32
    });
    const plan = planResult.data?.plan as {
      id: string;
      status: string;
      positions?: Array<{ objectId: string; x: number; y: number }>;
      objective?: Record<string, number>;
    };
    if (!plan || plan.status !== "feasible")
      throw new Error(`Reference layout is not feasible: ${JSON.stringify(plan)}`);
    const applied = await call("apply_layout_plan", { planId: plan.id });
    const sequence = await call("connect_sequence", {
      objectIds: stageContents,
      closed: true,
      routeType: "cycle-arc",
      arrowhead: "bar",
      center: { x: 900, y: 700 },
      axes: { x: 420, y: 260 },
      direction: "clockwise"
    });
    const stalePlanResult = await call("plan_layout", {
      mode: "cycle",
      objectIds: stageContents,
      center: { x: 900, y: 700 },
      axes: { x: 420, y: 260 },
      preferredAxes: { x: 420, y: 260 },
      fixedAxes: false,
      direction: "clockwise",
      gap: 36,
      padding: 72,
      hubKeepOut: { left: 760, top: 595, width: 280, height: 170 },
      maxIterations: 32
    });
    const stalePlan = stalePlanResult.data?.plan as { id: string };
    await call("set_object_semantics", {
      objectId: hubId,
      metadata: {
        version: 1,
        semanticRole: "hub",
        semanticType: "cancer-immunity-hub"
      }
    });
    const applyLayoutTool = tools.find((candidate) => candidate.name === "apply_layout_plan");
    if (!applyLayoutTool) throw new Error("Missing apply_layout_plan");
    const staleApply = (await applyLayoutTool.execute({ planId: stalePlan.id })) as Result;
    if (staleApply.ok) throw new Error("A stale layout plan was accepted after a scene change.");
    const beforeAtomicBatch = await call("inspect_scene", { maxObjects: 256, maxDepth: 12 });
    const batchTool = tools.find((candidate) => candidate.name === "batch");
    if (!batchTool) throw new Error("Missing batch");
    const failedBatch = (await batchTool.execute({
      confirmed: true,
      operations: [
        { command: "create_shape", input: { kind: "ellipse", x: 120, y: 120 } },
        { command: "scale_objects", input: { objectIds: ["missing-object"], scaleX: 2, scaleY: 2 } }
      ]
    })) as Result;
    const afterAtomicBatch = await call("inspect_scene", { maxObjects: 256, maxDepth: 12 });
    await call("normalize_styles", {
      roles: ["hub", "stage", "stage-label", "particle-field", "annotation"]
    });
    const sceneBeforeManual = await call("inspect_scene", { maxObjects: 256, maxDepth: 12 });
    const hubDescriptors = await call("find_objects", { semanticRole: "hub", limit: 8 });
    const hubTitleDescriptors = await call("find_objects", {
      text: "THE CANCER–IMMUNITY CYCLE",
      caseSensitive: true,
      limit: 8
    });
    const hubSubtitleDescriptors = await call("find_objects", {
      text: "Antigen release to immune control",
      caseSensitive: true,
      limit: 8
    });
    const stageDescriptors = await call("find_objects", { semanticRole: "stage", limit: 32 });
    const contentDescriptors = await call("find_objects", {
      semanticRole: "stage-content",
      limit: 32
    });
    const labelDescriptors = await call("find_objects", {
      semanticRole: "stage-label",
      limit: 64
    });
    const connectorDescriptors = await call("find_objects", {
      semanticRole: "main-flow-connector",
      limit: 32
    });
    const allConnectorDescriptors = await call("find_objects", {
      objectType: "connector",
      limit: 100
    });
    const assetDescriptors = await call("find_objects", {
      assetFamilyId: "nih-bioart-509",
      limit: 8
    });
    const tumorDescriptors = await call("find_objects", {
      assetFamilyId: "bioicons-tumor-480bc370",
      limit: 8
    });
    const apoptosisDescriptors = await call("find_objects", {
      assetFamilyId: "nih-bioart-21",
      limit: 8
    });
    const dendriticDescriptors = await call("find_objects", {
      assetFamilyId: "nih-bioart-114",
      limit: 8
    });
    const lymphNodeDescriptors = await call("find_objects", {
      assetFamilyId: "nih-bioart-304",
      limit: 8
    });
    const checkpointDescriptors = await call("find_objects", {
      semanticRole: "intervention",
      limit: 8
    });
    const vesselDescriptors = await call("find_objects", {
      assetFamilyId: "nih-bioart-539",
      limit: 8
    });
    const cd8Descriptors = await call("find_objects", { assetFamilyId: "nih-bioart-69", limit: 8 });
    const mhcDescriptors = await call("find_objects", {
      assetFamilyId: "nih-bioart-341",
      limit: 8
    });
    const stageGeometry = await call("inspect_geometry", {
      objectIds: stages.map((stage) => stage.contentObjectId)
    });
    const hubGeometry = await call("inspect_geometry", { objectIds: [hubId] });
    const relations = await call("inspect_relations", { limit: 256 });
    const analysis = await call("analyze_composition", {
      profile: "scientific-diagram",
      maxFindings: 256,
      padding: 48
    });
    const cycle = await call("validate_figure", {
      profile: "cycle",
      maxFindings: 256,
      padding: 48
    });
    const publication = await call("validate_figure", {
      profile: "publication",
      maxFindings: 256,
      padding: 48
    });
    return {
      stages,
      stageContents,
      sequence,
      staleApply,
      failedBatch,
      atomicObjectCountBefore: (beforeAtomicBatch.data?.objects ?? []).length,
      atomicObjectCountAfter: (afterAtomicBatch.data?.objects ?? []).length,
      applied,
      plan,
      annotationIds,
      relations,
      analysis,
      cycle,
      publication,
      sceneBeforeManual,
      hubDescriptors,
      hubTitleDescriptors,
      hubSubtitleDescriptors,
      stageDescriptors,
      contentDescriptors,
      labelDescriptors,
      connectorDescriptors,
      allConnectorDescriptors,
      assetDescriptors,
      tumorDescriptors,
      apoptosisDescriptors,
      dendriticDescriptors,
      lymphNodeDescriptors,
      checkpointDescriptors,
      vesselDescriptors,
      cd8Descriptors,
      mhcDescriptors,
      stageGeometry,
      hubGeometry,
      hubId,
      callNames: [...calls]
    };
  });

  const names = composition.callNames as string[];
  expect(names).toContain("apply_layout_plan");
  expect(names).toContain("connect_sequence");
  expect(names.filter((name) => name === "move_objects")).toHaveLength(0);
  expect(composition.stages).toHaveLength(7);
  expect(composition.sequence.data?.connectorIds).toHaveLength(7);
  expect(composition.plan.status).toBe("feasible");
  expect(composition.applied.data?.planId).toBe(composition.plan.id);
  const appliedGeometry = composition.stageGeometry.data?.objects as Array<{
    objectId: string;
    geometry: { center: { x: number; y: number } };
  }>;
  for (const planned of composition.plan.positions ?? []) {
    const actual = appliedGeometry.find((object) => object.objectId === planned.objectId);
    expect(actual).toBeDefined();
    expect(
      Math.hypot(actual!.geometry.center.x - planned.x, actual!.geometry.center.y - planned.y)
    ).toBeLessThanOrEqual(1);
  }

  expect(composition.staleApply).toMatchObject({ ok: false });
  expect(composition.staleApply.error?.code).toBe("STALE_LAYOUT_PLAN");
  expect(composition.failedBatch).toMatchObject({ ok: false });
  expect(composition.atomicObjectCountAfter).toBe(composition.atomicObjectCountBefore);

  const stages = composition.stageDescriptors.data?.objects as Descriptor[];
  const hubs = composition.hubDescriptors.data?.objects as Descriptor[];
  const contents = composition.contentDescriptors.data?.objects as Descriptor[];
  const labels = composition.labelDescriptors.data?.objects as Descriptor[];
  const descriptors = [
    ...stages,
    ...contents,
    ...labels,
    ...(composition.connectorDescriptors.data?.objects as Descriptor[]),
    ...(composition.assetDescriptors.data?.objects as Descriptor[]),
    ...(composition.vesselDescriptors.data?.objects as Descriptor[]),
    ...(composition.cd8Descriptors.data?.objects as Descriptor[]),
    ...(composition.mhcDescriptors.data?.objects as Descriptor[]),
    ...(composition.tumorDescriptors.data?.objects as Descriptor[]),
    ...(composition.apoptosisDescriptors.data?.objects as Descriptor[]),
    ...(composition.dendriticDescriptors.data?.objects as Descriptor[]),
    ...(composition.lymphNodeDescriptors.data?.objects as Descriptor[]),
    ...(composition.checkpointDescriptors.data?.objects as Descriptor[]),
    ...hubs
  ];
  expect(hubs).toHaveLength(1);
  expect(composition.hubId).toBe(hubs[0].objectId);
  expect(hubs[0].semanticMetadata).toMatchObject({
    semanticRole: "hub",
    semanticType: "cancer-immunity-hub"
  });
  expect(composition.hubTitleDescriptors.data?.objects).toHaveLength(1);
  expect(composition.hubSubtitleDescriptors.data?.objects).toHaveLength(1);
  expect(composition.hubTitleDescriptors.data?.objects[0]).toMatchObject({
    text: "THE CANCER–IMMUNITY CYCLE"
  });
  expect(composition.hubSubtitleDescriptors.data?.objects[0]).toMatchObject({
    text: "Antigen release to immune control"
  });
  expect(stages).toHaveLength(7);
  expect(contents).toHaveLength(7);
  expect(labels).toHaveLength(14);
  expect(stages.map((stage) => stage.semanticMetadata?.stageIndex).sort((a, b) => a - b)).toEqual([
    1, 2, 3, 4, 5, 6, 7
  ]);
  expect(
    descriptors.filter((object) => object.semanticMetadata?.semanticRole === "hub")
  ).toHaveLength(1);
  expect(
    (composition.connectorDescriptors.data?.objects as Descriptor[]).filter(
      (object) => object.connector?.pathShape === "circular"
    )
  ).toHaveLength(7);
  expect(composition.connectorDescriptors.data?.objects).toHaveLength(7);
  const allConnectors = composition.allConnectorDescriptors.data?.objects as Descriptor[];
  expect(allConnectors.every((object) => object.connector && !object.freeConnector)).toBe(true);
  expect(composition.assetDescriptors.data?.objects).not.toHaveLength(0);
  expect(composition.tumorDescriptors.data?.objects).not.toHaveLength(0);
  expect(composition.apoptosisDescriptors.data?.objects).not.toHaveLength(0);
  expect(composition.dendriticDescriptors.data?.objects).not.toHaveLength(0);
  expect(composition.lymphNodeDescriptors.data?.objects).not.toHaveLength(0);
  expect(composition.checkpointDescriptors.data?.objects).toHaveLength(1);
  expect(composition.vesselDescriptors.data?.objects).not.toHaveLength(0);
  expect(composition.cd8Descriptors.data?.objects).not.toHaveLength(0);
  expect(composition.mhcDescriptors.data?.objects).not.toHaveLength(0);

  const relationKinds = (
    (composition.relations.data?.relations ?? []) as Array<{ kind: string }>
  ).map((relation) => relation.kind);
  expect(relationKinds).toEqual(
    expect.arrayContaining(["flow_to", "binds", "contacts", "crosses", "emits", "follows_gradient"])
  );
  expect(composition.analysis.data?.metrics).toMatchObject({ connectorCrossingCount: 0 });
  expect(composition.analysis.data?.pass).toBe(true);
  expect(composition.cycle.data?.pass).toBe(true);
  expect(composition.publication.data?.pass).toBe(true);
  expect(composition.analysis.data?.metrics.maxEndpointGap).toBeLessThanOrEqual(1);
  expect(composition.analysis.data?.metrics.maxArrowheadPenetration).toBeLessThanOrEqual(5);
  expect(composition.analysis.data?.metrics.outwardLabelViolationCount).toBe(0);
  expect(composition.analysis.data?.metrics.failedRelationGeometryCount).toBe(0);
  expect(composition.cycle.data?.truncated).toBe(false);
  expect(composition.cycle.data?.skipped).toEqual([]);
  expect(composition.publication.data?.truncated).toBe(false);

  const flowRelations = (
    (composition.relations.data?.relations ?? []) as Array<{
      id: string;
      kind: string;
      sourceObjectId: string;
      targetObjectId: string;
    }>
  ).filter(
    (relation) =>
      relation.kind === "flow_to" &&
      composition.stageContents.includes(relation.sourceObjectId) &&
      composition.stageContents.includes(relation.targetObjectId)
  );
  expect(flowRelations).toHaveLength(7);
  const expectedFlowPairs = composition.stages.map(
    (stage: { contentObjectId: string }, index: number) =>
      [
        stage.contentObjectId,
        composition.stages[(index + 1) % composition.stages.length].contentObjectId
      ].join("→")
  );
  expect(
    flowRelations.map((relation) => `${relation.sourceObjectId}→${relation.targetObjectId}`)
  ).toEqual(expect.arrayContaining(expectedFlowPairs));
  const connectorPairs = (composition.connectorDescriptors.data?.objects as Descriptor[]).map(
    (object) => `${object.connector!.fromObjectId}→${object.connector!.toObjectId}`
  );
  expect(connectorPairs).toEqual(expect.arrayContaining(expectedFlowPairs));

  const hubGeometry = (
    composition.hubGeometry.data?.objects as Array<{
      geometry: { visualBounds: { left: number; top: number; width: number; height: number } };
    }>
  )[0].geometry.visualBounds;
  const intersects = (left: Descriptor["bounds"], right: typeof hubGeometry) =>
    Boolean(
      left &&
      left.left < right.left + right.width &&
      left.left + left.width > right.left &&
      left.top < right.top + right.height &&
      left.top + left.height > right.top
    );
  expect(
    descriptors
      .filter((object) => object.objectId !== hubs[0].objectId)
      .some((object) => intersects(object.bounds, hubGeometry))
  ).toBe(false);

  const stageForManualMove = contents.find((stage) => stage.semanticMetadata?.stageIndex === 4);
  const plannedStage = composition.plan.positions?.find(
    (position) => position.objectId === stageForManualMove?.objectId
  );
  expect(plannedStage).toBeDefined();
  const canvas = await page.locator(".artboard-stage").boundingBox();
  const canvasElement = await page.locator(".upper-canvas").boundingBox();
  if (!canvas || !canvasElement || !stageForManualMove || !plannedStage)
    throw new Error("Could not locate the live canvas for the manual stage move.");
  const canvasSize = composition.sceneBeforeManual.data?.canvas as {
    width: number;
    height: number;
  };
  const toViewport = (point: { x: number; y: number }) => ({
    x: canvasElement.x + (point.x / canvasSize.width) * canvasElement.width,
    y: canvasElement.y + (point.y / canvasSize.height) * canvasElement.height
  });
  const originalCenter = { x: plannedStage.x, y: plannedStage.y };
  const start = toViewport(originalCenter);
  if (![originalCenter.x, originalCenter.y, start.x, start.y].every(Number.isFinite))
    throw new Error(
      `Non-finite manual pointer: ${JSON.stringify({ originalCenter, start, canvasSize, canvasElement })}`
    );
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 32, start.y - 20, { steps: 12 });
  await page.mouse.up();
  const manualScene = await page.evaluate(
    async (stageIds) => {
      const tool = (
        (window as typeof window & { __webmcpTools?: Tool[] }).__webmcpTools ?? []
      ).find((candidate) => candidate.name === "inspect_scene");
      const tools = (window as typeof window & { __webmcpTools?: Tool[] }).__webmcpTools ?? [];
      const findObjects = tools.find((candidate) => candidate.name === "find_objects");
      const inspectGeometry = tools.find((candidate) => candidate.name === "inspect_geometry");
      if (!tool || !findObjects || !inspectGeometry) throw new Error("Missing inspection tools");
      return {
        scene: (await tool.execute({ maxObjects: 256, maxDepth: 12 })) as Result,
        stages: (await findObjects.execute({ semanticRole: "stage-content", limit: 32 })) as Result,
        connectors: (await findObjects.execute({
          semanticRole: "main-flow-connector",
          limit: 32
        })) as Result,
        geometry: (await inspectGeometry.execute({ objectIds: stageIds })) as Result
      };
    },
    stages.map((stage) => stage.contentObjectId)
  );
  const movedStage = (manualScene.stages.data?.objects as Descriptor[]).find(
    (object) => object.objectId === stageForManualMove.objectId
  );
  expect(movedStage).toBeDefined();
  expect(movedStage?.position?.x).not.toBe(originalCenter.x);
  const movedConnectors = (manualScene.connectors.data?.objects as Descriptor[]).filter(
    (object) =>
      object.connector?.fromObjectId === composition.stageContents[3] ||
      object.connector?.toObjectId === composition.stageContents[3]
  );
  expect(movedConnectors).toHaveLength(2);
  expect(
    movedConnectors.every((object) => object.connector?.fromObjectId && object.connector.toObjectId)
  ).toBe(true);

  await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("button", { name: "Redo" })).toBeEnabled();
  await page.getByRole("button", { name: "Redo" }).click();
  await page.getByRole("button", { name: "Zoom out" }).click();
  await page.screenshot({
    path: ".codex/visual-qa/pau-478/webmcp-composition-reference.png",
    fullPage: true
  });
  const rechecked = await page.evaluate(async () => {
    const tools = (window as typeof window & { __webmcpTools?: Tool[] }).__webmcpTools ?? [];
    const call = async (name: string, input: Record<string, unknown>) => {
      const tool = tools.find((candidate) => candidate.name === name);
      if (!tool) throw new Error(`Missing ${name}`);
      const result = (await tool.execute(input)) as Result;
      if (!result.ok) throw new Error(`${name} failed: ${JSON.stringify(result)}`);
      return result;
    };
    return {
      scene: await call("inspect_scene", { maxObjects: 256, maxDepth: 12 }),
      stages: await call("find_objects", { semanticRole: "stage", limit: 32 }),
      connectors: await call("find_objects", {
        semanticRole: "main-flow-connector",
        limit: 32
      }),
      relations: await call("inspect_relations", { limit: 256 }),
      cycle: await call("validate_figure", { profile: "cycle", maxFindings: 256, padding: 48 }),
      publication: await call("validate_figure", {
        profile: "publication",
        maxFindings: 256,
        padding: 48
      }),
      provenance: await call("inspect_provenance", {})
    };
  });
  expect(rechecked.stages.data?.objects).toHaveLength(7);
  expect(rechecked.connectors.data?.objects).toHaveLength(7);
  expect(rechecked.cycle.data?.truncated).toBe(false);
  expect(rechecked.publication.data?.truncated).toBe(false);
  expect(rechecked.provenance.data?.assets).toEqual(
    expect.arrayContaining([expect.objectContaining({ familyId: expect.any(String) })])
  );
  await expect(page.locator('[data-save-state="saved"]')).toBeVisible({ timeout: 30_000 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator(".workspace-plane")).toHaveAttribute("data-canvas-ready", "true", {
    timeout: 30_000
  });
  await page.evaluate(async () => {
    await document.fonts.load('16px "Source Sans 3"');
    await document.fonts.ready;
  });
  const afterReload = await page.evaluate(async () => {
    const tools = (window as typeof window & { __webmcpTools?: Tool[] }).__webmcpTools ?? [];
    const call = async (name: string, input: Record<string, unknown>) => {
      const tool = tools.find((candidate) => candidate.name === name);
      if (!tool) throw new Error(`Missing ${name}`);
      const result = (await tool.execute(input)) as Result;
      if (!result.ok) throw new Error(`${name} failed: ${JSON.stringify(result)}`);
      return result;
    };
    return {
      scene: await call("inspect_scene", { maxObjects: 256, maxDepth: 12 }),
      stages: await call("find_objects", { semanticRole: "stage", limit: 32 }),
      connectors: await call("find_objects", {
        semanticRole: "main-flow-connector",
        limit: 32
      }),
      cycle: await call("validate_figure", { profile: "cycle", maxFindings: 256, padding: 48 }),
      publication: await call("validate_figure", {
        profile: "publication",
        maxFindings: 256,
        padding: 48
      })
    };
  });
  expect(afterReload.scene.data?.canvasReady).toBe(true);
  expect(afterReload.stages.data?.objects).toHaveLength(7);
  expect(afterReload.connectors.data?.objects).toHaveLength(7);
  const publicationFindingObjects = await page.evaluate(async () => {
    const tools = (window as typeof window & { __webmcpTools?: Tool[] }).__webmcpTools ?? [];
    const validate = tools.find((tool) => tool.name === "validate_figure");
    const inspect = tools.find((tool) => tool.name === "inspect_object");
    if (!validate || !inspect) throw new Error("Missing validation inspection tools");
    const result = (await validate.execute({
      profile: "publication",
      maxFindings: 256,
      padding: 48
    })) as Result;
    const ids = [
      ...new Set(
        (result.data?.findings ?? []).flatMap(
          (finding: { objectIds: string[] }) => finding.objectIds
        )
      )
    ];
    return Promise.all(
      ids.map(async (objectId) => ({
        objectId,
        result: (await inspect.execute({ objectId })) as Result
      }))
    );
  });
  expect(publicationFindingObjects).toEqual([]);
  expect(afterReload.cycle.data?.pass).toBe(true);
  expect(afterReload.publication.data?.pass).toBe(true);

  for (const format of ["svg", "pdf", "png", "credits"] as const) {
    const exported = await page.evaluate(async (requestedFormat) => {
      const tools = (window as typeof window & { __webmcpTools?: Tool[] }).__webmcpTools ?? [];
      const tool = tools.find((candidate) => candidate.name === "export_figure");
      if (!tool) throw new Error("Missing export_figure");
      const originalCreateObjectURL = URL.createObjectURL.bind(URL);
      const originalRevokeObjectURL = URL.revokeObjectURL.bind(URL);
      const originalAnchorClick = HTMLAnchorElement.prototype.click;
      let artifact: Blob | undefined;
      let filename = "";
      URL.createObjectURL = ((value: Blob) => {
        artifact = value;
        return originalCreateObjectURL(value);
      }) as typeof URL.createObjectURL;
      HTMLAnchorElement.prototype.click = function () {
        filename = this.download;
        originalAnchorClick.call(this);
      };
      try {
        const result = (await tool.execute({
          format: requestedFormat,
          title: "Cancer-immunity cycle qualification"
        })) as Result;
        if (!result.ok) return { result, filename, size: 0 };
        if (!artifact) throw new Error(`No ${requestedFormat} export artifact was created.`);
        const bytes = new Uint8Array(await artifact.arrayBuffer());
        const text =
          requestedFormat === "svg" || requestedFormat === "credits"
            ? await artifact.text()
            : undefined;
        return {
          result,
          filename,
          size: bytes.byteLength,
          header: Array.from(bytes.slice(0, 24)),
          svgHasTitle: text?.includes("THE CANCER–IMMUNITY CYCLE") ?? false,
          textHasCredits: text?.includes("OpenSketch figure credits") ?? false,
          textHasFiniteNumbers: text ? !/NaN|Infinity/.test(text) : true
        };
      } finally {
        URL.createObjectURL = originalCreateObjectURL;
        URL.revokeObjectURL = originalRevokeObjectURL;
        HTMLAnchorElement.prototype.click = originalAnchorClick;
      }
    }, format);
    expect(exported.result).toMatchObject({ ok: true, data: { format, started: true } });
    expect(exported.filename).toContain(format);
    expect(exported.size).toBeGreaterThan(0);
    if (format === "svg") {
      expect(exported.svgHasTitle).toBe(true);
      expect(exported.textHasFiniteNumbers).toBe(true);
    } else if (format === "pdf") {
      expect(exported.header?.slice(0, 4)).toEqual([37, 80, 68, 70]);
    } else if (format === "png") {
      expect(exported.header?.slice(0, 8)).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
      expect(exported.header?.slice(16, 20)).toHaveLength(4);
      expect(exported.header?.slice(20, 24)).toHaveLength(4);
    } else {
      expect(exported.textHasCredits).toBe(true);
    }
  }
});
