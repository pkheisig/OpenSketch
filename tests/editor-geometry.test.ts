import { describe, expect, it } from "vitest";
import { anchorPoint, snapBounds } from "../apps/web/src/editor/geometry";

describe("editor geometry", () => {
  const bounds = { left: 10, top: 20, width: 100, height: 60 };

  it("resolves named connector anchors", () => {
    expect(anchorPoint(bounds, "top")).toEqual({ x: 60, y: 20 });
    expect(anchorPoint(bounds, "right")).toEqual({ x: 110, y: 50 });
    expect(anchorPoint(bounds, "bottom")).toEqual({ x: 60, y: 80 });
    expect(anchorPoint(bounds, "left")).toEqual({ x: 10, y: 50 });
    expect(anchorPoint(bounds, "center")).toEqual({ x: 60, y: 50 });
  });

  it("snaps object edges and centers to the nearest target", () => {
    const result = snapBounds(
      { left: 97, top: 48, width: 20, height: 20 },
      [{ left: 120, top: 10, width: 40, height: 100 }],
      5
    );
    expect(result.dx).toBe(3);
    expect(result.verticalGuide).toBe(120);
    expect(result.dy).toBe(2);
    expect(result.horizontalGuide).toBe(60);
  });
});
