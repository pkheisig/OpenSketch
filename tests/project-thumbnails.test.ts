import { describe, expect, it } from "vitest";
import {
  isCurrentVectorThumbnail,
  isProjectThumbnailCurrent,
  isVectorThumbnail,
  svgThumbnailDataUrl,
  VECTOR_THUMBNAIL_VERSION,
  vectorThumbnailMarkup
} from "../apps/web/src/persistence/thumbnailFormat";

describe("project overview thumbnails", () => {
  it("stores SVG previews as vector image data", () => {
    const revision = 7;
    const svg =
      `<svg data-opensketch-thumbnail="${VECTOR_THUMBNAIL_VERSION}" ` +
      `data-opensketch-project-revision="${revision}" xmlns="http://www.w3.org/2000/svg">` +
      "<text>αβ</text></svg>";
    const thumbnail = svgThumbnailDataUrl(svg);

    expect(isVectorThumbnail(thumbnail)).toBe(true);
    expect(isCurrentVectorThumbnail(thumbnail)).toBe(true);
    expect(isProjectThumbnailCurrent(thumbnail, revision)).toBe(true);
    expect(isProjectThumbnailCurrent(thumbnail, "newer-revision")).toBe(false);
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
