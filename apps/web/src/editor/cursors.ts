const CURSOR_SIZE = 28;
const CURSOR_HOTSPOT = 14;
const INK = "#183133";
const HALO = "#ffffff";

// Path data adapted from Lucide v0.536.0 (ISC). Keeping every transform cursor
// in the same icon family avoids mixing browser-native and bespoke silhouettes.
const LUCIDE_HAND = [
  '<path d="M18 11V6a2 2 0 0 0-4 0"/>',
  '<path d="M14 10V4a2 2 0 0 0-4 0v2"/>',
  '<path d="M10 10.5V6a2 2 0 0 0-4 0v8"/>',
  '<path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>'
].join("");

const LUCIDE_HAND_GRAB = [
  '<path d="M18 11.5V9a2 2 0 0 0-4 0v1.4"/>',
  '<path d="M14 10V8a2 2 0 0 0-4 0v2"/>',
  '<path d="M10 9.9V9a2 2 0 0 0-4 0v5"/>',
  '<path d="M6 14a2 2 0 0 0-4 0"/>',
  '<path d="M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-4a8 8 0 0 1-8-8 2 2 0 1 1 4 0"/>'
].join("");

const LUCIDE_MOVE_HORIZONTAL = [
  '<path d="m18 8 4 4-4 4"/>',
  '<path d="M2 12h20"/>',
  '<path d="m6 8-4 4 4 4"/>'
].join("");

const LUCIDE_ROTATE_CW = [
  '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/>',
  '<path d="M21 3v5h-5"/>'
].join("");

function iconLayers(paths: string, transform = ""): string {
  const transformAttribute = transform ? ` transform="${transform}"` : "";
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
    transform = ""
  }: { hotspotX?: number; hotspotY?: number; transform?: string } = {}
): string {
  const source = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CURSOR_SIZE}" height="${CURSOR_SIZE}" viewBox="0 0 28 28">`,
    `<g transform="translate(2 2)">${iconLayers(paths, transform)}</g>`,
    "</svg>"
  ].join("");
  return `url("data:image/svg+xml,${encodeURIComponent(source)}") ${hotspotX} ${hotspotY}, ${fallback}`;
}

function resizeCursor(angle: number, fallback: string): string {
  return svgCursor(LUCIDE_MOVE_HORIZONTAL, fallback, {
    transform: `rotate(${angle} 12 12)`
  });
}

export const CURSOR_GRAB = svgCursor(LUCIDE_HAND, "grab", {
  hotspotX: 12,
  hotspotY: 13
});

export const CURSOR_GRABBING = svgCursor(LUCIDE_HAND_GRAB, "grabbing", {
  hotspotX: 12,
  hotspotY: 13
});

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
