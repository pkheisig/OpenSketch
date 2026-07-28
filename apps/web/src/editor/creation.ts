import type { ConnectorArrowhead, ConnectorLineStyle } from "@workspace/editor-core";

export type TextKind = "point" | "box";

export type ShapeKind =
  | "rectangle"
  | "rounded-rectangle"
  | "ellipse"
  | "circle"
  | "pill"
  | "donut"
  | "triangle"
  | "right-triangle"
  | "pentagon"
  | "polygon"
  | "octagon"
  | "diamond"
  | "trapezoid"
  | "parallelogram"
  | "star"
  | "line"
  | "curved-line"
  | "arrow"
  | "double-arrow"
  | "curved-arrow"
  | "bracket"
  | "callout"
  | "membrane";

export type CreationTool =
  | { type: "text"; kind: TextKind; fontSize?: number; fontWeight?: number }
  | { type: "shape"; kind: ShapeKind };

export interface CreationDefaults {
  text: {
    color: string;
    fontFamily: string;
    fontSize: number;
    fontWeight: number;
  };
  shape: {
    fill: string;
    stroke: string;
    strokeWidth: number;
  };
  line: {
    color: string;
    width: number;
    lineStyle: ConnectorLineStyle;
    startArrowhead: ConnectorArrowhead;
    endArrowhead: ConnectorArrowhead;
  };
}

export const CREATION_DEFAULTS_STORAGE_KEY = "OpenSketch:creation-defaults";

export const DEFAULT_CREATION_DEFAULTS: CreationDefaults = {
  text: {
    color: "#183133",
    fontFamily: "Source Sans 3",
    fontSize: 54,
    fontWeight: 400
  },
  shape: {
    fill: "#d8efe9",
    stroke: "#25494b",
    strokeWidth: 4
  },
  line: {
    color: "#25494b",
    width: 5,
    lineStyle: "solid",
    startArrowhead: "none",
    endArrowhead: "triangle"
  }
};

const color = (value: unknown, fallback: string) =>
  typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;

const number = (value: unknown, fallback: number, minimum: number, maximum: number) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.max(minimum, Math.min(maximum, value))
    : fallback;

export function normalizeCreationDefaults(value: unknown): CreationDefaults {
  const candidate =
    value && typeof value === "object"
      ? (value as Partial<Record<keyof CreationDefaults, Record<string, unknown>>>)
      : {};
  const text = candidate.text ?? {};
  const shape = candidate.shape ?? {};
  const line = candidate.line ?? {};
  const arrowheads: ConnectorArrowhead[] = ["none", "triangle", "open", "circle"];
  const lineStyles: ConnectorLineStyle[] = ["solid", "dashed", "dotted"];
  return {
    text: {
      color: color(text.color, DEFAULT_CREATION_DEFAULTS.text.color),
      fontFamily:
        typeof text.fontFamily === "string"
          ? text.fontFamily
          : DEFAULT_CREATION_DEFAULTS.text.fontFamily,
      fontSize: number(text.fontSize, DEFAULT_CREATION_DEFAULTS.text.fontSize, 6, 400),
      fontWeight: number(text.fontWeight, DEFAULT_CREATION_DEFAULTS.text.fontWeight, 100, 900)
    },
    shape: {
      fill: color(shape.fill, DEFAULT_CREATION_DEFAULTS.shape.fill),
      stroke: color(shape.stroke, DEFAULT_CREATION_DEFAULTS.shape.stroke),
      strokeWidth: number(shape.strokeWidth, DEFAULT_CREATION_DEFAULTS.shape.strokeWidth, 0, 40)
    },
    line: {
      color: color(line.color, DEFAULT_CREATION_DEFAULTS.line.color),
      width: number(line.width, DEFAULT_CREATION_DEFAULTS.line.width, 1, 40),
      lineStyle: lineStyles.includes(line.lineStyle as ConnectorLineStyle)
        ? (line.lineStyle as ConnectorLineStyle)
        : DEFAULT_CREATION_DEFAULTS.line.lineStyle,
      startArrowhead: arrowheads.includes(line.startArrowhead as ConnectorArrowhead)
        ? (line.startArrowhead as ConnectorArrowhead)
        : DEFAULT_CREATION_DEFAULTS.line.startArrowhead,
      endArrowhead: arrowheads.includes(line.endArrowhead as ConnectorArrowhead)
        ? (line.endArrowhead as ConnectorArrowhead)
        : DEFAULT_CREATION_DEFAULTS.line.endArrowhead
    }
  };
}

export function isLinearCreationTool(tool: CreationTool | null): boolean {
  return (
    tool?.type === "shape" &&
    ["line", "curved-line", "arrow", "double-arrow", "curved-arrow"].includes(tool.kind)
  );
}
