import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { AssetManifest } from "../../packages/editor-core/src/types";
import { MANIFEST_PATH, ROOT } from "./paths";
import { writeBufferAtomic } from "./io";
import { mapLimit, readJson } from "./io";

const OPEN_MANIFEST_PATH = path.join(ROOT, "apps/web/src/generated/open-assets-manifest.json");
const PUBLIC_DIR = path.join(ROOT, "apps/web/public");

export async function generateThumbnail(svgPath: string, outputPath: string): Promise<void> {
  const source = await readFile(svgPath);
  const rendered = await sharp(source, { density: 192 })
    .trim({
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      threshold: 1
    })
    .resize(224, 224, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .extend({
      top: 16,
      bottom: 16,
      left: 16,
      right: 16,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .webp({ quality: 88, alphaQuality: 100 })
    .toBuffer();
  await writeBufferAtomic(outputPath, rendered);
}

async function main(): Promise<void> {
  const manifests = await Promise.all([
    readJson<AssetManifest>(MANIFEST_PATH),
    readJson<AssetManifest>(OPEN_MANIFEST_PATH)
  ]);
  const multiVariantOnly = process.argv.includes("--multi-variant");
  const variants = manifests.flatMap((manifest) =>
    manifest.families
      .filter((family) => !multiVariantOnly || family.variants.length > 1)
      .flatMap((family) => family.variants)
  );
  await mapLimit(variants, 8, async (variant, index) => {
    await generateThumbnail(
      path.join(PUBLIC_DIR, variant.assetPath.replace(/^\/+/, "")),
      path.join(PUBLIC_DIR, variant.thumbnailPath.replace(/^\/+/, ""))
    );
    if ((index + 1) % 50 === 0 || index + 1 === variants.length) {
      process.stdout.write(`\rNormalized thumbnails ${index + 1}/${variants.length}`);
    }
  });
  if (variants.length) process.stdout.write("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
