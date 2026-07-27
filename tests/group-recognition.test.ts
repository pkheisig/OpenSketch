import { describe, expect, it } from "vitest";
import {
  consumeRecognizedGroup,
  findRecognizedGroup,
  rememberRecognizedGroup,
  type RecognizedGroup
} from "../apps/web/src/editor/groupRecognition";

describe("semantic group recognition", () => {
  const tCell: RecognizedGroup = {
    objectId: "t-cell-group",
    memberObjectIds: ["membrane", "cytoplasm", "nucleus"],
    properties: { name: "T Cell", OpenSketchType: "nih-asset", assetId: "t-cell-variant" }
  };

  it("recognizes exactly the original direct members in any selection order", () => {
    const membrane = { objectId: "membrane" };
    const cytoplasm = { objectId: "cytoplasm" };
    const nucleus = { objectId: "nucleus" };
    rememberRecognizedGroup([membrane, cytoplasm, nucleus], tCell);

    expect(findRecognizedGroup([nucleus, membrane, cytoplasm])).toEqual(tCell);
  });

  it("does not recognize partial groups or groups with extra objects", () => {
    const membrane = { objectId: "membrane" };
    const cytoplasm = { objectId: "cytoplasm" };
    const nucleus = { objectId: "nucleus" };
    rememberRecognizedGroup([membrane, cytoplasm, nucleus], tCell);

    expect(findRecognizedGroup([membrane, nucleus])).toBeUndefined();
    expect(
      findRecognizedGroup([
        membrane,
        cytoplasm,
        nucleus,
        { objectId: "unrelated", recognizedGroups: [tCell] }
      ])
    ).toBeUndefined();
  });

  it("consumes only the restored recognition and preserves parent group lineage", () => {
    const parent: RecognizedGroup = {
      objectId: "immune-scene",
      memberObjectIds: ["t-cell-group", "receptor"],
      properties: { name: "Immune scene" }
    };
    const membrane = { objectId: "membrane", recognizedGroups: [parent, tCell] };
    const nucleus = { objectId: "nucleus", recognizedGroups: [parent, tCell] };

    consumeRecognizedGroup([membrane, nucleus], tCell);

    expect(membrane.recognizedGroups).toEqual([parent]);
    expect(nucleus.recognizedGroups).toEqual([parent]);
  });
});
