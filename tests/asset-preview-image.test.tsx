import { fireEvent, render } from "@testing-library/react";
import { createElement } from "../apps/web/node_modules/react/index.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssetPreviewImage } from "../apps/web/src/components/AssetPreviewImage";

describe("asset preview images", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the bundled thumbnail without fetching and rasterizing the source SVG", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { container } = render(
      createElement(AssetPreviewImage, {
        assetPath: "/assets/bioicons/cancer-cell.svg",
        fallbackPath: "/assets/bioicons-thumbnails/cancer-cell.webp"
      })
    );
    const image = container.querySelector("img");

    expect(image).not.toBeNull();
    expect(image).toHaveAttribute("src", "/assets/bioicons-thumbnails/cancer-cell.webp");
    expect(image).toHaveAttribute("data-preview-ready", "false");
    expect(fetchSpy).not.toHaveBeenCalled();

    fireEvent.load(image!);
    expect(image).toHaveAttribute("data-preview-ready", "true");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("falls back to the source SVG when a bundled thumbnail cannot be decoded", () => {
    const { container } = render(
      createElement(AssetPreviewImage, {
        assetPath: "/assets/bioicons/cancer-cell.svg",
        fallbackPath: "/assets/bioicons-thumbnails/cancer-cell.webp"
      })
    );
    const image = container.querySelector("img");

    fireEvent.error(image!);
    expect(image).toHaveAttribute("src", "/assets/bioicons/cancer-cell.svg");
    expect(image).toHaveAttribute("data-preview-ready", "false");

    fireEvent.load(image!);
    expect(image).toHaveAttribute("data-preview-ready", "true");
  });
});
