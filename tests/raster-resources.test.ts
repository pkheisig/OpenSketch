import { describe, expect, it, vi } from "vitest";
import {
  inspectRasterBlob,
  inspectRasterBytes,
  inspectRasterDataUrl,
  PORTABLE_PROJECT_LIMITS,
  rasterFitsLimits,
  rasterLimitMessage,
  RASTER_HEADER_READ_BYTES
} from "../packages/editor-core/src";

function dataUrl(mimeType: string, bytes: Uint8Array): string {
  return `data:${mimeType};base64,${btoa(String.fromCharCode(...bytes))}`;
}

function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array([
    137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 0, 0, 0, 0, 0
  ]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

function jpegHeader(width: number, height: number): Uint8Array {
  return new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xc0,
    0x00,
    0x11,
    0x08,
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff,
    0x03,
    0x01,
    0x11,
    0x00,
    0x02,
    0x11,
    0x00,
    0x03,
    0x11,
    0x00
  ]);
}

function webpVp8xHeader(width: number, height: number): Uint8Array {
  return new Uint8Array([
    0x52,
    0x49,
    0x46,
    0x46,
    0x00,
    0x00,
    0x00,
    0x00,
    0x57,
    0x45,
    0x42,
    0x50,
    0x56,
    0x50,
    0x38,
    0x58,
    0x0a,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    (width - 1) & 0xff,
    ((width - 1) >> 8) & 0xff,
    ((width - 1) >> 16) & 0xff,
    (height - 1) & 0xff,
    ((height - 1) >> 8) & 0xff,
    ((height - 1) >> 16) & 0xff
  ]);
}

describe("raster resource inspection", () => {
  it.each([
    ["PNG", "image/png", pngHeader(320, 240)],
    ["JPEG", "image/jpeg", jpegHeader(320, 240)],
    ["WebP", "image/webp", webpVp8xHeader(320, 240)]
  ])("reads %s dimensions without image decoding", (_label, mimeType, bytes) => {
    expect(inspectRasterBytes(bytes)).toEqual({
      mimeType,
      width: 320,
      height: 240,
      pixels: 76_800
    });
  });

  it("uses content sniffing and rejects MIME/content disagreement", () => {
    const jpeg = jpegHeader(64, 32);
    expect(inspectRasterDataUrl(dataUrl("image/jpeg", jpeg), "image/jpeg")?.mimeType).toBe(
      "image/jpeg"
    );
    expect(inspectRasterDataUrl(dataUrl("image/png", jpeg), "image/png")).toBeUndefined();
  });

  it("rejects truncated, malformed, and non-raster headers", () => {
    expect(inspectRasterBytes(pngHeader(12, 8).subarray(0, 23))).toBeUndefined();
    expect(inspectRasterBytes(new Uint8Array([0, 1, 2, 3]))).toBeUndefined();
    expect(inspectRasterDataUrl("data:image/webp;base64,not-a-webp")).toBeUndefined();
  });

  it("reads only the bounded header needed for inspection", async () => {
    const slice = vi.spyOn(Blob.prototype, "slice");
    const file = new Blob([pngHeader(16, 16), new Uint8Array(2_000_000)], {
      type: "image/png"
    });

    await expect(inspectRasterBlob(file)).resolves.toMatchObject({
      mimeType: "image/png",
      width: 16,
      height: 16
    });
    expect(slice).toHaveBeenCalledWith(0, RASTER_HEADER_READ_BYTES);
    slice.mockRestore();
  });

  it("applies the canonical per-image and aggregate pixel limits", () => {
    const ordinary = inspectRasterBytes(pngHeader(1_000, 1_000))!;
    expect(rasterFitsLimits(ordinary)).toBe(true);
    expect(rasterLimitMessage(ordinary)).toBeUndefined();

    const oversized = inspectRasterBytes(
      pngHeader(PORTABLE_PROJECT_LIMITS.maxRasterDimension + 1, 1)
    )!;
    expect(rasterFitsLimits(oversized)).toBe(false);
    expect(rasterLimitMessage(oversized)).toContain("per-side limit");

    expect(
      rasterLimitMessage(ordinary, PORTABLE_PROJECT_LIMITS.maxTotalRasterArea - ordinary.pixels + 1)
    ).toContain("decoded raster area budget");
  });
});
