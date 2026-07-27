import { describe, expect, it } from "vitest";
import { TEXT_FONT_FAMILIES } from "../apps/web/src/editor/fonts";

describe("editor font catalog", () => {
  it("offers a broad offline typography set without duplicate families", () => {
    expect(TEXT_FONT_FAMILIES.length).toBeGreaterThanOrEqual(12);
    expect(new Set(TEXT_FONT_FAMILIES).size).toBe(TEXT_FONT_FAMILIES.length);
    expect(TEXT_FONT_FAMILIES).toEqual(
      expect.arrayContaining([
        "Atkinson Hyperlegible",
        "IBM Plex Sans",
        "IBM Plex Serif",
        "Noto Sans",
        "Noto Serif",
        "Roboto Mono",
        "STIX Two Text"
      ])
    );
  });
});
