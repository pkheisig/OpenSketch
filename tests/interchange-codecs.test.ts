import { describe, expect, it } from "vitest";
import {
  decodeBmpRgba,
  decodeTiffRgba,
  encodeBmpRgba,
  encodeTiffRgba,
  InterchangeImportError,
  prepareStrictInterchangeImport,
  type RgbaRaster
} from "../apps/web/src/interchange/formatCodecs";
import { INTERCHANGE_PROBE_READ_BYTES } from "../packages/editor-core/src";

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

function planarTiff(): Uint8Array {
  const width = 2;
  const height = 2;
  const planeBytes = width * height;
  const ifdOffset = 8;
  const entryCount = 10;
  const bitsOffset = ifdOffset + 2 + entryCount * 12 + 4;
  const dataOffset = bitsOffset + 8;
  const bytes = new Uint8Array(dataOffset + planeBytes * 3);
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
  entry(256, 4, 1, width);
  entry(257, 4, 1, height);
  entry(258, 3, 3, bitsOffset);
  entry(259, 3, 1, 1);
  entry(262, 3, 1, 2);
  entry(273, 4, 1, dataOffset);
  entry(277, 3, 1, 3);
  entry(278, 4, 1, height);
  entry(279, 4, 1, planeBytes * 3);
  entry(284, 3, 1, 2);
  view.setUint32(entryOffset, 0, true);
  [8, 8, 8].forEach((value, index) => view.setUint16(bitsOffset + index * 2, value, true));
  bytes.set([255, 0, 0, 255], dataOffset);
  bytes.set([0, 255, 0, 255], dataOffset + planeBytes);
  bytes.set([0, 0, 255, 255], dataOffset + planeBytes * 2);
  return bytes;
}

function multipageTiffBeyondProbeWindow(): Uint8Array {
  const firstIfdOffset = 8;
  const secondIfdOffset = INTERCHANGE_PROBE_READ_BYTES + 100_000;
  const entryCount = 8;
  const imageDataOffset = firstIfdOffset + 2 + entryCount * 12 + 4;
  const bytes = new Uint8Array(secondIfdOffset + 6);
  const view = new DataView(bytes.buffer);
  bytes.set([0x49, 0x49, 0x2a, 0x00]);
  view.setUint32(4, firstIfdOffset, true);
  view.setUint16(firstIfdOffset, entryCount, true);
  let entryOffset = firstIfdOffset + 2;
  const entry = (tag: number, type: number, count: number, value: number) => {
    view.setUint16(entryOffset, tag, true);
    view.setUint16(entryOffset + 2, type, true);
    view.setUint32(entryOffset + 4, count, true);
    if (type === 3 && count === 1) view.setUint16(entryOffset + 8, value, true);
    else view.setUint32(entryOffset + 8, value, true);
    entryOffset += 12;
  };
  entry(256, 4, 1, 8);
  entry(257, 4, 1, 8);
  entry(258, 3, 1, 8);
  entry(259, 3, 1, 1);
  entry(262, 3, 1, 1);
  entry(273, 4, 1, imageDataOffset);
  entry(277, 3, 1, 1);
  entry(279, 4, 1, 64);
  view.setUint32(entryOffset, secondIfdOffset, true);
  view.setUint16(secondIfdOffset, 0, true);
  view.setUint32(secondIfdOffset + 2, 0, true);
  return bytes;
}

function fileLike(bytes: Uint8Array, name: string, type: string): File {
  const copy = bytes.slice();
  const arrayBuffer = async () =>
    copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength);
  return {
    name,
    type,
    size: copy.byteLength,
    slice: (start?: number, end?: number) => {
      const sliced = copy.slice(start, end);
      return { arrayBuffer: async () => sliced.buffer } as Blob;
    },
    arrayBuffer
  } as unknown as File;
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

  it("refuses TIFF planar storage before it can silently scramble pixels", async () => {
    await expect(decodeTiffRgba(planarTiff())).rejects.toMatchObject<InterchangeImportError>({
      code: "planar_storage_unsupported"
    });
  });

  it("re-probes a multi-page TIFF when its IFD chain exceeds the bounded window", async () => {
    const file = fileLike(multipageTiffBeyondProbeWindow(), "multi-page.tiff", "image/tiff");

    await expect(prepareStrictInterchangeImport(file)).rejects.toMatchObject({
      code: "multipage_requires_choice"
    });
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
