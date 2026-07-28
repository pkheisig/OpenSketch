import { describe, expect, it } from "vitest";
import {
  DEFAULT_CREATION_DEFAULTS,
  isLinearCreationTool,
  normalizeCreationDefaults
} from "../apps/web/src/editor/creation";

describe("creation tools", () => {
  it("normalizes stored defaults without discarding valid custom values", () => {
    expect(
      normalizeCreationDefaults({
        text: { color: "#123456", fontSize: 24, fontWeight: 600 },
        shape: { fill: "invalid", strokeWidth: 999 },
        line: {
          color: "#abcdef",
          width: 8,
          lineStyle: "dashed",
          startArrowhead: "open",
          endArrowhead: "circle"
        }
      })
    ).toEqual({
      text: {
        ...DEFAULT_CREATION_DEFAULTS.text,
        color: "#123456",
        fontSize: 24,
        fontWeight: 600
      },
      shape: {
        ...DEFAULT_CREATION_DEFAULTS.shape,
        strokeWidth: 40
      },
      line: {
        color: "#abcdef",
        width: 8,
        lineStyle: "dashed",
        startArrowhead: "open",
        endArrowhead: "circle"
      }
    });
  });

  it("only treats line and arrow tools as drag-sized creations", () => {
    expect(isLinearCreationTool({ type: "shape", kind: "line" })).toBe(true);
    expect(isLinearCreationTool({ type: "shape", kind: "curved-arrow" })).toBe(true);
    expect(isLinearCreationTool({ type: "shape", kind: "rectangle" })).toBe(false);
    expect(isLinearCreationTool({ type: "text", kind: "point" })).toBe(false);
  });

  it("preserves transparent shape paint without accepting it for text or lines", () => {
    const defaults = normalizeCreationDefaults({
      text: { color: "transparent" },
      shape: { fill: "transparent", stroke: "TRANSPARENT" },
      line: { color: "transparent" }
    });

    expect(defaults.shape.fill).toBe("transparent");
    expect(defaults.shape.stroke).toBe("transparent");
    expect(defaults.text.color).toBe(DEFAULT_CREATION_DEFAULTS.text.color);
    expect(defaults.line.color).toBe(DEFAULT_CREATION_DEFAULTS.line.color);
  });
});
