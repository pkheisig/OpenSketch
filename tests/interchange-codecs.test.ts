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

function paletteTiff(): Uint8Array {
  const entryCount = 10;
  const ifdOffset = 8;
  const bitsOffset = ifdOffset + 2 + entryCount * 12 + 4;
  const colorMapOffset = bitsOffset + 2;
  const stripOffset = colorMapOffset + 3 * 256 * 2;
  const bytes = new Uint8Array(stripOffset + 1);
  const view = new DataView(bytes.buffer);
  bytes.set([0x49, 0x49, 0x2a, 0x00]);
  view.setUint32(4, ifdOffset, true);
  view.setUint16(ifdOffset, entryCount, true);
  let entryOffset = ifdOffset + 2;
  const entry = (tag: number, type: number, count: number, value: number) => {
    view.setUint16(entryOffset, tag, true);
    view.setUint16(entryOffset + 2, type, true);
    view.setUint32(entryOffset + 4, count, true);
    if (type === 3 && count === 1) view.setUint16(entryOffset + 8, value, true);
    else view.setUint32(entryOffset + 8, value, true);
    entryOffset += 12;
  };
  entry(256, 4, 1, 1);
  entry(257, 4, 1, 1);
  entry(258, 3, 1, 8);
  entry(259, 3, 1, 1);
  entry(262, 3, 1, 3);
  entry(273, 4, 1, stripOffset);
  entry(277, 3, 1, 1);
  entry(278, 4, 1, 1);
  entry(279, 4, 1, 1);
  entry(320, 3, 768, colorMapOffset);
  view.setUint32(entryOffset, 0, true);
  view.setUint16(colorMapOffset, 200, true);
  view.setUint16(colorMapOffset + 2 * 256, 40_000, true);
  view.setUint16(colorMapOffset + 4 * 256, 65_535, true);
  bytes[stripOffset] = 0;
  return bytes;
}

function tiffWithSampleFormat(bitsPerSample: number, sampleFormat: number): Uint8Array {
  const bytes = encodeTiffRgba(raster).slice();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entryCount = view.getUint16(8, true);
  for (let index = 0; index < entryCount; index += 1) {
    const entryOffset = 10 + index * 12;
    const tag = view.getUint16(entryOffset, true);
    if (tag !== 258 && tag !== 339) continue;
    const valueOffset = view.getUint32(entryOffset + 8, true);
    for (let sample = 0; sample < 4; sample += 1) {
      view.setUint16(valueOffset + sample * 2, tag === 258 ? bitsPerSample : sampleFormat, true);
    }
  }
  return bytes;
}

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

  it("scales palette TIFF ColorMap entries from their full 16-bit range", async () => {
    const decoded = await decodeTiffRgba(paletteTiff());
    expect([...decoded.data]).toEqual([1, 156, 255, 255]);
  });

  it("refuses signed integer and non-32-bit floating-point TIFF samples", async () => {
    await expect(decodeTiffRgba(tiffWithSampleFormat(8, 2))).rejects.toThrow(
      /unsigned integer TIFF samples/
    );
    await expect(decodeTiffRgba(tiffWithSampleFormat(16, 3))).rejects.toThrow(
      /unsigned integer TIFF samples/
    );
  });

  it("preserves the selected BMP physical resolution metadata", () => {
    const source = { ...raster, physicalResolution: { x: 300, y: 150, unit: "dpi" as const } };
    const decoded = decodeBmpRgba(encodeBmpRgba(source));
    expect(decoded.physicalResolution?.x).toBeCloseTo(300, 0);
    expect(decoded.physicalResolution?.y).toBeCloseTo(150, 0);
  });

  it("treats alpha as opaque for legacy 32-bit BI_RGB BMP files", () => {
    const bytes = new Uint8Array(58);
    const view = new DataView(bytes.buffer);
    bytes.set([0x42, 0x4d]);
    view.setUint32(10, 54, true);
    view.setUint32(14, 40, true);
    view.setInt32(18, 1, true);
    view.setInt32(22, 1, true);
    view.setUint16(26, 1, true);
    view.setUint16(28, 32, true);
    view.setUint32(30, 0, true);
    bytes.set([3, 2, 1, 0], 54);

    expect([...decodeBmpRgba(bytes).data]).toEqual([1, 2, 3, 255]);
  });
});
