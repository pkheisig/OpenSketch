/** Original procedural presets. IDs never overlap the production artwork manifest. */
export const SCIENTIFIC_PRESETS = [
  { id: "editable-membrane", label: "Lipid bilayer", kind: "membrane", form: "line" },
  { id: "curved-membrane", label: "Curved membrane", kind: "membrane", form: "curve" },
  { id: "membrane-ring", label: "Membrane ring", kind: "membrane", form: "ring" },
  { id: "membrane-surface", label: "Membrane surface (top view)", kind: "surface", form: "line" },
  {
    id: "protein-domain-chain",
    label: "Protein domain chain",
    kind: "protein-chain",
    form: "curve"
  },
  { id: "lipid-monolayer", label: "Lipid monolayer", kind: "monolayer", form: "line" },
  { id: "editable-dna", label: "DNA helix", kind: "dna", form: "line" },
  { id: "editable-rna", label: "RNA strand", kind: "rna", form: "curve" },
  { id: "editable-vessel", label: "Vessel segment", kind: "vessel", form: "curve" },
  { id: "epithelial-row", label: "Epithelial row", kind: "epithelium", form: "line" },
  { id: "actin-filament", label: "Actin filament", kind: "actin", form: "curve" },
  { id: "microtubule-segment", label: "Microtubule", kind: "microtubule", form: "line" },
  { id: "chromatin-strand", label: "Chromatin strand", kind: "chromatin", form: "curve" },
  { id: "editable-protein", label: "Protein with movable domains", kind: "protein", form: "parts" },
  {
    id: "editable-receptor",
    label: "Receptor with movable domains",
    kind: "receptor",
    form: "parts"
  },
  { id: "editable-cell", label: "Cell with movable parts", kind: "cell", form: "parts" },
  { id: "editable-antibody", label: "Antibody with movable arms", kind: "antibody", form: "parts" }
] as const;
export type ScientificPresetId = (typeof SCIENTIFIC_PRESETS)[number]["id"];
export function scientificPreset(id: string) {
  return SCIENTIFIC_PRESETS.find((preset) => preset.id === id);
}
export {
  validBrushSpec,
  MAX_BRUSH_ANCHORS,
  MAX_BRUSH_UNITS,
  type ScientificBrushSpec,
  type BrushKind,
  type BrushPoint
} from "@workspace/editor-core";

export const FIXED_MEMBRANE_PRESETS = [
  { id: "fixed-circular-bilayer", label: "Circular membrane (fixed)", kind: "membrane" },
  { id: "fixed-circular-monolayer", label: "Circular monolayer (fixed)", kind: "monolayer" }
] as const;
