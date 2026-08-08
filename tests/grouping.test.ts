import { ActiveSelection, Canvas, Group, Rect } from "../apps/web/node_modules/fabric";
import { describe, expect, it } from "vitest";
import {
  arrangeObjects,
  directNestedParent,
  layerCollectionForObject
} from "../apps/web/src/editor/grouping";

function names(objects: Array<{ name?: string }>) {
  return objects.map((object) => object.name);
}

describe("layer hierarchy", () => {
  it("keeps a manual group as one outer layer while retaining its child stack", () => {
    const canvas = new Canvas();
    const behind = new Rect({ width: 10, name: "behind" });
    const groupBack = new Rect({ width: 10, name: "group back" });
    const groupFront = new Rect({ width: 10, name: "group front" });
    const group = new Group([groupBack, groupFront]);
    group.name = "group";
    const ahead = new Rect({ width: 10, name: "ahead" });
    canvas.add(behind, group, ahead);

    arrangeObjects([behind], canvas, "front");
    expect(names(canvas.getObjects())).toEqual(["group", "ahead", "behind"]);
    expect(names(group.getObjects())).toEqual(["group back", "group front"]);

    arrangeObjects([behind], canvas, "back");
    expect(names(canvas.getObjects())).toEqual(["behind", "group", "ahead"]);
    expect(names(group.getObjects())).toEqual(["group back", "group front"]);
  });

  it("ignores ActiveSelection when resolving the real layer parent", () => {
    const canvas = new Canvas();
    const first = new Rect({ width: 10, name: "first" });
    const second = new Rect({ width: 10, name: "second" });
    const groupChild = new Rect({ width: 10, name: "group child" });
    const group = new Group([groupChild]);
    group.name = "group";
    canvas.add(first, group, second);

    const selection = new ActiveSelection([first, second], { canvas });
    canvas.setActiveObject(selection);
    expect(layerCollectionForObject(first, canvas)).toBe(canvas);
    expect(directNestedParent(first)).toBeNull();

    arrangeObjects(canvas.getActiveObjects(), canvas, "front");
    expect(names(canvas.getObjects())).toEqual(["group", "first", "second"]);

    canvas.discardActiveObject();
    expect(layerCollectionForObject(groupChild, canvas)).toBe(group);
    expect(directNestedParent(groupChild)).toBe(group);
  });

  it("orders an object inside its immediate group without disturbing outer layers", () => {
    const canvas = new Canvas();
    const groupBack = new Rect({ width: 10, name: "group back" });
    const groupFront = new Rect({ width: 10, name: "group front" });
    const group = new Group([groupBack, groupFront]);
    group.name = "group";
    const outside = new Rect({ width: 10, name: "outside" });
    canvas.add(group, outside);

    arrangeObjects([groupBack], canvas, "front");
    expect(names(group.getObjects())).toEqual(["group front", "group back"]);
    expect(names(canvas.getObjects())).toEqual(["group", "outside"]);
  });

  it("keeps a multi-selection inside its real group hierarchy", () => {
    const canvas = new Canvas();
    const groupBack = new Rect({ width: 10, name: "group back" });
    const groupMiddle = new Rect({ width: 10, name: "group middle" });
    const groupFront = new Rect({ width: 10, name: "group front" });
    const group = new Group([groupBack, groupMiddle, groupFront]);
    group.name = "group";
    const outside = new Rect({ width: 10, name: "outside" });
    canvas.add(group, outside);

    const selection = new ActiveSelection([groupBack, groupMiddle], { canvas });
    canvas.setActiveObject(selection);
    arrangeObjects(canvas.getActiveObjects(), canvas, "front");

    expect(names(group.getObjects())).toEqual(["group front", "group back", "group middle"]);
    expect(names(canvas.getObjects())).toEqual(["group", "outside"]);
  });
});
