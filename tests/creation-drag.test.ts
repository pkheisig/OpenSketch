import { describe, expect, it } from "vitest";
import {
  connectorDropEndpoints,
  parseConnectorPresetDragPayload,
  parseShapePresetDragPayload
} from "../apps/web/src/editor/creationDrag";

describe("connector preset dragging", () => {
  it("resolves a sidebar payload to the same connector preset used by click placement", () => {
    const dragged = parseConnectorPresetDragPayload(
      JSON.stringify({ family: "inhibitor", label: "Rounded inhibitor" })
    );

    expect(dragged?.family).toBe("inhibitor");
    expect(dragged?.preset.pathShape).toBe("rounded-elbow");
    expect(dragged?.preset.endArrowhead).toBe("bar");
    expect(dragged?.tool).toMatchObject({
      type: "shape",
      kind: "arrow"
    });
  });

  it("rejects unknown or malformed drag payloads", () => {
    expect(parseConnectorPresetDragPayload("not-json")).toBeNull();
    expect(
      parseConnectorPresetDragPayload(
        JSON.stringify({ family: "inhibitor", label: "Unknown inhibitor" })
      )
    ).toBeNull();
    expect(
      parseConnectorPresetDragPayload(
        JSON.stringify({ family: "unknown", label: "Rounded inhibitor" })
      )
    ).toBeNull();
  });

  it("centers the dropped connector and keeps its geometry inside the canvas", () => {
    const dragged = parseConnectorPresetDragPayload(
      JSON.stringify({ family: "arrows", label: "Straight arrow" })
    );
    expect(dragged).not.toBeNull();

    const centered = connectorDropEndpoints(
      dragged!.tool,
      { x: 500, y: 300 },
      { width: 1000, height: 600 }
    );
    expect(centered).toEqual({
      from: { x: 390, y: 300 },
      to: { x: 610, y: 300 }
    });

    const nearEdge = connectorDropEndpoints(
      dragged!.tool,
      { x: 20, y: 300 },
      { width: 1000, height: 600 }
    );
    expect(nearEdge).toEqual({
      from: { x: 0, y: 300 },
      to: { x: 220, y: 300 }
    });
  });
});

describe("shape preset dragging", () => {
  it("resolves every sidebar shape kind to a direct-placement creation tool", () => {
    expect(parseShapePresetDragPayload("rounded-rectangle")).toEqual({
      type: "shape",
      kind: "rounded-rectangle"
    });
    expect(parseShapePresetDragPayload("pentagon")).toEqual({
      type: "shape",
      kind: "pentagon"
    });
  });

  it("rejects removed, connector, and unknown shape kinds", () => {
    expect(parseShapePresetDragPayload("star")).toBeNull();
    expect(parseShapePresetDragPayload("arrow")).toBeNull();
    expect(parseShapePresetDragPayload("unknown")).toBeNull();
  });
});
