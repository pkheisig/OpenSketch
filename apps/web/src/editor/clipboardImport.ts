import {
  extensionForFormat,
  formatForExtension,
  formatForMimeType,
  mimeTypeForFormat
} from "@workspace/editor-core";
import { isKnownInterchangeFile, isKnownInterchangeMimeType } from "@/interchange/registry";

function svgSourceFromClipboard(data: DataTransfer): string | undefined {
  const candidates = [
    data.getData("image/svg+xml"),
    data.getData("text/plain"),
    data.getData("text/html")
  ];
  for (const candidate of candidates) {
    const start = candidate.search(/<svg[\s>]/i);
    const end = candidate.toLowerCase().lastIndexOf("</svg>");
    if (start >= 0 && end >= start) return candidate.slice(start, end + 6);
  }
  return undefined;
}

function extensionForMimeType(mimeType: string): string {
  const format = formatForMimeType(mimeType);
  return format ? extensionForFormat(format) : "png";
}

function extensionForFile(file: File): string {
  return file.name.toLowerCase().split(".").at(-1) ?? "";
}

export function isSupportedImportedImageFile(file: File): boolean {
  return isKnownInterchangeFile(file);
}

export function importedMediaFilesFromDataTransfer(data: DataTransfer): File[] {
  const files = Array.from(data.files);
  if (files.length > 0) return files;
  return Array.from(data.items)
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);
}

function embeddedImageDataUrl(data: DataTransfer): string | undefined {
  const candidates = [data.getData("text/html"), data.getData("text/plain")];
  for (const candidate of candidates) {
    const match = candidate.match(
      /(?:src\s*=\s*["']\s*)?(data:([a-z0-9.+-]+\/[a-z0-9.+-]+)(?:;[^,]*)?,[^"'\s<>]+)/i
    );
    if (match && isKnownInterchangeMimeType(match[2])) return match[1];
  }
  return undefined;
}

function fileFromDataUrl(dataUrl: string): File | undefined {
  const match = dataUrl.match(/^data:([^;,]+)(?:;[^,]*)?,(.*)$/is);
  if (!match) return undefined;
  const [, declaredMimeType, encoded] = match;
  const mimeType = declaredMimeType.toLowerCase();
  if (!isKnownInterchangeMimeType(mimeType)) return undefined;
  const header = dataUrl.slice(5, dataUrl.indexOf(","));
  const base64 = /(?:^|;)base64$/i.test(header);
  try {
    const decoded = base64 ? atob(encoded) : decodeURIComponent(encoded);
    const bytes = Uint8Array.from(decoded, (character) => character.charCodeAt(0));
    const extension = extensionForMimeType(mimeType.toLowerCase());
    return new File([bytes], `Clipboard image.${extension}`, { type: mimeType.toLowerCase() });
  } catch {
    return undefined;
  }
}

export function importedMediaFilesFromClipboard(data: DataTransfer): File[] {
  const svgSource = svgSourceFromClipboard(data);
  if (svgSource) {
    return [new File([svgSource], "Clipboard SVG.svg", { type: "image/svg+xml" })];
  }

  const transferredItems = Array.from(data.items)
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null && isSupportedImportedImageFile(file));
  const transferredFiles =
    transferredItems.length > 0 ? transferredItems : importedMediaFilesFromDataTransfer(data);
  if (transferredFiles.length > 0) {
    return transferredFiles.map((file) => {
      const declaredMimeType = file.type.toLowerCase();
      const format =
        formatForMimeType(declaredMimeType) ?? formatForExtension(extensionForFile(file));
      const mimeType = format ? mimeTypeForFormat(format) : "";
      const extension = mimeType ? extensionForMimeType(mimeType) : extensionForFile(file) || "png";
      const isSvg = mimeType === "image/svg+xml" || extension === "svg";
      return new File([file], isSvg ? "Clipboard SVG.svg" : `Clipboard image.${extension}`, {
        type: mimeType,
        lastModified: file.lastModified
      });
    });
  }

  const dataUrl = embeddedImageDataUrl(data);
  const embeddedFile = dataUrl ? fileFromDataUrl(dataUrl) : undefined;
  return embeddedFile ? [embeddedFile] : [];
}

export function importedMediaFileFromClipboard(data: DataTransfer): File | undefined {
  return importedMediaFilesFromClipboard(data)[0];
}

export function clipboardContainsSelectionMarker(data: DataTransfer, marker?: string): boolean {
  if (!marker) return false;
  return [
    data.getData("text/plain"),
    data.getData("text/html"),
    data.getData("image/svg+xml")
  ].some((value) => value.includes(marker));
}
