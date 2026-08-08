import { describe, expect, it } from "vitest";
import { pixelsToUnit, unitToPixels } from "../packages/editor-core/src";

describe("canvas unit conversion", () => {
  it("converts pixels, inches, and millimeters using the requested DPI", () => {
    expect(pixelsToUnit(600, "in", 300)).toBe(2);
    expect(pixelsToUnit(300, "mm", 300)).toBeCloseTo(25.4);
    expect(pixelsToUnit(42, "px", 300)).toBe(42);
    expect(unitToPixels(2, "in", 300)).toBe(600);
    expect(unitToPixels(25.4, "mm", 300)).toBeCloseTo(300);
    expect(unitToPixels(42, "px", 300)).toBe(42);
  });
});
