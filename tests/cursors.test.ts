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
    for (const cursor of [
      CURSOR_GRAB,
      CURSOR_GRABBING,
      CURSOR_ROTATE,
      CURSOR_RESIZE_HORIZONTAL,
      CURSOR_RESIZE_VERTICAL,
      CURSOR_RESIZE_NW_SE,
      CURSOR_RESIZE_NE_SW
    ]) {
      expect(cursor).toContain("data:image/svg+xml");
    }
  });

  it("maps every native resize direction to an OpenSketch cursor", () => {
    expect(uiTransformCursor("e-resize")).toBe(CURSOR_RESIZE_HORIZONTAL);
    expect(uiTransformCursor("s-resize")).toBe(CURSOR_RESIZE_VERTICAL);
    expect(uiTransformCursor("se-resize")).toBe(CURSOR_RESIZE_NW_SE);
    expect(uiTransformCursor("sw-resize")).toBe(CURSOR_RESIZE_NE_SW);
    expect(uiTransformCursor("not-allowed")).toBe("not-allowed");
  });
});
