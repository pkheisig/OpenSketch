import type {
  ConnectorArrowhead,
  ConnectorLineStyle,
  ConnectorPathShape
} from "@workspace/editor-core";
import type { ConnectorCreationPreset } from "./creation";
import type { Point } from "./geometry";

export type ConnectorFamily =
  | "lines"
  | "arrows"
  | "inhibitor"
  | "dots"
  | "neurons"
  | "circular"
  | "brackets";

export interface ConnectorPreset extends ConnectorCreationPreset {
  label: string;
}

const HORIZONTAL = { x: 220, y: 0 };
const DIAGONAL_UP = { x: 220, y: -112 };
const DIAGONAL_DOWN = { x: 220, y: 112 };
const SHORT = { x: 120, y: 0 };
const VERTICAL = { x: 0, y: 220 };

const preset = (
  label: string,
  pathShape: ConnectorPathShape,
  lineStyle: ConnectorLineStyle = "solid",
  startArrowhead: ConnectorArrowhead = "none",
  endArrowhead: ConnectorArrowhead = "none",
  extra: Partial<
    Pick<
      ConnectorPreset,
      "curvature" | "opacity" | "widthScale" | "defaultOffset"
    >
  > = {}
): ConnectorPreset => ({
  label,
  pathShape,
  lineStyle,
  startArrowhead,
  endArrowhead,
  defaultOffset: HORIZONTAL,
  ...extra
});

/**
 * The visible order mirrors the BioRender families. Every entry is a real
 * geometry preset: changing an endpoint or line treatment never substitutes a
 * different path in the canvas than the one shown in the picker.
 */
export const CONNECTOR_PRESETS: Record<ConnectorFamily, ConnectorPreset[]> = {
  lines: [
    preset("Straight line", "straight"),
    preset("Faded line", "straight", "solid", "none", "none", { opacity: 0.35 }),
    preset("Dashed line", "straight", "dashed"),
    preset("Square elbow", "elbow", "solid", "none", "none", {
      defaultOffset: DIAGONAL_UP
    }),
    preset("Rounded elbow", "rounded-elbow", "solid", "none", "none", {
      defaultOffset: DIAGONAL_UP
    }),
    preset("Dashed elbow", "elbow", "dashed", "none", "none", {
      defaultOffset: DIAGONAL_UP
    }),
    preset("Step line", "step", "solid", "none", "none", { defaultOffset: DIAGONAL_UP }),
    preset("Rounded step", "rounded-step", "solid", "none", "none", {
      defaultOffset: DIAGONAL_UP
    }),
    preset("Dashed step", "step", "dashed", "none", "none", {
      defaultOffset: DIAGONAL_UP
    }),
    preset("Arc", "arc", "solid", "none", "none", { curvature: -0.28 }),
    preset("Faded arc", "arc", "solid", "none", "none", {
      curvature: -0.28,
      opacity: 0.35
    }),
    preset("Dashed arc", "arc", "dashed", "none", "none", { curvature: -0.28 }),
    preset("Arch", "arch", "solid", "none", "none", { curvature: -0.82 }),
    preset("Faded arch", "arch", "solid", "none", "none", {
      curvature: -0.82,
      opacity: 0.35
    }),
    preset("Dashed arch", "arch", "dashed", "none", "none", { curvature: -0.82 }),
    preset("Wave", "wave"),
    preset("Faded wave", "wave", "solid", "none", "none", { opacity: 0.35 }),
    preset("Dashed wave", "wave", "dashed"),
    preset("Pulse", "pulse"),
    preset("Faded pulse", "pulse", "solid", "none", "none", { opacity: 0.35 }),
    preset("Dashed pulse", "pulse", "dashed")
  ],
  arrows: [
    preset("Straight arrow", "straight", "solid", "none", "triangle"),
    preset("Open arrow", "straight", "solid", "none", "open"),
    preset("Double arrow", "straight", "solid", "triangle", "triangle"),
    preset("Dashed arrow", "straight", "dashed", "none", "triangle"),
    preset("Short arrow", "straight", "solid", "none", "triangle", {
      defaultOffset: SHORT
    }),
    preset("Shallow curved arrow", "arc", "solid", "none", "triangle", {
      curvature: -0.25
    }),
    preset("Descending curved arrow", "arc", "solid", "none", "triangle", {
      curvature: 0.35,
      defaultOffset: DIAGONAL_DOWN
    }),
    preset("Rounded elbow arrow", "rounded-elbow", "solid", "none", "triangle", {
      defaultOffset: DIAGONAL_UP
    }),
    preset("Reverse curved arrow", "arc", "solid", "none", "triangle", {
      curvature: 0.35
    }),
    preset("Double curved arrow", "arc", "solid", "triangle", "triangle", {
      curvature: -0.34
    }),
    preset("Dashed curved arrow", "arc", "dashed", "none", "triangle", {
      curvature: -0.34
    }),
    preset("Square elbow arrow", "elbow", "solid", "none", "triangle", {
      defaultOffset: DIAGONAL_UP
    }),
    preset("Elbow down arrow", "elbow", "solid", "none", "triangle", {
      defaultOffset: DIAGONAL_DOWN
    }),
    preset("Dashed elbow arrow", "elbow", "dashed", "none", "triangle", {
      defaultOffset: DIAGONAL_UP
    }),
    preset("Step arrow", "step", "solid", "none", "triangle", {
      defaultOffset: DIAGONAL_UP
    }),
    preset("Double step arrow", "step", "solid", "triangle", "triangle", {
      defaultOffset: DIAGONAL_UP
    }),
    preset("Rounded step arrow", "rounded-step", "solid", "none", "triangle", {
      defaultOffset: DIAGONAL_UP
    }),
    preset("Dashed step arrow", "rounded-step", "dashed", "none", "triangle", {
      defaultOffset: DIAGONAL_UP
    }),
    preset("Large curved arrow", "arch", "solid", "none", "triangle", {
      curvature: -0.76
    }),
    preset("Large double curved arrow", "arch", "solid", "triangle", "triangle", {
      curvature: -0.76
    }),
    preset("Dashed large curved arrow", "arch", "dashed", "none", "triangle", {
      curvature: -0.76
    }),
    preset("Wave arrow", "wave", "solid", "none", "triangle"),
    preset("Double wave arrow", "wave", "solid", "triangle", "triangle"),
    preset("Dashed wave arrow", "wave", "dashed", "none", "triangle"),
    preset("Broad arrow", "straight", "solid", "none", "triangle", { widthScale: 2 }),
    preset("Broad open arrow", "straight", "solid", "none", "open", { widthScale: 2 }),
    preset("Broad double arrow", "straight", "solid", "triangle", "triangle", {
      widthScale: 2
    }),
    preset("Broad dashed arrow", "straight", "dashed", "none", "triangle", {
      widthScale: 2
    })
  ],
  inhibitor: [
    preset("Inhibitor", "straight", "solid", "none", "bar"),
    preset("Faded inhibitor", "straight", "solid", "none", "bar", { opacity: 0.35 }),
    preset("Dashed inhibitor", "straight", "dashed", "none", "bar"),
    preset("Elbow inhibitor", "elbow", "solid", "none", "bar", {
      defaultOffset: DIAGONAL_UP
    }),
    preset("Rounded inhibitor", "rounded-elbow", "solid", "none", "bar", {
      defaultOffset: DIAGONAL_UP
    }),
    preset("Dashed elbow inhibitor", "elbow", "dashed", "none", "bar", {
      defaultOffset: DIAGONAL_UP
    }),
    preset("Step inhibitor", "step", "solid", "none", "bar", {
      defaultOffset: DIAGONAL_UP
    }),
    preset("Rounded step inhibitor", "rounded-step", "solid", "none", "bar", {
      defaultOffset: DIAGONAL_UP
    }),
    preset("Dashed step inhibitor", "step", "dashed", "none", "bar", {
      defaultOffset: DIAGONAL_UP
    }),
    preset("Curved inhibitor", "arc", "solid", "none", "bar", { curvature: -0.32 }),
    preset("Faded curved inhibitor", "arc", "solid", "none", "bar", {
      curvature: -0.32,
      opacity: 0.35
    }),
    preset("Dashed curved inhibitor", "arc", "dashed", "none", "bar", {
      curvature: -0.32
    })
  ],
  dots: [
    preset("Dot endpoint", "straight", "solid", "none", "circle"),
    preset("Dashed dot endpoint", "straight", "dashed", "none", "circle"),
    preset("Elbow dot endpoint", "elbow", "solid", "none", "circle", {
      defaultOffset: DIAGONAL_UP
    }),
    preset("Dashed elbow dot endpoint", "elbow", "dashed", "none", "circle", {
      defaultOffset: DIAGONAL_UP
    })
  ],
  neurons: [
    preset("Neuron connector", "straight", "solid", "neuron", "circle"),
    preset("Neuron open endpoint", "straight", "solid", "neuron", "open-circle"),
    preset("Reverse neuron connector", "straight", "solid", "circle", "neuron"),
    preset("Reverse open neuron", "straight", "solid", "open-circle", "neuron"),
    preset("Curved neuron", "arc", "solid", "neuron", "circle", { curvature: -0.3 }),
    preset("Wave neuron", "wave", "solid", "neuron", "circle"),
    preset("Arc neuron", "arc", "solid", "neuron", "open-circle", { curvature: 0.3 }),
    preset("Elbow neuron", "elbow", "solid", "neuron", "circle", {
      defaultOffset: DIAGONAL_UP
    }),
    preset("Rounded neuron", "rounded-elbow", "solid", "neuron", "circle", {
      defaultOffset: DIAGONAL_UP
    }),
    preset("Step neuron", "step", "solid", "neuron", "circle", {
      defaultOffset: DIAGONAL_UP
    })
  ],
  circular: [
    preset("Circular line", "circular", "solid", "none", "none", { curvature: 0.8 }),
    preset("Reverse circular line", "circular", "solid", "none", "none", {
      curvature: -0.8
    }),
    preset("Short arc", "arc", "solid", "none", "none", {
      curvature: -0.46,
      defaultOffset: SHORT
    }),
    preset("Quarter arc", "arc", "solid", "none", "none", {
      curvature: -0.62,
      defaultOffset: DIAGONAL_UP
    }),
    preset("Circular arrow", "circular", "solid", "none", "triangle", { curvature: 0.8 }),
    preset("Reverse circular arrow", "circular", "solid", "none", "triangle", {
      curvature: -0.8
    }),
    preset("Short circular arrow", "arc", "solid", "none", "triangle", {
      curvature: -0.46,
      defaultOffset: SHORT
    }),
    preset("Quarter arrow", "arc", "solid", "none", "triangle", {
      curvature: -0.62,
      defaultOffset: DIAGONAL_UP
    }),
    preset("Double circular arrow", "circular", "solid", "triangle", "triangle", {
      curvature: 0.8
    }),
    preset("Reverse double circular arrow", "circular", "solid", "triangle", "triangle", {
      curvature: -0.8
    }),
    preset("Open circular arrow", "circular", "solid", "none", "open", {
      curvature: 0.8
    }),
    preset("Reverse open circular arrow", "circular", "solid", "none", "open", {
      curvature: -0.8
    }),
    preset("Dashed circular line", "circular", "dashed", "none", "none", {
      curvature: 0.8
    }),
    preset("Dashed reverse circular line", "circular", "dashed", "none", "none", {
      curvature: -0.8
    }),
    preset("Dashed circular arrow", "circular", "dashed", "none", "triangle", {
      curvature: 0.8
    }),
    preset("Dashed reverse circular arrow", "circular", "dashed", "none", "triangle", {
      curvature: -0.8
    })
  ],
  brackets: [
    preset("Square bracket", "bracket-square", "solid", "none", "none", {
      defaultOffset: VERTICAL
    }),
    preset("Round bracket", "bracket-round", "solid", "none", "none", {
      defaultOffset: VERTICAL
    }),
    preset("Square brace", "bracket-square-center", "solid", "none", "none", {
      defaultOffset: VERTICAL
    }),
    preset("Curly brace", "bracket-curly", "solid", "none", "none", {
      defaultOffset: VERTICAL
    }),
    preset("Reverse curly brace", "bracket-curly", "solid", "none", "none", {
      curvature: 0.25,
      defaultOffset: VERTICAL
    })
  ]
};

const PREVIEW_SCALE = 24 / 220;

export function connectorPreviewEndpoints(presetValue: ConnectorPreset): {
  from: Point;
  to: Point;
} {
  const offset = presetValue.defaultOffset ?? HORIZONTAL;
  if (Math.abs(offset.y) > Math.abs(offset.x) * 1.5) {
    return {
      from: { x: 16, y: 2 },
      to: { x: 16, y: 2 + offset.y * (18 / 220) }
    };
  }
  const scaled = { x: offset.x * PREVIEW_SCALE, y: offset.y * PREVIEW_SCALE };
  const center = { x: 16, y: 12 };
  return {
    from: { x: center.x - scaled.x / 2, y: center.y - scaled.y / 2 },
    to: { x: center.x + scaled.x / 2, y: center.y + scaled.y / 2 }
  };
}

export const CONNECTOR_FAMILIES: ReadonlyArray<{
  id: ConnectorFamily;
  label: string;
}> = [
  { id: "lines", label: "Lines" },
  { id: "arrows", label: "Arrows" },
  { id: "inhibitor", label: "Inhibitor" },
  { id: "dots", label: "Dots" },
  { id: "neurons", label: "Neurons" },
  { id: "circular", label: "Circular" },
  { id: "brackets", label: "Brackets" }
];
