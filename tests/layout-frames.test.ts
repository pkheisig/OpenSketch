import { describe, expect, it } from "vitest";
import {
  collectSerializedLayoutValidationContext,
  createLayoutDocument,
  createLayoutFrame,
  insertLayoutChild,
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

  it("places implicit grid children in deterministic row-major order", () => {
    const four = createLayoutFrame(createLayoutDocument(), {
      frameId: "implicit-four",
      bounds: { left: 0, top: 0, width: 200, height: 200 },
      flow: "grid",
      children: [
        { objectId: "a", sizing: "fill" },
        { objectId: "b", sizing: "fill" },
        { objectId: "c", sizing: "fill" },
        { objectId: "d", sizing: "fill" }
      ]
    }).frames[0]!;
    const geometries = [
      child("a", 0, 0, 10, 10),
      child("b", 0, 0, 10, 10),
      child("c", 0, 0, 10, 10),
      child("d", 0, 0, 10, 10)
    ];
    const first = layoutFrame(four, geometries);
    const second = layoutFrame(four, geometries);

    expect(first).toEqual(second);
    expect(first.diagnostics).toEqual([]);
    expect(first.children.map(({ bounds }) => bounds)).toEqual([
      { left: 0, top: 0, width: 100, height: 100 },
      { left: 100, top: 0, width: 100, height: 100 },
      { left: 0, top: 100, width: 100, height: 100 },
      { left: 100, top: 100, width: 100, height: 100 }
    ]);

    const two = createLayoutFrame(createLayoutDocument(), {
      frameId: "implicit-two",
      bounds: { left: 0, top: 0, width: 200, height: 100 },
      flow: "grid",
      children: [
        { objectId: "left", sizing: "fill" },
        { objectId: "right", sizing: "fill" }
      ]
    }).frames[0]!;
    expect(
      layoutFrame(two, [child("left", 0, 0, 10, 10), child("right", 0, 0, 10, 10)]).children.map(
        ({ bounds }) => bounds
      )
    ).toEqual([
      { left: 0, top: 0, width: 100, height: 100 },
      { left: 100, top: 0, width: 100, height: 100 }
    ]);
  });

  it("re-derives implicit grid tracks after inserting a child", () => {
    const initial = createLayoutFrame(createLayoutDocument(), {
      frameId: "implicit-insert",
      bounds: { left: 0, top: 0, width: 300, height: 200 },
      flow: "grid",
      children: [
        { objectId: "a", sizing: "fill" },
        { objectId: "b", sizing: "fill" },
        { objectId: "c", sizing: "fill" },
        { objectId: "d", sizing: "fill" }
      ]
    });
    const next = insertLayoutChild(initial, "implicit-insert", {
      objectId: "e",
      sizing: "fill"
    });
    const frame = next.frames[0]!;

    expect(frame.tracks).toBeUndefined();
    expect(
      layoutFrame(frame, [
        child("a", 0, 0, 10, 10),
        child("b", 0, 0, 10, 10),
        child("c", 0, 0, 10, 10),
        child("d", 0, 0, 10, 10),
        child("e", 0, 0, 10, 10)
      ]).diagnostics
    ).toEqual([]);
  });

  it("reports zero-space implicit grid starvation before materialization", () => {
    const frame = createLayoutFrame(createLayoutDocument(), {
      frameId: "starved-grid",
      bounds: { left: 0, top: 0, width: 100, height: 100 },
      flow: "grid",
      gap: { horizontal: 100, vertical: 100 },
      children: [
        { objectId: "a", sizing: "fill" },
        { objectId: "b", sizing: "fill" }
      ]
    }).frames[0]!;

    const resolved = layoutFrame(frame, [child("a", 0, 0, 10, 10), child("b", 0, 0, 10, 10)]);

    expect(resolved.children.map(({ bounds }) => bounds.width)).toEqual([0, 0]);
    expect(resolved.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "FRAME_OVERFLOW" })])
    );
  });

  it("reports fixed siblings that starve fill children in horizontal and vertical flows", () => {
    const horizontal = createLayoutFrame(createLayoutDocument(), {
      frameId: "starved-horizontal",
      bounds: { left: 0, top: 0, width: 100, height: 100 },
      flow: "horizontal",
      children: [
        { objectId: "fixed", sizing: "fixed", width: 100 },
        { objectId: "fill", sizing: "fill" }
      ]
    }).frames[0]!;
    const vertical = createLayoutFrame(createLayoutDocument(), {
      frameId: "starved-vertical",
      bounds: { left: 0, top: 0, width: 100, height: 100 },
      flow: "vertical",
      children: [
        { objectId: "fixed", sizing: "fixed", height: 100 },
        { objectId: "fill", sizing: "fill" }
      ]
    }).frames[0]!;

    const horizontalResolution = layoutFrame(horizontal, [
      child("fixed", 0, 0, 10, 10),
      child("fill", 0, 0, 10, 10)
    ]);
    const verticalResolution = layoutFrame(vertical, [
      child("fixed", 0, 0, 10, 10),
      child("fill", 0, 0, 10, 10)
    ]);

    expect(horizontalResolution.children.map(({ bounds }) => bounds.width)).toEqual([100, 0]);
    expect(verticalResolution.children.map(({ bounds }) => bounds.height)).toEqual([100, 0]);
    expect(horizontalResolution.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "FRAME_OVERFLOW" })])
    );
    expect(verticalResolution.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "FRAME_OVERFLOW" })])
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

  it("derives persisted-scene IDs and parents without treating decorations as layout objects", () => {
    const context = collectSerializedLayoutValidationContext({
      version: "7.0.0",
      objects: [
        {
          type: "Group",
          objectId: "frame-object",
          objects: [
            {
              type: "Rect",
              objectId: "child",
              clipPath: { type: "Rect", objectId: "clip" }
            },
            {
              type: "Textbox",
              objectId: "label",
              path: { type: "Path", objectId: "text-path" }
            }
          ]
        }
      ],
      backgroundImage: { type: "Image", objectId: "background" }
    });

    expect(context.objectIds).toEqual(["frame-object", "child", "label"]);
    expect(context.parentByObjectId.get("frame-object")).toBeUndefined();
    expect(context.parentByObjectId.get("child")).toBe("frame-object");
    expect(context.parentByObjectId.get("label")).toBe("frame-object");

    const invalid = createLayoutFrame(createLayoutDocument(), {
      frameId: "persisted-invalid",
      bounds: { left: 0, top: 0, width: 100, height: 100 },
      flow: "free",
      children: [{ objectId: "missing", sizing: "content-sized" }]
    });
    expect(() => validateLayoutDocument(invalid, context)).toThrow(/unknown object/i);
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

  it("bounds overlapping-cell diagnostics by child rather than occupied cell", () => {
    const objectCount = 500;
    const frame = createLayoutFrame(createLayoutDocument(), {
      frameId: "bounded-diagnostics",
      bounds: { left: 0, top: 0, width: 10_000, height: 10_000 },
      flow: "grid",
      tracks: {
        rows: Array.from({ length: 32 }, () => ({ type: "flex" as const, value: 1 })),
        columns: Array.from({ length: 32 }, () => ({ type: "flex" as const, value: 1 }))
      },
      children: Array.from({ length: objectCount }, (_, index) => ({
        objectId: `object-${index}`,
        row: 0,
        column: 0,
        rowSpan: 32,
        columnSpan: 32,
        sizing: "fill" as const
      }))
    }).frames[0]!;

    const result = layoutFrame(
      frame,
      Array.from({ length: objectCount }, (_, index) => child(`object-${index}`, 0, 0, 10, 10))
    );

    expect(result.diagnostics).toHaveLength(objectCount - 1);
    expect(result.diagnostics.every(({ code }) => code === "INVALID_CELL")).toBe(true);
  });

  it("rejects explicit flexible tracks with no positive remaining space", () => {
    expect(() =>
      createLayoutFrame(createLayoutDocument(), {
        frameId: "degenerate-tracks",
        bounds: { left: 0, top: 0, width: 100, height: 100 },
        flow: "grid",
        tracks: {
          rows: [
            { type: "fixed", value: 100 },
            { type: "flex", value: 1 }
          ],
          columns: [{ type: "flex", value: 1 }]
        },
        children: []
      })
    ).toThrow(/positive space|flexible tracks/i);
  });

  it("rejects zero-sized explicit child dimensions before persistence", () => {
    expect(() =>
      createLayoutFrame(createLayoutDocument(), {
        frameId: "zero-child",
        bounds: { left: 0, top: 0, width: 100, height: 100 },
        flow: "free",
        children: [{ objectId: "child", sizing: "fixed", width: 0, height: 20 }]
      })
    ).toThrow(/width|positive|zero-sized/i);
  });

  it("reflows a bounded poster-sized grid within the resource budget", () => {
    const objectCount = 500;
    const document = createLayoutFrame(createLayoutDocument(), {
      frameId: "stress",
      bounds: { left: 0, top: 0, width: 2500, height: 2200 },
      flow: "grid",
      children: Array.from({ length: objectCount }, (_, index) => ({
        objectId: `object-${index}`,
        sizing: "fill" as const
      }))
    });
    const geometries = Array.from({ length: objectCount }, (_, index) =>
      child(`object-${index}`, 0, 0, 10, 10)
    );
    const started = performance.now();
    const result = layoutFrame(document.frames[0]!, geometries);

    expect(result.children).toHaveLength(objectCount);
    expect(result.diagnostics).toEqual([]);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it("reflows dozens of frames containing hundreds of objects deterministically", () => {
    const frameCount = 32;
    const childrenPerFrame = 16;
    let document = createLayoutDocument();
    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      document = createLayoutFrame(document, {
        frameId: `frame-${frameIndex}`,
        bounds: { left: frameIndex * 10, top: 0, width: 400, height: 400 },
        flow: "grid",
        children: Array.from({ length: childrenPerFrame }, (_, childIndex) => ({
          objectId: `object-${frameIndex}-${childIndex}`,
          sizing: "fill" as const
        }))
      });
    }

    const geometries = document.frames.map((frame) =>
      frame.children.map((child) => childGeometry(child.objectId))
    );
    const started = performance.now();
    const first = document.frames.map((frame, index) => layoutFrame(frame, geometries[index]!));
    const second = document.frames.map((frame, index) => layoutFrame(frame, geometries[index]!));

    expect(first).toEqual(second);
    expect(first.flatMap((resolution) => resolution.children)).toHaveLength(
      frameCount * childrenPerFrame
    );
    expect(first.every((resolution) => resolution.diagnostics.length === 0)).toBe(true);
    expect(performance.now() - started).toBeLessThan(1000);
  });
});

function childGeometry(objectId: string): LayoutChildGeometry {
  return child(objectId, 0, 0, 10, 10);
}
