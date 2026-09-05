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
    expect(colorProfileForFamily(family("Equipment", "Generic laboratory scene"))).toBe(
      "equipment"
    );
    expect(colorProfileForFamily(family("Animals", "Prairie Dog"))).toBe("cell");
  });

  it("keeps related shades distinct within the dominant color family", () => {
    const green = ASSET_COLOR_PRESETS.find((preset) => preset.id === "green")!;
    const sources = ["#3c1b62", "#8055a7", "#c8a9e1", "#f1e7f8"];
    const mapping = presetColorMap(sources, "cell", green);

    expect(mapping.size).toBe(4);
    expect(new Set(mapping.values()).size).toBe(4);
    expect(mapping.has(normalizedPresetColor(sources[3]))).toBe(true);
  });

  it("preserves extreme neutral equipment materials while recoloring accents", () => {
    const blue = ASSET_COLOR_PRESETS.find((preset) => preset.id === "blue")!;
    const mapping = presetColorMap(["#111111", "#ffffff", "#df7298", "#f5b1c5"], "equipment", blue);

    expect(mapping.has(normalizedPresetColor("#111111"))).toBe(false);
    expect(mapping.has(normalizedPresetColor("#ffffff"))).toBe(false);
    expect(mapping.has(normalizedPresetColor("#df7298"))).toBe(true);
    expect(mapping.has(normalizedPresetColor("#f5b1c5"))).toBe(true);
  });
  it("offers 12 families with four shades and retains original preset IDs", () => {
    expect(ASSET_COLOR_PRESETS).toHaveLength(48);
    expect(new Set(ASSET_COLOR_PRESETS.map((p) => p.id)).size).toBe(48);
    for (const id of ["green", "blue", "red", "purple", "gold"])
      expect(ASSET_COLOR_PRESETS.some((p) => p.id === id)).toBe(true);
  });
  it("themes contrasting large-region hues while preserving neutral extremes and alpha", () => {
    const sources = [
      "#70bda2",
      "#a7dfca",
      "#ac72b4",
      "#111111",
      "#ffffff",
      "rgba(112,189,162,0.5)"
    ];
    const map = presetColorMap(
      sources,
      "cell",
      ASSET_COLOR_PRESETS.find((p) => p.id === "red")!
    );
    expect(map.has(normalizedPresetColor(sources[0]))).toBe(true);
    expect(map.has(normalizedPresetColor(sources[1]))).toBe(true);
    expect(map.has(normalizedPresetColor(sources[2]))).toBe(true);
    for (const color of sources.slice(3, 5))
      expect(map.has(normalizedPresetColor(color))).toBe(false);
    expect(map.get(normalizedPresetColor(sources[5]))).toMatch(/0.5\)$/);
    expect(map.get(normalizedPresetColor(sources[0]))).not.toBe(
      map.get(normalizedPresetColor(sources[1]))
    );
  });
});
