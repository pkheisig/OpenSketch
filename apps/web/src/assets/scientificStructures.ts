import type { AssetFamily } from "@workspace/editor-core";
import { SCIENTIFIC_PRESETS } from "../editor/scientific/catalog";

/** Editable means explicit path controls or separately movable semantic components. */
export const SCIENTIFIC_STRUCTURE_FAMILIES: AssetFamily[] = SCIENTIFIC_PRESETS.map((preset) => ({
  familyId: preset.id,
  bioartEntryId: 0,
  title: preset.label,
  description:
    preset.form === "parts"
      ? "Flat schematic with independently movable components."
      : "Flat schematic with editable path handles, unit size and spacing.",
  category: "Cell components",
  keywords: [preset.label, preset.kind, "editable", "flat", "scientific structure"],
  author: "OpenSketch",
  credit: "Original OpenSketch procedural artwork",
  license: "AGPL-3.0-only",
  licenseUrl:
    "https://github.com/pkheisig/OpenSketch/blob/planning/scientific-asset-expansion-20260905/LICENSE",
  sourceName: "OpenSketch structures",
  sourcePage:
    "https://github.com/pkheisig/OpenSketch/tree/planning/scientific-asset-expansion-20260905/apps/web/src/editor/scientific",
  defaultVariantId: preset.id,
  editableStructure: true,
  variants: [
    {
      id: preset.id,
      assetPath: `assets/scientific-structures/${preset.id}.svg`,
      thumbnailPath: `assets/scientific-structures/${preset.id}.svg`
    }
  ]
}));
