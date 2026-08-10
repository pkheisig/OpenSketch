import { describe, expect, it } from "vitest";
import { formatRulerValue, rulerScale, visibleRulerTicks } from "../apps/web/src/editor/ruler";

describe("canvas ruler", () => {
  it("keeps major ticks readable across the full zoom range", () => {
    for (const zoom of [0.1, 0.25, 0.67, 1, 2, 4]) {
      const scale = rulerScale(zoom, "px", 300);
      expect(scale.majorScreenStep).toBeGreaterThanOrEqual(80);
      expect(scale.majorScreenStep).toBeLessThanOrEqual(200);
      expect(scale.minorScreenStep).toBe(scale.majorScreenStep / 5);
    }
  });

  it("expresses ticks in the selected physical unit", () => {
    expect(rulerScale(1, "mm", 300).majorUnitStep).toBe(10);
    expect(rulerScale(1, "in", 300).majorUnitStep).toBe(0.5);
    expect(formatRulerValue(0.5, "in")).toBe("0.5");
    expect(formatRulerValue(20, "mm")).toBe("20");
  });

  it("only renders visible artboard coordinates when the canvas is panned", () => {
    const scale = rulerScale(1, "px", 300);
    const ticks = visibleRulerTicks({
      canvasLength: 1600,
      origin: -250,
      viewportLength: 500,
      scale,
      unit: "px"
    });

    expect(ticks.map((tick) => tick.value)).toEqual([300, 400, 500, 600, 700]);
    expect(ticks.map((tick) => tick.position)).toEqual([300, 400, 500, 600, 700]);
  });

  it("does not invent coordinates outside the artboard", () => {
    const ticks = visibleRulerTicks({
      canvasLength: 1600,
      origin: 240,
      viewportLength: 180,
      scale: rulerScale(1, "px", 300),
      unit: "px"
    });
    expect(ticks).toEqual([]);
  });
});
