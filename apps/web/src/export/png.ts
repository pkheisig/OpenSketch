const PNG_SIGNATURE_LENGTH = 8;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function uint32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value);
  return bytes;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const result = new Uint8Array(12 + data.length);
  result.set(uint32(data.length), 0);
  result.set(typeBytes, 4);
  result.set(data, 8);
  result.set(uint32(crc32(result.subarray(4, 8 + data.length))), 8 + data.length);
  return result;
}

function readBlob(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

export async function setPngDpi(blob: Blob, dpi: number): Promise<Blob> {
  const source = new Uint8Array(await readBlob(blob));
  if (
    source.length < PNG_SIGNATURE_LENGTH ||
    !PNG_SIGNATURE.every((value, index) => source[index] === value)
  ) {
    throw new Error("The raster export is not a valid PNG.");
  }

  const pixelsPerMeter = Math.round(dpi / 0.0254);
  const physical = new Uint8Array(9);
  const physicalView = new DataView(physical.buffer);
  physicalView.setUint32(0, pixelsPerMeter);
  physicalView.setUint32(4, pixelsPerMeter);
  physical[8] = 1;
  const physicalChunk = chunk("pHYs", physical);

  const parts: Uint8Array[] = [source.subarray(0, PNG_SIGNATURE_LENGTH)];
  let offset = PNG_SIGNATURE_LENGTH;
  let inserted = false;
  while (offset + 12 <= source.length) {
    const length = new DataView(source.buffer, source.byteOffset + offset, 4).getUint32(0);
    const end = offset + 12 + length;
    if (end > source.length) throw new Error("The raster export contains a truncated PNG chunk.");
    const type = new TextDecoder().decode(source.subarray(offset + 4, offset + 8));
    if (type !== "pHYs") parts.push(source.subarray(offset, end));
    if (type === "IHDR" && !inserted) {
      parts.push(physicalChunk);
      inserted = true;
    }
    offset = end;
  }
  if (!inserted) throw new Error("The raster export has no PNG header chunk.");

  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(size);
  let outputOffset = 0;
  for (const part of parts) {
    output.set(part, outputOffset);
    outputOffset += part.length;
  }
  return new Blob([output], { type: "image/png" });
}
