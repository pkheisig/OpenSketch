import type { SemanticCommandResult } from "./semanticTypes";

export const CANCER_IMMUNITY_DEMO_PROMPT =
  "Using OpenSketch WebMCP, create a polished, publication-ready cancer-immunity cycle showing eight biologically accurate stages around a compact circle, using NIH BioArt assets, clear labels, immune-cell color coding, and relevant molecular interactions.";

type ExecuteCommand = (
  name: string,
  input: Record<string, unknown>
) => Promise<SemanticCommandResult>;

export interface CancerImmunityDemoProgress {
  commandCount: number;
  commandName: string;
  stage: string;
}

export interface CancerImmunityDemoOptions {
  execute: ExecuteCommand;
  pace?: number;
  signal?: AbortSignal;
  onProgress?: (progress: CancerImmunityDemoProgress) => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asObjectId(result: SemanticCommandResult): string {
  if (!result.ok || !isRecord(result.data) || typeof result.data.objectId !== "string") {
    throw new Error(`Command did not return an object ID: ${JSON.stringify(result)}`);
  }
  return result.data.objectId;
}

function sleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (milliseconds <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(resolve, milliseconds);
    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        reject(new DOMException("Demo stopped.", "AbortError"));
      },
      { once: true }
    );
  });
}

export async function runCancerImmunityDemo({
  execute,
  pace = 0.72,
  signal,
  onProgress
}: CancerImmunityDemoOptions): Promise<{ commandCount: number }> {
  const ids: Record<string, string> = {};
  let commandCount = 0;
  let stage = "Preparing canvas";

  const run = async (name: string, input: Record<string, unknown>, wait = 720) => {
    if (signal?.aborted) throw new DOMException("Demo stopped.", "AbortError");
    const result = await execute(name, input);
    commandCount += 1;
    onProgress?.({ commandCount, commandName: name, stage });
    if (!result.ok) throw new Error(`${name}: ${result.error.message}`);
    await sleep(wait * Math.max(0, pace), signal);
    return result;
  };
  const text = async (
    key: string,
    value: string,
    x: number,
    y: number,
    fontSize: number,
    fontWeight = 700,
    wait = 650
  ) => {
    const result = await run(
      "create_text",
      { kind: "point", text: value, x, y, fontSize, fontWeight },
      wait
    );
    ids[key] = asObjectId(result);
    return ids[key];
  };
  const asset = async (
    key: string,
    familyId: string,
    variantId: string,
    x: number,
    y: number,
    scale: number,
    preset?: "green" | "blue" | "purple" | "red" | "gold"
  ) => {
    const inserted = await run("insert_asset", { familyId, variantId, x, y }, 900);
    const objectId = asObjectId(inserted);
    ids[key] = objectId;
    if (preset) await run("set_asset_color_preset", { objectId, presetId: preset }, 180);
    if (scale !== 1) {
      await run("scale_objects", { objectIds: [objectId], scaleX: scale, scaleY: scale }, 180);
    }
    return objectId;
  };
  const particles = async (key: string, input: Record<string, unknown>, wait = 650) => {
    const result = await run("create_particle_field", input, wait);
    ids[key] = asObjectId(result);
    return ids[key];
  };

  const initial = await run("inspect_scene", { maxObjects: 500, maxDepth: 12 }, 120);
  if (initial.ok && isRecord(initial.data) && Array.isArray(initial.data.objects)) {
    const objectIds = (
      initial.data.objects as Array<{ objectId?: unknown; parentObjectId?: unknown }>
    )
      .filter((object) => object.parentObjectId === undefined)
      .map((object) => object.objectId)
      .filter((objectId): objectId is string => typeof objectId === "string");
    if (objectIds.length > 0) {
      await run("delete_objects", { objectIds, confirmed: true }, 300);
    }
  }
  await run("resize_canvas", { width: 1920, height: 1080 }, 450);
  await run(
    "set_project_metadata",
    {
      name: "Cancer-immunity cycle · live WebMCP build",
      description:
        "Eight-stage antitumor-immunity schematic assembled live with semantic WebMCP commands and NIH BioArt assets."
    },
    500
  );

  stage = "Central cycle";
  const ring = await run("create_shape", { kind: "circle", x: 960, y: 535 }, 400);
  ids.ring = asObjectId(ring);
  await run(
    "set_object_properties",
    {
      objectIds: [ids.ring],
      properties: { fill: "rgba(255,255,255,0)", stroke: "#20272b", strokeWidth: 3 }
    },
    160
  );
  await run("scale_objects", { objectIds: [ids.ring], scaleX: 2.15, scaleY: 2.15 }, 450);
  await text("hubTitle", "THE CANCER–IMMUNITY CYCLE", 960, 500, 25, 800);
  await text("hubSub", "Tumor antigen release → immune priming", 960, 548, 16, 650, 420);
  await text("hubSub2", "→ trafficking → recognition → killing", 960, 576, 16, 650, 500);

  stage = "1 · Antigen release";
  await text("s1Title", "1  Antigen release", 960, 35, 27, 800);
  await text("s1Sub", "Immunogenic tumor-cell death releases antigens and DAMPs", 960, 68, 17, 550);
  await asset("s1Tumor", "nih-bioart-171", "nih-bioart-171-50f7631d87fd", 875, 180, 0.98, "red");
  await asset("s1Apoptosis", "nih-bioart-21", "nih-bioart-21-5ff8abc8b96f", 1045, 180, 0.96);
  await particles("s1Antigens", {
    count: 11,
    distribution: "cloud",
    seed: "s1-antigen-damps",
    bounds: { left: 930, top: 145, width: 65, height: 65 },
    semanticType: "tumor-antigens-damps"
  });
  await text("s1FactorLabel", "Tumor antigens + DAMPs", 960, 270, 16, 700);

  stage = "2 · Antigen capture";
  await text("s2Title", "2  Antigen capture", 1460, 90, 27, 800);
  await text("s2Sub", "Dendritic cells engulf tumor-derived antigens", 1460, 123, 17, 550);
  await asset("s2DC", "nih-bioart-112", "nih-bioart-112-7cf6c40352c7", 1460, 220, 1.12, "green");
  await particles("s2Antigens", {
    count: 9,
    distribution: "target-converging",
    seed: "s2-capture",
    targetObjectId: ids.s2DC,
    bounds: { left: 1325, top: 190, width: 90, height: 65 },
    semanticType: "captured-tumor-antigen"
  });
  await text("s2FactorLabel", "Antigen uptake", 1460, 300, 16, 700);

  stage = "3 · Dendritic-cell migration";
  await text("s3Title", "3  Dendritic-cell migration", 1570, 355, 27, 800);
  await text("s3Sub", "Antigen-bearing DC enters the draining lymph node", 1570, 388, 17, 550);
  await asset("s3DC", "nih-bioart-112", "nih-bioart-112-7cf6c40352c7", 1490, 500, 1.02, "green");
  await asset("s3Node", "nih-bioart-304", "nih-bioart-304-f0d45fc1759a", 1650, 500, 1.02);
  await particles("s3Trail", {
    count: 8,
    distribution: "linear",
    seed: "s3-migration-trail",
    bounds: { left: 1535, top: 480, width: 80, height: 32 },
    semanticType: "dc-migration"
  });
  await text("s3NodeLabel", "Draining lymph node", 1660, 575, 16, 700);

  stage = "4 · T-cell priming";
  await text("s4Title", "4  T-cell priming", 1455, 680, 27, 800);
  await text("s4Sub", "pMHC–TCR and CD80–CD28 activate naive CD8 T cells", 1455, 713, 17, 550);
  await asset("s4DC", "nih-bioart-112", "nih-bioart-112-7cf6c40352c7", 1375, 825, 1.02, "green");
  await asset("s4T", "nih-bioart-69", "nih-bioart-69-384a902a9286", 1535, 825, 1.04, "blue");
  await asset(
    "s4Complex",
    "nih-bioart-342",
    "nih-bioart-342-a89453de7c17",
    1455,
    815,
    0.52,
    "purple"
  );
  await run(
    "place_object_between",
    {
      objectId: ids.s4Complex,
      fromObjectId: ids.s4DC,
      toObjectId: ids.s4T,
      objectAnchor: "center",
      fromAnchor: "right",
      toAnchor: "left",
      offset: { x: 0, y: 0 },
      angle: 0
    },
    520
  );
  await particles("s4Cytokines", {
    count: 12,
    distribution: "cloud",
    seed: "s4-local-cytokines",
    bounds: { left: 1415, top: 865, width: 82, height: 48 },
    semanticType: "IL-12-type-I-IFN"
  });
  await text("s4SynapseLabel", "pMHC–TCR / CD80–CD28", 1455, 755, 15, 700);
  await text("s4CytokineLabel", "IL-12 + type I IFN", 1455, 935, 15, 700);

  stage = "5 · Clonal expansion";
  await text("s5Title", "5  Clonal expansion", 960, 790, 27, 800);
  await text(
    "s5Sub",
    "Activated CD8 T cells proliferate and acquire effector function",
    960,
    823,
    17,
    550
  );
  await text("s5FactorLabel", "IL-2-driven expansion", 960, 858, 16, 700);
  await particles("s5IL2", {
    count: 14,
    distribution: "cloud",
    seed: "s5-il2",
    bounds: { left: 915, top: 875, width: 90, height: 48 },
    semanticType: "IL-2"
  });
  await asset("s5T1", "nih-bioart-69", "nih-bioart-69-384a902a9286", 865, 960, 0.88, "blue");
  await asset("s5T2", "nih-bioart-69", "nih-bioart-69-384a902a9286", 950, 945, 0.88, "blue");
  await asset("s5T3", "nih-bioart-69", "nih-bioart-69-384a902a9286", 1035, 960, 0.88, "blue");

  stage = "6 · Tumor infiltration";
  await text("s6Title", "6  Tumor infiltration", 455, 680, 27, 800);
  await text(
    "s6Sub",
    "Effector T cells follow CXCL9/10/11 and cross the vessel wall",
    455,
    713,
    17,
    550
  );
  await text("s6GradientLabel", "CXCL9 / CXCL10 / CXCL11 gradient", 520, 750, 15, 700);
  await particles("s6Gradient", {
    count: 16,
    distribution: "gradient",
    seed: "s6-cxcl-gradient",
    bounds: { left: 500, top: 770, width: 115, height: 50 },
    semanticType: "CXCL9-CXCL10-CXCL11"
  });
  await asset("s6Vessel", "nih-bioart-539", "nih-bioart-539-c9995689934b", 365, 835, 0.88);
  await asset("s6T", "nih-bioart-69", "nih-bioart-69-384a902a9286", 465, 825, 0.94, "blue");

  stage = "7 · Tumor recognition";
  await text("s7Title", "7  Tumor recognition", 335, 355, 27, 800);
  await text("s7Sub", "TCR recognizes tumor pMHC; PD-1/PD-L1 restrains killing", 335, 388, 17, 550);
  await asset("s7T", "nih-bioart-69", "nih-bioart-69-384a902a9286", 340, 500, 1.02, "blue");
  await asset("s7Tumor", "nih-bioart-171", "nih-bioart-171-50f7631d87fd", 500, 500, 0.92, "red");
  await asset(
    "s7Complex",
    "nih-bioart-342",
    "nih-bioart-342-a89453de7c17",
    425,
    510,
    0.48,
    "purple"
  );
  await run(
    "place_object_between",
    {
      objectId: ids.s7Complex,
      fromObjectId: ids.s7T,
      toObjectId: ids.s7Tumor,
      objectAnchor: "center",
      fromAnchor: "right",
      toAnchor: "left",
      offset: { x: 0, y: 0 },
      angle: 0
    },
    520
  );
  await asset("s7AntiPD1", "nih-bioart-17", "nih-bioart-17-0035fcda721b", 230, 500, 0.43, "gold");
  await text("s7DrugLabel", "anti-PD-1", 220, 560, 16, 750);
  await text("s7SynapseLabel", "pMHC–TCR · PD-1/PD-L1", 425, 590, 15, 700);

  stage = "8 · Cytotoxic killing";
  await text("s8Title", "8  Cytotoxic killing", 455, 90, 27, 800);
  await text(
    "s8Sub",
    "Perforin and granzymes trigger apoptosis and antigen renewal",
    455,
    123,
    17,
    550
  );
  await asset("s8T", "nih-bioart-69", "nih-bioart-69-384a902a9286", 350, 235, 1, "blue");
  await asset("s8Tumor", "nih-bioart-171", "nih-bioart-171-50f7631d87fd", 505, 235, 0.9, "red");
  await asset("s8Apoptosis", "nih-bioart-21", "nih-bioart-21-5ff8abc8b96f", 645, 235, 0.85);
  await particles("s8Granules", {
    count: 11,
    distribution: "target-converging",
    seed: "s8-perforin-granzymes",
    targetObjectId: ids.s8Tumor,
    bounds: { left: 410, top: 210, width: 75, height: 50 },
    semanticType: "perforin-granzymes"
  });
  await text("s8GranuleLabel", "Perforin + granzymes", 430, 325, 15, 700);

  stage = "Quality checks";
  await run(
    "analyze_composition",
    {
      profile: "scientific-diagram",
      categories: ["geometry", "text", "relations", "scientific", "style"],
      maxFindings: 64,
      clearance: 8,
      padding: 12
    },
    260
  );
  await run(
    "validate_figure",
    { profile: "publication", maxFindings: 64, clearance: 8, padding: 12 },
    260
  );
  await run("inspect_scene", { maxObjects: 160, maxDepth: 4 }, 0);
  return { commandCount };
}
