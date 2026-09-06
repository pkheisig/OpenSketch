import { describe, expect, it } from "vitest";
import {
  createLayoutDocument,
  createLayoutFrame,
  layoutFrame,
  validateLayoutDocument,
  type LayoutChildGeometry
} from "../packages/editor-core/src";

const child = (
  objectId: string,
  left: number,
  top: number,
  width: number,
  height: number
): LayoutChildGeometry => ({
  objectId,
  bounds: { left, top, width, height }
});

describe("persistent layout frames", () => {
  it("resolves a deterministic horizontal frame with padding, gaps, and fill sizing", () => {
    const document = createLayoutDocument();
    const next = createLayoutFrame(document, {
      frameId: "frame-1",
      bounds: { left: 10, top: 20, width: 500, height: 200 },
      flow: "horizontal",
      padding: { top: 10, right: 20, bottom: 10, left: 20 },
      gap: { horizontal: 10, vertical: 0 },
      children: [
        { objectId: "a", sizing: "fixed" },
        { objectId: "b", sizing: "fill" }
      ]
    });

    const resolved = layoutFrame(next.frames[0]!, [
      child("a", 0, 0, 100, 40),
      child("b", 0, 0, 80, 30)
    ]);

    expect(resolved.children).toEqual([
      { objectId: "a", bounds: { left: 30, top: 100, width: 100, height: 40 } },
      { objectId: "b", bounds: { left: 140, top: 30, width: 350, height: 180 } }
    ]);
    expect(resolved.diagnostics).toEqual([]);
  });

  it("supports grid spans and rejects silent clipping when overflow is disallowed", () => {
    const document = createLayoutDocument();
    const next = createLayoutFrame(document, {
      frameId: "grid-1",
      bounds: { left: 0, top: 0, width: 300, height: 200 },
      flow: "grid",
      padding: 10,
      gap: 10,
      overflow: "reject",
      tracks: {
        rows: [
          { type: "fixed", value: 80 },
          { type: "flex", value: 1 }
        ],
        columns: [
          { type: "flex", value: 1 },
          { type: "flex", value: 1 }
        ]
      },
      children: [
        { objectId: "wide", row: 0, column: 0, columnSpan: 2, sizing: "fill" },
        { objectId: "left", row: 1, column: 0, sizing: "preserve-aspect" },
        { objectId: "right", row: 1, column: 1, sizing: "preserve-aspect" }
      ]
    });

    const resolved = layoutFrame(next.frames[0]!, [
      child("wide", 0, 0, 20, 20),
      child("left", 0, 0, 40, 20),
      child("right", 0, 0, 40, 20)
    ]);

    expect(resolved.children).toEqual([
      { objectId: "wide", bounds: { left: 10, top: 10, width: 280, height: 80 } },
      { objectId: "left", bounds: { left: 10, top: 111.25, width: 135, height: 67.5 } },
      { objectId: "right", bounds: { left: 155, top: 111.25, width: 135, height: 67.5 } }
    ]);

    const overflowing = createLayoutFrame(createLayoutDocument(), {
      frameId: "overflow",
      bounds: { left: 0, top: 0, width: 100, height: 40 },
      flow: "horizontal",
      overflow: "reject",
      children: [{ objectId: "large", sizing: "fixed" }]
    });
    expect(() => layoutFrame(overflowing.frames[0]!, [child("large", 0, 0, 200, 20)])).toThrow(
      /overflow/i
    );
  });

  it("validates child references and ancestor/descendant membership before persistence", () => {
    const document = createLayoutDocument();
    const next = createLayoutFrame(document, {
      frameId: "frame-1",
      containerObjectId: "frame-object",
      bounds: { left: 0, top: 0, width: 100, height: 100 },
      flow: "free",
      children: [{ objectId: "child", sizing: "content-sized" }]
    });

    expect(() =>
      validateLayoutDocument(next, {
        objectIds: ["frame-object"],
        parentByObjectId: new Map([["child", "frame-object"]])
      })
    ).toThrow(/unknown object|layout frame/i);

    expect(() =>
      validateLayoutDocument(next, {
        objectIds: ["frame-object", "child"],
        parentByObjectId: new Map([["child", "frame-object"]])
      })
    ).toThrow(/ancestor|descendant|frame-object/i);
  });

  it("keeps explicit fixed dimensions and rejects free-flow overflow or grid collisions", () => {
    const fixed = createLayoutFrame(createLayoutDocument(), {
      frameId: "fixed",
      bounds: { left: 0, top: 0, width: 100, height: 40 },
      flow: "horizontal",
      overflow: "reject",
      children: [{ objectId: "fixed-child", sizing: "fixed", width: 80, height: 20 }]
    });
    expect(layoutFrame(fixed.frames[0]!, [child("fixed-child", 0, 0, 10, 10)]).children[0]).toEqual(
      { objectId: "fixed-child", bounds: { left: 0, top: 10, width: 80, height: 20 } }
    );

    const free = createLayoutFrame(createLayoutDocument(), {
      frameId: "free",
      bounds: { left: 0, top: 0, width: 40, height: 40 },
      flow: "free",
      overflow: "reject",
      children: [{ objectId: "free-child", sizing: "content-sized" }]
    });
    expect(() => layoutFrame(free.frames[0]!, [child("free-child", 30, 0, 20, 20)])).toThrow(
      /overflow/i
    );

    const collision = createLayoutFrame(createLayoutDocument(), {
      frameId: "collision",
      bounds: { left: 0, top: 0, width: 100, height: 100 },
      flow: "grid",
      overflow: "reject",
      tracks: {
        rows: [{ type: "flex", value: 1 }],
        columns: [{ type: "flex", value: 1 }]
      },
      children: [
        { objectId: "one", row: 0, column: 0, sizing: "fill" },
        { objectId: "two", row: 0, column: 0, sizing: "fill" }
      ]
    });
    expect(() =>
      layoutFrame(collision.frames[0]!, [child("one", 0, 0, 10, 10), child("two", 0, 0, 10, 10)])
    ).toThrow(/invalid cells|overlap/i);
  });
});
