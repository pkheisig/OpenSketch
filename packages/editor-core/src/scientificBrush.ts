import { sampleBrush } from "./scientificBrushGeometry";
export const BRUSH_KINDS = [
  "membrane",
  "monolayer",
  "surface",
  "protein-chain",
  "dna",
  "rna",
  "vessel",
  "epithelium",
  "actin",
  "microtubule",
  "chromatin"
] as const;
export type BrushKind = (typeof BRUSH_KINDS)[number];
export type BrushPoint = { x: number; y: number };
export type ScientificBrushSpec = {
  version: 1;
  kind: BrushKind;
  points: BrushPoint[];
  closed: boolean;
  smooth: boolean;
  unitSize: number;
  spacing: number;
  flipped: boolean;
  fill: string;
  accent: string;
  stroke: string;
};
export const MAX_BRUSH_ANCHORS = 24;
export const MAX_BRUSH_UNITS = 300;
export function validBrushSpec(value: unknown): value is ScientificBrushSpec {
  if (!value || typeof value !== "object") return false;
  const v = value as ScientificBrushSpec;
  return (
    Object.keys(v).every((key) =>
      [
        "version",
        "kind",
        "points",
        "closed",
        "smooth",
        "unitSize",
        "spacing",
        "flipped",
        "fill",
        "accent",
        "stroke"
      ].includes(key)
    ) &&
    v.version === 1 &&
    BRUSH_KINDS.includes(v.kind) &&
    typeof v.closed === "boolean" &&
    typeof v.smooth === "boolean" &&
    typeof v.flipped === "boolean" &&
    [v.fill, v.accent, v.stroke].every(
      (color) => typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color)
    ) &&
    Number.isFinite(v.unitSize) &&
    v.unitSize >= 8 &&
    v.unitSize <= 100 &&
    Number.isFinite(v.spacing) &&
    v.spacing >= 0.65 &&
    v.spacing <= 3 &&
    Array.isArray(v.points) &&
    v.points.length >= (v.closed ? 3 : 2) &&
    v.points.length <= MAX_BRUSH_ANCHORS &&
    v.points.every(
      (p) =>
        p &&
        Object.keys(p).every((key) => key === "x" || key === "y") &&
        Number.isFinite(p.x) &&
        Number.isFinite(p.y) &&
        Math.abs(p.x) <= 10000 &&
        Math.abs(p.y) <= 10000
    ) &&
    withinRenderBudget(v)
  );
}
function withinRenderBudget(spec: ScientificBrushSpec): boolean {
  try {
    sampleBrush(spec);
    return true;
  } catch {
    return false;
  }
}
