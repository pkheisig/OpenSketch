import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { enrichAssetKeywords } from "../../packages/editor-core/src/assetCatalog";
import { canonicalArtworkGroups } from "./canonical-artwork.mjs";

const commit = process.argv[2];
if (!/^[a-f0-9]{40}$/.test(commit ?? ""))
  throw new Error("Supply a pinned 40-character artwork commit.");
const inventories = execFileSync(
  "git",
  ["ls-tree", "-r", "--name-only", commit, "--", "experiments"],
  { encoding: "utf8" }
)
  .trim()
  .split("\n")
  .filter((path) => path.endsWith("/inventory-progress.json"));
if (inventories.length !== 1) throw new Error("Expected one asset inventory.");
const base = inventories[0].slice(0, -"inventory-progress.json".length);
const read = (path: string) =>
  execFileSync("git", ["show", `${commit}:${base}${path}`], { maxBuffer: 100 * 1024 * 1024 });
const progress = JSON.parse(read("inventory-progress.json").toString());
const previous = JSON.parse(await readFile("docs/opensketch-generated-snapshot.json", "utf8"));
const metadata = JSON.parse(
  await readFile("docs/scientific-asset-planning/curated-metadata.json", "utf8")
);
const assets = canonicalArtworkGroups(progress.assets, previous.assets).map(
  ({ canonical, entries, sha256 }) => {
    for (const entry of entries) {
      const actual = createHash("sha256").update(read(entry.svg)).digest("hex");
      if (actual !== sha256) throw new Error(`Artwork checksum mismatch: ${entry.id}`);
    }
    return {
      canonicalId: `opensketch-generated-${canonical.id}`,
      title: metadata.assets[canonical.id].title,
      sourceSha256: sha256,
      sourceConceptIds: entries.map((entry) => entry.id),
      keywords: enrichAssetKeywords({
        title: metadata.assets[canonical.id].title,
        category: metadata.assets[canonical.id].category,
        keywords: metadata.assets[canonical.id].keywords
      })
    };
  }
);
const registry = {
  version: 1,
  sourceCommit: commit,
  uniqueArtworkCount: assets.length,
  completedConceptCount: assets.reduce((count, asset) => count + asset.sourceConceptIds.length, 0),
  note: "Concept IDs record generation history only and are not additional search aliases or claims of biological equivalence. Uncommitted artwork is not included.",
  assets
};
await writeFile(
  "docs/scientific-asset-planning/research/canonical-asset-registry.json",
  JSON.stringify(registry, null, 2) + "\n"
);
console.log(
  `${registry.uniqueArtworkCount} unique artwork IDs covering ${registry.completedConceptCount} completed concepts.`
);
