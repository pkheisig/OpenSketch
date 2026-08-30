import { PORTABLE_PROJECT_LIMITS } from "./resourceLimits";

export const SUPPORTED_IMAGE_MIME_TYPES = [
  "image/svg+xml",
  "image/png",
  "image/jpeg",
  "image/webp"
] as const;

export const SUPPORTED_RASTER_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

export const RASTER_HEADER_READ_BYTES = 1024 * 1024;

export type SupportedRasterMimeType = (typeof SUPPORTED_RASTER_MIME_TYPES)[number];

export interface ParsedImageDataUrl {
  mimeType: string;
  payload: string;
  base64: boolean;
}

export interface RasterInspection {
  mimeType: SupportedRasterMimeType;
  width: number;
  height: number;
  pixels: number;
}

export function isSupportedImageMimeType(value: string): boolean {
  return (SUPPORTED_IMAGE_MIME_TYPES as readonly string[]).includes(value.toLowerCase());
}

export function isSupportedRasterMimeType(value: string): value is SupportedRasterMimeType {
  return (SUPPORTED_RASTER_MIME_TYPES as readonly string[]).includes(value.toLowerCase());
}

export function parseImageDataUrl(value: string): ParsedImageDataUrl | undefined {
  const match =
    /^data:(image\/(?:svg\+xml|png|jpeg|webp))(?:;charset=[A-Za-z0-9._-]+)?(;base64)?,([\s\S]*)$/i.exec(
      value
    );
  if (!match) return undefined;
  return {
    mimeType: match[1].toLowerCase(),
    base64: Boolean(match[2]),
    payload: match[3]
  };
}

export function imageDataUrlByteLength(parsed: ParsedImageDataUrl): number {
  if (!parsed.base64) {
    try {
      return new TextEncoder().encode(decodeURIComponent(parsed.payload)).byteLength;
    } catch {
      return Number.POSITIVE_INFINITY;
    }
  }
  const unpaddedLength = normalizedBase64Payload(parsed).replace(/=+$/, "").length;
  return Math.floor((unpaddedLength * 3) / 4);
}

function normalizedBase64Payload(parsed: ParsedImageDataUrl): string {
  return parsed.payload.replace(/[\t\n\f\r ]+/g, "");
}

export function decodeImageDataUrlBytes(
  parsed: ParsedImageDataUrl,
  maxBytes = Number.POSITIVE_INFINITY
): Uint8Array | undefined {
  if (!parsed.base64) {
    try {
      const bytes = new TextEncoder().encode(decodeURIComponent(parsed.payload));
      return Number.isFinite(maxBytes) ? bytes.slice(0, maxBytes) : bytes;
    } catch {
      return undefined;
    }
  }
  try {
    const payload = normalizedBase64Payload(parsed);
    const boundedPayload = Number.isFinite(maxBytes)
      ? payload.slice(0, Math.ceil(maxBytes / 3) * 4)
      : payload;
    const binary = atob(boundedPayload);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return Number.isFinite(maxBytes) ? bytes.slice(0, maxBytes) : bytes;
  } catch {
    return undefined;
  }
}

export function decodeImageDataUrlText(parsed: ParsedImageDataUrl): string | undefined {
  const bytes = decodeImageDataUrlBytes(parsed);
  return bytes === undefined ? undefined : new TextDecoder().decode(bytes);
}

function readUint16BE(bytes: Uint8Array, offset: number): number | undefined {
  if (offset + 2 > bytes.length) return undefined;
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint32BE(bytes: Uint8Array, offset: number): number | undefined {
  if (offset + 4 > bytes.length) return undefined;
  return (
    bytes[offset] * 0x1000000 +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3]
  );
}

function readUint16LE(bytes: Uint8Array, offset: number): number | undefined {
  if (offset + 2 > bytes.length) return undefined;
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint24LE(bytes: Uint8Array, offset: number): number | undefined {
  if (offset + 3 > bytes.length) return undefined;
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function readUint32LE(bytes: Uint8Array, offset: number): number | undefined {
  if (offset + 4 > bytes.length) return undefined;
  return (
    bytes[offset] +
    bytes[offset + 1] * 0x100 +
    bytes[offset + 2] * 0x10000 +
    bytes[offset + 3] * 0x1000000
  );
}

function rasterDimensions(
  bytes: Uint8Array,
  mimeType: SupportedRasterMimeType
): { width: number; height: number } | undefined {
  if (mimeType === "image/png") {
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (
      bytes.length < 24 ||
      !signature.every((byte, index) => bytes[index] === byte) ||
      bytes[12] !== 73 ||
      bytes[13] !== 72 ||
      bytes[14] !== 68 ||
      bytes[15] !== 82
    ) {
      return undefined;
    }
    const width = readUint32BE(bytes, 16);
    const height = readUint32BE(bytes, 20);
    return width === undefined || height === undefined ? undefined : { width, height };
  }

  if (mimeType === "image/jpeg") {
    if (bytes.length < 2 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined;
    let offset = 2;
    for (let segment = 0; segment < 1_024 && offset < bytes.length; segment += 1) {
      while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
      if (offset >= bytes.length) return undefined;
      const marker = bytes[offset];
      offset += 1;
      if (marker === 0x00 || marker === 0xd9 || marker === 0xda) return undefined;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      const segmentLength = readUint16BE(bytes, offset);
      if (segmentLength === undefined || segmentLength < 2) return undefined;
      if (offset + segmentLength > bytes.length) return undefined;
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        if (segmentLength < 7) return undefined;
        const height = readUint16BE(bytes, offset + 3);
        const width = readUint16BE(bytes, offset + 5);
        return width === undefined || height === undefined ? undefined : { width, height };
      }
      offset += segmentLength;
    }
    return undefined;
  }

  if (
    bytes.length < 12 ||
    bytes[0] !== 0x52 ||
    bytes[1] !== 0x49 ||
    bytes[2] !== 0x46 ||
    bytes[3] !== 0x46 ||
    bytes[8] !== 0x57 ||
    bytes[9] !== 0x45 ||
    bytes[10] !== 0x42 ||
    bytes[11] !== 0x50
  ) {
    return undefined;
  }
  let offset = 12;
  for (let chunk = 0; chunk < 1_024 && offset + 8 <= bytes.length; chunk += 1) {
    const chunkType = String.fromCharCode(
      bytes[offset],
      bytes[offset + 1],
      bytes[offset + 2],
      bytes[offset + 3]
    );
    const chunkLength = readUint32LE(bytes, offset + 4);
    if (chunkLength === undefined || offset + 8 + chunkLength > bytes.length) return undefined;
    const payload = offset + 8;
    if (chunkType === "VP8X" && chunkLength >= 10) {
      const widthMinusOne = readUint24LE(bytes, payload + 4);
      const heightMinusOne = readUint24LE(bytes, payload + 7);
      if (widthMinusOne === undefined || heightMinusOne === undefined) return undefined;
      return { width: widthMinusOne + 1, height: heightMinusOne + 1 };
    }
    if (chunkType === "VP8 " && chunkLength >= 10) {
      if (
        bytes[payload + 3] !== 0x9d ||
        bytes[payload + 4] !== 0x01 ||
        bytes[payload + 5] !== 0x2a
      ) {
        return undefined;
      }
      const width = readUint16LE(bytes, payload + 6);
      const height = readUint16LE(bytes, payload + 8);
      if (width === undefined || height === undefined) return undefined;
      return { width: width & 0x3fff, height: height & 0x3fff };
    }
    if (chunkType === "VP8L" && chunkLength >= 5 && bytes[payload] === 0x2f) {
      const width = 1 + (bytes[payload + 1] | ((bytes[payload + 2] & 0x3f) << 8));
      const height =
        1 +
        ((bytes[payload + 2] >> 6) |
          (bytes[payload + 3] << 2) |
          ((bytes[payload + 4] & 0x0f) << 10));
      return { width, height };
    }
    offset += 8 + chunkLength + (chunkLength % 2);
  }
  return undefined;
}

export function sniffRasterMimeType(bytes: Uint8Array): SupportedRasterMimeType | undefined {
  if (
    bytes.length >= 8 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)
  ) {
    return "image/png";
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return undefined;
}

export function inspectRasterBytes(bytes: Uint8Array): RasterInspection | undefined {
  const mimeType = sniffRasterMimeType(bytes);
  if (!mimeType) return undefined;
  const dimensions = rasterDimensions(bytes, mimeType);
  if (
    !dimensions ||
    dimensions.width <= 0 ||
    dimensions.height <= 0 ||
    !Number.isSafeInteger(dimensions.width) ||
    !Number.isSafeInteger(dimensions.height)
  ) {
    return undefined;
  }
  const pixels = dimensions.width * dimensions.height;
  if (!Number.isSafeInteger(pixels)) return undefined;
  return { mimeType, ...dimensions, pixels };
}

export async function inspectRasterBlob(blob: Blob): Promise<RasterInspection | undefined> {
  const boundedBlob = blob.slice(0, Math.min(blob.size, RASTER_HEADER_READ_BYTES));
  const buffer =
    typeof boundedBlob.arrayBuffer === "function"
      ? await boundedBlob.arrayBuffer()
      : await new Promise<ArrayBuffer>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as ArrayBuffer);
          reader.onerror = () => reject(reader.error);
          reader.readAsArrayBuffer(boundedBlob);
        });
  const header = new Uint8Array(buffer);
  return inspectRasterBytes(header);
}

export function inspectRasterDataUrl(
  value: string,
  expectedMimeType?: string
): RasterInspection | undefined {
  const parsed = parseImageDataUrl(value);
  if (!parsed || !isSupportedRasterMimeType(parsed.mimeType)) return undefined;
  if (expectedMimeType && parsed.mimeType !== expectedMimeType.toLowerCase()) return undefined;
  if (
    parsed.base64 &&
    (() => {
      const payload = normalizedBase64Payload(parsed);
      return payload.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(payload);
    })()
  ) {
    return undefined;
  }
  const bytes = decodeImageDataUrlBytes(parsed, RASTER_HEADER_READ_BYTES);
  const inspection = bytes === undefined ? undefined : inspectRasterBytes(bytes);
  return inspection?.mimeType === parsed.mimeType ? inspection : undefined;
}

export function rasterFitsLimits(
  inspection: Pick<RasterInspection, "width" | "height" | "pixels">,
  existingPixels = 0
): boolean {
  return (
    inspection.width <= PORTABLE_PROJECT_LIMITS.maxRasterDimension &&
    inspection.height <= PORTABLE_PROJECT_LIMITS.maxRasterDimension &&
    inspection.pixels <= PORTABLE_PROJECT_LIMITS.maxRasterArea &&
    existingPixels <= PORTABLE_PROJECT_LIMITS.maxTotalRasterArea - inspection.pixels
  );
}

export function rasterLimitMessage(
  inspection: Pick<RasterInspection, "width" | "height" | "pixels">,
  existingPixels = 0
): string | undefined {
  if (
    inspection.width > PORTABLE_PROJECT_LIMITS.maxRasterDimension ||
    inspection.height > PORTABLE_PROJECT_LIMITS.maxRasterDimension
  ) {
    return `Image dimensions ${inspection.width} × ${inspection.height} exceed the supported ${PORTABLE_PROJECT_LIMITS.maxRasterDimension.toLocaleString()} px per-side limit.`;
  }
  if (inspection.pixels > PORTABLE_PROJECT_LIMITS.maxRasterArea) {
    return `Image dimensions ${inspection.width} × ${inspection.height} exceed the supported ${PORTABLE_PROJECT_LIMITS.maxRasterArea.toLocaleString()} pixel area limit.`;
  }
  if (existingPixels > PORTABLE_PROJECT_LIMITS.maxTotalRasterArea - inspection.pixels) {
    return "Adding this image would exceed the document's decoded raster area budget.";
  }
  return undefined;
}
