import { unitToPixels, type CanvasUnit } from "@workspace/editor-core";

const TARGET_MAJOR_TICK_SPACING = 80;

export interface RulerScale {
  majorUnitStep: number;
  majorCanvasStep: number;
  majorScreenStep: number;
  minorScreenStep: number;
}

export interface RulerTick {
  label: string;
  position: number;
  value: number;
}

function nextNiceStep(minimum: number): number {
  if (!Number.isFinite(minimum) || minimum <= 0) return 1;
  const exponent = Math.floor(Math.log10(minimum));
  const magnitude = 10 ** exponent;
  const normalized = minimum / magnitude;
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return factor * magnitude;
}

export function rulerScale(zoom: number, unit: CanvasUnit, dpi: number): RulerScale {
  const safeZoom = Math.max(0.1, zoom);
  const pixelsPerUnit = unitToPixels(1, unit, dpi);
  const majorUnitStep = nextNiceStep(TARGET_MAJOR_TICK_SPACING / (pixelsPerUnit * safeZoom));
  const majorCanvasStep = unitToPixels(majorUnitStep, unit, dpi);
  const majorScreenStep = majorCanvasStep * safeZoom;
  return {
    majorUnitStep,
    majorCanvasStep,
    majorScreenStep,
    minorScreenStep: majorScreenStep / 5
  };
}

export function formatRulerValue(value: number, unit: CanvasUnit): string {
  if (unit === "px") return String(Math.round(value));
  const digits = Math.abs(value) < 1 ? 2 : Math.abs(value) < 10 ? 1 : 0;
  const fixed = value.toFixed(digits);
  return digits === 0 ? fixed : fixed.replace(/\.?0+$/, "");
}

export function visibleRulerTicks({
  canvasLength,
  origin,
  viewportLength,
  scale,
  unit
}: {
  canvasLength: number;
  origin: number;
  viewportLength: number;
  scale: RulerScale;
  unit: CanvasUnit;
}): RulerTick[] {
  if (canvasLength <= 0 || viewportLength <= 0 || scale.majorScreenStep <= 0) return [];

  const finalIndex = Math.floor((canvasLength + Number.EPSILON) / scale.majorCanvasStep);
  const firstVisibleIndex = Math.max(0, Math.ceil(-origin / scale.majorScreenStep));
  const lastVisibleIndex = Math.min(
    finalIndex,
    Math.floor((viewportLength - origin) / scale.majorScreenStep)
  );
  if (lastVisibleIndex < firstVisibleIndex) return [];

  return Array.from({ length: lastVisibleIndex - firstVisibleIndex + 1 }, (_, offset) => {
    const index = firstVisibleIndex + offset;
    const value = index * scale.majorUnitStep;
    return {
      label: formatRulerValue(value, unit),
      position: index * scale.majorScreenStep,
      value
    };
  });
}
