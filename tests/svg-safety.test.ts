import { describe, expect, it } from "vitest";
import { isSafeEmbeddedImageDataUrl, PORTABLE_PROJECT_LIMITS } from "../packages/editor-core/src";

function svgDataUrl(source: string): string {
  return `data:image/svg+xml;base64,${btoa(source)}`;
}

describe("embedded SVG image safety", () => {
  it("accepts safe raster and nested SVG data URLs", () => {
    const raster =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    const nested = svgDataUrl(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><image href="${raster}"/></svg>`
    );

    expect(isSafeEmbeddedImageDataUrl(raster)).toBe(true);
    expect(isSafeEmbeddedImageDataUrl(nested)).toBe(true);
  });

  it("rejects unsafe nested SVG markup", () => {
    const nested = svgDataUrl(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><script>alert(1)</script></svg>'
    );
    const outer = svgDataUrl(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><image href="${nested}"/></svg>`
    );

    expect(isSafeEmbeddedImageDataUrl(outer)).toBe(false);
  });

  it("rejects oversized and deeply nested data URLs", () => {
    const oversized = `data:image/png;base64,${"A".repeat(
      PORTABLE_PROJECT_LIMITS.maxDataUrlBytes
    )}`;
    expect(isSafeEmbeddedImageDataUrl(oversized)).toBe(false);

    let nested = svgDataUrl(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1"/></svg>'
    );
    for (let index = 0; index < 9; index += 1) {
      nested = svgDataUrl(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><image href="${nested}"/></svg>`
      );
    }

    expect(isSafeEmbeddedImageDataUrl(nested)).toBe(false);
  });
});
