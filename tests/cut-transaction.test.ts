import { Group, Rect, type Canvas, type FabricObject } from "../apps/web/node_modules/fabric";
import { describe, expect, it } from "vitest";
import {
  captureCutTransaction,
  isCutTransactionValid
} from "../apps/web/src/editor/cutTransaction";

function makeCanvas(objects: FabricObject[]): Canvas {
  return { getObjects: () => objects } as unknown as Canvas;
}

describe("asynchronous cut transactions", () => {
  it("keeps a selection change from changing the captured target", () => {
    const target = new Rect({ left: 20, top: 30, width: 40, height: 20 });
    const replacementSelection = new Rect({ left: 120, top: 30, width: 40, height: 20 });
    target.objectId = "target";
    replacementSelection.objectId = "replacement-selection";
    const objects = [target, replacementSelection];
    const canvas = makeCanvas(objects);
    const transaction = captureCutTransaction({
      owner: 1,
      canvas,
      documentId: "document-1",
      generation: 1,
      targets: [target]
    });

    expect(transaction).toBeDefined();
    expect(
      isCutTransactionValid(transaction!, { canvas, documentId: "document-1", generation: 1 })
    ).toBe(true);
  });

  it("allows unrelated z-order changes while preserving captured target order", () => {
    const target = new Rect({ width: 40, height: 20 });
    const sibling = new Rect({ width: 30, height: 15 });
    const unrelated = new Rect({ width: 10, height: 10 });
    target.objectId = "target";
    sibling.objectId = "sibling";
    unrelated.objectId = "unrelated";
    const objects = [target, sibling];
    const canvas = makeCanvas(objects);
    const transaction = captureCutTransaction({
      owner: 1,
      canvas,
      documentId: "document-1",
      generation: 1,
      targets: [target, sibling]
    });

    objects.unshift(unrelated);

    expect(
      isCutTransactionValid(transaction!, { canvas, documentId: "document-1", generation: 1 })
    ).toBe(true);
    objects.reverse();
    expect(
      isCutTransactionValid(transaction!, { canvas, documentId: "document-1", generation: 1 })
    ).toBe(false);
  });

  it("rejects an in-place target edit before deletion", () => {
    const target = new Rect({ width: 40, height: 20 });
    target.objectId = "target";
    const canvas = makeCanvas([target]);
    const transaction = captureCutTransaction({
      owner: 1,
      canvas,
      documentId: "document-1",
      generation: 1,
      targets: [target]
    });

    target.set({ left: 12 });

    expect(
      isCutTransactionValid(transaction!, { canvas, documentId: "document-1", generation: 1 })
    ).toBe(false);
  });

  it("rejects replacement, reparenting, and document changes", () => {
    const target = new Rect({ width: 40, height: 20 });
    const sibling = new Rect({ width: 30, height: 15 });
    target.objectId = "target";
    sibling.objectId = "sibling";
    const objects = [target, sibling];
    const canvas = makeCanvas(objects);
    const transaction = captureCutTransaction({
      owner: 1,
      canvas,
      documentId: "document-1",
      generation: 1,
      targets: [target]
    });

    objects[0] = Object.assign(new Rect({ width: 40, height: 20 }), { objectId: "target" });
    expect(
      isCutTransactionValid(transaction!, { canvas, documentId: "document-1", generation: 1 })
    ).toBe(false);

    objects[0] = target;
    const parent = new Group([target]);
    objects.splice(0, 1, parent);
    expect(
      isCutTransactionValid(transaction!, { canvas, documentId: "document-1", generation: 1 })
    ).toBe(false);

    expect(
      isCutTransactionValid(transaction!, { canvas, documentId: "document-2", generation: 1 })
    ).toBe(false);
    expect(
      isCutTransactionValid(transaction!, { canvas, documentId: "document-1", generation: 2 })
    ).toBe(false);
  });

  it("requires stable IDs for every object in the captured parent path", () => {
    const target = new Rect({ width: 40, height: 20 });
    const parent = new Group([target]);
    parent.objectId = "parent";
    const canvas = makeCanvas([parent]);

    expect(
      captureCutTransaction({
        owner: 1,
        canvas,
        documentId: "document-1",
        generation: 1,
        targets: [target]
      })
    ).toBeUndefined();
  });
});
