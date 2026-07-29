const CURSOR_SIZE = 28;
const CURSOR_HOTSPOT = 14;
const INK = "#183133";
const HALO = "#ffffff";

const LUCIDE_ROTATE_CW = [
  '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/>',
  '<path d="M21 3v5h-5"/>'
].join("");

function iconLayers(paths: string): string {
  return [
    `<g fill="none" stroke="${HALO}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round">${paths}</g>`,
    `<g fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</g>`
  ].join("");
}

function svgCursor(paths: string, fallback: string): string {
  const source = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CURSOR_SIZE}" height="${CURSOR_SIZE}" viewBox="0 0 28 28">`,
    `<g transform="translate(2 2)">${iconLayers(paths)}</g>`,
    "</svg>"
  ].join("");
  return `url("data:image/svg+xml,${encodeURIComponent(source)}") ${CURSOR_HOTSPOT} ${CURSOR_HOTSPOT}, ${fallback}`;
}

// Native CSS cursors intentionally delegate common interactions to the host
// operating system. Rotation remains custom because CSS has no rotate cursor.
export const CURSOR_GRAB = "grab";

export const CURSOR_GRABBING = "grabbing";

export const CURSOR_ROTATE = svgCursor(LUCIDE_ROTATE_CW, "crosshair");

export const CURSOR_RESIZE_HORIZONTAL = "ew-resize";
export const CURSOR_RESIZE_VERTICAL = "ns-resize";
export const CURSOR_RESIZE_NW_SE = "nwse-resize";
export const CURSOR_RESIZE_NE_SW = "nesw-resize";

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
