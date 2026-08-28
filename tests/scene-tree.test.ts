import { Canvas, Group, Rect } from "../apps/web/node_modules/fabric";
import { describe, expect, it } from "vitest";
import {
  assertUniqueSceneObjectIds,
  sceneObjectEntries,
  sceneObjectIndex
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
});
