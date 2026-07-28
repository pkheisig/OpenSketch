import { describe, expect, it } from "vitest";
import {
  anchorPoint,
  applySnapResistance,
  SNAP_CAPTURE_DISTANCE_PX,
  SNAP_MAX_ORTHOGONAL_GAP_PX,
  SNAP_RELEASE_DISTANCE_PX,
  snapBounds
} from "../apps/web/src/editor/geometry";

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

  it("does not create object guides for distant objects or outside the capture zone", () => {
    const outsideCapture = snapBounds(
      { left: 96, top: 20, width: 20, height: 20 },
      [{ left: 120, top: 10, width: 40, height: 100 }],
      SNAP_CAPTURE_DISTANCE_PX
    );
    expect(outsideCapture.verticalGuide).toBeUndefined();

    const distant = snapBounds(
      { left: 97, top: 600, width: 20, height: 20 },
      [{ left: 120, top: 10, width: 40, height: 100 }],
      SNAP_CAPTURE_DISTANCE_PX,
      undefined,
      SNAP_MAX_ORTHOGONAL_GAP_PX
    );
    expect(distant.verticalGuide).toBeUndefined();
  });

  it("keeps global artboard guides even when objects are far apart", () => {
    const result = snapBounds(
      { left: 857, top: 800, width: 200, height: 100 },
      [],
      SNAP_CAPTURE_DISTANCE_PX,
      { left: 0, top: 0, width: 1920, height: 1080 },
      SNAP_MAX_ORTHOGONAL_GAP_PX
    );
    expect(result.verticalGuide).toBe(960);
    expect(result.dx).toBe(3);
  });

  it("holds a snap until pointer resistance is overcome, then releases without reacquiring", () => {
    const acquired = applySnapResistance({
      proposedPosition: 97,
      pointer: 200,
      snapDelta: 3,
      snapGuide: 120,
      releaseDistance: SNAP_RELEASE_DISTANCE_PX
    });
    expect(acquired).toMatchObject({
      position: 100,
      guide: 120,
      released: false
    });

    const resisted = applySnapResistance({
      proposedPosition: 106,
      pointer: 200 + SNAP_RELEASE_DISTANCE_PX - 1,
      snapDelta: -6,
      snapGuide: 120,
      lock: acquired.lock,
      releaseDistance: SNAP_RELEASE_DISTANCE_PX
    });
    expect(resisted).toMatchObject({
      position: 100,
      guide: 120,
      released: false
    });

    const released = applySnapResistance({
      proposedPosition: 111,
      pointer: 200 + SNAP_RELEASE_DISTANCE_PX + 1,
      snapDelta: -1,
      snapGuide: 120,
      lock: resisted.lock,
      releaseDistance: SNAP_RELEASE_DISTANCE_PX
    });
    expect(released).toMatchObject({
      position: 111,
      released: true
    });

    const stillReleased = applySnapResistance({
      proposedPosition: 112,
      pointer: 212,
      snapDelta: -2,
      snapGuide: 120,
      lock: released.lock,
      releaseDistance: SNAP_RELEASE_DISTANCE_PX
    });
    expect(stillReleased).toMatchObject({
      position: 112,
      released: true
    });
    expect(stillReleased.guide).toBeUndefined();

    const cleared = applySnapResistance({
      proposedPosition: 120,
      pointer: 220,
      snapDelta: 0,
      lock: stillReleased.lock,
      releaseDistance: SNAP_RELEASE_DISTANCE_PX
    });
    expect(cleared).toEqual({
      position: 120,
      released: false
    });
  });
});
