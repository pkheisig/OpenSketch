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
    expect(image).toHaveAttribute("loading", "eager");
    expect(image).toHaveAttribute("decoding", "async");
    expect(image).toHaveAttribute("data-preview-ready", "false");
    expect(getComputedStyle(image!).visibility).not.toBe("hidden");
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
    const fallbackImage = container.querySelector("img");
    expect(fallbackImage).not.toBe(image);
    expect(fallbackImage).toHaveAttribute("src", "/assets/bioicons/cancer-cell.svg");
    expect(fallbackImage).toHaveAttribute("data-preview-ready", "false");

    fireEvent.load(fallbackImage!);
    expect(fallbackImage).toHaveAttribute("data-preview-ready", "true");
  });

  it("marks a newly recycled virtual-list thumbnail ready after it loads", () => {
    const view = render(
      createElement(AssetPreviewImage, {
        assetPath: "/assets/bioicons/first.svg",
        fallbackPath: "/assets/bioicons-thumbnails/first.webp"
      })
    );
    fireEvent.load(view.container.querySelector("img")!);

    view.rerender(
      createElement(AssetPreviewImage, {
        assetPath: "/assets/bioicons/second.svg",
        fallbackPath: "/assets/bioicons-thumbnails/second.webp"
      })
    );
    const recycledImage = view.container.querySelector("img");
    expect(recycledImage).toHaveAttribute("src", "/assets/bioicons-thumbnails/second.webp");
    expect(recycledImage).toHaveAttribute("data-preview-ready", "false");

    fireEvent.load(recycledImage!);
    expect(recycledImage).toHaveAttribute("data-preview-ready", "true");
  });

  it("does not let a stale recycled-row load hide the current thumbnail", () => {
    const view = render(
      createElement(AssetPreviewImage, {
        assetPath: "/assets/bioicons/first.svg",
        fallbackPath: "/assets/bioicons-thumbnails/first.webp"
      })
    );
    const firstImage = view.container.querySelector("img")!;

    view.rerender(
      createElement(AssetPreviewImage, {
        assetPath: "/assets/bioicons/second.svg",
        fallbackPath: "/assets/bioicons-thumbnails/second.webp"
      })
    );
    const secondImage = view.container.querySelector("img")!;

    expect(secondImage).not.toBe(firstImage);
    expect(secondImage).toHaveAttribute("src", "/assets/bioicons-thumbnails/second.webp");
    fireEvent.load(firstImage);
    expect(view.container.querySelector("img")).toHaveAttribute(
      "src",
      "/assets/bioicons-thumbnails/second.webp"
    );
  });
});
