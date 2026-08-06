import { describe, expect, it, vi } from "vitest";
import {
  parseAssetDragPayload,
  setAssetDragImage,
  setAssetDragPayload
} from "../apps/web/src/editor/assetDrag";

function mockDataTransfer() {
  return {
    effectAllowed: "none",
    setData: vi.fn(),
    setDragImage: vi.fn()
  };
}

describe("asset dragging", () => {
  it("keeps the selected asset variant in the drop payload", () => {
    const transfer = mockDataTransfer();

    setAssetDragPayload(transfer as unknown as DataTransfer, "t-cell", "variant-green");

    expect(transfer.effectAllowed).toBe("copy");
    expect(transfer.setData).toHaveBeenCalledWith(
      "application/x-scientific-asset",
      JSON.stringify({ familyId: "t-cell", variantId: "variant-green" })
    );
  });

  it("rejects malformed or incomplete drop payloads without throwing", () => {
    expect(parseAssetDragPayload("not JSON")).toBeNull();
    expect(parseAssetDragPayload(JSON.stringify({ familyId: "t-cell" }))).toBeNull();
    expect(parseAssetDragPayload(JSON.stringify(["t-cell", "variant-green"]))).toBeNull();
    expect(
      parseAssetDragPayload(JSON.stringify({ familyId: "", variantId: "variant-green" }))
    ).toBeNull();
    expect(
      parseAssetDragPayload(JSON.stringify({ familyId: "t-cell", variantId: "variant-green" }))
    ).toEqual({
      familyId: "t-cell",
      variantId: "variant-green"
    });
  });

  it("uses only the asset image as the browser drag preview", () => {
    const transfer = mockDataTransfer();
    const preview = document.createElement("img");
    vi.spyOn(preview, "getBoundingClientRect").mockReturnValue({
      x: 100,
      y: 50,
      left: 100,
      top: 50,
      right: 220,
      bottom: 150,
      width: 120,
      height: 100,
      toJSON: () => ({})
    });

    setAssetDragImage(transfer as unknown as DataTransfer, preview, {
      clientX: 145,
      clientY: 80
    });

    expect(transfer.setDragImage).toHaveBeenCalledWith(preview, 45, 30);
  });

  it("clamps the drag-preview hotspot when a drag starts outside the image bounds", () => {
    const transfer = mockDataTransfer();
    const preview = document.createElement("img");
    vi.spyOn(preview, "getBoundingClientRect").mockReturnValue({
      x: 20,
      y: 30,
      left: 20,
      top: 30,
      right: 100,
      bottom: 90,
      width: 80,
      height: 60,
      toJSON: () => ({})
    });

    setAssetDragImage(transfer as unknown as DataTransfer, preview, {
      clientX: 150,
      clientY: 10
    });

    expect(transfer.setDragImage).toHaveBeenCalledWith(preview, 80, 0);
  });
});
