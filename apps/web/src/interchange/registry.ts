import {
  exportableInterchangeFormats,
  fidelityForFormat,
  formatForExtension,
  formatForMimeType,
  importAcceptAttribute,
  importableInterchangeFormats,
  probeInterchangeBytes,
  type InterchangeFormat,
  type InterchangeImportPreparation,
  type InterchangeProbe
} from "@workspace/editor-core";
import { prepareStrictInterchangeImport } from "./formatCodecs";
import type { PptxRenderedSlide } from "./pptx";

export interface RegisteredInterchangeAdapter {
  readonly format: InterchangeFormat;
  readonly label: string;
  readonly mimeTypes: readonly string[];
  readonly extensions: readonly string[];
  readonly importable: boolean;
  readonly exportable: boolean;
  readonly fidelity: ReturnType<typeof fidelityForFormat>;
}

export const INTERCHANGE_REGISTRY: readonly RegisteredInterchangeAdapter[] =
  importableInterchangeFormats().map((definition) => ({
    format: definition.id,
    label: definition.label,
    mimeTypes: definition.mimeTypes,
    extensions: definition.extensions,
    importable: definition.importable,
    exportable: definition.exportable,
    fidelity: fidelityForFormat(definition.id)
  }));

export const INTERCHANGE_EXPORT_REGISTRY: readonly RegisteredInterchangeAdapter[] =
  exportableInterchangeFormats().map((definition) => ({
    format: definition.id,
    label: definition.label,
    mimeTypes: definition.mimeTypes,
    extensions: definition.extensions,
    importable: definition.importable,
    exportable: definition.exportable,
    fidelity: fidelityForFormat(definition.id)
  }));

export function interchangeFileAccept(): string {
  return importAcceptAttribute();
}

export function isKnownInterchangeFile(file: Pick<File, "type" | "name">): boolean {
  const format = formatForMimeType(file.type) ?? formatForExtension(file.name.split(".").at(-1));
  return Boolean(format && INTERCHANGE_REGISTRY.some((adapter) => adapter.format === format));
}

export function isKnownInterchangeMimeType(mimeType: string): boolean {
  const format = formatForMimeType(mimeType);
  return Boolean(format && INTERCHANGE_REGISTRY.some((adapter) => adapter.format === format));
}

export function probeInterchangeFile(
  bytes: Uint8Array,
  source: { mimeType?: string; name?: string }
): InterchangeProbe {
  return probeInterchangeBytes(bytes, source);
}

export function requiresImportDecision(probe: InterchangeProbe): boolean {
  return probe.animated === true || (probe.pageCount ?? 1) > 1;
}

export function importDecisionMessage(probe: InterchangeProbe): string {
  if (probe.animated) {
    return "This animated GIF will be normalized to its first frame. Continue?";
  }
  if ((probe.pageCount ?? 1) > 1) {
    if (probe.format === "pptx") {
      return `This presentation contains ${probe.pageCount} slides. Enter slide numbers to import (for example, 1,3):`;
    }
    return `This TIFF contains ${probe.pageCount} pages. Import the first page only?`;
  }
  return "Import this file?";
}

export async function prepareInterchangeFile(
  file: File,
  options: {
    signal?: AbortSignal;
    allowAnimatedFirstFrame?: boolean;
    allowFirstPage?: boolean;
    allowLossyBitDepth?: boolean;
    pptxSlideIndices?: readonly number[];
  } = {}
): Promise<
  InterchangeImportPreparation & {
    normalized: Blob;
    normalizedMimeType: string;
    requiresDecision: boolean;
    slides?: readonly PptxRenderedSlide[];
    selectedSlideIndices?: readonly number[];
  }
> {
  return prepareStrictInterchangeImport(file, options);
}
