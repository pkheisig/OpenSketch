import { Group, Text } from "../apps/web/node_modules/fabric";
import { describe, expect, it, vi } from "vitest";
import { refreshTextMetrics } from "../apps/web/src/editor/textMetrics";

describe("editor text metrics", () => {
  it("refreshes dimensions for imported Fabric Text instances", () => {
    const importedText = new Text("Imported SVG text", {
      fontFamily: "Inter",
      fontSize: 32
    });
    importedText.set("width", 0);
    const initDimensions = vi.spyOn(importedText, "initDimensions");

    refreshTextMetrics([importedText]);

    expect(initDimensions).toHaveBeenCalledTimes(1);
    expect(importedText.width).toBeGreaterThan(0);
    expect(importedText.height).toBeGreaterThan(0);
  });

  it("refreshes text nested inside imported SVG groups", () => {
    const importedText = new Text("Nested SVG text", { fontSize: 28 });
    importedText.set("width", 0);
    const initDimensions = vi.spyOn(importedText, "initDimensions");
    const group = new Group([importedText]);

    refreshTextMetrics([group]);

    expect(initDimensions).toHaveBeenCalledTimes(1);
    expect(importedText.width).toBeGreaterThan(0);
  });
});
