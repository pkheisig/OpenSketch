import { describe, expect, it } from "vitest";
import {
  decodeBmpRgba,
  decodeTiffRgba,
  encodeBmpRgba,
  encodeTiffRgba,
  type RgbaRaster
} from "../apps/web/src/interchange/formatCodecs";

const raster: RgbaRaster = {
  width: 2,
  height: 2,
  data: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 64, 255, 255, 255, 0])
};

describe("loss-aware raster codecs", () => {
  it("round-trips RGBA pixels through the BMP adapter", () => {
    const decoded = decodeBmpRgba(encodeBmpRgba(raster));
    expect(decoded.width).toBe(raster.width);
    expect(decoded.height).toBe(raster.height);
    expect([...decoded.data]).toEqual([...raster.data]);
  });

  it("round-trips RGBA pixels and resolution through the TIFF adapter", async () => {
    const source = { ...raster, physicalResolution: { x: 300, y: 150, unit: "dpi" as const } };
    const decoded = await decodeTiffRgba(encodeTiffRgba(source));
    expect(decoded.width).toBe(source.width);
    expect(decoded.height).toBe(source.height);
    expect([...decoded.data]).toEqual([...source.data]);
    expect(decoded.physicalResolution).toEqual({ x: 300, y: 150, unit: "dpi" });
  });

  it("preserves the selected BMP physical resolution metadata", () => {
    const source = { ...raster, physicalResolution: { x: 300, y: 150, unit: "dpi" as const } };
    const decoded = decodeBmpRgba(encodeBmpRgba(source));
    expect(decoded.physicalResolution?.x).toBeCloseTo(300, 0);
    expect(decoded.physicalResolution?.y).toBeCloseTo(150, 0);
  });
});
