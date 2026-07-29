const SUPPORTED_CLIPBOARD_IMAGE_TYPES = new Set([
  "image/svg+xml",
  "image/png",
  "image/jpeg",
  "image/webp"
]);
const SUPPORTED_IMAGE_EXTENSIONS = new Set(["svg", "png", "jpg", "jpeg", "webp"]);

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
  if (mimeType === "image/svg+xml") return "svg";
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  return "png";
}

function extensionForFile(file: File): string {
  return file.name.toLowerCase().split(".").at(-1) ?? "";
}

export function isSupportedImportedImageFile(file: File): boolean {
  return (
    SUPPORTED_CLIPBOARD_IMAGE_TYPES.has(file.type.toLowerCase()) ||
    SUPPORTED_IMAGE_EXTENSIONS.has(extensionForFile(file))
  );
}

export function importedMediaFilesFromDataTransfer(data: DataTransfer): File[] {
  const files = Array.from(data.files).filter(isSupportedImportedImageFile);
  if (files.length > 0) return files;
  return Array.from(data.items)
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null && isSupportedImportedImageFile(file));
}

function embeddedImageDataUrl(data: DataTransfer): string | undefined {
  const candidates = [data.getData("text/html"), data.getData("text/plain")];
  for (const candidate of candidates) {
    const match = candidate.match(
      /(?:src\s*=\s*["']\s*)?(data:image\/(?:png|jpeg|webp|svg\+xml)(?:;charset=[^;,]+)?(?:;base64)?,[^"'\s<>]+)/i
    );
    if (match) return match[1];
  }
  return undefined;
}

function fileFromDataUrl(dataUrl: string): File | undefined {
  const match = dataUrl.match(
    /^data:(image\/(?:png|jpeg|webp|svg\+xml))(?:;charset=[^;,]+)?(;base64)?,(.*)$/is
  );
  if (!match) return undefined;
  const [, mimeType, base64, encoded] = match;
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
      const mimeType = SUPPORTED_CLIPBOARD_IMAGE_TYPES.has(declaredMimeType)
        ? declaredMimeType
        : "";
      const extension = mimeType
        ? extensionForMimeType(mimeType)
        : extensionForFile(file) || "png";
      const isSvg = mimeType === "image/svg+xml" || extension === "svg";
      return new File(
        [file],
        isSvg ? "Clipboard SVG.svg" : `Clipboard image.${extension}`,
        {
          type: mimeType,
          lastModified: file.lastModified
        }
      );
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
