import { describe, expect, it } from "vitest";
import { Rect } from "../apps/web/node_modules/fabric";
import { analyzeComposition, validateFigure } from "../apps/web/src/semantic/analysis";
import {
  annotationCandidates,
  planInteraction,
  planParticleField
} from "../apps/web/src/semantic/compound";

function canvasOf(objects: Rect[]) {
  return { getObjects: () => objects } as never;
}

describe("semantic compound planning", () => {
  it("is deterministic and keeps every particle inside the requested bounds", () => {
    const bounds = { left: 10, top: 20, width: 180, height: 120 };
    const first = planParticleField(
      bounds,
      32,
      "source-fan",
      "seed-1",
      { x: 12, y: 80 },
      { x: 188, y: 80 }
    );
    const second = planParticleField(
      bounds,
      32,
      "source-fan",
      "seed-1",
      { x: 12, y: 80 },
      { x: 188, y: 80 }
    );
    expect(second).toEqual(first);
    expect(first.points).toHaveLength(32);
    expect(
      first.points.every(
        (point) => point.x >= 10 && point.x <= 190 && point.y >= 20 && point.y <= 140
      )
    ).toBe(true);
  });

  it("returns semantic relation intent for each interaction mode", () => {
    const plan = planInteraction(
      { left: 0, top: 0, width: 40, height: 40 },
      { left: 100, top: 0, width: 40, height: 40 },
      "cross-boundary"
    );
    expect(plan.relationKind).toBe("crosses");
    expect(plan.allowedOverlap).toBe(true);
    expect(plan.mediator).toEqual({ x: 70, y: 20 });
  });

  it("provides bounded annotation candidates", () => {
    expect(
      annotationCandidates(
        { left: 100, top: 100, width: 40, height: 40 },
        { left: 0, top: 0, width: 80, height: 20 }
      )
    ).toHaveLength(4);
  });
});

describe("semantic composition analysis", () => {
  it("reports unexpected overlap but permits relation-authorized overlap", () => {
    const a = new Rect({ left: 30, top: 30, width: 80, height: 80 });
    const b = new Rect({ left: 70, top: 70, width: 80, height: 80 });
    a.objectId = "a";
    b.objectId = "b";
    a.semanticMetadata = { version: 1, semanticRole: "scientific-asset" };
    b.semanticMetadata = { version: 1, semanticRole: "scientific-asset" };
    let result = analyzeComposition(canvasOf([a, b]), { width: 400, height: 400 }, "scene-1");
    expect(result.findings.some((item) => item.code === "unexpected_overlap")).toBe(true);
    a.semanticRelations = [
      {
        id: "contact-1",
        kind: "contacts",
        sourceObjectId: "a",
        targetObjectId: "b",
        allowedOverlap: true
      }
    ];
    result = analyzeComposition(canvasOf([a, b]), { width: 400, height: 400 }, "scene-1");
    expect(result.findings.some((item) => item.code === "unexpected_overlap")).toBe(false);
  });

  it("is read-only, bounded, deterministic, and exposes validation profiles", () => {
    const object = new Rect({ left: -50, top: 20, width: 80, height: 80 });
    object.objectId = "outside";
    const before = { left: object.left, top: object.top, metadata: object.semanticMetadata };
    const first = validateFigure(
      canvasOf([object]),
      { width: 200, height: 200 },
      "scene-2",
      "publication",
      { maxFindings: 1 }
    );
    const second = validateFigure(
      canvasOf([object]),
      { width: 200, height: 200 },
      "scene-2",
      "publication",
      { maxFindings: 1 }
    );
    expect(first).toEqual(second);
    expect(first.profile).toBe("publication");
    expect(first.truncated).toBe(false);
    expect(object.left).toBe(before.left);
    expect(object.semanticMetadata).toBe(before.metadata);
  });
});
