import { Group, Rect } from "../apps/web/node_modules/fabric";
import { describe, expect, it } from "vitest";
import { assignFreshCloneIds } from "../apps/web/src/editor/cloneIdentity";
import type { ConnectorBinding } from "../packages/editor-core/src/types";

const binding = (fromObjectId: string, toObjectId: string): ConnectorBinding => ({
  fromObjectId,
  fromAnchor: "center",
  toObjectId,
  toAnchor: "center",
  startArrowhead: "none",
  endArrowhead: "triangle",
  lineStyle: "solid",
  curvature: 0
});

describe("clone identity remapping", () => {
  it("remaps nested IDs and references across a multi-object clone", () => {
    const from = new Rect({ width: 10 });
    const to = new Rect({ width: 10 });
    from.objectId = "from-source";
    to.objectId = "to-source";
    from.connector = binding("from-source", "to-source");
    const recognition = {
      objectId: "recognition-source",
      memberObjectIds: ["from-source", "to-source"],
      properties: {}
    };
    from.recognizedGroups = [structuredClone(recognition)];
    to.recognizedGroups = [structuredClone(recognition)];
    from.defaultElementStyle = {
      properties: {},
      connector: binding("from-source", "to-source")
    };

    const sourceRecognition = structuredClone(from.recognizedGroups);
    const sourceStyle = structuredClone(from.defaultElementStyle);
    const clonedFrom = new Rect({ width: 10 });
    const clonedTo = new Rect({ width: 10 });
    clonedFrom.objectId = from.objectId;
    clonedTo.objectId = to.objectId;
    clonedFrom.connector = from.connector;
    clonedFrom.recognizedGroups = from.recognizedGroups;
    clonedTo.recognizedGroups = to.recognizedGroups;
    clonedFrom.defaultElementStyle = from.defaultElementStyle;
    const group = new Group([clonedFrom, clonedTo]);
    group.objectId = "group-source";
    assignFreshCloneIds(group);

    expect(new Set([group.objectId, clonedFrom.objectId, clonedTo.objectId]).size).toBe(3);
    expect(clonedFrom.connector).toEqual(binding(clonedFrom.objectId!, clonedTo.objectId!));
    expect(clonedFrom.defaultElementStyle?.connector).toEqual(
      binding(clonedFrom.objectId!, clonedTo.objectId!)
    );
    expect(clonedFrom.recognizedGroups?.[0]).toEqual({
      ...recognition,
      objectId: clonedFrom.recognizedGroups[0].objectId,
      memberObjectIds: [clonedFrom.objectId, clonedTo.objectId]
    });
    expect(clonedTo.recognizedGroups?.[0].objectId).toBe(clonedFrom.recognizedGroups?.[0].objectId);
    expect(from.objectId).toBe("from-source");
    expect(to.objectId).toBe("to-source");
    expect(from.connector).toEqual(binding("from-source", "to-source"));
    expect(from.recognizedGroups).toEqual(sourceRecognition);
    expect(from.defaultElementStyle).toEqual(sourceStyle);
  });

  it("keeps external connector targets unchanged while refreshing clone IDs", () => {
    const object = new Rect({ width: 10 });
    object.objectId = "source";
    object.connector = binding("source", "external");

    assignFreshCloneIds(object);

    expect(object.objectId).not.toBe("source");
    expect(object.connector).toEqual(binding(object.objectId!, "external"));
  });
});
