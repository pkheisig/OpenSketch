import { describe, expect, it } from "vitest";
import { resolveBundledAssetPath } from "../apps/web/src/assets/manifest";

describe("GitHub Pages asset paths", () => {
  it("resolves bundled assets below the repository base path", () => {
    expect(resolveBundledAssetPath("/assets/nih-bioart/cell.svg", "/OpenSketch/")).toBe(
      "/OpenSketch/assets/nih-bioart/cell.svg"
    );
  });

  it("normalizes base paths without trailing slashes", () => {
    expect(resolveBundledAssetPath("/assets/icon.webp", "/OpenSketch")).toBe(
      "/OpenSketch/assets/icon.webp"
    );
  });
});
