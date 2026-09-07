import { PORTABLE_PROJECT_LIMITS } from "./resourceLimits";

const EMBEDDED_IMAGE_DATA_URL =
  /^data:(image\/(?:png|jpe?g|gif|webp|svg\+xml));base64,([A-Za-z0-9+/]*={0,2})$/i;
const MAX_NESTED_IMAGE_DATA_DEPTH = 8;
const SVG_TAG = /<(?:(?:[^"'<>]|"[^"]*"|'[^']*'))*>/g;
const SVG_URL_ATTRIBUTE =
  /(?:^|[\s<])(?:href|xlink:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;

function svgTags(source: string): string {
  return [...source.matchAll(SVG_TAG)].map(([tag]) => tag).join("\n");
}

/**
 * Checks an image data URL and, for nested SVG images, applies the same bounded
 * markup and URL policy recursively. Callers still perform their own DOM
 * sanitization before rendering or persistence.
 */
export function isSafeEmbeddedImageDataUrl(value: string, depth = 0): boolean {
  if (depth > MAX_NESTED_IMAGE_DATA_DEPTH) return false;
  const normalized = value.trim();
  if (new TextEncoder().encode(normalized).byteLength > PORTABLE_PROJECT_LIMITS.maxDataUrlBytes) {
    return false;
  }
  const match = normalized.match(EMBEDDED_IMAGE_DATA_URL);
  if (!match || match[2].length === 0) return false;
  if (match[1].toLowerCase() !== "image/svg+xml") return true;
  try {
    const binary = atob(match[2]);
    const source = new TextDecoder().decode(
      Uint8Array.from(binary, (character) => character.charCodeAt(0))
    );
    const tags = svgTags(source);
    const tagsWithoutQuotedValues = tags.replace(/"[^"]*"|'[^']*'/g, '""');
    const hasUnsafeMarkup =
      /<\s*(?:script|foreignObject|iframe|object|embed|animate|style)\b|\bon[a-z][\w:-]*\s*=/i.test(
        tagsWithoutQuotedValues
      );
    const hasExternalAttribute = [...tags.matchAll(SVG_URL_ATTRIBUTE)].some((attribute) => {
      const attributeValue = (attribute[1] ?? attribute[2] ?? attribute[3] ?? "").trim();
      return (
        /^(?:https?:|\/\/|file:|javascript:|data:)/i.test(attributeValue) &&
        !isSafeEmbeddedImageDataUrl(attributeValue, depth + 1)
      );
    });
    return !(
      /<!DOCTYPE\b|<!ENTITY\b/i.test(source) ||
      hasUnsafeMarkup ||
      hasExternalAttribute ||
      /url\s*\(\s*["']?\s*(?:https?:|\/\/|file:|javascript:|data:)/i.test(source)
    );
  } catch {
    return false;
  }
}
