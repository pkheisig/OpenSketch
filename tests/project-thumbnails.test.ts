import { describe, expect, it } from "vitest";
import {
  isCurrentVectorThumbnail,
  isVectorThumbnail,
  svgThumbnailDataUrl,
  vectorThumbnailMarkup
} from "../apps/web/src/persistence/thumbnailFormat";

describe("project overview thumbnails", () => {
  it("stores SVG previews as vector image data", () => {
    const svg =
      '<svg data-opensketch-thumbnail="2" xmlns="http://www.w3.org/2000/svg"><text>αβ</text></svg>';
    const thumbnail = svgThumbnailDataUrl(svg);

    expect(isVectorThumbnail(thumbnail)).toBe(true);
    expect(isCurrentVectorThumbnail(thumbnail)).toBe(true);
    expect(vectorThumbnailMarkup(thumbnail)).toBe(svg);
  });

  it("recognizes legacy raster previews for local upgrading", () => {
    expect(isVectorThumbnail("data:image/png;base64,legacy")).toBe(false);
    expect(
      isCurrentVectorThumbnail(
        svgThumbnailDataUrl('<svg xmlns="http://www.w3.org/2000/svg"></svg>')
      )
    ).toBe(false);
    expect(isVectorThumbnail(undefined)).toBe(false);
  });
});
