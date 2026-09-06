import {
  INTERCHANGE_PROBE_READ_BYTES,
  PORTABLE_PROJECT_LIMITS,
  createFidelityReport,
  mimeTypeForFormat,
  probeInterchangeBytes,
  probeIsUsable,
  type InterchangeDiagnostic,
  type InterchangeFidelityReport,
  type InterchangeFormat,
  type InterchangeImportPreparation,
  type InterchangePhysicalResolution,
  type InterchangeProbe,
  type InterchangeSourceResource
} from "@workspace/editor-core";

export interface RgbaRaster {
  width: number;
  height: number;
  data: Uint8Array;
  physicalResolution?: InterchangePhysicalResolution;
  sourceBitDepth?: number;
}

export class InterchangeImportError extends Error {
  readonly code: string;
  readonly probe?: InterchangeProbe;
  readonly report?: InterchangeFidelityReport;

  constructor(
    message: string,
    options: { code: string; probe?: InterchangeProbe; report?: InterchangeFidelityReport }
  ) {
    super(message);
    this.name = "InterchangeImportError";
    this.code = options.code;
    this.probe = options.probe;
    this.report = options.report;
  }
}

function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted)
    throw new InterchangeImportError("The import was canceled.", { code: "canceled" });
}

function readU16(view: DataView, offset: number, littleEndian: boolean): number {
  return view.getUint16(offset, littleEndian);
}

function readU32(view: DataView, offset: number, littleEndian: boolean): number {
  return view.getUint32(offset, littleEndian);
}

function readI32(view: DataView, offset: number, littleEndian: boolean): number {
  return view.getInt32(offset, littleEndian);
}

function assertRasterDimensions(width: number, height: number): void {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width > PORTABLE_PROJECT_LIMITS.maxRasterDimension ||
    height > PORTABLE_PROJECT_LIMITS.maxRasterDimension ||
    width * height > PORTABLE_PROJECT_LIMITS.maxRasterArea
  ) {
    throw new InterchangeImportError("The raster dimensions exceed the supported import budget.", {
      code: "raster_limit"
    });
  }
}

function assertRasterPayload(raster: RgbaRaster): void {
  assertRasterDimensions(raster.width, raster.height);
  if (raster.data.byteLength !== raster.width * raster.height * 4) {
    throw new InterchangeImportError("The raster pixel payload is invalid.", {
      code: "raster_payload"
    });
  }
}

function pixelsPerMeter(value: number | undefined, unit: "dpi" | "dpcm" | "unknown"): number {
  if (!value || !Number.isFinite(value) || value <= 0) return 2835;
  if (unit === "dpcm") return Math.round(value * 100);
  if (unit === "dpi") return Math.round(value * 39.37007874);
  return 2835;
}

function setU16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, true);
}

function setU32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value, true);
}

export function encodeBmpRgba(raster: RgbaRaster): Uint8Array {
  assertRasterPayload(raster);
  const rowBytes = raster.width * 4;
  const imageBytes = rowBytes * raster.height;
  const dibHeaderBytes = 108;
  const pixelOffset = 14 + dibHeaderBytes;
  const bytes = new Uint8Array(pixelOffset + imageBytes);
  const view = new DataView(bytes.buffer);
  bytes.set([0x42, 0x4d]);
  setU32(view, 2, bytes.byteLength);
  setU32(view, 10, pixelOffset);
  setU32(view, 14, dibHeaderBytes);
  view.setInt32(18, raster.width, true);
  view.setInt32(22, raster.height, true);
  setU16(view, 26, 1);
  setU16(view, 28, 32);
  setU32(view, 30, 3);
  setU32(view, 34, imageBytes);
  const resolutionUnit = raster.physicalResolution?.unit ?? "unknown";
  setU32(view, 38, pixelsPerMeter(raster.physicalResolution?.x, resolutionUnit));
  setU32(view, 42, pixelsPerMeter(raster.physicalResolution?.y, resolutionUnit));
  setU32(view, 54, 0x00ff0000);
  setU32(view, 58, 0x0000ff00);
  setU32(view, 62, 0x000000ff);
  setU32(view, 66, 0xff000000);
  for (let y = 0; y < raster.height; y += 1) {
    const sourceRow = raster.height - 1 - y;
    const sourceOffset = sourceRow * rowBytes;
    const targetOffset = pixelOffset + y * rowBytes;
    for (let x = 0; x < raster.width; x += 1) {
      const source = sourceOffset + x * 4;
      const target = targetOffset + x * 4;
      bytes[target] = raster.data[source + 2];
      bytes[target + 1] = raster.data[source + 1];
      bytes[target + 2] = raster.data[source];
      bytes[target + 3] = raster.data[source + 3];
    }
  }
  return bytes;
}

export function decodeBmpRgba(bytes: Uint8Array): RgbaRaster {
  if (bytes.length < 54 || bytes[0] !== 0x42 || bytes[1] !== 0x4d)
    throw new InterchangeImportError("The BMP header is invalid.", { code: "bmp_header" });
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const pixelOffset = readU32(view, 10, true);
  const dibSize = readU32(view, 14, true);
  if (dibSize < 40 || 14 + dibSize > bytes.length || pixelOffset >= bytes.length) {
    throw new InterchangeImportError("The BMP DIB header is unsupported.", { code: "bmp_header" });
  }
  const width = readI32(view, 18, true);
  const rawHeight = readI32(view, 22, true);
  const planes = readU16(view, 26, true);
  const bitsPerPixel = readU16(view, 28, true);
  const compression = readU32(view, 30, true);
  const hasBgraMasks =
    dibSize >= 108 &&
    readU32(view, 54, true) === 0x00ff0000 &&
    readU32(view, 58, true) === 0x0000ff00 &&
    readU32(view, 62, true) === 0x000000ff &&
    readU32(view, 66, true) === 0xff000000;
  if (
    width <= 0 ||
    rawHeight === 0 ||
    planes !== 1 ||
    ![24, 32].includes(bitsPerPixel) ||
    (compression !== 0 && !(compression === 3 && bitsPerPixel === 32 && hasBgraMasks))
  ) {
    throw new InterchangeImportError(
      "Only uncompressed 24-bit and 32-bit BMP files are supported.",
      {
        code: "bmp_encoding"
      }
    );
  }
  const height = Math.abs(rawHeight);
  const alphaDefined = bitsPerPixel === 32 && (dibSize >= 108 || hasBgraMasks);
  assertRasterDimensions(width, height);
  const rowBytes = Math.ceil((width * (bitsPerPixel / 8)) / 4) * 4;
  if (pixelOffset + rowBytes * height > bytes.length) {
    throw new InterchangeImportError("The BMP pixel payload is truncated.", {
      code: "bmp_payload"
    });
  }
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const sourceRow = rawHeight > 0 ? height - 1 - y : y;
    const sourceOffset = pixelOffset + sourceRow * rowBytes;
    for (let x = 0; x < width; x += 1) {
      const source = sourceOffset + x * (bitsPerPixel / 8);
      const target = (y * width + x) * 4;
      data[target] = bytes[source + 2];
      data[target + 1] = bytes[source + 1];
      data[target + 2] = bytes[source];
      data[target + 3] = alphaDefined ? bytes[source + 3] : 255;
    }
  }
  const xPixelsPerMeter = readU32(view, 38, true);
  const yPixelsPerMeter = readU32(view, 42, true);
  return {
    width,
    height,
    data,
    ...(xPixelsPerMeter > 0 && yPixelsPerMeter > 0
      ? {
          physicalResolution: {
            x: xPixelsPerMeter / 39.37007874,
            y: yPixelsPerMeter / 39.37007874,
            unit: "dpi" as const
          }
        }
      : {})
  };
}

function scaleTiffSample(value: number, bitsPerSample: number, floatingPoint: boolean): number {
  if (!Number.isFinite(value)) return 0;
  if (floatingPoint) {
    const normalized = value >= 0 && value <= 1 ? value : value / 255;
    return Math.max(0, Math.min(255, Math.round(normalized * 255)));
  }
  const maximum = bitsPerSample === 1 ? 1 : 2 ** bitsPerSample - 1;
  return Math.max(0, Math.min(255, Math.round((value / maximum) * 255)));
}

function scaleTiffPaletteSample(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(255, Math.round((value / 65535) * 255)));
}

export async function decodeTiffRgba(bytes: Uint8Array): Promise<RgbaRaster> {
  try {
    const { decode } = await import("tiff");
    const input = bytes.slice().buffer;
    const metadataPage = decode(input, { pages: [0], ignoreImageData: true })[0];
    if (!metadataPage) throw new Error("The TIFF contains no image pages.");
    if (metadataPage.planarConfiguration !== undefined && metadataPage.planarConfiguration !== 1) {
      throw new InterchangeImportError(
        "TIFF planar storage is unsupported because it cannot be decoded without risking scrambled pixels.",
        { code: "planar_storage_unsupported" }
      );
    }
    assertRasterDimensions(metadataPage.width, metadataPage.height);
    if (
      metadataPage.sampleFormat !== 1 &&
      !(metadataPage.bitsPerSample === 32 && metadataPage.sampleFormat === 3)
    ) {
      throw new Error(
        "Only unsigned integer TIFF samples and 32-bit floating-point TIFF samples have a deterministic display mapping."
      );
    }
    const metadataBytesPerSample = metadataPage.bitsPerSample / 8;
    const estimatedBytes =
      metadataPage.width * metadataPage.height * metadataPage.components * metadataBytesPerSample;
    if (
      !Number.isFinite(estimatedBytes) ||
      estimatedBytes > PORTABLE_PROJECT_LIMITS.maxTotalRasterArea * 4
    ) {
      throw new Error("The TIFF decoded pixel payload exceeds the supported memory budget.");
    }
    const pages = decode(input, { pages: [0] });
    const page = pages[0];
    if (!page) throw new Error("The TIFF contains no image pages.");
    const width = page.width;
    const height = page.height;
    const components = page.components;
    const bitsPerSample = page.bitsPerSample;
    const photometric = page.type;
    const data = page.data;
    if (!width || !height || !data || !Number.isInteger(components)) {
      throw new Error("The TIFF image metadata is incomplete.");
    }
    if (![1, 2, 3, 4].includes(components)) {
      throw new Error(`The TIFF color model has ${components} channels.`);
    }
    if (![0, 1, 2, 3].includes(photometric)) {
      throw new Error(`The TIFF photometric interpretation ${photometric} is unsupported.`);
    }
    if (![1, 8, 16, 32].includes(bitsPerSample)) {
      throw new Error(`The TIFF bit depth ${bitsPerSample} is unsupported.`);
    }
    assertRasterDimensions(width, height);
    if (data.length !== width * height * components) {
      throw new Error("The TIFF decoder returned an incomplete pixel payload.");
    }
    const floatingPoint = data instanceof Float32Array || data instanceof Float64Array;
    const palette = page.palette;
    if (photometric === 3 && !palette) throw new Error("The TIFF palette is missing.");
    const pixels = new Uint8Array(width * height * 4);
    const readChannel = (index: number): number =>
      scaleTiffSample(data[index], bitsPerSample, floatingPoint);
    for (let pixel = 0; pixel < width * height; pixel += 1) {
      const source = pixel * components;
      const target = pixel * 4;
      if (photometric === 3) {
        const entry = palette?.[Math.round(data[source])];
        if (!entry) throw new Error("The TIFF palette index is outside the palette.");
        pixels[target] = scaleTiffPaletteSample(entry[0]);
        pixels[target + 1] = scaleTiffPaletteSample(entry[1]);
        pixels[target + 2] = scaleTiffPaletteSample(entry[2]);
        pixels[target + 3] = components === 2 ? readChannel(source + 1) : 255;
      } else if (components <= 2) {
        const gray = readChannel(source);
        pixels[target] = gray;
        pixels[target + 1] = gray;
        pixels[target + 2] = gray;
        pixels[target + 3] = components === 2 ? readChannel(source + 1) : 255;
      } else {
        pixels[target] = readChannel(source);
        pixels[target + 1] = readChannel(source + 1);
        pixels[target + 2] = readChannel(source + 2);
        pixels[target + 3] = components === 4 ? readChannel(source + 3) : 255;
      }
    }
    const xResolution = page.xResolution;
    const yResolution = page.yResolution;
    const resolutionUnit = page.resolutionUnit;
    return {
      width,
      height,
      data: pixels,
      sourceBitDepth: bitsPerSample,
      ...(Number.isFinite(xResolution) &&
      Number.isFinite(yResolution) &&
      xResolution > 0 &&
      yResolution > 0
        ? {
            physicalResolution: {
              x: xResolution,
              y: yResolution,
              unit: resolutionUnit === 3 ? "dpcm" : resolutionUnit === 2 ? "dpi" : "unknown"
            }
          }
        : {})
    };
  } catch (error) {
    if (error instanceof InterchangeImportError) throw error;
    const message = error instanceof Error ? error.message : "Unknown TIFF decoder error.";
    throw new InterchangeImportError(`TIFF decode failed: ${message}`, { code: "tiff_decode" });
  }
}

export function encodeTiffRgba(raster: RgbaRaster): Uint8Array {
  assertRasterPayload(raster);
  const entryCount = 14;
  const ifdOffset = 8;
  const bitsOffset = ifdOffset + 2 + entryCount * 12 + 4;
  const sampleFormatOffset = bitsOffset + 8;
  const resolutionOffset = sampleFormatOffset + 8;
  const yResolutionOffset = resolutionOffset + 8;
  const stripOffset = yResolutionOffset + 8;
  const bytes = new Uint8Array(stripOffset + raster.data.byteLength);
  const view = new DataView(bytes.buffer);
  bytes.set([0x49, 0x49, 0x2a, 0x00]);
  setU32(view, 4, ifdOffset);
  setU16(view, ifdOffset, entryCount);
  const resolutionUnit = raster.physicalResolution?.unit === "dpcm" ? 3 : 2;
  const defaultResolution = resolutionUnit === 3 ? 28.3464567 : 72;
  const xResolution = raster.physicalResolution?.x ?? defaultResolution;
  const yResolution = raster.physicalResolution?.y ?? xResolution;
  const writeEntry = (index: number, tag: number, type: number, count: number, value: number) => {
    const offset = ifdOffset + 2 + index * 12;
    setU16(view, offset, tag);
    setU16(view, offset + 2, type);
    setU32(view, offset + 4, count);
    if (type === 3 && count === 1) setU16(view, offset + 8, value);
    else setU32(view, offset + 8, value);
  };
  writeEntry(0, 256, 4, 1, raster.width);
  writeEntry(1, 257, 4, 1, raster.height);
  writeEntry(2, 258, 3, 4, bitsOffset);
  writeEntry(3, 259, 3, 1, 1);
  writeEntry(4, 262, 3, 1, 2);
  writeEntry(5, 273, 4, 1, stripOffset);
  writeEntry(6, 277, 3, 1, 4);
  writeEntry(7, 278, 4, 1, raster.height);
  writeEntry(8, 279, 4, 1, raster.data.byteLength);
  writeEntry(9, 282, 5, 1, resolutionOffset);
  writeEntry(10, 283, 5, 1, yResolutionOffset);
  writeEntry(11, 296, 3, 1, resolutionUnit);
  writeEntry(12, 338, 3, 1, 2);
  writeEntry(13, 339, 3, 4, sampleFormatOffset);
  setU32(view, ifdOffset + 2 + entryCount * 12, 0);
  [8, 8, 8, 8].forEach((value, index) => setU16(view, bitsOffset + index * 2, value));
  setU32(view, resolutionOffset, Math.max(1, Math.round(xResolution)));
  setU32(view, resolutionOffset + 4, 1);
  setU32(view, yResolutionOffset, Math.max(1, Math.round(yResolution)));
  setU32(view, yResolutionOffset + 4, 1);
  [1, 1, 1, 1].forEach((value, index) => setU16(view, bitsOffset + 8 + index * 2, value));
  bytes.set(raster.data, stripOffset);
  return bytes;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string | undefined> {
  if (!globalThis.crypto?.subtle) return undefined;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes.slice().buffer);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function blobFromRgba(
  raster: RgbaRaster,
  mimeType: "image/png" | "image/bmp" | "image/tiff"
): Promise<Blob> {
  if (mimeType === "image/bmp") return new Blob([encodeBmpRgba(raster)], { type: mimeType });
  if (mimeType === "image/tiff") return new Blob([encodeTiffRgba(raster)], { type: mimeType });
  if (typeof document === "undefined")
    throw new Error("A browser canvas is required to normalize this image.");
  const canvas = document.createElement("canvas");
  canvas.width = raster.width;
  canvas.height = raster.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("The browser canvas is unavailable.");
  context.putImageData(
    new ImageData(new Uint8ClampedArray(raster.data), raster.width, raster.height),
    0,
    0
  );
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("PNG encoding failed."))),
      mimeType
    );
  });
}

async function decodeViaBrowser(
  file: Blob,
  expectedDimensions: { width: number; height: number },
  signal?: AbortSignal
): Promise<RgbaRaster> {
  checkAbort(signal);
  assertRasterDimensions(expectedDimensions.width, expectedDimensions.height);
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    try {
      assertRasterDimensions(bitmap.width, bitmap.height);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("The browser canvas is unavailable.");
      context.drawImage(bitmap, 0, 0);
      const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height);
      return { width: bitmap.width, height: bitmap.height, data: new Uint8Array(pixels.data) };
    } finally {
      bitmap.close();
    }
  }
  throw new Error("This browser cannot decode the selected raster format.");
}

export async function prepareStrictInterchangeImport(
  file: File,
  options: {
    signal?: AbortSignal;
    allowAnimatedFirstFrame?: boolean;
    allowFirstPage?: boolean;
    allowLossyBitDepth?: boolean;
  } = {}
): Promise<
  InterchangeImportPreparation & {
    normalized: Blob;
    normalizedMimeType: string;
    requiresDecision: boolean;
  }
> {
  checkAbort(options.signal);
  if (file.size <= 0 || file.size > PORTABLE_PROJECT_LIMITS.maxDataUrlBytes) {
    throw new InterchangeImportError("Images must be non-empty and 25 MB or smaller.", {
      code: "source_limit"
    });
  }
  const probeByteLength = Math.min(file.size, INTERCHANGE_PROBE_READ_BYTES);
  const boundedProbe = new Uint8Array(await file.slice(0, probeByteLength).arrayBuffer());
  checkAbort(options.signal);
  const sourceDetails = {
    mimeType: file.type,
    name: file.name,
    byteLength: file.size
  };
  let probe = probeInterchangeBytes(boundedProbe, sourceDetails);
  let fullBytes: Uint8Array | undefined;
  if (
    file.size > probeByteLength &&
    !probeIsUsable(probe) &&
    (probe.format === "gif" || probe.format === "jpeg" || probe.format === "tiff")
  ) {
    fullBytes = new Uint8Array(await file.arrayBuffer());
    checkAbort(options.signal);
    probe = probeInterchangeBytes(fullBytes, sourceDetails);
  }
  let source: InterchangeSourceResource = {
    name: file.name,
    mimeType: file.type || mimeTypeForFormat(probe.format ?? "png"),
    byteLength: file.size,
    bytes: boundedProbe
  };
  const report = createFidelityReport({ source, probe });
  if (!probeIsUsable(probe)) {
    throw new InterchangeImportError(
      report.diagnostics.find((diagnostic) => diagnostic.severity === "error")?.message ??
        "The file cannot be imported safely.",
      { code: "probe_refused", probe, report }
    );
  }
  if (probe.format === "pdf" || probe.format === "avif" || probe.format === "heif") {
    const refused = createFidelityReport({
      source,
      probe,
      status: "unsupported/refused",
      diagnostics: [
        {
          code: "codec_unqualified",
          severity: "error",
          message: `No qualified offline decoder is available for ${probe.format.toUpperCase()}.`
        }
      ]
    });
    throw new InterchangeImportError(
      refused.diagnostics.at(-1)?.message ?? "The codec is unavailable.",
      {
        code: "codec_unqualified",
        probe,
        report: refused
      }
    );
  }
  if ((probe.pageCount ?? 1) > 1 && !options.allowFirstPage) {
    const decisionReport = createFidelityReport({
      source,
      probe,
      diagnostics: [
        {
          code: "multipage_requires_choice",
          severity: "warning",
          message: "This TIFF is multi-page; choose whether to import its first page."
        }
      ],
      substitutions: ["multi-page TIFF reduced to first page"]
    });
    throw new InterchangeImportError(
      "Multi-page TIFF import needs an explicit first-page choice.",
      {
        code: "multipage_requires_choice",
        probe,
        report: decisionReport
      }
    );
  }
  fullBytes ??= new Uint8Array(await file.arrayBuffer());
  checkAbort(options.signal);
  const checksum = await sha256Hex(fullBytes);
  source = { ...source, ...(checksum ? { sha256: checksum } : {}) };
  const format = probe.format as InterchangeFormat;
  let normalized: Blob = file;
  let normalizedMimeType = mimeTypeForFormat(format);
  let requiresDecision = false;
  let physicalResolution: InterchangePhysicalResolution | undefined;
  const substitutions: string[] = [];
  const fidelityDiagnostics: InterchangeDiagnostic[] = [];
  if (format === "bmp") {
    const raster = decodeBmpRgba(fullBytes);
    physicalResolution = raster.physicalResolution;
    normalized = await blobFromRgba(raster, "image/png");
    normalizedMimeType = "image/png";
  } else if (format === "tiff") {
    const raster = await decodeTiffRgba(fullBytes);
    physicalResolution = raster.physicalResolution;
    if (raster.sourceBitDepth && raster.sourceBitDepth > 8) {
      const substitution = `TIFF ${raster.sourceBitDepth}-bit samples reduced to 8-bit project-owned PNG pixels`;
      const diagnostic: InterchangeDiagnostic = {
        code: "bit_depth_flattened",
        severity: "warning",
        message: `The TIFF ${raster.sourceBitDepth}-bit samples are reduced to 8-bit display pixels.`
      };
      if (!options.allowLossyBitDepth) {
        const decisionReport = createFidelityReport({
          source,
          probe,
          checksum,
          physicalResolution,
          diagnostics: [diagnostic],
          substitutions: [substitution]
        });
        throw new InterchangeImportError(
          "This TIFF uses samples above 8-bit depth and needs explicit acceptance before import.",
          {
            code: "lossy_depth_requires_choice",
            probe,
            report: decisionReport
          }
        );
      }
      substitutions.push(substitution);
      fidelityDiagnostics.push(diagnostic);
    }
    if ((probe.pageCount ?? 1) > 1 && options.allowFirstPage) {
      substitutions.push("multi-page TIFF reduced to first page");
      fidelityDiagnostics.push({
        code: "multipage_reduced",
        severity: "warning",
        message: "Only the selected first page of the multi-page TIFF was imported."
      });
    }
    normalized = await blobFromRgba(raster, "image/png");
    normalizedMimeType = "image/png";
  } else if (format === "gif") {
    requiresDecision = Boolean(probe.animated && !options.allowAnimatedFirstFrame);
    if (requiresDecision && !options.allowAnimatedFirstFrame) {
      const decisionReport = createFidelityReport({
        source,
        probe,
        checksum,
        diagnostics: [
          {
            code: "animated_requires_choice",
            severity: "warning",
            message: "This GIF is animated; choose whether to import its first frame."
          }
        ],
        substitutions: ["animated GIF reduced to first frame"]
      });
      throw new InterchangeImportError(
        "Animated GIF import needs an explicit first-frame choice.",
        {
          code: "animated_requires_choice",
          probe,
          report: decisionReport
        }
      );
    }
    if (!probe.dimensions) {
      throw new InterchangeImportError(
        "The raster dimensions could not be verified before decoding.",
        { code: "header_malformed", probe }
      );
    }
    const raster = await decodeViaBrowser(file, probe.dimensions, options.signal);
    if (probe.animated && options.allowAnimatedFirstFrame) {
      substitutions.push("animated GIF reduced to first frame");
      fidelityDiagnostics.push({
        code: "animation_reduced",
        severity: "warning",
        message: "Only the first frame of the animated GIF was imported."
      });
    }
    normalized = await blobFromRgba(raster, "image/png");
    normalizedMimeType = "image/png";
  } else if (format === "svg") {
    normalizedMimeType = "image/svg+xml";
  } else if (format === "jpeg") {
    if (!probe.dimensions) {
      throw new InterchangeImportError(
        "The raster dimensions could not be verified before decoding.",
        { code: "header_malformed", probe }
      );
    }
    const raster = await decodeViaBrowser(file, probe.dimensions, options.signal);
    physicalResolution = raster.physicalResolution;
    normalized = await blobFromRgba(raster, "image/png");
    normalizedMimeType = "image/png";
  } else if (format === "png" || format === "webp") {
    // The strict signature and dimensions are checked above. Keep the source bytes lossless.
    normalizedMimeType = mimeTypeForFormat(format);
  }
  if (format === "bmp" || format === "tiff") {
    substitutions.push("normalized to project-owned PNG pixels");
  } else if (format === "gif") {
    substitutions.push("normalized to project-owned PNG pixels");
  } else if (format === "jpeg") {
    substitutions.push("JPEG EXIF orientation normalized to project-owned PNG pixels");
  }
  checkAbort(options.signal);
  return {
    source,
    probe,
    fidelity: createFidelityReport({
      source,
      probe,
      checksum,
      physicalResolution,
      diagnostics: fidelityDiagnostics,
      substitutions
    }),
    normalized,
    normalizedMimeType,
    requiresDecision
  };
}
