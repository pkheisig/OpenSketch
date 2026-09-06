const JPEG_SOI = [0xff, 0xd8] as const;
const JFIF_IDENTIFIER = [0x4a, 0x46, 0x49, 0x46, 0x00] as const;

function readBlob(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

function isJfif(source: Uint8Array, offset: number): boolean {
  return (
    offset + 16 <= source.length &&
    JFIF_IDENTIFIER.every((value, index) => source[offset + 4 + index] === value)
  );
}

function findJfifSegment(source: Uint8Array): number | undefined {
  let offset = 2;
  while (offset + 4 <= source.length && source[offset] === 0xff) {
    const marker = source[offset + 1];
    if (marker === 0xda || marker === 0xd9) return undefined;
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = new DataView(source.buffer, source.byteOffset + offset + 2, 2).getUint16(0);
    if (length < 2 || offset + 2 + length > source.length) return undefined;
    if (marker === 0xe0 && length >= 16 && isJfif(source, offset)) return offset;
    offset += 2 + length;
  }
  return undefined;
}

function density(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("JPEG output DPI must be finite and positive.");
  }
  return Math.max(1, Math.min(65_535, Math.round(value)));
}

export async function setJpegDpi(blob: Blob, dpi: number): Promise<Blob> {
  const source = new Uint8Array(await readBlob(blob));
  if (source.length < 2 || source[0] !== JPEG_SOI[0] || source[1] !== JPEG_SOI[1]) {
    throw new Error("The raster export is not a valid JPEG.");
  }
  const pixelsPerInch = density(dpi);
  const segment = findJfifSegment(source);
  if (segment !== undefined) {
    const output = source.slice();
    output[segment + 11] = 1;
    new DataView(output.buffer).setUint16(segment + 12, pixelsPerInch);
    new DataView(output.buffer).setUint16(segment + 14, pixelsPerInch);
    return new Blob([output], { type: "image/jpeg" });
  }

  const app0 = new Uint8Array(18);
  app0.set([0xff, 0xe0, 0x00, 0x10], 0);
  app0.set(JFIF_IDENTIFIER, 4);
  app0[9] = 1;
  app0[10] = 1;
  app0[11] = 1;
  new DataView(app0.buffer).setUint16(12, pixelsPerInch);
  new DataView(app0.buffer).setUint16(14, pixelsPerInch);
  const output = new Uint8Array(source.length + app0.length);
  output.set(source.subarray(0, 2), 0);
  output.set(app0, 2);
  output.set(source.subarray(2), 2 + app0.length);
  return new Blob([output], { type: "image/jpeg" });
}
