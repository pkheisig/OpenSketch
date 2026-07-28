import type { CanvasSettings, CanvasUnit } from "./types";

export const DEFAULT_DPI = 300;

const mmToPx = (millimeters: number, dpi = DEFAULT_DPI) => Math.round((millimeters / 25.4) * dpi);

const inchesToPx = (inches: number, dpi = DEFAULT_DPI) => Math.round(inches * dpi);

export const CANVAS_PRESETS: Record<string, Pick<CanvasSettings, "width" | "height">> = {
  Freeform: { width: 1600, height: 1000 },
  "A4 portrait": { width: mmToPx(210), height: mmToPx(297) },
  "A4 landscape": { width: mmToPx(297), height: mmToPx(210) },
  "Letter portrait": { width: inchesToPx(8.5), height: inchesToPx(11) },
  "Letter landscape": { width: inchesToPx(11), height: inchesToPx(8.5) },
  "Presentation 16:9": { width: 1920, height: 1080 },
  Square: { width: 1600, height: 1600 }
};

export const DEFAULT_CANVAS: CanvasSettings = {
  ...CANVAS_PRESETS["Presentation 16:9"],
  unit: "px",
  dpi: DEFAULT_DPI,
  background: "#ffffff",
  transparent: false,
  grid: false,
  doubleClickCreatesText: true
};

export function pixelsToUnit(pixels: number, unit: CanvasUnit, dpi = DEFAULT_DPI): number {
  if (unit === "in") return pixels / dpi;
  if (unit === "mm") return (pixels / dpi) * 25.4;
  return pixels;
}

export function unitToPixels(value: number, unit: CanvasUnit, dpi = DEFAULT_DPI): number {
  if (unit === "in") return value * dpi;
  if (unit === "mm") return (value / 25.4) * dpi;
  return value;
}
