import { canonicalArtworkGroups } from "./canonical-artwork.mjs";
import process from "node:process";
import console from "node:console";
/** Import only committed, reviewed artwork. Never reads the production agent's working files. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import sharp from "sharp";
const commit = process.argv[2];
if (!/^[a-f0-9]{40}$/.test(commit ?? ""))
  throw new Error("Supply an immutable 40-character source commit.");
const inventories = execFileSync(
  "git",
  ["ls-tree", "-r", "--name-only", commit, "--", "experiments"],
  { encoding: "utf8" }
)
  .trim()
  .split("\n")
  .filter((path) => path.endsWith("/inventory-progress.json"));
if (inventories.length !== 1) throw new Error("Expected one committed asset inventory.");
const base = inventories[0].slice(0, -"inventory-progress.json".length);
const metadata = JSON.parse(
  await readFile("docs/scientific-asset-planning/curated-metadata.json", "utf8")
);
const read = (path) =>
  execFileSync("git", ["show", `${commit}:${base}${path}`], { maxBuffer: 100 * 1024 * 1024 });
const digest = (data) => createHash("sha256").update(data).digest("hex");
const progress = JSON.parse(read("inventory-progress.json"));
const previousSnapshot = JSON.parse(
  await readFile("docs/opensketch-generated-snapshot.json", "utf8")
);
for (const [id, entry] of Object.entries(progress.assets)) {
  if (entry.status !== "complete") continue;
  if (
    (!entry.visual_review && !entry.alias_of && entry.provenance !== "Approved batches 01/02") ||
    !entry.svg_sha256 ||
    !entry.png_sha256
  )
    throw new Error(`Unreviewed asset: ${id}`);
}
const folder = "apps/web/public/assets/opensketch-generated";
await mkdir(folder, { recursive: true });
const derivatives = JSON.parse(
  await readFile("docs/opensketch-generated-derivatives.json", "utf8")
);
if (derivatives.sourceCommit !== commit) throw new Error("Derivative commit mismatch.");
const families = [],
  receipts = [];
for (const { canonical: entry, entries } of canonicalArtworkGroups(
  progress.assets,
  previousSnapshot.assets
)) {
  const path = entry.svg;
  if (!entry.visual_review && entry.provenance !== "Approved batches 01/02")
    throw new Error(`Missing canonical review: ${entry.id}`);
  const svg = read(path),
    png = read(entry.png);
  for (const alias of entries) {
    if (digest(read(alias.svg)) !== alias.svg_sha256 || digest(svg) !== alias.svg_sha256)
      throw new Error(`SVG checksum mismatch: ${alias.id}`);
    if (digest(read(alias.png)) !== alias.png_sha256)
      throw new Error(`PNG checksum mismatch: ${alias.id}`);
  }
  if (digest(png) !== entry.png_sha256) throw new Error(`PNG checksum mismatch: ${entry.id}`);
  if (/<image\b|<script\b|<foreignObject\b|(?:href|src)\s*=\s*["']https?:/i.test(svg.toString()))
    throw new Error(`Unexpected SVG content: ${entry.id}`);
  const id = `opensketch-generated-${entry.id}`;
  const derivative = derivatives.assets.find((e) => e.id === entry.id);
  const appSvg = await readFile(`${folder}/${entry.id}.svg`);
  if (
    !derivative ||
    digest(appSvg) !== derivative.appSvgSha256 ||
    derivative.sourceSvgSha256 !== digest(svg)
  )
    throw new Error(`Derivative checksum mismatch: ${entry.id}`);
  await sharp(appSvg)
    .trim()
    .resize(192, 192, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 85 })
    .toFile(`${folder}/${entry.id}.webp`);
  const curated = metadata.assets[entry.id];
  if (!curated || !metadata.categoryDefinitions[curated.category])
    throw new Error(`Missing curated metadata: ${entry.id}`);
  families.push({
    familyId: id,
    title: curated.title,
    description: `${curated.title}. Original OpenSketch schematic for ${curated.topics.join(", ")}.`,
    category: curated.category,
    topics: curated.topics,
    keywords: curated.keywords,
    author: "OpenSketch",
    credit: "OpenSketch AI-assisted artwork",
    license: "AGPL-3.0-only",
    licenseUrl: "https://github.com/pkheisig/OpenSketch/blob/" + commit + "/LICENSE",
    sourceName: "OpenSketch generated",
    sourcePage: `https://github.com/pkheisig/OpenSketch/commit/${commit}`,
    defaultVariantId: id,
    variants: [
      {
        id,
        label: "Original",
        assetPath: `assets/opensketch-generated/${entry.id}.svg`,
        thumbnailPath: `assets/opensketch-generated/${entry.id}.webp`,
        localSha256: digest(appSvg),
        width: derivative.width,
        height: derivative.height
      }
    ]
  });
  receipts.push({
    id: entry.id,
    aliases: entries.map((e) => e.id),
    sha256: digest(svg),
    visualReview: entry.visual_review ?? entry.provenance,
    qa: entry.qa_urls
  });
}
const generatedAt = execFileSync("git", ["show", "-s", "--format=%cI", commit], {
  encoding: "utf8"
}).trim();
await writeFile(
  "apps/web/src/generated/opensketch-generated-manifest.json",
  JSON.stringify(
    { version: 1, source: "OpenSketch generated", generatedAt, sourceCommit: commit, families },
    null,
    2
  ) + "\n"
);
await writeFile(
  "docs/opensketch-generated-snapshot.json",
  JSON.stringify(
    {
      sourceCommit: commit,
      distinctAssets: families.length,
      completedNames: receipts.reduce((n, e) => n + e.aliases.length, 0),
      assets: receipts
    },
    null,
    2
  ) + "\n"
);
console.log(`Imported ${families.length} reviewed SVG assets from ${commit}.`);
