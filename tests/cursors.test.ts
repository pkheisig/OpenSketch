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
  it("provides vector UI cursors for canvas transforms", () => {
    const cursors = [
      CURSOR_GRAB,
      CURSOR_GRABBING,
      CURSOR_ROTATE,
      CURSOR_RESIZE_HORIZONTAL,
      CURSOR_RESIZE_VERTICAL,
      CURSOR_RESIZE_NW_SE,
      CURSOR_RESIZE_NE_SW
    ];
    for (const cursor of cursors) {
      expect(cursor).toContain("data:image/svg+xml");
      const source = decodeURIComponent(cursor);
      expect(source).toContain('width="28"');
      expect(source).toContain('stroke="#183133"');
      expect(source).toContain('stroke-width="2"');
    }
    for (const cursor of [
      CURSOR_ROTATE,
      CURSOR_RESIZE_HORIZONTAL,
      CURSOR_RESIZE_VERTICAL,
      CURSOR_RESIZE_NW_SE,
      CURSOR_RESIZE_NE_SW
    ]) {
      expect(decodeURIComponent(cursor)).toContain('stroke-width="4.5"');
    }
    expect(new Set(cursors).size).toBe(cursors.length);
  });

  it("fills the hand itself white without drawing a background tile", () => {
    for (const cursor of [CURSOR_GRAB, CURSOR_GRABBING]) {
      const source = decodeURIComponent(cursor);
      expect(source).toContain('fill="#ffffff" stroke="#183133" stroke-width="2"');
      expect(source).not.toContain("<rect");
    }
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
