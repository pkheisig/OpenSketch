import { describe, expect, it } from "vitest";
import {
  ASSET_COLOR_PRESETS,
  colorProfileForFamily,
  normalizedPresetColor,
  presetColorMap
} from "../apps/web/src/editor/assetColorPresets";

const family = (category: string, title: string, keywords: string[] = []) => ({
  category,
  title,
  keywords
});

describe("asset color presets", () => {
  it("uses distinct profiles for cells, proteins, and curated equipment", () => {
    expect(colorProfileForFamily(family("Cells", "T Cell"))).toBe("cell");
    expect(colorProfileForFamily(family("Proteins", "CD80"))).toBe("protein");
    expect(colorProfileForFamily(family("Equipment", "96 Well Plate"))).toBe("equipment");
    expect(colorProfileForFamily(family("Equipment", "Generic laboratory scene"))).toBeUndefined();
    expect(colorProfileForFamily(family("Animals", "Prairie Dog"))).toBeUndefined();
  });

  it("assigns one coordinated shade to every distinct cellular paint", () => {
    const green = ASSET_COLOR_PRESETS.find((preset) => preset.id === "green")!;
    const sources = ["#3c1b62", "#8055a7", "#c8a9e1", "#f1e7f8"];
    const mapping = presetColorMap(sources, "cell", green);

    expect(mapping.size).toBe(4);
    expect(new Set(mapping.values()).size).toBe(4);
    expect(sources.every((source) => mapping.has(normalizedPresetColor(source)))).toBe(true);
  });

  it("preserves extreme neutral equipment materials while recoloring accents", () => {
    const blue = ASSET_COLOR_PRESETS.find((preset) => preset.id === "blue")!;
    const mapping = presetColorMap(
      ["#111111", "#ffffff", "#df7298", "#f5b1c5"],
      "equipment",
      blue
    );

    expect(mapping.has(normalizedPresetColor("#111111"))).toBe(false);
    expect(mapping.has(normalizedPresetColor("#ffffff"))).toBe(false);
    expect(mapping.has(normalizedPresetColor("#df7298"))).toBe(true);
    expect(mapping.has(normalizedPresetColor("#f5b1c5"))).toBe(true);
  });
});
