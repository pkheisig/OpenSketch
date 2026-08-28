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

    const group = new Group([from, to]);
    group.objectId = "group-source";
    assignFreshCloneIds([group]);

    expect(new Set([group.objectId, from.objectId, to.objectId]).size).toBe(3);
    expect(from.connector).toEqual(binding(from.objectId!, to.objectId!));
    expect(from.defaultElementStyle?.connector).toEqual(binding(from.objectId!, to.objectId!));
    expect(from.recognizedGroups?.[0]).toEqual({
      ...recognition,
      objectId: from.recognizedGroups[0].objectId,
      memberObjectIds: [from.objectId, to.objectId]
    });
    expect(to.recognizedGroups?.[0].objectId).toBe(from.recognizedGroups?.[0].objectId);
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
