import path from "node:path";
import type { AssetManifest } from "../../packages/editor-core/src/types";
import { importBioIcons } from "./bioicons";
import { readJson, writeJsonAtomic } from "./io";
import { closeOpenAssetStorage } from "./open-asset-storage";
import { ROOT } from "./paths";

const MANIFEST_PATH = path.join(ROOT, "apps/web/src/generated/open-assets-manifest.json");
const REPORT_PATH = path.join(ROOT, "data/open-assets-import-report.json");

async function main(): Promise<void> {
  const [manifest, previousReport] = await Promise.all([
    readJson<AssetManifest>(MANIFEST_PATH),
    readJson<Record<string, unknown>>(REPORT_PATH)
  ]);
  const imported = await importBioIcons(process.env.BIOICONS_SOURCE_DIR);
  const retained = manifest.families.filter((family) => !family.sourceName?.startsWith("BioIcons"));
  const families = [...retained, ...imported.families].sort((a, b) =>
    a.title.localeCompare(b.title)
  );
  const generatedAt = new Date().toISOString();
  await writeJsonAtomic(MANIFEST_PATH, {
    ...manifest,
    generatedAt,
    source: "SciDraw, Arcadia Science Free organism illustration library, and BioIcons",
    families
  });
  const sources =
    typeof previousReport.sources === "object" && previousReport.sources !== null
      ? previousReport.sources
      : {};
  const previousFailures = Array.isArray(previousReport.failures)
    ? previousReport.failures.filter(
        (failure) =>
          typeof failure !== "object" ||
          failure === null ||
          !("source" in failure) ||
          failure.source !== "BioIcons"
      )
    : [];
  await writeJsonAtomic(REPORT_PATH, {
    ...previousReport,
    generatedAt,
    sources: {
      ...sources,
      bioIcons: {
        importedFamilies: imported.families.length,
        discoveredSvgFiles: imported.discoveredSvgFiles,
        excludedWithoutAttribution: imported.excludedWithoutAttribution,
        commit: imported.commit,
        licenses: Object.fromEntries(
          [...new Set(imported.families.map((family) => family.license))]
            .sort()
            .map((license) => [
              license,
              imported.families.filter((family) => family.license === license).length
            ])
        )
      }
    },
    failures: [...previousFailures, ...imported.failures]
  });
  console.log(
    `Imported ${imported.families.length} BioIcons SVGs; ${imported.failures.length} processing failures and ${imported.excludedWithoutAttribution} metadata exclusions.`
  );
  await closeOpenAssetStorage();
}

main().catch((error) => {
  void closeOpenAssetStorage();
  console.error(error);
  process.exitCode = 1;
});
