import { describe, expect, it } from "vitest";
import {
  GESTURE_ZOOM_SENSITIVITY,
  WHEEL_ZOOM_STEP,
  wheelZoomDelta
} from "../apps/web/src/editor/zoom";

describe("canvas wheel zoom", () => {
  it("uses 0.015 gesture sensitivity and fixed six-percent wheel steps", () => {
    expect(GESTURE_ZOOM_SENSITIVITY).toBe(0.015);
    expect(WHEEL_ZOOM_STEP).toBe(0.06);
    expect(wheelZoomDelta(-1)).toBe(0.015);
    expect(wheelZoomDelta(1)).toBe(-0.015);
    expect(wheelZoomDelta(-100)).toBe(0.06);
    expect(wheelZoomDelta(100)).toBe(-0.06);
    expect(wheelZoomDelta(-1, WheelEvent.DOM_DELTA_LINE)).toBe(0.06);
    expect(wheelZoomDelta(1, WheelEvent.DOM_DELTA_LINE)).toBe(-0.06);
    expect(wheelZoomDelta(0)).toBe(0);
  });
});
