import {
  CONNECTOR_PRESETS,
  creationToolForConnectorPreset,
  type ConnectorFamily,
  type ConnectorPreset
} from "./connectorPresets";
import type { CreationTool } from "./creation";
import type { Point } from "./geometry";

export const CONNECTOR_PRESET_DRAG_TYPE = "application/x-opensketch-connector-preset";

interface ConnectorPresetDragPayload {
  family: ConnectorFamily;
  label: string;
}

export interface DraggedConnectorPreset {
  family: ConnectorFamily;
  preset: ConnectorPreset;
  tool: CreationTool;
}

const connectorFamilies = new Set<ConnectorFamily>([
  "lines",
  "arrows",
  "inhibitor",
  "dots",
  "neurons",
  "circular",
  "brackets"
]);

export function setConnectorPresetDragPayload(
  dataTransfer: DataTransfer,
  family: ConnectorFamily,
  preset: ConnectorPreset
): void {
  dataTransfer.effectAllowed = "copy";
  dataTransfer.setData(
    CONNECTOR_PRESET_DRAG_TYPE,
    JSON.stringify({ family, label: preset.label } satisfies ConnectorPresetDragPayload)
  );
}

export function parseConnectorPresetDragPayload(encoded: string): DraggedConnectorPreset | null {
  try {
    const payload = JSON.parse(encoded) as Partial<ConnectorPresetDragPayload>;
    if (
      typeof payload.family !== "string" ||
      !connectorFamilies.has(payload.family as ConnectorFamily) ||
      typeof payload.label !== "string"
    ) {
      return null;
    }
    const family = payload.family as ConnectorFamily;
    const preset = CONNECTOR_PRESETS[family].find((candidate) => candidate.label === payload.label);
    return preset
      ? {
          family,
          preset,
          tool: creationToolForConnectorPreset(preset, family)
        }
      : null;
  } catch {
    return null;
  }
}

export function readConnectorPresetDragPayload(
  dataTransfer: DataTransfer
): DraggedConnectorPreset | null {
  const encoded = dataTransfer.getData(CONNECTOR_PRESET_DRAG_TYPE);
  return encoded ? parseConnectorPresetDragPayload(encoded) : null;
}

export function connectorDropEndpoints(
  tool: CreationTool,
  center: Point,
  canvasSize: { width: number; height: number }
): { from: Point; to: Point } {
  const offset =
    tool.type === "shape" && tool.connectorPreset?.defaultOffset
      ? tool.connectorPreset.defaultOffset
      : { x: 220, y: 0 };
  const initial = {
    from: { x: center.x - offset.x / 2, y: center.y - offset.y / 2 },
    to: { x: center.x + offset.x / 2, y: center.y + offset.y / 2 }
  };
  const minimumX = Math.min(initial.from.x, initial.to.x);
  const maximumX = Math.max(initial.from.x, initial.to.x);
  const minimumY = Math.min(initial.from.y, initial.to.y);
  const maximumY = Math.max(initial.from.y, initial.to.y);
  const shiftX =
    minimumX < 0 ? -minimumX : maximumX > canvasSize.width ? canvasSize.width - maximumX : 0;
  const shiftY =
    minimumY < 0 ? -minimumY : maximumY > canvasSize.height ? canvasSize.height - maximumY : 0;
  return {
    from: { x: initial.from.x + shiftX, y: initial.from.y + shiftY },
    to: { x: initial.to.x + shiftX, y: initial.to.y + shiftY }
  };
}
