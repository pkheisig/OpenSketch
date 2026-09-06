import { describe, expect, it } from "vitest";
import {
  INTERCHANGE_PROBE_READ_BYTES,
  createFidelityReport,
  importAcceptAttribute,
  probeInterchangeBytes,
  probeIsUsable
} from "../packages/editor-core/src";

function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  bytes.set([73, 72, 68, 82], 12);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}

function jpegWithLateSof(): Uint8Array {
  const appSegmentLength = 65_535;
  const appSegmentCount = 16;
  const sofLength = 17;
  const bytes = new Uint8Array(2 + appSegmentCount * (2 + appSegmentLength) + 2 + sofLength + 2);
  const view = new DataView(bytes.buffer);
  let offset = 0;
  bytes.set([0xff, 0xd8], offset);
  offset += 2;
  for (let segment = 0; segment < appSegmentCount; segment += 1) {
    bytes.set([0xff, 0xe1], offset);
    offset += 2;
    view.setUint16(offset, appSegmentLength, false);
    offset += 2 + appSegmentLength - 2;
  }
  bytes.set([0xff, 0xc0], offset);
  view.setUint16(offset + 2, sofLength, false);
  bytes.set(
    [8, 0, 2, 0, 3, 3, 1, 0x11, 0, 2, 0x11, 0, 3, 0x11],
    offset + 4
  );
  return bytes;
}

describe("strict interchange probing", () => {
  it("detects the signature and dimensions instead of trusting the extension", () => {
    const probe = probeInterchangeBytes(pngHeader(320, 240), {
      mimeType: "image/png",
      name: "figure.png"
    });

    expect(probe).toMatchObject({
      format: "png",
      dimensions: { width: 320, height: 240 },
      diagnostics: []
    });
    expect(probeIsUsable(probe)).toBe(true);
  });

  it("uses the verified signature while reporting MIME and extension mismatches", () => {
    const probe = probeInterchangeBytes(pngHeader(2, 2), {
      mimeType: "image/jpeg",
      name: "figure.jpg"
    });

    expect(probeIsUsable(probe)).toBe(true);
    expect(probe.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "declared_type_mismatch",
      "extension_mismatch"
    ]);
    expect(probe.diagnostics.every((diagnostic) => diagnostic.severity === "warning")).toBe(true);
  });

  it("finds a JPEG SOF marker beyond the bounded probe window", () => {
    const probe = probeInterchangeBytes(jpegWithLateSof(), {
      mimeType: "image/jpeg",
      name: "metadata-heavy.jpg"
    });

    expect(probe).toMatchObject({
      format: "jpeg",
      dimensions: { width: 3, height: 2 },
      diagnostics: []
    });
    expect(probeIsUsable(probe)).toBe(true);
  });

  it("reads out-of-line TIFF RATIONAL resolution values", () => {
    const bytes = new Uint8Array(200);
    const view = new DataView(bytes.buffer);
    bytes.set([0x49, 0x49, 0x2a, 0x00]);
    view.setUint32(4, 8, true);
    view.setUint16(8, 5, true);
    let entryOffset = 10;
    const entry = (tag: number, type: number, count: number, value: number) => {
      view.setUint16(entryOffset, tag, true);
      view.setUint16(entryOffset + 2, type, true);
      view.setUint32(entryOffset + 4, count, true);
      view.setUint32(entryOffset + 8, value, true);
      entryOffset += 12;
    };
    entry(256, 4, 1, 100);
    entry(257, 4, 1, 50);
    entry(282, 5, 1, 170);
    entry(283, 5, 1, 178);
    entry(296, 3, 1, 2);
    view.setUint32(entryOffset, 0, true);
    view.setUint32(170, 300, true);
    view.setUint32(174, 1, true);
    view.setUint32(178, 150, true);
    view.setUint32(182, 1, true);

    expect(
      probeInterchangeBytes(bytes, { mimeType: "image/tiff", name: "figure.tiff" })
    ).toMatchObject({
      physicalResolution: { x: 300, y: 150, unit: "dpi" },
      dimensions: { width: 100, height: 50 }
    });
  });

  it("accepts a large SVG when its bounded header is valid", () => {
    const bytes = new Uint8Array(INTERCHANGE_PROBE_READ_BYTES);
    bytes.set(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg">'));
    const probe = probeInterchangeBytes(bytes, {
      mimeType: "image/svg+xml",
      name: "large.svg",
      byteLength: INTERCHANGE_PROBE_READ_BYTES + 1
    });

    expect(probe.diagnostics).toEqual([]);
    expect(probeIsUsable(probe)).toBe(true);
  });

  it("walks a static GIF whose image data exceeds the bounded probe window", () => {
    const parts: number[] = [...new TextEncoder().encode("GIF89a")];
    parts.push(10, 0, 10, 0, 0, 0, 0);
    parts.push(0x2c, 0, 0, 0, 0, 10, 0, 10, 0, 0);
    parts.push(0x02);
    const blockSize = 255;
    const blockCount = Math.ceil((INTERCHANGE_PROBE_READ_BYTES + 100_000) / blockSize);
    for (let block = 0; block < blockCount; block += 1) {
      parts.push(blockSize);
      for (let byte = 0; byte < blockSize; byte += 1) parts.push(0x84);
    }
    parts.push(0, 0x3b);

    const probe = probeInterchangeBytes(Uint8Array.from(parts), {
      mimeType: "image/gif",
      name: "large.gif"
    });

    expect(probe).toMatchObject({
      format: "gif",
      dimensions: { width: 10, height: 10 },
      frameCount: 1,
      animated: false,
      diagnostics: []
    });
    expect(probeIsUsable(probe)).toBe(true);
  });

  it("accepts SVG files with a bounded DOCTYPE prolog", () => {
    const bytes = new TextEncoder().encode(
      '<!DOCTYPE svg [<!ENTITY sample "bounded > entity">]><svg xmlns="http://www.w3.org/2000/svg" />'
    );
    const probe = probeInterchangeBytes(bytes, {
      mimeType: "image/svg+xml",
      name: "legacy.svg"
    });

    expect(probe.format).toBe("svg");
    expect(probeIsUsable(probe)).toBe(true);
  });

  it("accepts SVG processing instructions and a prolog beyond the old short window", () => {
    const preamble = `<?xml version="1.0"?><?xml-stylesheet type="text/css" href="figure.css"?>${"<!-- license -->".repeat(1_200)}`;
    const bytes = new TextEncoder().encode(
      `${preamble}<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" />`
    );
    const probe = probeInterchangeBytes(bytes, {
      mimeType: "image/svg+xml",
      name: "licensed.svg"
    });

    expect(probe).toMatchObject({ format: "svg", diagnostics: [] });
    expect(probeIsUsable(probe)).toBe(true);
  });

  it("detects BMP, TIFF, GIF animation, and modern container signatures", () => {
    const bmp = new Uint8Array(26);
    bmp.set([0x42, 0x4d], 0);
    new DataView(bmp.buffer).setUint32(14, 12, true);
    new DataView(bmp.buffer).setUint16(18, 4, true);
    new DataView(bmp.buffer).setUint16(20, 3, true);
    expect(probeInterchangeBytes(bmp, { name: "figure.bmp" })).toMatchObject({
      format: "bmp",
      dimensions: { width: 4, height: 3 }
    });

    const topDownBmp = new Uint8Array(54);
    topDownBmp.set([0x42, 0x4d], 0);
    const topDownView = new DataView(topDownBmp.buffer);
    topDownView.setUint32(14, 40, true);
    topDownView.setInt32(18, -4, true);
    topDownView.setInt32(22, -3, true);
    expect(probeInterchangeBytes(topDownBmp, { name: "top-down.bmp" })).toMatchObject({
      format: "bmp",
      dimensions: { width: 4, height: 3 }
    });

    const tiff = new Uint8Array(26);
    tiff.set([0x49, 0x49, 0x2a, 0x00], 0);
    new DataView(tiff.buffer).setUint32(4, 8, true);
    new DataView(tiff.buffer).setUint16(8, 0, true);
    expect(probeInterchangeBytes(tiff, { name: "figure.tiff" }).format).toBe("tiff");

    const gif = Uint8Array.from([
      ...new TextEncoder().encode("GIF89a"),
      10,
      0,
      10,
      0,
      0,
      0,
      0,
      0x2c,
      0,
      0,
      0,
      0,
      10,
      0,
      10,
      0,
      0,
      0x02,
      0x01,
      0x00,
      0x00,
      0x2c,
      0,
      0,
      0,
      0,
      10,
      0,
      10,
      0,
      0,
      0x02,
      0x01,
      0x00,
      0x00,
      0x3b
    ]);
    expect(probeInterchangeBytes(gif, { name: "figure.gif" })).toMatchObject({
      format: "gif",
      frameCount: 2,
      animated: true
    });

    const avif = new Uint8Array(16);
    avif.set([0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66]);
    expect(probeInterchangeBytes(avif, { name: "figure.avif" }).format).toBe("avif");
  });

  it("produces a structured refusal report", () => {
    const probe = probeInterchangeBytes(new Uint8Array([1, 2, 3]), {
      mimeType: "image/png",
      name: "figure.png"
    });
    const report = createFidelityReport({
      source: { name: "figure.png", mimeType: "image/png", byteLength: 3 },
      probe
    });
    expect(report).toMatchObject({
      format: "unknown",
      status: "unsupported/refused",
      mappedCount: 0,
      refusedCount: 1
    });
    expect(report.diagnostics[0]?.code).toBe("signature_unrecognized");
  });

  it("builds one accept list for all registered import formats", () => {
    const accept = importAcceptAttribute();
    expect(accept).toContain("image/tiff");
    expect(accept).toContain(".bmp");
    expect(accept).toContain(".heic");
  });
});
