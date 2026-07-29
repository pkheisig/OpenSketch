const CURSOR_SIZE = 28;
const CURSOR_HOTSPOT = 14;
const INK = "#183133";
const HALO = "#ffffff";

// Closed silhouette from Google's rounded Material Icons `pan_tool`
// (Apache-2.0). A single closed path is intentional: filling Lucide's former
// multi-path outline implicitly closed each finger path and produced the white
// wedges/"leaks" visible inside the cursor.
const MATERIAL_HAND =
  '<path d="M21.5 4c-.83 0-1.5.67-1.5 1.5v5c0 .28-.22.5-.5.5s-.5-.22-.5-.5v-8c0-.83-.67-1.5-1.5-1.5S16 1.67 16 2.5v8c0 .28-.22.5-.5.5s-.5-.22-.5-.5v-9c0-.83-.67-1.5-1.5-1.5S12 .67 12 1.5v8.99c0 .28-.22.5-.5.5s-.5-.22-.5-.5V4.5c0-.83-.67-1.5-1.5-1.5S8 3.67 8 4.5v11.41l-4.12-2.35c-.58-.33-1.3-.24-1.78.22-.6.58-.62 1.54-.03 2.13l6.78 6.89c.75.77 1.77 1.2 2.85 1.2H19c2.21 0 4-1.79 4-4V5.5c0-.83-.67-1.5-1.5-1.5z"/>';

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

export const CURSOR_GRAB = svgCursor(MATERIAL_HAND, "grab", {
  hotspotX: 12,
  hotspotY: 13,
  filled: true
});

export const CURSOR_GRABBING = svgCursor(MATERIAL_HAND, "grabbing", {
  hotspotX: 12,
  hotspotY: 13,
  transform: "translate(1.08 1.35) scale(.91)",
  filled: true
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
