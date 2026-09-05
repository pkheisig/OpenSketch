import console from "node:console";
/** Regenerate the original flat SVG presets; no raster or external artwork is involved. */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SCIENTIFIC_PRESETS } from "../../apps/web/src/editor/scientific/catalog";
import { createScientificObject } from "../../apps/web/src/editor/scientific/objects";
import { DEFAULT_CREATION_DEFAULTS } from "../../apps/web/src/editor/creation";
const output = fileURLToPath(
  new URL("../../apps/web/public/assets/scientific-structures/", import.meta.url)
);
mkdirSync(output, { recursive: true });
for (const preset of SCIENTIFIC_PRESETS) {
  const group = createScientificObject(preset.id, DEFAULT_CREATION_DEFAULTS)!;
  group.set({ left: 12, top: 12, originX: "left", originY: "top" });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(group.width + 24)}" height="${Math.ceil(group.height + 24)}" viewBox="0 0 ${Math.ceil(group.width + 24)} ${Math.ceil(group.height + 24)}"><title>${preset.label}</title><desc>Original OpenSketch flat schematic. Independent vector parts; use the Scientific structures palette for path editing.</desc>${group.toSVG()}</svg>\n`;
  writeFileSync(`${output}${preset.id}.svg`, svg);
}
console.log(`Exported ${SCIENTIFIC_PRESETS.length} flat SVG presets.`);
