const SUPPORTED_CLIPBOARD_IMAGE_TYPES = new Set([
  "image/svg+xml",
  "image/png",
  "image/jpeg",
  "image/webp"
]);

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

export function importedMediaFileFromClipboard(data: DataTransfer): File | undefined {
  const svgSource = svgSourceFromClipboard(data);
  if (svgSource) {
    return new File([svgSource], "Clipboard SVG.svg", { type: "image/svg+xml" });
  }

  for (const item of data.items) {
    if (item.kind !== "file" || !SUPPORTED_CLIPBOARD_IMAGE_TYPES.has(item.type)) continue;
    const file = item.getAsFile();
    if (!file) continue;
    const extension = extensionForMimeType(item.type);
    return new File(
      [file],
      item.type === "image/svg+xml" ? "Clipboard SVG.svg" : `Clipboard image.${extension}`,
      {
        type: item.type,
        lastModified: file.lastModified
      }
    );
  }
  return undefined;
}

export function clipboardContainsSelectionMarker(data: DataTransfer, marker?: string): boolean {
  if (!marker) return false;
  return [
    data.getData("text/plain"),
    data.getData("text/html"),
    data.getData("image/svg+xml")
  ].some((value) => value.includes(marker));
}
