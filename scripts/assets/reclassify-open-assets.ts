import path from "node:path";
import type { AssetManifest } from "../../packages/editor-core/src/types";
import { readJson, writeJsonAtomic } from "./io";
import { categoryForOrganismAsset, categoryForSciDrawAsset } from "./open-taxonomy";
import { ROOT } from "./paths";

const MANIFEST_PATH = path.join(ROOT, "apps/web/src/generated/open-assets-manifest.json");

async function main(): Promise<void> {
  const manifest = await readJson<AssetManifest>(MANIFEST_PATH);
  const families = manifest.families.map((family) => {
    const sourceCategory = family.sourceName === "SciDraw" ? (family.keywords[1] ?? "") : "";
    const category = family.sourceName?.startsWith("Arcadia Science")
      ? categoryForOrganismAsset(family.title)
      : categoryForSciDrawAsset({
          name: family.title,
          category_slug: sourceCategory
        });
    return {
      ...family,
      category,
      keywords: [
        family.title,
        ...(sourceCategory ? [sourceCategory] : []),
        category,
        family.sourceName ?? ""
      ].filter(Boolean)
    };
  });
  await writeJsonAtomic(MANIFEST_PATH, { ...manifest, families });
  console.log(`Reclassified ${families.length} open-licensed asset families.`);
}

await main();
