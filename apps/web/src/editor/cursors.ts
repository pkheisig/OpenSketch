const CURSOR_SIZE = 28;
const CURSOR_HOTSPOT = 14;
const INK = "#183133";
const HALO = "#ffffff";

const HAND_PATH =
  "M9 20c-1.8-1.2-2.8-3-3.5-5L3.9 10.8c-.35-.95.15-2 1.1-2.35s2 .1 2.45 1l1.05 2.05V3.2C8.5 2 9.45 1 10.65 1s2.15 1 2.15 2.2V8c0-1 .8-1.8 1.8-1.8s1.8.8 1.8 1.8v.8c0-1 .8-1.8 1.8-1.8s1.8.8 1.8 1.8v1c0-1 .8-1.8 1.8-1.8 1.1 0 1.9.9 1.9 2v4c0 4.9-3.7 8.5-8.5 8.5h-2c-1.5 0-3-.9-4.2-2.5Z";

const LUCIDE_MOVE_HORIZONTAL = [
  '<path d="m18 8 4 4-4 4"/>',
  '<path d="M2 12h20"/>',
  '<path d="m6 8-4 4 4 4"/>'
].join("");

const LUCIDE_ROTATE_CW = [
  '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/>',
  '<path d="M21 3v5h-5"/>'
].join("");

function iconLayers(paths: string, transform = "", filled = false): string {
  const transformAttribute = transform ? ` transform="${transform}"` : "";
  if (filled) {
    return `<g${transformAttribute} fill="${HALO}" stroke="${INK}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</g>`;
  }
  return [
    `<g${transformAttribute} fill="none" stroke="${HALO}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round">${paths}</g>`,
    `<g${transformAttribute} fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</g>`
  ].join("");
}

function svgCursor(
  paths: string,
  fallback: string,
  {
    hotspotX = CURSOR_HOTSPOT,
    hotspotY = CURSOR_HOTSPOT,
    transform = "",
    filled = false
  }: { hotspotX?: number; hotspotY?: number; transform?: string; filled?: boolean } = {}
): string {
  const source = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CURSOR_SIZE}" height="${CURSOR_SIZE}" viewBox="0 0 28 28">`,
    `<g transform="translate(2 2)">${iconLayers(paths, transform, filled)}</g>`,
    "</svg>"
  ].join("");
  return `url("data:image/svg+xml,${encodeURIComponent(source)}") ${hotspotX} ${hotspotY}, ${fallback}`;
}

function resizeCursor(angle: number, fallback: string): string {
  return svgCursor(LUCIDE_MOVE_HORIZONTAL, fallback, {
    transform: `rotate(${angle} 12 12)`
  });
}

function handCursor(fallback: string): string {
  const source = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CURSOR_SIZE}" height="${CURSOR_SIZE}" viewBox="0 0 28 28">`,
    '<g transform="translate(3.1 2) scale(.92 1)">',
    `<path fill="${HALO}" stroke="${INK}" stroke-width="1.8" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round" d="${HAND_PATH}"/>`,
    "</g>",
    "</svg>"
  ].join("");
  return `url("data:image/svg+xml,${encodeURIComponent(source)}") 12 13, ${fallback}`;
}

export const CURSOR_GRAB = handCursor("grab");

export const CURSOR_GRABBING = handCursor("grabbing");

export const CURSOR_ROTATE = svgCursor(LUCIDE_ROTATE_CW, "crosshair");

export const CURSOR_RESIZE_HORIZONTAL = resizeCursor(0, "ew-resize");
export const CURSOR_RESIZE_VERTICAL = resizeCursor(90, "ns-resize");
export const CURSOR_RESIZE_NW_SE = resizeCursor(45, "nwse-resize");
export const CURSOR_RESIZE_NE_SW = resizeCursor(-45, "nesw-resize");

export function uiTransformCursor(nativeCursor: string): string {
  switch (nativeCursor) {
    case "e-resize":
    case "w-resize":
    case "ew-resize":
      return CURSOR_RESIZE_HORIZONTAL;
    case "n-resize":
    case "s-resize":
    case "ns-resize":
      return CURSOR_RESIZE_VERTICAL;
    case "nw-resize":
    case "se-resize":
    case "nwse-resize":
      return CURSOR_RESIZE_NW_SE;
    case "ne-resize":
    case "sw-resize":
    case "nesw-resize":
      return CURSOR_RESIZE_NE_SW;
    default:
      return nativeCursor;
  }
}
