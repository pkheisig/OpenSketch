import { describe, expect, it } from "vitest";
import { transformColor } from "../apps/web/src/editor/colors";

describe("asset color effects", () => {
  it("applies tint, saturation, and brightness deterministically", () => {
    expect(
      transformColor("#808080", {
        tint: "#ff0000",
        tintAmount: 0.5,
        saturation: 0,
        brightness: 0
      })
    ).toBe("rgba(192,64,64,1)");
    expect(
      transformColor("#000000", {
        tint: "#ffffff",
        tintAmount: 0,
        saturation: 0,
        brightness: 0.2
      })
    ).toBe("rgba(51,51,51,1)");
  });
});
