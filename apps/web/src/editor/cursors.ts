const CURSOR_SIZE = 32;
const CURSOR_HOTSPOT = 16;
const INK = "#173f3d";
const HALO = "#ffffff";

function svgCursor(body: string, fallback: string, hotspot = CURSOR_HOTSPOT): string {
  const source = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CURSOR_SIZE}" height="${CURSOR_SIZE}" viewBox="0 0 ${CURSOR_SIZE} ${CURSOR_SIZE}">`,
    body,
    "</svg>"
  ].join("");
  return `url("data:image/svg+xml,${encodeURIComponent(source)}") ${hotspot} ${hotspot}, ${fallback}`;
}

function outlinedPath(path: string, attributes = ""): string {
  return [
    `<path d="${path}" ${attributes} fill="none" stroke="${HALO}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`,
    `<path d="${path}" ${attributes} fill="none" stroke="${INK}" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"/>`
  ].join("");
}

function resizeCursor(angle: number, fallback: string): string {
  const arrow = outlinedPath("M5 16h22M5 16l5-5M5 16l5 5M27 16l-5-5M27 16l-5 5");
  return svgCursor(`<g transform="rotate(${angle} 16 16)">${arrow}</g>`, fallback);
}

export const CURSOR_GRAB = svgCursor(
  [
    `<path d="M11.5 15.5V8.8a2 2 0 0 1 4 0v4.4-6a2 2 0 0 1 4 0v6-3.8a2 2 0 0 1 4 0v7.1l1.2-1.5a2.2 2.2 0 0 1 3.5 2.6l-4.5 6.3a6 6 0 0 1-4.9 2.6h-2.5a6 6 0 0 1-5.2-3L8 18.1a2.2 2.2 0 0 1 3.5-2.6Z" fill="${HALO}" stroke="${HALO}" stroke-width="4" stroke-linejoin="round"/>`,
    `<path d="M11.5 15.5V8.8a2 2 0 0 1 4 0v4.4-6a2 2 0 0 1 4 0v6-3.8a2 2 0 0 1 4 0v7.1l1.2-1.5a2.2 2.2 0 0 1 3.5 2.6l-4.5 6.3a6 6 0 0 1-4.9 2.6h-2.5a6 6 0 0 1-5.2-3L8 18.1a2.2 2.2 0 0 1 3.5-2.6Z" fill="#f8fbfa" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`
  ].join(""),
  "grab",
  15
);

export const CURSOR_GRABBING = svgCursor(
  [
    `<path d="M9 15.4V12a2 2 0 0 1 3.8-.9V8.8a2 2 0 0 1 4 0V8a2 2 0 0 1 4 0v2a2 2 0 0 1 4 .1v7.2l1.2-1.5a2.1 2.1 0 0 1 3.4 2.5l-4.6 6.2a6 6 0 0 1-4.8 2.4h-3.1a6 6 0 0 1-5.2-3L8.1 18a2 2 0 0 1 .9-2.6Z" fill="${HALO}" stroke="${HALO}" stroke-width="4" stroke-linejoin="round"/>`,
    `<path d="M9 15.4V12a2 2 0 0 1 3.8-.9V8.8a2 2 0 0 1 4 0V8a2 2 0 0 1 4 0v2a2 2 0 0 1 4 .1v7.2l1.2-1.5a2.1 2.1 0 0 1 3.4 2.5l-4.6 6.2a6 6 0 0 1-4.8 2.4h-3.1a6 6 0 0 1-5.2-3L8.1 18a2 2 0 0 1 .9-2.6Z" fill="#eaf3f1" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`
  ].join(""),
  "grabbing",
  15
);

export const CURSOR_ROTATE = svgCursor(
  [
    outlinedPath("M24.5 12.5A9.5 9.5 0 1 0 25 21"),
    `<path d="M20.5 8.5h5v5" fill="${HALO}" stroke="${HALO}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`,
    `<path d="M20.5 8.5h5v5" fill="none" stroke="${INK}" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"/>`
  ].join(""),
  "crosshair"
);

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
