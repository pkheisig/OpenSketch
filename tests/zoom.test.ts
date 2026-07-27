import { describe, expect, it } from "vitest";
import {
  captureZoomAnchor,
  GESTURE_ZOOM_SENSITIVITY,
  WHEEL_ZOOM_STEP,
  wheelZoomDelta,
  zoomAnchorScrollDelta,
  zoomedCanvasDimensions
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

  it("keeps the same artboard point beneath an off-center cursor", () => {
    const anchor = captureZoomAnchor(700, 260, {
      left: 100,
      top: 100,
      width: 800,
      height: 400
    });

    expect(anchor.xRatio).toBe(0.75);
    expect(anchor.yRatio).toBe(0.4);
    expect(
      zoomAnchorScrollDelta(anchor, {
        left: 0,
        top: 0,
        width: 1200,
        height: 600
      })
    ).toEqual({ x: 200, y: -20 });
  });

  it("uses the artboard center when its dimensions are temporarily zero", () => {
    expect(
      captureZoomAnchor(20, 30, {
        left: 10,
        top: 10,
        width: 0,
        height: 0
      })
    ).toMatchObject({ xRatio: 0.5, yRatio: 0.5 });
  });

  it("scales the Fabric render dimensions with zoom", () => {
    expect(zoomedCanvasDimensions(1920, 1080, 2.8)).toEqual({
      width: 5376,
      height: 3024
    });
    expect(zoomedCanvasDimensions(7, 5, 0.1)).toEqual({ width: 1, height: 1 });
  });
});
