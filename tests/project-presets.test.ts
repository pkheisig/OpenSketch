import { describe, expect, it } from "vitest";
import { DEFAULT_CANVAS, resolveProjectDefaults } from "../packages/editor-core/src";

describe("project mode defaults", () => {
  it("keeps diagram projects on the current canvas defaults", () => {
    expect(resolveProjectDefaults("diagram")).toEqual({
      kind: "diagram",
      name: "Untitled diagram",
      canvas: DEFAULT_CANVAS
    });
  });

  it("gives figures a physical publication canvas", () => {
    expect(resolveProjectDefaults("figure")).toMatchObject({
      kind: "figure",
      canvas: { unit: "mm", width: 3508, height: 2480, dpi: 300 }
    });
  });

  it("provides a neutral poster default", () => {
    expect(resolveProjectDefaults("poster")).toMatchObject({
      kind: "poster",
      canvas: DEFAULT_CANVAS
    });
  });
});
