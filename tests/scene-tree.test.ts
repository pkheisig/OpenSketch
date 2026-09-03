import { Canvas, Group, Rect, util } from "../apps/web/node_modules/fabric";
import { describe, expect, it } from "vitest";
import {
  assertUniqueSceneObjectIds,
  isSceneDescendant,
  sceneObjectEntries,
  sceneObjectIndex,
  sendSceneObjectToParentPlane
} from "../apps/web/src/editor/sceneTree";

describe("recursive scene identity", () => {
  it("indexes objects below every persisted group instead of only canvas roots", () => {
    const leaf = new Rect({ width: 10 });
    leaf.objectId = "leaf";
    const nested = new Group([leaf]);
    nested.objectId = "nested";
    const root = new Group([nested]);
    root.objectId = "root";
    const canvas = { getObjects: () => [root] } as unknown as Canvas;

    expect(sceneObjectEntries(canvas).map(({ object }) => object.objectId)).toEqual([
      "root",
      "nested",
      "leaf"
    ]);
    expect(sceneObjectIndex(canvas).get("leaf")).toBe(leaf);
    expect(() => assertUniqueSceneObjectIds(canvas)).not.toThrow();
  });

  it("rejects duplicate IDs anywhere in the scene tree", () => {
    const first = new Rect({ width: 10 });
    const second = new Rect({ width: 10 });
    first.objectId = "duplicate";
    second.objectId = "duplicate";
    const group = new Group([first, second]);
    group.objectId = "group";
    const canvas = { getObjects: () => [group] } as unknown as Canvas;

    expect(() => assertUniqueSceneObjectIds(canvas)).toThrow('"duplicate" is duplicated');
  });

  it("recognizes parent-only ancestry without recursing forever", () => {
    const ancestor = new Group([]);
    const object = new Rect({ width: 10 });
    Object.defineProperty(object, "group", { value: undefined, configurable: true });
    Object.defineProperty(object, "parent", { value: ancestor, configurable: true });

    expect(isSceneDescendant(object, ancestor)).toBe(true);
  });

  it("keeps a replacement in the same world plane when its parent is transformed", () => {
    const parent = new Group([], {
      left: 180,
      top: 140,
      angle: 28,
      scaleX: 1.4,
      scaleY: 0.8
    });
    const replacement = new Rect({ left: 30, top: 20, width: 80, height: 40, angle: 12 });
    const worldBefore = replacement.calcTransformMatrix();

    sendSceneObjectToParentPlane(replacement, parent);

    const worldAfter = util.multiplyTransformMatrices(
      parent.calcTransformMatrix(),
      replacement.calcOwnMatrix()
    );
    expect(worldAfter).toHaveLength(worldBefore.length);
    worldAfter.forEach((value, index) => expect(value).toBeCloseTo(worldBefore[index], 8));
  });
});
