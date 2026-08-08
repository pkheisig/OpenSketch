import { describe, expect, it } from "vitest";
import {
  DEFAULT_TEXT_LINE_HEIGHT,
  lineSpacingValue,
  TEXT_LINE_SPACING_OPTIONS
} from "../apps/web/src/editor/text";

describe("text line spacing", () => {
  it("uses no extra spacing for newly created text", () => {
    expect(DEFAULT_TEXT_LINE_HEIGHT).toBe(1);
    expect(lineSpacingValue(DEFAULT_TEXT_LINE_HEIGHT)).toBe(1);
  });

  it("recognizes presets and preserves custom values", () => {
    expect(TEXT_LINE_SPACING_OPTIONS.map((option) => option.value)).toEqual([0.8, 1, 1.2, 1.5, 2]);
    expect(lineSpacingValue(1.5)).toBe(1.5);
    expect(lineSpacingValue(1.1)).toBe("custom");
    expect(lineSpacingValue(undefined)).toBe(1);
  });
});
