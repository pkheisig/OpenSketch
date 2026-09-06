export const PPTX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";
export const PPTX_EMU_PER_INCH = 914_400;
export const PPTX_MIN_INCHES = 1;
export const PPTX_MAX_INCHES = 56;
export const PPTX_MAX_PACKAGE_BYTES = 25 * 1024 * 1024;
export const PPTX_MAX_BASE64_LENGTH = Math.ceil((PPTX_MAX_PACKAGE_BYTES * 4) / 3) + 4;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

/** Encode a generated slide snapshot for safe local preview/persistence. */
export function svgDataUrlForPptx(source: string): string {
  return `data:image/svg+xml;base64,${bytesToBase64(new TextEncoder().encode(source))}`;
}

function xml(value: string | number): string {
  return String(value).replace(/[&<>"']/g, (character) => {
    if (character === "&") return "&amp;";
    if (character === "<") return "&lt;";
    if (character === ">") return "&gt;";
    if (character === '"') return "&quot;";
    return "&apos;";
  });
}

/** Give an SVG snapshot a bounded CSS-sized viewport while retaining its EMU viewBox. */
export function svgForPptxCanvas(source: string, width: number, height: number): string {
  const rootMatch = /<svg\b[^>]*>/i.exec(source);
  if (!rootMatch || rootMatch.index === undefined) return source;
  let root = rootMatch[0];
  const setDimension = (name: "width" | "height", value: number): void => {
    const attribute = new RegExp(`\\s${name}\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+)`, "i");
    const replacement = ` ${name}="${xml(value)}"`;
    root = attribute.test(root)
      ? root.replace(attribute, replacement)
      : `${root.slice(0, -1)}${replacement}>`;
  };
  setDimension("width", width);
  setDimension("height", height);
  return (
    source.slice(0, rootMatch.index) + root + source.slice(rootMatch.index + rootMatch[0].length)
  );
}
