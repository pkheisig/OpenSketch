import { ActiveSelection, Group, Rect } from "../apps/web/node_modules/fabric";
import { describe, expect, it } from "vitest";
import {
  configureSelectionControls,
  GROUP_SELECTION_COLOR,
  ROTATION_SNAP_ANGLE,
  ROTATION_SNAP_THRESHOLD,
  SELECTION_STROKE_WIDTH_PX,
  selectionStrokeWidthAtZoom,
  SINGLE_OBJECT_SELECTION_COLOR,
  nextDeepSelection
} from "../apps/web/src/editor/selection";

describe("selection control colors", () => {
  it("uses purple controls for a grouped element", () => {
    const group = new Group([new Rect({ width: 20, height: 20 })]);

    configureSelectionControls(group);

    expect(group.borderColor).toBe(GROUP_SELECTION_COLOR);
    expect(group.cornerColor).toBe(GROUP_SELECTION_COLOR);
  });

  it("keeps single objects and temporary multi-selections blue", () => {
    const first = new Rect({ width: 20, height: 20 });
    const second = new Rect({ width: 20, height: 20, left: 30 });
    const selection = new ActiveSelection([first, second]);

    configureSelectionControls(first);
    configureSelectionControls(selection);

    expect(first.borderColor).toBe(SINGLE_OBJECT_SELECTION_COLOR);
    expect(first.cornerColor).toBe(SINGLE_OBJECT_SELECTION_COLOR);
    expect(selection.borderColor).toBe(SINGLE_OBJECT_SELECTION_COLOR);
    expect(selection.cornerColor).toBe(SINGLE_OBJECT_SELECTION_COLOR);
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

  it("keeps selection strokes at two pixels across zoom levels", () => {
    const shape = new Rect({ width: 20, height: 20 });

    configureSelectionControls(shape, 2);

    expect(SELECTION_STROKE_WIDTH_PX).toBe(2);
    expect(shape.borderScaleFactor).toBe(SELECTION_STROKE_WIDTH_PX);
    expect(selectionStrokeWidthAtZoom(0.1)).toBe(SELECTION_STROKE_WIDTH_PX);
    expect(selectionStrokeWidthAtZoom(1)).toBe(SELECTION_STROKE_WIDTH_PX);
    expect(selectionStrokeWidthAtZoom(4)).toBe(SELECTION_STROKE_WIDTH_PX);
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
