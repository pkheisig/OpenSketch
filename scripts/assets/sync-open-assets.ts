import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import Piscina from "piscina";
import type { AssetFamily, AssetLicense, AssetManifest } from "../../packages/editor-core/src/types";
import {
  fetchWithRetry,
  mapLimit,
  rateLimitedFetch,
  sha256,
  writeJsonAtomic,
  writeTextAtomic
} from "./io";
import { ROOT } from "./paths";

const execFileAsync = promisify(execFile);
const GENERATED_MANIFEST = path.join(
  ROOT,
  "apps/web/src/generated/open-assets-manifest.json"
);
const IMPORT_REPORT = path.join(ROOT, "data/open-assets-import-report.json");
const SCIDRAW_ASSET_DIR = path.join(ROOT, "apps/web/public/assets/scidraw");
const SCIDRAW_THUMB_DIR = path.join(ROOT, "apps/web/public/assets/scidraw-thumbnails");
const ORGANISM_ASSET_DIR = path.join(ROOT, "apps/web/public/assets/organism-library");
const ORGANISM_THUMB_DIR = path.join(
  ROOT,
  "apps/web/public/assets/organism-library-thumbnails"
);
const ORGANISM_RECORD_URL = "https://zenodo.org/api/records/17203578";
const ORGANISM_ZIP_URL =
  "https://zenodo.org/api/records/17203578/files/arcadia-organism-library-v1.0.zip/content";
const THUMBNAIL_WORKER = path.join(ROOT, "scripts/assets/thumbnail-worker.mjs");
const sanitizerPool = new Piscina({
  filename: fileURLToPath(new URL("./sanitize-worker.mjs", import.meta.url)),
  minThreads: 2,
  maxThreads: 6
});

interface SciDrawSummary {
  id: string;
  name: string;
  slug: string;
  image_url: string;
  image_type: string;
  is_vector: boolean;
  license: "cc-by" | "cc0";
  category_slug: string;
  doi: string;
  primary_author: { full_name: string };
}

interface SciDrawPage {
  next: string | null;
  results: SciDrawSummary[];
}

interface ImportFailure {
  source: string;
  title: string;
  error: string;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return String(error);
}

function httpsUrl(value: string): string {
  return value.replace(/^http:/, "https:");
}

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function legacyNumericId(key: string, namespace: number): number {
  return namespace + Number.parseInt(sha256(key).slice(0, 7), 16);
}

function readableTitle(filename: string): string {
  return filename
    .replace(/-(?:tricolorstroke|silhouette)\.svg$/i, "")
    .replace(/\.svg$/i, "")
    .replace(/-/g, " ")
    .replace(/\b(?:sp)\b/gi, "sp.")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function ensureViewBox(source: string): string {
  if (/\bviewBox\s*=/i.test(source)) return source;
  const width = source.match(/\bwidth=["']([0-9.]+)(?:px)?["']/i)?.[1];
  const height = source.match(/\bheight=["']([0-9.]+)(?:px)?["']/i)?.[1];
  if (!width || !height) return source;
  return source.replace(/<svg\b/i, `<svg viewBox="0 0 ${width} ${height}"`);
}

function dimensions(svg: string): { width: number; height: number } {
  const values = svg
    .match(/\bviewBox=["']([^"']+)["']/i)?.[1]
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (!values || values.length !== 4 || values.some((value) => !Number.isFinite(value))) {
    throw new Error("SVG has no valid viewBox.");
  }
  return { width: Math.abs(values[2]), height: Math.abs(values[3]) };
}

function categoryForSciDraw(drawing: SciDrawSummary): string {
  const text = `${drawing.name} ${drawing.category_slug}`.toLowerCase();
  if (/\b(?:virus|virion|phage|sars|hiv|influenza)\b/.test(text)) return "Viruses";
  if (/\b(?:bacteri|bacillus|coccus|e\\. ?coli)\b/.test(text)) return "Bacteria";
  if (/\b(?:protein|enzyme|antibody|receptor|channel|kinase|tubulin|actin)\b/.test(text)) {
    return "Proteins";
  }
  if (/\b(?:dna|rna|nucleic|chromosome|helix|nucleotide|gene|genome)\b/.test(text)) {
    return "Nucleic acids & genetics";
  }
  if (/\b(?:molecule|lipid|atp|glucose|chemical|metabolite|amino acid)\b/.test(text)) {
    return "Molecules";
  }
  if (
    /\b(?:cell|neuron|astrocyte|microglia|macrophage|lymphocyte|platelet|organelle|mitochondri|nucleus)\b/.test(
      text
    )
  ) {
    return "Cells";
  }
  if (
    /\b(?:tube|pipet|syringe|flask|beaker|dish|plate|microscope|centrifuge|vial|bottle|rack|instrument|equipment)\b/.test(
      text
    )
  ) {
    return "Equipment";
  }
  if (/\b(?:pathway|cycle|process|signaling|division|mitosis|transport)\b/.test(text)) {
    return "Cellular processes";
  }
  if (/\b(?:brain|heart|lung|liver|kidney|bone|muscle|organ|anatom|skin|eye)\b/.test(text)) {
    return "Anatomy";
  }
  if (/\b(?:drosophila|mosquito|fly|insect|arthropod)\b/.test(text)) return "Arthropods";
  if (/\b(?:plant|leaf|flower|root|arabidopsis)\b/.test(text)) return "Plants";
  if (drawing.category_slug === "human") return "People";
  if (["mouse", "rat", "fish", "bird", "drosophila"].includes(drawing.category_slug)) {
    return drawing.category_slug === "drosophila" ? "Arthropods" : "Animals";
  }
  if (/\b(?:arrow|symbol|diagram|shape)\b/.test(text)) return "Symbols & diagrams";
  return "Other";
}

function categoryForOrganism(title: string): string {
  const text = title.toLowerCase();
  if (/\b(?:virus|sars-cov-2|influenza|immunodeficiency)\b/.test(text)) return "Viruses";
  if (/\bescherichia coli\b/.test(text)) return "Bacteria";
  if (
    /\b(?:plasmodium|schistosoma|giardia|entamoeba|perkinsus|bodo saltans|naegleria)\b/.test(
      text
    )
  ) {
    return "Parasites";
  }
  if (/\b(?:aedes|drosophila)\b/.test(text)) return "Arthropods";
  if (
    /\b(?:arabidopsis|chlamydomonas|chlorella|bathycoccus|micromonas|nannochloropsis|ostreococcus|phaeodactylum|porphyra|symbiodinium|tetraselmis|volvox|isochrysis)\b/.test(
      text
    )
  ) {
    return "Plants";
  }
  if (
    /\b(?:agaricus|aspergillus|candida|neurospora|penicillium|saccharomyces|schizosaccharomyces|ustilago|yarrowia)\b/.test(
      text
    )
  ) {
    return "Other";
  }
  return "Animals";
}

async function fetchJson<T>(url: string): Promise<T> {
  return (await (await fetchWithRetry(httpsUrl(url))).json()) as T;
}

async function allSciDrawSummaries(): Promise<SciDrawSummary[]> {
  const drawings: SciDrawSummary[] = [];
  let url: string | null = "https://scidraw.io/api/v1/drawings/";
  while (url) {
    const page: SciDrawPage = await fetchJson<SciDrawPage>(url);
    drawings.push(...page.results);
    url = page.next ? httpsUrl(page.next) : null;
  }
  return drawings.filter(
    (drawing) =>
      drawing.is_vector &&
      drawing.image_type === "svg" &&
      (drawing.license === "cc0" || drawing.license === "cc-by")
  );
}

async function writeAsset(
  source: string,
  assetId: string,
  assetDirectory: string,
  thumbnailDirectory: string
): Promise<{ assetPath: string; thumbnailPath: string; localSha256: string; width: number; height: number }> {
  const sanitized = (await sanitizerPool.run(
    {
      source: ensureViewBox(source),
      assetId
    },
    { signal: AbortSignal.timeout(60_000) }
  )) as string;
  const filename = `${assetId}.svg`;
  const thumbnailFilename = `${assetId}.webp`;
  const svgPath = path.join(assetDirectory, filename);
  const thumbnailPath = path.join(thumbnailDirectory, thumbnailFilename);
  await writeTextAtomic(svgPath, sanitized);
  await execFileAsync(process.execPath, [THUMBNAIL_WORKER, svgPath, thumbnailPath], {
    timeout: 20_000
  });
  const size = dimensions(sanitized);
  const publicRoot = path.join(ROOT, "apps/web/public");
  return {
    assetPath: path.relative(publicRoot, svgPath).split(path.sep).join("/"),
    thumbnailPath: path.relative(publicRoot, thumbnailPath).split(path.sep).join("/"),
    localSha256: sha256(sanitized),
    ...size
  };
}

async function importSciDraw(failures: ImportFailure[]): Promise<AssetFamily[]> {
  const drawings = await allSciDrawSummaries();
  const families = await mapLimit(drawings, 6, async (drawing) => {
    try {
      const assetId = `scidraw-${slugify(drawing.slug)}`;
      const response = await rateLimitedFetch(
        httpsUrl(drawing.image_url),
        {},
        180,
        3,
        20_000
      );
      const stored = await writeAsset(
        await response.text(),
        assetId,
        SCIDRAW_ASSET_DIR,
        SCIDRAW_THUMB_DIR
      );
      const author = drawing.primary_author.full_name;
      const license: AssetLicense =
        drawing.license === "cc0" ? "CC0-1.0" : "CC-BY-4.0";
      const licenseUrl =
        drawing.license === "cc0"
          ? "https://creativecommons.org/publicdomain/zero/1.0/"
          : "https://creativecommons.org/licenses/by/4.0/";
      const sourcePage = `https://scidraw.io/drawing/${drawing.slug}`;
      const category = categoryForSciDraw(drawing);
      return {
        familyId: assetId,
        bioartEntryId: legacyNumericId(drawing.id, 1_000_000_000),
        title: drawing.name,
        description: `Editable scientific illustration from SciDraw.`,
        category,
        keywords: [drawing.name, drawing.category_slug, category, "SciDraw"],
        author,
        credit: `${author}; SciDraw; ${license}${
          drawing.doi ? `; DOI ${drawing.doi}` : ""
        }`,
        license,
        licenseUrl,
        sourceName: "SciDraw",
        sourcePage,
        defaultVariantId: assetId,
        variants: [{ id: assetId, ...stored }]
      } satisfies AssetFamily;
    } catch (error) {
      failures.push({
        source: "SciDraw",
        title: drawing.name,
        error: errorMessage(error)
      });
      return null;
    }
  });
  return families.filter(
    (family): family is NonNullable<typeof family> => family !== null
  );
}

async function importOrganismLibrary(failures: ImportFailure[]): Promise<AssetFamily[]> {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "opensketch-organisms-"));
  const zipPath = path.join(temporaryDirectory, "organisms.zip");
  try {
    const archiveResponse = await fetch(ORGANISM_ZIP_URL, {
      signal: AbortSignal.timeout(180_000)
    });
    if (!archiveResponse.ok) {
      throw new Error(
        `Organism archive download failed: ${archiveResponse.status} ${archiveResponse.statusText}`
      );
    }
    const zip = Buffer.from(await archiveResponse.arrayBuffer());
    await import("node:fs/promises").then(({ writeFile }) => writeFile(zipPath, zip));
    await execFileAsync("unzip", ["-qq", zipPath, "-d", temporaryDirectory]);
    const root = path.join(temporaryDirectory, "2025 Zoogle organisms");
    const styleDirectories = [
      {
        name: "Tricolor + stroke",
        suffix: "-tricolorstroke",
        directory: path.join(root, "Tricolor + stroke SVGs")
      },
      {
        name: "Silhouette",
        suffix: "-silhouette",
        directory: path.join(root, "Silhouette SVGs")
      }
    ];
    const grouped = new Map<string, Array<{ name: string; path: string; suffix: string }>>();
    for (const style of styleDirectories) {
      const files = (await readdir(style.directory)).filter((file) => file.endsWith(".svg"));
      for (const file of files) {
        const base = file.replace(new RegExp(`${style.suffix}\\.svg$`, "i"), "");
        const variants = grouped.get(base) ?? [];
        variants.push({ name: style.name, path: path.join(style.directory, file), suffix: style.suffix });
        grouped.set(base, variants);
      }
    }
    return (
      await mapLimit([...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)), 6, async ([base, variants]) => {
        const title = readableTitle(base);
        try {
          const familyId = `organism-${slugify(base)}`;
          const storedVariants = [];
          for (const variant of variants.sort((a, b) => a.name.localeCompare(b.name))) {
            const variantId = `${familyId}${variant.suffix}`;
            const stored = await writeAsset(
              await readFile(variant.path, "utf8"),
              variantId,
              ORGANISM_ASSET_DIR,
              ORGANISM_THUMB_DIR
            );
            storedVariants.push({ id: variantId, ...stored });
          }
          const preferred =
            storedVariants.find((variant) => variant.id.endsWith("-tricolorstroke")) ??
            storedVariants[0];
          const category = categoryForOrganism(title);
          return {
            familyId,
            bioartEntryId: legacyNumericId(base, 1_500_000_000),
            title,
            description: "Editable organism illustration from the Arcadia Science library.",
            category,
            keywords: [title, category, "organism", "Arcadia Science"],
            author: "Arcadia Science",
            credit:
              "Arcadia Science, Free organism illustration library, CC0-1.0, DOI 10.5281/zenodo.17203578",
            license: "CC0-1.0",
            licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
            sourceName: "Arcadia Science Free organism illustration library",
            sourcePage: "https://doi.org/10.5281/zenodo.17203578",
            defaultVariantId: preferred.id,
            variants: storedVariants
          } satisfies AssetFamily;
        } catch (error) {
          failures.push({
            source: "Arcadia Science",
            title,
            error: errorMessage(error)
          });
          return null;
        }
      })
    ).filter(
      (family): family is NonNullable<typeof family> => family !== null
    );
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  for (const directory of [
    SCIDRAW_ASSET_DIR,
    SCIDRAW_THUMB_DIR,
    ORGANISM_ASSET_DIR,
    ORGANISM_THUMB_DIR
  ]) {
    await rm(directory, { recursive: true, force: true });
    await mkdir(directory, { recursive: true });
  }
  const failures: ImportFailure[] = [];
  const sciDrawFamilies = await importSciDraw(failures);
  const organismFamilies = await importOrganismLibrary(failures);
  const families = [...sciDrawFamilies, ...organismFamilies].sort((a, b) =>
    a.title.localeCompare(b.title)
  );
  const manifest: AssetManifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: "SciDraw and Arcadia Science Free organism illustration library",
    families
  };
  await writeJsonAtomic(GENERATED_MANIFEST, manifest);
  await writeJsonAtomic(IMPORT_REPORT, {
    generatedAt: manifest.generatedAt,
    sources: {
      sciDraw: {
        importedFamilies: sciDrawFamilies.length,
        licenses: {
          "CC-BY-4.0": sciDrawFamilies.filter((family) => family.license === "CC-BY-4.0")
            .length,
          "CC0-1.0": sciDrawFamilies.filter((family) => family.license === "CC0-1.0")
            .length
        }
      },
      organismLibrary: {
        importedFamilies: organismFamilies.length,
        importedVariants: organismFamilies.reduce(
          (count, family) => count + family.variants.length,
          0
        ),
        license: "CC0-1.0",
        record: ORGANISM_RECORD_URL
      }
    },
    failures
  });
  console.log(
    `Imported ${families.length} open-licensed families (${sciDrawFamilies.length} SciDraw, ${organismFamilies.length} organism-library); ${failures.length} failures.`
  );
  await sanitizerPool.destroy();
}

main().catch((error) => {
  void sanitizerPool.destroy();
  console.error(error);
  process.exitCode = 1;
});
