import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";
import sharp from "sharp";

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  throw new Error("Usage: node thumbnail-worker.mjs <input.svg> <output.webp>");
}

const rendered = await sharp(await readFile(input), {
  density: 192,
  limitInputPixels: false
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

await writeFile(output, rendered);
