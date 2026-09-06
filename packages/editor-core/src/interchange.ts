import { PORTABLE_PROJECT_LIMITS } from "./resourceLimits";

export const INTERCHANGE_FORMAT_IDS = [
  "svg",
  "png",
  "jpeg",
  "webp",
  "tiff",
  "bmp",
  "gif",
  "avif",
  "heif",
  "pdf"
] as const;

export type InterchangeFormat = (typeof INTERCHANGE_FORMAT_IDS)[number];
export type InterchangeFidelity =
  "native-editable" | "appearance-snapshot" | "editable-with-losses" | "unsupported/refused";
export type InterchangeDiagnosticSeverity = "info" | "warning" | "error";

export interface InterchangeDiagnostic {
  code: string;
  severity: InterchangeDiagnosticSeverity;
  message: string;
}

export interface InterchangeDimensions {
  width: number;
  height: number;
}

export interface InterchangePhysicalResolution {
  x: number;
  y: number;
  unit: "dpi" | "dpcm" | "unknown";
}

export interface InterchangeProbe {
  format?: InterchangeFormat;
  signature?: string;
  declaredMimeType?: string;
  extension?: string;
  dimensions?: InterchangeDimensions;
  physicalResolution?: InterchangePhysicalResolution;
  frameCount?: number;
  pageCount?: number;
  animated?: boolean;
  diagnostics: InterchangeDiagnostic[];
}

export interface InterchangeSourceResource {
  name: string;
  mimeType: string;
  byteLength: number;
  sha256?: string;
  /** Optional bounded bytes for adapters that need source-level metadata. */
  bytes?: Uint8Array;
}

export interface InterchangeFidelityReport {
  format: InterchangeFormat | "unknown";
  status: InterchangeFidelity;
  sourceName: string;
  sourceMimeType: string;
  sourceBytes: number;
  checksum?: string;
  dimensions?: InterchangeDimensions;
  physicalResolution?: InterchangePhysicalResolution;
  mappedCount: number;
  flattenedCount: number;
  refusedCount: number;
  substitutions: string[];
  diagnostics: InterchangeDiagnostic[];
}

export interface InterchangeImportPreparation {
  source: InterchangeSourceResource;
  probe: InterchangeProbe;
  fidelity: InterchangeFidelityReport;
  /** Normalized content is intentionally not persisted until commit succeeds. */
  normalized?: Blob;
  normalizedMimeType?: string;
}

export interface InterchangeAdapterContext {
  signal?: AbortSignal;
  maxBytes: number;
}

export interface ImportAdapter<TSource = Blob> {
  readonly format: InterchangeFormat;
  readonly label: string;
  readonly mimeTypes: readonly string[];
  readonly extensions: readonly string[];
  probe(bytes: Uint8Array, source?: { mimeType?: string; name?: string }): InterchangeProbe;
  prepare(
    source: TSource,
    probe: InterchangeProbe,
    context: InterchangeAdapterContext
  ): Promise<InterchangeImportPreparation>;
}

export interface InterchangeExportResult {
  blob: Blob;
  report: InterchangeFidelityReport;
}

export interface ExportAdapter<TOptions = Record<string, unknown>> {
  readonly format: InterchangeFormat;
  readonly label: string;
  readonly extension: string;
  readonly mimeType: string;
  export(options: TOptions, context: { signal?: AbortSignal }): Promise<InterchangeExportResult>;
}

export interface InterchangeFormatDefinition {
  id: InterchangeFormat;
  label: string;
  mimeTypes: readonly string[];
  extensions: readonly string[];
  importable: boolean;
  exportable: boolean;
}

export const INTERCHANGE_FORMATS: readonly InterchangeFormatDefinition[] = [
  {
    id: "svg",
    label: "SVG",
    mimeTypes: ["image/svg+xml"],
    extensions: ["svg"],
    importable: true,
    exportable: true
  },
  {
    id: "png",
    label: "PNG",
    mimeTypes: ["image/png"],
    extensions: ["png"],
    importable: true,
    exportable: true
  },
  {
    id: "jpeg",
    label: "JPEG",
    mimeTypes: ["image/jpeg", "image/jpg"],
    extensions: ["jpg", "jpeg", "jpe"],
    importable: true,
    exportable: true
  },
  {
    id: "webp",
    label: "WebP",
    mimeTypes: ["image/webp"],
    extensions: ["webp"],
    importable: true,
    exportable: true
  },
  {
    id: "tiff",
    label: "TIFF",
    mimeTypes: ["image/tiff"],
    extensions: ["tif", "tiff"],
    importable: true,
    exportable: true
  },
  {
    id: "bmp",
    label: "BMP",
    mimeTypes: ["image/bmp", "image/x-ms-bmp"],
    extensions: ["bmp"],
    importable: true,
    exportable: true
  },
  {
    id: "gif",
    label: "GIF",
    mimeTypes: ["image/gif"],
    extensions: ["gif"],
    importable: true,
    exportable: false
  },
  {
    id: "avif",
    label: "AVIF",
    mimeTypes: ["image/avif"],
    extensions: ["avif"],
    importable: true,
    exportable: false
  },
  {
    id: "heif",
    label: "HEIF / HEIC",
    mimeTypes: ["image/heif", "image/heic"],
    extensions: ["heif", "heic"],
    importable: true,
    exportable: false
  },
  {
    id: "pdf",
    label: "PDF",
    mimeTypes: ["application/pdf"],
    extensions: ["pdf"],
    importable: false,
    exportable: true
  }
] as const;

export const INTERCHANGE_PROBE_READ_BYTES = Math.min(
  1_048_576,
  PORTABLE_PROJECT_LIMITS.maxDataUrlBytes
);

const formatById = new Map(INTERCHANGE_FORMATS.map((definition) => [definition.id, definition]));

function normalizeMimeType(value: string | undefined): string {
  return (value ?? "").split(";", 1)[0].trim().toLowerCase();
}

export function formatForMimeType(value: string | undefined): InterchangeFormat | undefined {
  const mimeType = normalizeMimeType(value);
  if (mimeType === "image/jpg") return "jpeg";
  return INTERCHANGE_FORMATS.find((definition) => definition.mimeTypes.includes(mimeType))?.id;
}

export function formatForExtension(value: string | undefined): InterchangeFormat | undefined {
  const extension = (value ?? "").toLowerCase().replace(/^\./, "");
  return INTERCHANGE_FORMATS.find((definition) => definition.extensions.includes(extension))?.id;
}

export function extensionForFormat(format: InterchangeFormat): string {
  return formatById.get(format)?.extensions[0] ?? format;
}

export function mimeTypeForFormat(format: InterchangeFormat): string {
  return formatById.get(format)?.mimeTypes[0] ?? "application/octet-stream";
}

export function interchangeFormatDefinition(
  format: InterchangeFormat
): InterchangeFormatDefinition {
  const definition = formatById.get(format);
  if (!definition) throw new Error(`Unknown interchange format: ${format}`);
  return definition;
}

function sameBytes(bytes: Uint8Array, offset: number, values: readonly number[]): boolean {
  return values.every((value, index) => bytes[offset + index] === value);
}

function readUint16BE(bytes: Uint8Array, offset: number): number | undefined {
  if (offset < 0 || offset + 2 > bytes.length) return undefined;
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint32BE(bytes: Uint8Array, offset: number): number | undefined {
  if (offset < 0 || offset + 4 > bytes.length) return undefined;
  return (
    bytes[offset] * 0x1000000 +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3]
  );
}

function readUint16LE(bytes: Uint8Array, offset: number): number | undefined {
  if (offset < 0 || offset + 2 > bytes.length) return undefined;
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint32LE(bytes: Uint8Array, offset: number): number | undefined {
  if (offset < 0 || offset + 4 > bytes.length) return undefined;
  return (
    bytes[offset] +
    bytes[offset + 1] * 0x100 +
    bytes[offset + 2] * 0x10000 +
    bytes[offset + 3] * 0x1000000
  );
}

function dimensions(
  width: number | undefined,
  height: number | undefined
): InterchangeDimensions | undefined {
  if (
    width === undefined ||
    height === undefined ||
    width <= 0 ||
    height <= 0 ||
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height)
  ) {
    return undefined;
  }
  return { width, height };
}

function probePng(bytes: Uint8Array): InterchangeDimensions | undefined {
  if (!sameBytes(bytes, 0, [137, 80, 78, 71, 13, 10, 26, 10])) return undefined;
  if (!sameBytes(bytes, 12, [73, 72, 68, 82])) return undefined;
  return dimensions(readUint32BE(bytes, 16), readUint32BE(bytes, 20));
}

function probeJpeg(bytes: Uint8Array): InterchangeDimensions | undefined {
  if (!sameBytes(bytes, 0, [0xff, 0xd8])) return undefined;
  let offset = 2;
  for (let segment = 0; segment < 1_024 && offset < bytes.length; segment += 1) {
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) return undefined;
    const marker = bytes[offset++];
    if (marker === 0x00 || marker === 0xd9 || marker === 0xda) return undefined;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const segmentLength = readUint16BE(bytes, offset);
    if (segmentLength === undefined || segmentLength < 2 || offset + segmentLength > bytes.length)
      return undefined;
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      if (segmentLength < 7) return undefined;
      return dimensions(readUint16BE(bytes, offset + 5), readUint16BE(bytes, offset + 3));
    }
    offset += segmentLength;
  }
  return undefined;
}

function probeWebp(bytes: Uint8Array): InterchangeDimensions | undefined {
  if (
    !sameBytes(bytes, 0, [0x52, 0x49, 0x46, 0x46]) ||
    !sameBytes(bytes, 8, [0x57, 0x45, 0x42, 0x50])
  )
    return undefined;
  let offset = 12;
  for (let chunk = 0; chunk < 1_024 && offset + 8 <= bytes.length; chunk += 1) {
    const type = String.fromCharCode(...bytes.slice(offset, offset + 4));
    const length = readUint32LE(bytes, offset + 4);
    if (length === undefined || offset + 8 + length > bytes.length) return undefined;
    const payload = offset + 8;
    if (type === "VP8X" && length >= 10) {
      const width =
        1 + (bytes[payload + 4] | (bytes[payload + 5] << 8) | (bytes[payload + 6] << 16));
      const height =
        1 + (bytes[payload + 7] | (bytes[payload + 8] << 8) | (bytes[payload + 9] << 16));
      return dimensions(width, height);
    }
    if (type === "VP8 " && length >= 10 && sameBytes(bytes, payload + 3, [0x9d, 0x01, 0x2a])) {
      const width = readUint16LE(bytes, payload + 6);
      const height = readUint16LE(bytes, payload + 8);
      return dimensions(
        width === undefined ? undefined : width & 0x3fff,
        height === undefined ? undefined : height & 0x3fff
      );
    }
    if (type === "VP8L" && length >= 5 && bytes[payload] === 0x2f) {
      const width = 1 + (bytes[payload + 1] | ((bytes[payload + 2] & 0x3f) << 8));
      const height =
        1 +
        ((bytes[payload + 2] >> 6) |
          (bytes[payload + 3] << 2) |
          ((bytes[payload + 4] & 0x0f) << 10));
      return dimensions(width, height);
    }
    offset += 8 + length + (length % 2);
  }
  return undefined;
}

function probeBmp(bytes: Uint8Array): InterchangeDimensions | undefined {
  if (!sameBytes(bytes, 0, [0x42, 0x4d])) return undefined;
  const dibSize = readUint32LE(bytes, 14);
  if (dibSize === undefined || dibSize < 12) return undefined;
  if (dibSize === 12) return dimensions(readUint16LE(bytes, 18), readUint16LE(bytes, 20));
  const width = readUint32LE(bytes, 18);
  const rawHeight = readUint32LE(bytes, 22);
  if (width === undefined || rawHeight === undefined) return undefined;
  return dimensions(width, rawHeight & 0x7fffffff);
}

function probeGif(
  bytes: Uint8Array
): { dimensions?: InterchangeDimensions; frameCount: number } | undefined {
  if (
    !sameBytes(bytes, 0, [0x47, 0x49, 0x46, 0x38]) ||
    (bytes[4] !== 0x37 && bytes[4] !== 0x39) ||
    bytes[5] !== 0x61
  ) {
    return undefined;
  }
  const width = readUint16LE(bytes, 6);
  const height = readUint16LE(bytes, 8);
  if (width === undefined || height === undefined || bytes.length < 13) return undefined;

  const globalPacked = bytes[10];
  let offset = 13;
  if (globalPacked & 0x80) {
    const tableLength = 3 * (1 << ((globalPacked & 0x07) + 1));
    if (offset + tableLength > bytes.length) return undefined;
    offset += tableLength;
  }

  const skipSubBlocks = (): number | undefined => {
    while (offset < bytes.length) {
      const length = bytes[offset++];
      if (length === 0) return offset;
      if (offset + length > bytes.length) return undefined;
      offset += length;
    }
    return undefined;
  };

  let frameCount = 0;
  let trailerFound = false;
  for (let block = 0; block < 1_024 && offset < bytes.length; block += 1) {
    const introducer = bytes[offset++];
    if (introducer === 0x3b) {
      trailerFound = true;
      break;
    }
    if (introducer === 0x21) {
      if (offset >= bytes.length) return undefined;
      offset += 1;
      if (skipSubBlocks() === undefined) return undefined;
      continue;
    }
    if (introducer !== 0x2c) return undefined;
    if (offset + 9 > bytes.length) return undefined;
    const imagePacked = bytes[offset + 8];
    offset += 9;
    if (imagePacked & 0x80) {
      const tableLength = 3 * (1 << ((imagePacked & 0x07) + 1));
      if (offset + tableLength > bytes.length) return undefined;
      offset += tableLength;
    }
    if (offset >= bytes.length) return undefined;
    offset += 1;
    if (skipSubBlocks() === undefined) return undefined;
    frameCount += 1;
  }
  if (!trailerFound) return undefined;
  return { dimensions: dimensions(width, height), frameCount };
}

interface TiffLayout {
  littleEndian: boolean;
  ifdOffset: number;
}

function tiffLayout(bytes: Uint8Array): TiffLayout | undefined {
  if (sameBytes(bytes, 0, [0x49, 0x49, 0x2a, 0x00])) {
    const ifdOffset = readUint32LE(bytes, 4);
    return ifdOffset === undefined ? undefined : { littleEndian: true, ifdOffset };
  }
  if (sameBytes(bytes, 0, [0x4d, 0x4d, 0x00, 0x2a])) {
    const ifdOffset = readUint32BE(bytes, 4);
    return ifdOffset === undefined ? undefined : { littleEndian: false, ifdOffset };
  }
  return undefined;
}

function tiffRead16(bytes: Uint8Array, offset: number, littleEndian: boolean): number | undefined {
  return littleEndian ? readUint16LE(bytes, offset) : readUint16BE(bytes, offset);
}

function tiffRead32(bytes: Uint8Array, offset: number, littleEndian: boolean): number | undefined {
  return littleEndian ? readUint32LE(bytes, offset) : readUint32BE(bytes, offset);
}

function probeTiff(bytes: Uint8Array):
  | {
      dimensions?: InterchangeDimensions;
      pageCount: number;
      physicalResolution?: InterchangePhysicalResolution;
    }
  | undefined {
  const layout = tiffLayout(bytes);
  if (!layout) return undefined;
  let ifdOffset = layout.ifdOffset;
  let pageCount = 0;
  let width: number | undefined;
  let height: number | undefined;
  let xResolution: number | undefined;
  let yResolution: number | undefined;
  let resolutionUnit: number | undefined;
  for (let page = 0; page < 64 && ifdOffset > 0; page += 1) {
    const count = tiffRead16(bytes, ifdOffset, layout.littleEndian);
    if (count === undefined || count > 512) return undefined;
    pageCount += 1;
    const entryOffset = ifdOffset + 2;
    for (let index = 0; index < count; index += 1) {
      const offset = entryOffset + index * 12;
      const tag = tiffRead16(bytes, offset, layout.littleEndian);
      const type = tiffRead16(bytes, offset + 2, layout.littleEndian);
      const valueCount = tiffRead32(bytes, offset + 4, layout.littleEndian);
      if (tag === undefined || type === undefined || valueCount === undefined) return undefined;
      const typeSize =
        type === 1 || type === 2 || type === 6 || type === 7
          ? 1
          : type === 3 || type === 8
            ? 2
            : type === 5 || type === 10
              ? 8
              : 4;
      const valueBytes = typeSize * valueCount;
      const valueOffset =
        valueBytes <= 4 ? offset + 8 : tiffRead32(bytes, offset + 8, layout.littleEndian);
      if (valueOffset === undefined || valueOffset + valueBytes > bytes.length) return undefined;
      const first =
        type === 3
          ? tiffRead16(bytes, valueOffset, layout.littleEndian)
          : type === 4
            ? tiffRead32(bytes, valueOffset, layout.littleEndian)
            : undefined;
      if (page === 0 && tag === 256) width = first;
      else if (page === 0 && tag === 257) height = first;
      else if (page === 0 && tag === 296) resolutionUnit = first;
      else if (page === 0 && (tag === 282 || tag === 283)) {
        const numerator = tiffRead32(bytes, valueOffset, layout.littleEndian);
        const denominator = tiffRead32(bytes, valueOffset + 4, layout.littleEndian);
        if (numerator !== undefined && denominator) {
          if (tag === 282) xResolution = numerator / denominator;
          else yResolution = numerator / denominator;
        }
      }
    }
    const nextOffset = entryOffset + count * 12;
    if (nextOffset + 4 > bytes.length) return undefined;
    ifdOffset = tiffRead32(bytes, nextOffset, layout.littleEndian) ?? 0;
  }
  const unit = resolutionUnit === 3 ? "dpcm" : resolutionUnit === 2 ? "dpi" : "unknown";
  return {
    dimensions: dimensions(width, height),
    pageCount,
    ...(xResolution && yResolution
      ? { physicalResolution: { x: xResolution, y: yResolution, unit } }
      : {})
  };
}

function probeSvg(bytes: Uint8Array): boolean {
  const text = new TextDecoder().decode(bytes.slice(0, Math.min(bytes.length, 16_384)));
  return /^\s*(?:<\?xml[^>]*>\s*)?(?:<!--[^]*?-->\s*)*<svg(?:\s|>)/i.test(text);
}

function probeFtyp(bytes: Uint8Array): InterchangeFormat | undefined {
  if (!sameBytes(bytes, 4, [0x66, 0x74, 0x79, 0x70])) return undefined;
  const brand = String.fromCharCode(...bytes.slice(8, 12)).toLowerCase();
  if (["avif", "avis"].includes(brand)) return "avif";
  if (["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(brand)) return "heif";
  return undefined;
}

function formatFromSignature(bytes: Uint8Array): {
  format?: InterchangeFormat;
  signature?: string;
} {
  if (probeSvg(bytes)) return { format: "svg", signature: "svg" };
  if (sameBytes(bytes, 0, [137, 80, 78, 71, 13, 10, 26, 10]))
    return { format: "png", signature: "png" };
  if (sameBytes(bytes, 0, [0xff, 0xd8])) return { format: "jpeg", signature: "jpeg" };
  if (
    sameBytes(bytes, 0, [0x52, 0x49, 0x46, 0x46]) &&
    sameBytes(bytes, 8, [0x57, 0x45, 0x42, 0x50])
  )
    return { format: "webp", signature: "webp" };
  if (sameBytes(bytes, 0, [0x42, 0x4d])) return { format: "bmp", signature: "bmp" };
  if (sameBytes(bytes, 0, [0x47, 0x49, 0x46, 0x38])) return { format: "gif", signature: "gif" };
  if (tiffLayout(bytes)) return { format: "tiff", signature: "tiff" };
  if (sameBytes(bytes, 0, [0x25, 0x50, 0x44, 0x46, 0x2d]))
    return { format: "pdf", signature: "pdf" };
  const ftyp = probeFtyp(bytes);
  return ftyp ? { format: ftyp, signature: ftyp } : {};
}

export function probeInterchangeBytes(
  bytes: Uint8Array,
  source: { mimeType?: string; name?: string; byteLength?: number } = {}
): InterchangeProbe {
  const declaredMimeType = normalizeMimeType(source.mimeType);
  const extension = source.name?.toLowerCase().split(".").at(-1) || undefined;
  const signature = formatFromSignature(bytes);
  const declaredFormat = formatForMimeType(declaredMimeType);
  const extensionFormat = formatForExtension(extension);
  const diagnostics: InterchangeDiagnostic[] = [];
  if (!signature.format) {
    diagnostics.push({
      code: "signature_unrecognized",
      severity: "error",
      message: "The file signature is not a supported interchange format."
    });
  }
  if (signature.format && declaredFormat && signature.format !== declaredFormat) {
    diagnostics.push({
      code: "declared_type_mismatch",
      severity: "warning",
      message: `The declared MIME type ${declaredMimeType} does not match the detected ${signature.format} signature.`
    });
  }
  if (signature.format && extensionFormat && signature.format !== extensionFormat) {
    diagnostics.push({
      code: "extension_mismatch",
      severity: "warning",
      message: `The .${extension} extension does not match the detected ${signature.format} signature.`
    });
  }
  if (
    signature.format === "svg" &&
    (source.byteLength ?? bytes.length) > INTERCHANGE_PROBE_READ_BYTES
  ) {
    diagnostics.push({
      code: "probe_truncated",
      severity: "error",
      message: "The SVG header exceeds the bounded probe window."
    });
  }
  let parsedDimensions: InterchangeDimensions | undefined;
  let physicalResolution: InterchangePhysicalResolution | undefined;
  let frameCount: number | undefined;
  let pageCount: number | undefined;
  if (signature.format === "png") parsedDimensions = probePng(bytes);
  else if (signature.format === "jpeg") parsedDimensions = probeJpeg(bytes);
  else if (signature.format === "webp") parsedDimensions = probeWebp(bytes);
  else if (signature.format === "bmp") parsedDimensions = probeBmp(bytes);
  else if (signature.format === "gif") {
    const gif = probeGif(bytes);
    parsedDimensions = gif?.dimensions;
    frameCount = gif?.frameCount;
  } else if (signature.format === "tiff") {
    const tiff = probeTiff(bytes);
    parsedDimensions = tiff?.dimensions;
    pageCount = tiff?.pageCount;
    physicalResolution = tiff?.physicalResolution;
  }
  if (
    signature.format &&
    ["png", "jpeg", "webp", "bmp", "gif", "tiff"].includes(signature.format) &&
    !parsedDimensions
  ) {
    diagnostics.push({
      code: "header_malformed",
      severity: "error",
      message: `The ${signature.format.toUpperCase()} header is incomplete or malformed.`
    });
  }
  if (signature.format === "gif" && frameCount === 0) {
    diagnostics.push({
      code: "frame_missing",
      severity: "error",
      message: "The GIF does not contain a decodable image frame."
    });
  }
  if (signature.format === "tiff" && pageCount === 1) {
    // The current bounded probe intentionally reports the first IFD only. A decoder may refine it.
    pageCount = 1;
  }
  return {
    ...(signature.format ? { format: signature.format } : {}),
    ...(signature.signature ? { signature: signature.signature } : {}),
    ...(declaredMimeType ? { declaredMimeType } : {}),
    ...(extension ? { extension } : {}),
    ...(parsedDimensions ? { dimensions: parsedDimensions } : {}),
    ...(physicalResolution ? { physicalResolution } : {}),
    ...(frameCount !== undefined ? { frameCount, animated: frameCount > 1 } : {}),
    ...(pageCount !== undefined ? { pageCount } : {}),
    diagnostics
  };
}

export function probeIsUsable(probe: InterchangeProbe): boolean {
  return (
    Boolean(probe.format) &&
    !probe.diagnostics.some((diagnostic) => diagnostic.severity === "error")
  );
}

export function fidelityForFormat(format: InterchangeFormat | undefined): InterchangeFidelity {
  if (!format) return "unsupported/refused";
  if (format === "svg") return "native-editable";
  if (format === "avif" || format === "heif" || format === "pdf") return "unsupported/refused";
  if (format === "tiff" || format === "bmp" || format === "gif") return "editable-with-losses";
  return "appearance-snapshot";
}

export function createFidelityReport(args: {
  source: InterchangeSourceResource;
  probe: InterchangeProbe;
  checksum?: string;
  diagnostics?: InterchangeDiagnostic[];
  physicalResolution?: InterchangePhysicalResolution;
  substitutions?: string[];
  mappedCount?: number;
  flattenedCount?: number;
  refusedCount?: number;
  status?: InterchangeFidelity;
}): InterchangeFidelityReport {
  const diagnostics = [...args.probe.diagnostics, ...(args.diagnostics ?? [])];
  const hasErrors = diagnostics.some((diagnostic) => diagnostic.severity === "error");
  const status =
    args.status ?? (hasErrors ? "unsupported/refused" : fidelityForFormat(args.probe.format));
  return {
    format: args.probe.format ?? "unknown",
    status,
    sourceName: args.source.name,
    sourceMimeType: args.source.mimeType,
    sourceBytes: args.source.byteLength,
    ...(args.checksum ? { checksum: args.checksum } : {}),
    ...(args.probe.dimensions ? { dimensions: args.probe.dimensions } : {}),
    ...((args.physicalResolution ?? args.probe.physicalResolution)
      ? { physicalResolution: args.physicalResolution ?? args.probe.physicalResolution }
      : {}),
    mappedCount: args.mappedCount ?? (hasErrors ? 0 : 1),
    flattenedCount: args.flattenedCount ?? (status === "appearance-snapshot" ? 1 : 0),
    refusedCount: args.refusedCount ?? (hasErrors || status === "unsupported/refused" ? 1 : 0),
    substitutions: [...(args.substitutions ?? [])],
    diagnostics
  };
}

export function importAcceptAttribute(): string {
  return INTERCHANGE_FORMATS.filter((definition) => definition.importable)
    .flatMap((definition) => [
      ...definition.mimeTypes,
      ...definition.extensions.map((extension) => `.${extension}`)
    ])
    .join(",");
}

export function exportableInterchangeFormats(): readonly InterchangeFormatDefinition[] {
  return INTERCHANGE_FORMATS.filter((definition) => definition.exportable);
}

export function importableInterchangeFormats(): readonly InterchangeFormatDefinition[] {
  return INTERCHANGE_FORMATS.filter((definition) => definition.importable);
}
