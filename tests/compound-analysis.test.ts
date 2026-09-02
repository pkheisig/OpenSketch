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

  it("places binding participants at their bounds-derived contact range", () => {
    const plan = planInteraction(
      { left: 0, top: 0, width: 40, height: 40 },
      { left: 200, top: 0, width: 40, height: 40 },
      "binding"
    );
    expect(plan.target.x - plan.source.x).toBe(40);
  });

  it("places cross-boundary participants with bounds-derived overlap", () => {
    const plan = planInteraction(
      { left: 0, top: 0, width: 40, height: 40 },
      { left: 220, top: 0, width: 40, height: 40 },
      "cross-boundary"
    );
    expect(plan.target.x - plan.source.x).toBe(8);
  });

  it("provides bounded annotation candidates", () => {
    expect(
      annotationCandidates(
        { left: 100, top: 100, width: 40, height: 40 },
        { left: 0, top: 0, width: 80, height: 20 }
      )
    ).toHaveLength(4);
  });

  it("requires endpoints for directional particle distributions and converges", () => {
    expect(() =>
      planParticleField({ left: 0, top: 0, width: 200, height: 100 }, 4, "source-fan", "seed")
    ).toThrow("source-fan distribution requires a source point");
    expect(() =>
      planParticleField(
        { left: 0, top: 0, width: 200, height: 100 },
        4,
        "target-converging",
        "seed"
      )
    ).toThrow("target-converging distribution requires a target point");
    const target = { x: 180, y: 50 };
    const plan = planParticleField(
      { left: 0, top: 0, width: 200, height: 100 },
      4,
      "target-converging",
      "seed",
      undefined,
      target
    );
    expect(plan.points.at(-1)).toEqual(target);
  });

  it("insets rendered linear and gradient particles from field bounds", () => {
    const bounds = { left: 10, top: 20, width: 180, height: 120 };
    for (const distribution of ["linear", "gradient"] as const) {
      const plan = planParticleField(bounds, 8, distribution, "seed-2");
      expect(
        plan.points.every(
          (point) =>
            point.x >= bounds.left + 5 &&
            point.x <= bounds.left + bounds.width - 5 &&
            point.y >= bounds.top + 5 &&
            point.y <= bounds.top + bounds.height - 5
        )
      ).toBe(true);
    }
  });

  it("gives uniform fields a deterministic grid instead of cloud sampling", () => {
    const plan = planParticleField(
      { left: 0, top: 0, width: 180, height: 120 },
      4,
      "uniform",
      "seed-3"
    );
    expect(plan.points).toHaveLength(4);
    expect(plan.points[0].x).toBeCloseTo(33.333, 2);
    expect(plan.points[1].x).toBeCloseTo(90, 2);
    expect(plan.points[2].x).toBeCloseTo(146.667, 2);
    expect(plan.points[0].y).toBeCloseTo(32.5, 2);
    expect(plan.points[3].y).toBeCloseTo(87.5, 2);
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
