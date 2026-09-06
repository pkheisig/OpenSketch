import { describe, expect, it } from "vitest";
import { CANVAS_PRESETS, DEFAULT_DPI } from "../packages/editor-core/src/presets";
import {
  PNG_EXPORT_MAX_DIMENSION,
  PNG_EXPORT_MAX_PIXELS,
  calculatePngExportResource,
  inspectPngExportResource,
  setPngDpi
} from "../apps/web/src/export/png";
import { PROVENANCE_METADATA_KEY } from "../apps/web/src/export/provenance";
import { setJpegDpi } from "../apps/web/src/export/jpeg";

const ONE_PIXEL_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function blobBytes(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

describe("PNG export metadata", () => {
  it("writes the selected physical resolution", async () => {
    const bytes = Uint8Array.from(atob(ONE_PIXEL_PNG), (character) => character.charCodeAt(0));
    const outputBlob = await setPngDpi(new Blob([bytes]), 300);
    const output = new Uint8Array(
      await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(outputBlob);
      })
    );
    const marker = new TextEncoder().encode("pHYs");
    const index = output.findIndex(
      (_, offset) =>
        offset + marker.length <= output.length &&
        marker.every((value, index) => output[offset + index] === value)
    );
    expect(index).toBeGreaterThan(0);
    const pixelsPerMeter = new DataView(output.buffer).getUint32(index + 4);
    expect(pixelsPerMeter).toBe(11811);
    expect(output[index + 12]).toBe(1);
  });

  it("writes the canonical provenance manifest as UTF-8 iTXt metadata", async () => {
    const bytes = Uint8Array.from(atob(ONE_PIXEL_PNG), (character) => character.charCodeAt(0));
    const provenance = {
      version: 1 as const,
      assets: [
        {
          assetId: "asset-a",
          name: "Alpha",
          source: "https://example.org/alpha",
          author: "A. Author",
          license: "CC-BY-4.0",
          credit: "A. Author / Example"
        }
      ]
    };
    const outputBlob = await setPngDpi(new Blob([bytes]), 300, { provenance });
    const output = new Uint8Array(
      await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(outputBlob);
      })
    );
    let offset = 8;
    let manifest: unknown;
    while (offset + 12 <= output.length) {
      const length = new DataView(output.buffer).getUint32(offset);
      const type = new TextDecoder().decode(output.subarray(offset + 4, offset + 8));
      const data = output.subarray(offset + 8, offset + 8 + length);
      if (type === "iTXt") {
        const keywordEnd = data.indexOf(0);
        const keyword = new TextDecoder().decode(data.subarray(0, keywordEnd));
        if (keyword === PROVENANCE_METADATA_KEY) {
          manifest = JSON.parse(new TextDecoder().decode(data.subarray(keywordEnd + 5)));
        }
      }
      offset += length + 12;
    }
    expect(manifest).toEqual(provenance);
  });
});

describe("JPEG export metadata", () => {
  it("writes a JFIF density segment when the browser encoder omits one", async () => {
    const source = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const output = await blobBytes(await setJpegDpi(new Blob([source]), 300));
    expect([...output.subarray(0, 2)]).toEqual([0xff, 0xd8]);
    expect([...output.subarray(2, 9)]).toEqual([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49]);
    expect(output[13]).toBe(1);
    expect(new DataView(output.buffer).getUint16(14)).toBe(300);
    expect(new DataView(output.buffer).getUint16(16)).toBe(300);
  });
});

describe("PNG export resource limits", () => {
  it("calculates finite raster dimensions and the scale used by Fabric", () => {
    expect(calculatePngExportResource(1920, 1080, 300, 1200)).toEqual({
      width: 7680,
      height: 4320,
      pixels: 33_177_600,
      scale: 4,
      estimatedRgbaBytes: 132_710_400
    });
  });

  it("accepts a raster exactly at the documented dimension and pixel budgets", () => {
    const height = Math.floor(PNG_EXPORT_MAX_PIXELS / PNG_EXPORT_MAX_DIMENSION);
    const resource = calculatePngExportResource(PNG_EXPORT_MAX_DIMENSION, height, 300, 300);
    expect(resource.width).toBe(PNG_EXPORT_MAX_DIMENSION);
    expect(resource.height).toBe(height);
    expect(resource.pixels).toBe(PNG_EXPORT_MAX_DIMENSION * height);
  });

  it("rejects a raster that exceeds the pixel budget even below the dimension limit", () => {
    expect(() => calculatePngExportResource(8_001, 8_000, 300, 300)).toThrow(
      "Raster export at 300 DPI would create 8001 × 8000 pixels"
    );
  });

  it("checks every built-in canvas preset and export DPI without producing unbounded dimensions", () => {
    for (const preset of Object.values(CANVAS_PRESETS)) {
      for (const outputDpi of [150, 300, 600, 1200, 1500]) {
        const result = inspectPngExportResource(
          preset.width,
          preset.height,
          DEFAULT_DPI,
          outputDpi
        );
        if (result.resource) {
          expect(result.resource.width).toBeLessThanOrEqual(PNG_EXPORT_MAX_DIMENSION);
          expect(result.resource.height).toBeLessThanOrEqual(PNG_EXPORT_MAX_DIMENSION);
          expect(result.resource.pixels).toBeLessThanOrEqual(PNG_EXPORT_MAX_PIXELS);
        } else {
          expect(result.error).toContain("Choose a lower DPI or export SVG/PDF instead");
        }
      }
    }
  });

  it("rejects A4 at 1200 DPI before a browser raster allocation", () => {
    const result = inspectPngExportResource(2480, 3508, 300, 1200);
    expect(result.resource).toBeUndefined();
    expect(result.error).toContain("9920 × 14032 pixels");
    expect(result.error).toContain("lower DPI");
    expect(result.error).toContain("SVG/PDF");
  });

  it("fails closed for non-finite and non-positive export inputs", () => {
    expect(() => calculatePngExportResource(1920, 1080, 0, 300)).toThrow(
      "Raster export dimensions are invalid"
    );
    expect(() => calculatePngExportResource(1920, 1080, 300, Number.POSITIVE_INFINITY)).toThrow(
      "Raster export dimensions are invalid"
    );
    expect(() => calculatePngExportResource(Number.POSITIVE_INFINITY, 1080, 300, 300)).toThrow(
      "Raster export dimensions are invalid"
    );
  });
});
