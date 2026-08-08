import {
  ActiveSelection,
  Canvas,
  Group,
  IText,
  Point,
  Rect
} from "../apps/web/node_modules/fabric";
import { describe, expect, it } from "vitest";
import {
  configureSelectionControls,
  configureTextObject,
  applyActiveSelectionTextScale,
  beginActiveSelectionTextScale,
  enableSelectionBoundsTarget,
  GROUP_SELECTION_COLOR,
  ROTATION_SNAP_ANGLE,
  ROTATION_SNAP_THRESHOLD,
  SELECTION_CORNER_MAX_PX,
  SELECTION_CORNER_MIN_PX,
  SELECTION_CORNER_TOUCH_PX,
  SELECTION_CONTROL_HIT_MAX_PX,
  SELECTION_CONTROL_HIT_MIN_PX,
  SELECTION_STROKE_WIDTH_PX,
  selectionControlHitSizeForObject,
  selectionCornerSizeForObject,
  selectionStrokeWidthAtZoom,
  SINGLE_OBJECT_SELECTION_COLOR,
  nextDeepSelection,
  restoreObjectTargeting
} from "../apps/web/src/editor/selection";

describe("selection control colors", () => {
  it("uses orange controls for a manually grouped element", () => {
    const group = new Group([new Rect({ width: 20, height: 20 })]);
    group.OpenSketchType = "group";

    configureSelectionControls(group);

    expect(group.borderColor).toBe(GROUP_SELECTION_COLOR);
    expect(group.cornerColor).toBe("#ffffff");
    expect(group.cornerStrokeColor).toBe(GROUP_SELECTION_COLOR);
    expect(group.transparentCorners).toBe(false);
  });

  it("keeps single objects, atomic SVGs, and temporary multi-selections blue", () => {
    const first = new Rect({ width: 20, height: 20 });
    const second = new Rect({ width: 20, height: 20, left: 30 });
    const selection = new ActiveSelection([first, second]);
    const atomicAsset = new Group([new Rect({ width: 20, height: 20 })]);
    atomicAsset.OpenSketchType = "nih-asset";

    configureSelectionControls(first);
    configureSelectionControls(selection);
    configureSelectionControls(atomicAsset);

    expect(first.borderColor).toBe(SINGLE_OBJECT_SELECTION_COLOR);
    expect(first.cornerColor).toBe("#ffffff");
    expect(first.cornerStrokeColor).toBe(SINGLE_OBJECT_SELECTION_COLOR);
    expect(selection.borderColor).toBe(SINGLE_OBJECT_SELECTION_COLOR);
    expect(selection.cornerColor).toBe("#ffffff");
    expect(selection.cornerStrokeColor).toBe(SINGLE_OBJECT_SELECTION_COLOR);
    expect(atomicAsset.borderColor).toBe(SINGLE_OBJECT_SELECTION_COLOR);
    expect(atomicAsset.cornerStrokeColor).toBe(SINGLE_OBJECT_SELECTION_COLOR);
  });

  it("uses the full selection bounds as the drag target only while selected", () => {
    const asset = new Group([new Rect({ width: 20, height: 20 })]);
    asset.perPixelTargetFind = true;

    enableSelectionBoundsTarget(asset);

    expect(asset.perPixelTargetFind).toBe(false);

    restoreObjectTargeting(asset);

    expect(asset.perPixelTargetFind).toBe(true);
  });

  it("snaps rotation to every quarter turn for all selection types", () => {
    const shape = new Rect({ width: 20, height: 20 });
    const group = new Group([shape]);

    configureSelectionControls(shape);
    configureSelectionControls(group);

    for (const object of [shape, group]) {
      expect(object.snapAngle).toBe(ROTATION_SNAP_ANGLE);
      expect(object.snapThreshold).toBe(ROTATION_SNAP_THRESHOLD);
    }
  });

  it("keeps selection strokes at one pixel across zoom levels", () => {
    const shape = new Rect({ width: 20, height: 20 });

    configureSelectionControls(shape, 2);

    expect(SELECTION_STROKE_WIDTH_PX).toBe(1);
    expect(shape.borderScaleFactor).toBe(SELECTION_STROKE_WIDTH_PX);
    expect(selectionStrokeWidthAtZoom(0.1)).toBe(SELECTION_STROKE_WIDTH_PX);
    expect(selectionStrokeWidthAtZoom(1)).toBe(SELECTION_STROKE_WIDTH_PX);
    expect(selectionStrokeWidthAtZoom(4)).toBe(SELECTION_STROKE_WIDTH_PX);
  });

  it("shrinks visible handles for small on-screen objects without shrinking touch targets", () => {
    const tiny = new Rect({ width: 20, height: 20 });
    const large = new Rect({ width: 200, height: 200 });

    configureSelectionControls(tiny, 0.25);
    configureSelectionControls(large, 1);

    expect(selectionCornerSizeForObject(tiny, 0.25)).toBe(SELECTION_CORNER_MIN_PX);
    expect(tiny.cornerSize).toBe(SELECTION_CORNER_MIN_PX);
    expect(tiny.touchCornerSize).toBe(SELECTION_CORNER_TOUCH_PX);
    expect(large.cornerSize).toBe(SELECTION_CORNER_MAX_PX);
  });

  it("uses larger invisible mouse targets without enlarging the visible squares", () => {
    const canvas = new Canvas();
    const shape = new Rect({ width: 200, height: 120 });
    canvas.add(shape);
    canvas.setActiveObject(shape);
    configureSelectionControls(shape, 1);

    const control = shape.controls.br;
    const visibleCorners = control.calcCornerCoords(0, shape.cornerSize, 100, 100, false, shape);
    const pointerOutsideVisibleSquare = new Point(110, 100);

    expect(shape.cornerSize).toBe(SELECTION_CORNER_MAX_PX);
    expect(selectionControlHitSizeForObject(shape, 1)).toBe(SELECTION_CONTROL_HIT_MAX_PX);
    expect(control.shouldActivate("br", shape, pointerOutsideVisibleSquare, visibleCorners)).toBe(
      true
    );
  });

  it("limits hit targets for very small on-screen objects to reduce overlap", () => {
    const tiny = new Rect({ width: 20, height: 20 });

    expect(selectionControlHitSizeForObject(tiny, 0.25)).toBe(SELECTION_CONTROL_HIT_MIN_PX);
  });
});

describe("text scaling controls", () => {
  it("realizes text font size while resizing a mixed multi-selection", () => {
    const canvas = new Canvas();
    const text = new IText("Label", { fontSize: 20, left: 100, top: 100 });
    const shape = new Rect({ width: 40, height: 40, left: 180, top: 100 });
    canvas.add(text, shape);
    const selection = new ActiveSelection([text, shape], { canvas });
    canvas.setActiveObject(selection);

    const session = beginActiveSelectionTextScale(selection);
    expect(session).not.toBeNull();

    selection.set({ scaleX: 2, scaleY: 2 });
    expect(applyActiveSelectionTextScale(selection, session!)).toBe(true);
    expect(text.fontSize).toBe(40);
    expect(text.scaleX).toBeCloseTo(0.5);
    expect(text.scaleY).toBeCloseTo(0.5);

    selection.remove(text);
    expect(text.fontSize).toBe(40);
    expect(text.scaleX).toBeCloseTo(1);
    expect(text.scaleY).toBeCloseTo(1);
  });

  it("uses font-size resize handles without allowing visual stretch", () => {
    const text = new IText("Label");

    configureTextObject(text);

    for (const corner of ["tl", "tr", "br", "bl"] as const) {
      expect(text.isControlVisible(corner)).toBe(true);
      expect(text.controls[corner].actionName).toBe("text-font-size");
    }
    for (const edge of ["mt", "mr", "mb", "ml"] as const) {
      expect(text.isControlVisible(edge)).toBe(false);
    }
    expect(text.isControlVisible("mtr")).toBe(true);
  });

  it("converts a corner drag into font size while resetting object scale", () => {
    const canvas = new Canvas();
    const text = new IText("Label", { fontSize: 20, left: 100, top: 100 });
    canvas.add(text);
    canvas.setActiveObject(text);
    configureSelectionControls(text);

    const handler = text.controls.br.actionHandler;
    expect(handler).toBeDefined();
    const width = text.width;
    const height = text.height;
    const anchor = text.getPositionByOrigin("left", "top");
    const transform = {
      target: text,
      corner: "br",
      originX: "left",
      originY: "top",
      scaleX: 1,
      scaleY: 1,
      skewX: 0,
      skewY: 0,
      offsetX: 0,
      offsetY: 0,
      ex: anchor.x + width,
      ey: anchor.y + height,
      lastX: anchor.x + width,
      lastY: anchor.y + height,
      theta: 0,
      width,
      height,
      shiftKey: false,
      altKey: false,
      actionPerformed: false,
      original: {
        scaleX: 1,
        scaleY: 1,
        skewX: 0,
        skewY: 0,
        angle: 0,
        left: text.left,
        top: text.top,
        flipX: false,
        flipY: false,
        originX: "left",
        originY: "top"
      }
    };

    handler?.({} as never, transform as never, anchor.x + width * 1.5, anchor.y + height * 1.5);

    expect(text.fontSize).toBeGreaterThan(20);
    expect(text.scaleX).toBe(1);
    expect(text.scaleY).toBe(1);
  });
});

describe("deep selection cycling", () => {
  it("enters the first hit child when the selected group is not a leaf candidate", () => {
    const topChild = new Rect({ width: 20, height: 20 });
    const lowerChild = new Rect({ width: 20, height: 20 });
    const group = new Group([lowerChild, topChild]);

    expect(nextDeepSelection(group, [topChild, lowerChild])).toBe(topChild);
  });

  it("cycles through overlapping objects from front to back and wraps", () => {
    const top = new Rect({ width: 20, height: 20 });
    const middle = new Rect({ width: 20, height: 20 });
    const bottom = new Rect({ width: 20, height: 20 });
    const hits = [top, middle, bottom];

    expect(nextDeepSelection(top, hits)).toBe(middle);
    expect(nextDeepSelection(middle, hits)).toBe(bottom);
    expect(nextDeepSelection(bottom, hits)).toBe(top);
  });

  it("keeps a sole hit selected", () => {
    const object = new Rect({ width: 20, height: 20 });

    expect(nextDeepSelection(object, [object])).toBe(object);
  });
});
