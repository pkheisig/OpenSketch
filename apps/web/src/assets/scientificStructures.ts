import type { AssetFamily } from "@workspace/editor-core";
import { SCIENTIFIC_PRESETS, FIXED_MEMBRANE_PRESETS } from "../editor/scientific/catalog";

/** Editable means explicit path controls or separately movable semantic components. */
export const SCIENTIFIC_STRUCTURE_FAMILIES: AssetFamily[] = SCIENTIFIC_PRESETS.map((preset) => ({
  familyId: preset.id,
  title: preset.label,
  description:
    preset.form === "parts"
      ? "Flat schematic with independently movable components."
      : "Flat schematic with editable path handles, unit size and spacing.",
  category: ["dna", "rna", "chromatin"].includes(preset.kind)
    ? "Nucleic acids"
    : ["protein-chain", "protein", "receptor", "antibody"].includes(preset.kind)
      ? "Proteins & complexes"
      : preset.kind === "cell"
        ? "Cells"
        : ["vessel", "epithelium"].includes(preset.kind)
          ? "Tissues & models"
          : ["actin", "microtubule"].includes(preset.kind)
            ? "Cell structures"
            : "Membranes & junctions",
  topics: ["dna", "rna", "chromatin"].includes(preset.kind)
    ? ["genetics", "cell biology"]
    : ["protein-chain", "protein", "receptor", "antibody"].includes(preset.kind)
      ? ["biochemistry", ...(preset.kind === "antibody" ? ["immunology"] : [])]
      : ["membrane", "surface", "monolayer"].includes(preset.kind)
        ? ["membrane biology", "cell biology"]
        : ["vessel", "epithelium"].includes(preset.kind)
          ? ["histology"]
          : ["cell biology"],
  keywords: [
    preset.label,
    preset.kind,
    "editable",
    "flat",
    "scientific structure",
    ...(["curved-membrane", "membrane-ring"].includes(preset.id)
      ? ["circular", "round", "arc"]
      : [])
  ],
  author: "OpenSketch",
  credit: "Original OpenSketch procedural artwork",
  license: "AGPL-3.0-only",
  licenseUrl: "https://github.com/pkheisig/OpenSketch/blob/main/LICENSE",
  sourceName: "OpenSketch structures",
  sourcePage: "https://github.com/pkheisig/OpenSketch/tree/main/apps/web/src/editor/scientific",
  defaultVariantId: preset.id,
  editableStructure: true,
  variants: [
    {
      id: preset.id,
      style: "detailed",
      assetPath: `assets/scientific-structures/${preset.id}.svg`,
      thumbnailPath: `assets/scientific-structures/${preset.id}.svg`
    }
  ]
}));

/** Fixed SVG choices intentionally have no Editable badge or procedural controls. */
export const FIXED_MEMBRANE_FAMILIES: AssetFamily[] = FIXED_MEMBRANE_PRESETS.map((preset) => ({
  ...SCIENTIFIC_STRUCTURE_FAMILIES[0],
  familyId: preset.id,
  title: preset.label,
  description:
    "Complete circular membrane with fixed geometry. Move, rotate or resize as one SVG asset.",
  keywords: [preset.label, "membrane", "circle", "circular", "fixed", preset.kind],
  editableStructure: false,
  defaultVariantId: preset.id,
  variants: [
    {
      id: preset.id,
      style: "detailed",
      assetPath: `assets/scientific-structures/${preset.id}.svg`,
      thumbnailPath: `assets/scientific-structures/${preset.id}.svg`
    }
  ]
}));
