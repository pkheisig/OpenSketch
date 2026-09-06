import { describe, expect, it } from "vitest";
import {
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

  it("refuses MIME or extension mismatches", () => {
    const probe = probeInterchangeBytes(pngHeader(2, 2), {
      mimeType: "image/jpeg",
      name: "figure.jpg"
    });

    expect(probeIsUsable(probe)).toBe(false);
    expect(probe.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "declared_type_mismatch",
      "extension_mismatch"
    ]);
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
