import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type {
  AssetFamily,
  AssetLicense,
  AssetManifest
} from "../../packages/editor-core/src/types";
import { importBioIcons } from "./bioicons";
import { fetchWithRetry, mapLimit, rateLimitedFetch, sha256, writeJsonAtomic } from "./io";
import { closeOpenAssetStorage, storeOpenAsset } from "./open-asset-storage";
import { categoryForOrganismAsset, categoryForSciDrawAsset } from "./open-taxonomy";
import { ROOT } from "./paths";

const execFileAsync = promisify(execFile);
const GENERATED_MANIFEST = path.join(ROOT, "apps/web/src/generated/open-assets-manifest.json");
const IMPORT_REPORT = path.join(ROOT, "data/open-assets-import-report.json");
const SCIDRAW_ASSET_DIR = path.join(ROOT, "apps/web/public/assets/scidraw");
const SCIDRAW_THUMB_DIR = path.join(ROOT, "apps/web/public/assets/scidraw-thumbnails");
const ORGANISM_ASSET_DIR = path.join(ROOT, "apps/web/public/assets/organism-library");
const ORGANISM_THUMB_DIR = path.join(ROOT, "apps/web/public/assets/organism-library-thumbnails");
const ORGANISM_RECORD_URL = "https://zenodo.org/api/records/17203578";
const ORGANISM_ZIP_URL =
  "https://zenodo.org/api/records/17203578/files/arcadia-organism-library-v1.0.zip/content";

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

async function importSciDraw(failures: ImportFailure[]): Promise<AssetFamily[]> {
  const drawings = await allSciDrawSummaries();
  const families = await mapLimit(drawings, 6, async (drawing) => {
    try {
      const assetId = `scidraw-${slugify(drawing.slug)}`;
      const response = await rateLimitedFetch(httpsUrl(drawing.image_url), {}, 180, 3, 20_000);
      const stored = await storeOpenAsset(
        await response.text(),
        assetId,
        SCIDRAW_ASSET_DIR,
        SCIDRAW_THUMB_DIR
      );
      const author = drawing.primary_author.full_name;
      const license: AssetLicense = drawing.license === "cc0" ? "CC0-1.0" : "CC-BY-4.0";
      const licenseUrl =
        drawing.license === "cc0"
          ? "https://creativecommons.org/publicdomain/zero/1.0/"
          : "https://creativecommons.org/licenses/by/4.0/";
      const sourcePage = `https://scidraw.io/drawing/${drawing.slug}`;
      const category = categoryForSciDrawAsset(drawing);
      return {
        familyId: assetId,
        bioartEntryId: legacyNumericId(drawing.id, 1_000_000_000),
        title: drawing.name,
        description: `Editable scientific illustration from SciDraw.`,
        category,
        keywords: [drawing.name, drawing.category_slug, category, "SciDraw"],
        author,
        credit: `${author}; SciDraw; ${license}${drawing.doi ? `; DOI ${drawing.doi}` : ""}`,
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
  return families.filter((family): family is NonNullable<typeof family> => family !== null);
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
        variants.push({
          name: style.name,
          path: path.join(style.directory, file),
          suffix: style.suffix
        });
        grouped.set(base, variants);
      }
    }
    return (
      await mapLimit(
        [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)),
        6,
        async ([base, variants]) => {
          const title = readableTitle(base);
          try {
            const familyId = `organism-${slugify(base)}`;
            const storedVariants = [];
            for (const variant of variants.sort((a, b) => a.name.localeCompare(b.name))) {
              const variantId = `${familyId}${variant.suffix}`;
              const stored = await storeOpenAsset(
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
            const category = categoryForOrganismAsset(title);
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
        }
      )
    ).filter((family): family is NonNullable<typeof family> => family !== null);
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
  const bioIcons = await importBioIcons(process.env.BIOICONS_SOURCE_DIR);
  failures.push(...bioIcons.failures);
  const families = [...sciDrawFamilies, ...organismFamilies, ...bioIcons.families].sort((a, b) =>
    a.title.localeCompare(b.title)
  );
  const manifest: AssetManifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: "SciDraw, Arcadia Science Free organism illustration library, and BioIcons",
    families
  };
  await writeJsonAtomic(GENERATED_MANIFEST, manifest);
  await writeJsonAtomic(IMPORT_REPORT, {
    generatedAt: manifest.generatedAt,
    sources: {
      sciDraw: {
        importedFamilies: sciDrawFamilies.length,
        licenses: {
          "CC-BY-4.0": sciDrawFamilies.filter((family) => family.license === "CC-BY-4.0").length,
          "CC0-1.0": sciDrawFamilies.filter((family) => family.license === "CC0-1.0").length
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
      },
      bioIcons: {
        importedFamilies: bioIcons.families.length,
        discoveredSvgFiles: bioIcons.discoveredSvgFiles,
        excludedWithoutAttribution: bioIcons.excludedWithoutAttribution,
        commit: bioIcons.commit,
        licenses: Object.fromEntries(
          [...new Set(bioIcons.families.map((family) => family.license))]
            .sort()
            .map((license) => [
              license,
              bioIcons.families.filter((family) => family.license === license).length
            ])
        )
      }
    },
    failures
  });
  console.log(
    `Imported ${families.length} open-licensed families (${sciDrawFamilies.length} SciDraw, ${organismFamilies.length} organism-library, ${bioIcons.families.length} BioIcons); ${failures.length} failures.`
  );
  await closeOpenAssetStorage();
}

main().catch((error) => {
  void closeOpenAssetStorage();
  console.error(error);
  process.exitCode = 1;
});
