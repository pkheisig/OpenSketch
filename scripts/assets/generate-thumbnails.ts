import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { SVG_DIR, THUMB_DIR } from "./paths";
import { writeBufferAtomic } from "./io";

export async function generateThumbnail(svgPath: string, outputPath: string): Promise<void> {
  const source = await readFile(svgPath);
  const rendered = await sharp(source, { density: 192 })
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
  const files = (await readdir(SVG_DIR)).filter((file) => file.endsWith(".svg")).sort();
  for (const [index, file] of files.entries()) {
    const output = path.join(THUMB_DIR, file.replace(/\.svg$/, ".webp"));
    await generateThumbnail(path.join(SVG_DIR, file), output);
    process.stdout.write(`\rThumbnail ${index + 1}/${files.length}: ${file}`);
  }
  if (files.length) process.stdout.write("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
