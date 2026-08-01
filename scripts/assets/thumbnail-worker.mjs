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

const { channels } = await sharp(rendered).stats();
const alpha = channels[3];
if (alpha && alpha.max === 0) {
  throw new Error("The SVG renders no visible pixels.");
}

await writeFile(output, rendered);
