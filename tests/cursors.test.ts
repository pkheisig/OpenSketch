import { describe, expect, it } from "vitest";
import sharp from "sharp";
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
    }
    for (const cursor of [
      CURSOR_ROTATE,
      CURSOR_RESIZE_HORIZONTAL,
      CURSOR_RESIZE_VERTICAL,
      CURSOR_RESIZE_NW_SE,
      CURSOR_RESIZE_NE_SW
    ]) {
      const source = decodeURIComponent(cursor);
      expect(source).toContain('stroke-width="2"');
      expect(source).toContain('stroke-width="4.5"');
    }
    expect(new Set(cursors).size).toBe(cursors.length);
  });

  it("draws a white pointing hand with a heavy rounded outline", () => {
    for (const cursor of [CURSOR_GRAB, CURSOR_GRABBING]) {
      const source = decodeURIComponent(cursor);
      expect(source).toContain(
        'fill="#ffffff" stroke="#183133" stroke-width="1.8" vector-effect="non-scaling-stroke"'
      );
      expect(source).toContain('transform="translate(3.1 2) scale(.92 1)"');
      expect(source).not.toContain("<rect");
      expect(source.match(/<path\b/g)).toHaveLength(1);
      expect(source).toContain("M9 20c-1.8-1.2-2.8-3-3.5-5");
      expect(source).toContain("Z");
    }
    expect(CURSOR_GRABBING).not.toBe(CURSOR_GRAB);
    expect(decodeURIComponent(CURSOR_ROTATE)).toContain('fill="none"');
  });

  it("rasterizes the hand with a solid white interior and transparent exterior", async () => {
    for (const cursor of [CURSOR_GRAB, CURSOR_GRABBING]) {
      const decoded = decodeURIComponent(cursor);
      const svg = decoded.slice(decoded.indexOf("<svg"), decoded.indexOf("</svg>") + 6);
      const { data, info } = await sharp(Buffer.from(svg))
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const pixel = (x: number, y: number) => {
        const offset = (y * info.width + x) * 4;
        return [...data.subarray(offset, offset + 4)];
      };

      expect(pixel(16, 18)).toEqual([255, 255, 255, 255]);
      expect(pixel(14, 18)).toEqual([255, 255, 255, 255]);
      expect(pixel(17, 20)).toEqual([255, 255, 255, 255]);
      expect(pixel(1, 1)).toEqual([0, 0, 0, 0]);
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
