import { describe, expect, it } from "vitest";
import {
  inspectSemanticGeometry,
  normalizeRelation,
  normalizeSemanticMetadata,
  planSemanticLayout,
  validateRelations,
  type SemanticGeometry
} from "../apps/web/src/semantic/composition";
import { Circle, Group, Rect } from "../apps/web/node_modules/fabric";

describe("semantic composition contracts", () => {
  it("accepts only bounded semantic metadata and rejects arbitrary keys", () => {
    expect(
      normalizeSemanticMetadata({ version: 1, semanticRole: "stage", tags: ["cycle"] })
    ).toEqual({
      version: 1,
      semanticRole: "stage",
      tags: ["cycle"]
    });
    expect(() => normalizeSemanticMetadata({ version: 1, biologicalMeaning: "secret" })).toThrow(
      "biologicalMeaning"
    );
  });

  it("rejects duplicate and stale relation references before publication", () => {
    const relation = normalizeRelation({
      id: "r1",
      kind: "contacts",
      sourceObjectId: "a",
      targetObjectId: "b",
      allowedOverlap: true
    });
    expect(() => validateRelations([relation, relation], new Set(["a", "b"]))).toThrow(
      "duplicated"
    );
    expect(() => validateRelations([relation], new Set(["a"]))).toThrow("missing object");
  });

  it("reports deterministic geometry ports and excludes hidden group children", () => {
    const visible = new Rect({ left: 100, top: 100, width: 40, height: 20 });
    visible.objectId = "visible";
    const hidden = new Rect({ left: 0, top: 0, width: 1000, height: 1000, opacity: 0 });
    const group = new Group([visible, hidden]);
    group.objectId = "group";
    const geometry = inspectSemanticGeometry(group);
    expect(geometry.visualBounds.width).toBeLessThan(100);
    expect(geometry.visualBounds.height).toBeLessThan(100);
    expect(geometry.ports.map((port) => port.id)).toContain("group:port:top");
  });

  it("resolves curved-object ports on the sampled visible perimeter", () => {
    const circle = new Circle({
      left: 120,
      top: 90,
      radius: 30,
      originX: "center",
      originY: "center"
    });
    circle.objectId = "circle";
    const geometry = inspectSemanticGeometry(circle);
    const radial = geometry.ports.find((port) => port.id === "circle:port:radial-out");
    expect(radial).toBeDefined();
    expect(radial?.position.x).toBeCloseTo(geometry.center.x, 5);
    expect(radial?.position.y).toBeGreaterThan(geometry.center.y);
    expect(radial?.position).not.toEqual(geometry.center);
    expect(geometry.geometrySource).toBe("vector");
    expect(geometry.evaluable).toBe(true);
  });

  it("fails closed for an object with no visible ink", () => {
    const hidden = new Rect({ left: 20, top: 20, width: 100, height: 100, opacity: 0 });
    hidden.objectId = "hidden";
    const geometry = inspectSemanticGeometry(hidden);
    expect(geometry.evaluable).toBe(false);
    expect(geometry.geometrySource).toBe("empty");
    expect(geometry.ports).toEqual([]);
    expect(geometry.visualBounds.width).toBe(0);
  });

  it("returns an infeasible cycle rather than accepting overlaps", () => {
    const objects = ["a", "b", "c"].map((id) => ({
      object: { objectId: id } as never,
      geometry: {
        visualBounds: { left: 0, top: 0, width: 500, height: 500 },
        layoutBounds: { left: 0, top: 0, width: 500, height: 500 },
        selectionBounds: { left: 0, top: 0, width: 500, height: 500 },
        hull: [],
        center: { x: 0, y: 0 },
        area: 250000,
        ports: []
      } as SemanticGeometry
    }));
    const plan = planSemanticLayout(
      objects,
      {
        mode: "cycle",
        objectIds: ["a", "b", "c"],
        center: { x: 500, y: 500 },
        radius: 10,
        canvas: { width: 1000, height: 1000 },
        padding: 20
      },
      "scene-1"
    );
    expect(plan.status).toBe("infeasible");
    expect(plan.sourceRevision).toBe("scene-1");
  });

  it("allocates unequal cycle spacing from visual extents and reports metrics", () => {
    const objects = [
      new Rect({ left: 100, top: 100, width: 30, height: 30 }),
      new Rect({ left: 100, top: 100, width: 180, height: 40 }),
      new Rect({ left: 100, top: 100, width: 40, height: 120 })
    ].map((object, index) => {
      object.objectId = `stage-${index}`;
      return { object, geometry: inspectSemanticGeometry(object) };
    });
    const plan = planSemanticLayout(
      objects,
      {
        mode: "cycle",
        objectIds: objects.map(({ object }) => object.objectId!),
        center: { x: 400, y: 300 },
        preferredAxes: { x: 100, y: 100 },
        canvas: { width: 800, height: 600 },
        padding: 20,
        gap: 24
      },
      "scene-unequal"
    );
    expect(plan.status).toBe("feasible");
    expect(plan.metrics.occupiedAreaRatio).toBeGreaterThan(0);
    expect(plan.metrics.expectedMainFlowPathLength).toBeGreaterThan(0);
  });
});
