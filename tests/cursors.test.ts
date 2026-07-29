import { describe, expect, it } from "vitest";
import {
  CURSOR_GRAB,
  CURSOR_GRABBING,
  CURSOR_RESIZE_HORIZONTAL,
  CURSOR_RESIZE_NE_SW,
  CURSOR_RESIZE_NW_SE,
  CURSOR_RESIZE_VERTICAL,
  CURSOR_ROTATE,
  uiTransformCursor
} from "../apps/web/src/editor/cursors";

describe("OpenSketch canvas cursors", () => {
  it("keeps a vector UI cursor only for rotation", () => {
    expect(CURSOR_ROTATE).toContain("data:image/svg+xml");
    const source = decodeURIComponent(CURSOR_ROTATE);
    expect(source).toContain('width="28"');
    expect(source).toContain('stroke="#183133"');
    expect(source).toContain('stroke-width="2"');
    expect(source).toContain('stroke-width="4.5"');
  });

  it("delegates standard interaction cursors to the host operating system", () => {
    expect(CURSOR_GRAB).toBe("grab");
    expect(CURSOR_GRABBING).toBe("grabbing");
    expect(CURSOR_RESIZE_HORIZONTAL).toBe("ew-resize");
    expect(CURSOR_RESIZE_VERTICAL).toBe("ns-resize");
    expect(CURSOR_RESIZE_NW_SE).toBe("nwse-resize");
    expect(CURSOR_RESIZE_NE_SW).toBe("nesw-resize");
    expect(decodeURIComponent(CURSOR_ROTATE)).toContain('fill="none"');
  });

  it("maps every native resize direction to an OpenSketch cursor", () => {
    expect(uiTransformCursor("e-resize")).toBe(CURSOR_RESIZE_HORIZONTAL);
    expect(uiTransformCursor("s-resize")).toBe(CURSOR_RESIZE_VERTICAL);
    expect(uiTransformCursor("se-resize")).toBe(CURSOR_RESIZE_NW_SE);
    expect(uiTransformCursor("sw-resize")).toBe(CURSOR_RESIZE_NE_SW);
    expect(uiTransformCursor("not-allowed")).toBe("not-allowed");
  });
});
