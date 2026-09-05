import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { assetManifest } from "../../apps/web/src/assets/manifest";

const output = process.argv[2];
if (!output) throw new Error("Usage: write-asset-manifest.ts <output-path>");

const manifest = {
  ...assetManifest,
  families: assetManifest.families.map((family) => ({
    ...family,
    variants: family.variants.map((variant) => ({ ...variant }))
  }))
};

const outputPath = resolve(output);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
