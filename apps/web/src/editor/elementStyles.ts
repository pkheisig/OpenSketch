import { Group, type FabricObject } from "fabric";
import type { ConnectorBinding } from "@workspace/editor-core";
import type { StringListStorage } from "@/editor/stringListStorage";

export const SAVED_ELEMENT_STYLES_STORAGE_KEY = "OpenSketch:element-styles";
export const SAVED_ELEMENT_STYLES_CHANGED_EVENT = "opensketch:element-styles-changed";

type StyleValue = string | number | boolean | number[] | null;

export interface ElementStyleSnapshot {
  properties: Record<string, StyleValue>;
  connector?: ConnectorBinding;
  children?: ElementStyleSnapshot[];
}

export type SavedElementStyles = Record<string, ElementStyleSnapshot>;

const STYLE_PROPERTIES = [
  "fill",
  "stroke",
  "strokeWidth",
  "strokeDashArray",
  "strokeLineCap",
  "strokeLineJoin",
  "strokeUniform",
  "paintFirst",
  "opacity",
  "globalCompositeOperation",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "underline",
  "linethrough",
  "overline",
  "charSpacing",
  "lineHeight",
  "textAlign",
  "scaleX",
  "scaleY",
  "assetTint",
  "assetTintAmount",
  "assetSaturation",
  "assetBrightness",
  "assetColorPreset"
] as const;

function styleValue(value: unknown): StyleValue | undefined {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (Array.isArray(value) && value.every((item) => typeof item === "number")) {
    return [...value];
  }
  return undefined;
}

export function styleTarget(object: FabricObject | undefined): FabricObject | undefined {
  if (!object) return undefined;
  for (let parent = object.group; parent; parent = parent.group) {
    if (
      parent.OpenSketchType === "nih-asset" ||
      parent.OpenSketchType === "import" ||
      parent.OpenSketchType === "upload"
    ) {
      return parent;
    }
  }
  return object;
}

export function elementStyleKey(object: FabricObject | undefined): string | undefined {
  const target = styleTarget(object);
  if (!target) return undefined;
  const type = target.OpenSketchType ?? "";
  if (type === "nih-asset" && target.assetId) return `asset:${target.assetId}`;
  if ((type === "import" || type === "upload") && target.name) {
    return `import:${target.name.trim().toLowerCase()}`;
  }
  if (type === "text") return "text:point";
  if (type === "shape" && target.name) return `shape:${target.name.trim().toLowerCase()}`;
  if (
    ["connector", "line", "curved-line", "arrow", "double-arrow", "curved-arrow"].includes(type)
  ) {
    return `connector:${type}`;
  }
  return undefined;
}

export function captureElementStyle(object: FabricObject): ElementStyleSnapshot {
  const source = object as unknown as Record<string, unknown>;
  const properties = Object.fromEntries(
    STYLE_PROPERTIES.flatMap((property) => {
      const value = styleValue(source[property]);
      return value === undefined ? [] : [[property, value]];
    })
  );
  return {
    properties,
    connector: object.connector ? structuredClone(object.connector) : undefined,
    children:
      object instanceof Group
        ? object.getObjects().map((child) => captureElementStyle(child))
        : undefined
  };
}

export function applyElementStyle(
  object: FabricObject,
  snapshot: ElementStyleSnapshot | undefined
): void {
  if (!snapshot) return;
  object.set(snapshot.properties);
  if (snapshot.connector) object.connector = structuredClone(snapshot.connector);
  if (object instanceof Group && snapshot.children) {
    object
      .getObjects()
      .forEach((child, index) => applyElementStyle(child, snapshot.children?.[index]));
    object.dirty = true;
  }
  object.setCoords();
}

export function loadSavedElementStyles(
  storage: StringListStorage = localStorage
): SavedElementStyles {
  try {
    const value = JSON.parse(storage.getItem(SAVED_ELEMENT_STYLES_STORAGE_KEY) ?? "{}");
    return value && typeof value === "object" ? (value as SavedElementStyles) : {};
  } catch {
    return {};
  }
}

export function persistSavedElementStyles(
  styles: SavedElementStyles,
  storage: StringListStorage = localStorage
): void {
  try {
    storage.setItem(SAVED_ELEMENT_STYLES_STORAGE_KEY, JSON.stringify(styles));
  } catch {
    // Styling remains active for this session if persistent storage is unavailable.
  }
  window.dispatchEvent(new Event(SAVED_ELEMENT_STYLES_CHANGED_EVENT));
}
