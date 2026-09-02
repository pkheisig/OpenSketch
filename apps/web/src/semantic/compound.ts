import type { Bounds } from "@/editor/geometry";

export const COMPOUND_VERSION = 1 as const;

export type LabelPlacement = "outward" | "top" | "right" | "bottom" | "left";
export type InteractionMode =
  | "contact"
  | "binding"
  | "secretion"
  | "engulfment"
  | "migration"
  | "cross-boundary"
  | "progression";
export type ParticleDistribution =
  "cloud" | "uniform" | "linear" | "arc" | "gradient" | "source-fan" | "target-converging";

export interface CompoundPoint {
  x: number;
  y: number;
}

export interface InteractionPlan {
  source: CompoundPoint;
  target: CompoundPoint;
  mediator?: CompoundPoint;
  relationKind: "contacts" | "binds" | "emits" | "crosses" | "flow_to";
  allowedOverlap: boolean;
  warnings: string[];
}

export interface ParticleFieldPlan {
  seed: string;
  points: CompoundPoint[];
  distribution: ParticleDistribution;
  warnings: string[];
}

export interface AnnotationCandidate {
  position: CompoundPoint;
  leader: CompoundPoint;
  score: number;
}

export interface StylePreset {
  fill: string;
  stroke: string;
  strokeWidth: number;
  fontSize: number;
  fontWeight: number;
}

export const SEMANTIC_STYLE_PRESETS: Record<string, StylePreset> = {
  hub: { fill: "#d8f0ed", stroke: "#25494b", strokeWidth: 4, fontSize: 28, fontWeight: 700 },
  stage: { fill: "#f4faf9", stroke: "#69bdb4", strokeWidth: 3, fontSize: 24, fontWeight: 700 },
  "stage-label": {
    fill: "#ffffff",
    stroke: "#25494b",
    strokeWidth: 0,
    fontSize: 22,
    fontWeight: 700
  },
  "scientific-asset": {
    fill: "#ffffff",
    stroke: "#25494b",
    strokeWidth: 3,
    fontSize: 20,
    fontWeight: 600
  },
  mediator: { fill: "#fff3d6", stroke: "#aa7418", strokeWidth: 2, fontSize: 18, fontWeight: 600 },
  annotation: { fill: "#ffffff", stroke: "#25494b", strokeWidth: 0, fontSize: 18, fontWeight: 400 },
  decorative: { fill: "#ffffff", stroke: "#8ba7a6", strokeWidth: 2, fontSize: 18, fontWeight: 400 }
};

function hashSeed(seed: string): number {
  let result = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    result ^= seed.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function random(seed: string): () => number {
  let state = hashSeed(seed) || 1;
  return () => {
    state = Math.imul(state ^ (state >>> 15), 2246822519);
    state = Math.imul(state ^ (state >>> 13), 3266489917);
    return ((state ^= state >>> 16) >>> 0) / 4294967296;
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function center(bounds: Bounds): CompoundPoint {
  return { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
}

export function planInteraction(
  sourceBounds: Bounds,
  targetBounds: Bounds,
  mode: InteractionMode,
  offset = 32
): InteractionPlan {
  const source = center(sourceBounds);
  const target = center(targetBounds);
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const normal = { x: -dy / length, y: dx / length };
  const midpoint = { x: (source.x + target.x) / 2, y: (source.y + target.y) / 2 };
  switch (mode) {
    case "contact": {
      const horizontal = Math.abs(dx) >= Math.abs(dy);
      const sign = (horizontal ? dx : dy) < 0 ? -1 : 1;
      const separation = horizontal
        ? (sourceBounds.width + targetBounds.width) / 2
        : (sourceBounds.height + targetBounds.height) / 2;
      return {
        source,
        target: horizontal
          ? { x: source.x + sign * separation, y: source.y }
          : { x: source.x, y: source.y + sign * separation },
        relationKind: "contacts",
        allowedOverlap: true,
        warnings: []
      };
    }
    case "binding":
      return {
        source: { x: source.x + dx * 0.18, y: source.y + dy * 0.18 },
        target: { x: target.x - dx * 0.18, y: target.y - dy * 0.18 },
        mediator: midpoint,
        relationKind: "binds",
        allowedOverlap: true,
        warnings: []
      };
    case "secretion":
      return {
        source: { x: source.x + dx * 0.2, y: source.y + dy * 0.2 },
        target: { x: target.x + dx * 0.05, y: target.y + dy * 0.05 },
        mediator: { x: midpoint.x + normal.x * offset, y: midpoint.y + normal.y * offset },
        relationKind: "emits",
        allowedOverlap: false,
        warnings: []
      };
    case "engulfment":
      return {
        source,
        target: { x: target.x + normal.x * offset * 0.35, y: target.y + normal.y * offset * 0.35 },
        mediator: target,
        relationKind: "contacts",
        allowedOverlap: true,
        warnings: ["Engulfment uses controlled target overlap; inspect the resulting hull."]
      };
    case "migration":
      return { source, target, relationKind: "flow_to", allowedOverlap: false, warnings: [] };
    case "cross-boundary":
      return {
        source: { x: source.x + dx * 0.35, y: source.y + dy * 0.35 },
        target: { x: target.x - dx * 0.35, y: target.y - dy * 0.35 },
        mediator: midpoint,
        relationKind: "crosses",
        allowedOverlap: true,
        warnings: []
      };
    case "progression":
      return { source, target, relationKind: "flow_to", allowedOverlap: false, warnings: [] };
  }
}

export function planParticleField(
  bounds: Bounds,
  count: number,
  distribution: ParticleDistribution,
  seed: string,
  source?: CompoundPoint,
  target?: CompoundPoint
): ParticleFieldPlan {
  if (distribution === "source-fan" && !source)
    throw new Error("source-fan distribution requires a source point.");
  if (distribution === "target-converging" && !target)
    throw new Error("target-converging distribution requires a target point.");
  const next = random(seed);
  const points: CompoundPoint[] = [];
  const safeCount = Math.max(0, Math.min(256, Math.floor(count)));
  const c = center(bounds);
  for (let index = 0; index < safeCount; index += 1) {
    const fraction = safeCount <= 1 ? 0.5 : index / (safeCount - 1);
    let x = bounds.left + next() * bounds.width;
    let y = bounds.top + next() * bounds.height;
    if (distribution === "linear") {
      x = bounds.left + fraction * bounds.width;
      y = c.y + (next() - 0.5) * bounds.height * 0.18;
    } else if (distribution === "arc") {
      const angle = -Math.PI * 0.85 + fraction * Math.PI * 1.7;
      const radius = Math.min(bounds.width, bounds.height) * (0.35 + next() * 0.12);
      x = c.x + Math.cos(angle) * radius;
      y = c.y + Math.sin(angle) * radius;
    } else if (distribution === "gradient") {
      x = bounds.left + Math.pow(fraction, 0.65) * bounds.width;
      y = bounds.top + next() * bounds.height;
    } else if (distribution === "source-fan" && source) {
      const end = target ?? { x: bounds.left + bounds.width, y: c.y };
      const spread = (next() - 0.5) * bounds.height * 0.7;
      x = clamp(source.x + fraction * (end.x - source.x), bounds.left, bounds.left + bounds.width);
      y = clamp(
        source.y + fraction * (end.y - source.y) + spread * (1 - fraction),
        bounds.top,
        bounds.top + bounds.height
      );
    } else if (distribution === "target-converging" && target) {
      const start = source ?? { x: bounds.left, y: c.y };
      const spread = (next() - 0.5) * bounds.height * 0.7;
      x = clamp(start.x + fraction * (target.x - start.x), bounds.left, bounds.left + bounds.width);
      y = clamp(
        start.y + fraction * (target.y - start.y) + spread * (1 - fraction),
        bounds.top,
        bounds.top + bounds.height
      );
    }
    points.push({
      x: clamp(x, bounds.left, bounds.left + bounds.width),
      y: clamp(y, bounds.top, bounds.top + bounds.height)
    });
  }
  return {
    seed,
    points,
    distribution,
    warnings: safeCount !== count ? ["Particle count was capped at 256."] : []
  };
}

export function annotationCandidates(
  targetBounds: Bounds,
  annotationBounds: Bounds,
  gap = 24
): AnnotationCandidate[] {
  const target = center(targetBounds);
  const candidates = [
    { x: target.x, y: targetBounds.top - gap - annotationBounds.height / 2 },
    { x: targetBounds.left - gap - annotationBounds.width / 2, y: target.y },
    { x: targetBounds.left + targetBounds.width + gap + annotationBounds.width / 2, y: target.y },
    { x: target.x, y: targetBounds.top + targetBounds.height + gap + annotationBounds.height / 2 }
  ];
  return candidates.map((position, index) => ({ position, leader: target, score: index }));
}

export function stylePreset(role: string): StylePreset | undefined {
  return SEMANTIC_STYLE_PRESETS[role];
}
