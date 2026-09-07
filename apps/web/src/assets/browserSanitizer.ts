import DOMPurify from "dompurify";
import { PORTABLE_PROJECT_LIMITS, rewriteSvgCssSelectors } from "@workspace/editor-core";

const EXECUTABLE = /(?:javascript:|@import|<\s*(?:script|foreignObject)\b)/i;
const NETWORK = /(?:https?:\/\/|^\/\/)/i;
const EXTERNAL_STYLE_URL = /url\(\s*(?:(?:["'])(?!#)|(?!(?:["']?)#))/i;
const URL_ATTRIBUTES = new Set([
  "href",
  "xlink:href",
  "src",
  "fill",
  "stroke",
  "filter",
  "mask",
  "clip-path"
]);
const EMBEDDED_IMAGE_DATA_URL =
  /^data:(image\/(?:png|jpe?g|gif|webp|svg\+xml));base64,([A-Za-z0-9+/]*={0,2})$/i;
const MAX_NESTED_IMAGE_DATA_DEPTH = 8;

function svgMarkupAndStyles(value: string): string {
  const tags = [...value.matchAll(/<(?:(?:[^"'<>]|"[^"]*"|'[^']*'))*>/g)]
    .map(([tag]) => tag)
    .join("\n");
  const styles = [...value.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)]
    .map(([, style]) => style)
    .join("\n");
  return `${tags}\n${styles}`;
}

function isSafeEmbeddedImageDataUrl(value: string, depth = 0): boolean {
  if (depth > MAX_NESTED_IMAGE_DATA_DEPTH) return false;
  if (new TextEncoder().encode(value).byteLength > PORTABLE_PROJECT_LIMITS.maxDataUrlBytes) {
    return false;
  }
  const match = value.match(EMBEDDED_IMAGE_DATA_URL);
  if (!match || match[2].length === 0) return false;
  if (match[1].toLowerCase() !== "image/svg+xml") return true;
  try {
    const binary = atob(match[2]);
    const source = new TextDecoder().decode(
      Uint8Array.from(binary, (character) => character.charCodeAt(0))
    );
    const tags = [...source.matchAll(/<(?:(?:[^"'<>]|"[^"]*"|'[^']*'))*>/g)]
      .map(([tag]) => tag)
      .join("\n");
    const tagsWithoutQuotedValues = tags.replace(/"[^"]*"|'[^']*'/g, '""');
    const hasUnsafeMarkup =
      /<\s*(?:script|foreignObject|iframe|object|embed|animate|style)\b|\bon[a-z][\w:-]*\s*=/i.test(
        tagsWithoutQuotedValues
      );
    const hasExternalAttribute = [
      ...tags.matchAll(
        /(?:^|[\s<])(?:href|xlink:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi
      )
    ].some((attribute) => {
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

export function sanitizeImportedSvg(
  source: string,
  prefix = `import-${crypto.randomUUID()}`
): string {
  if (EXECUTABLE.test(svgMarkupAndStyles(source)) || /<!DOCTYPE|<!ENTITY/i.test(source)) {
    throw new Error("The SVG contains external or executable content.");
  }
  const svgNamespacePrefix = source.match(
    /xmlns:([A-Za-z_][\w.-]*)=["']http:\/\/www\.w3\.org\/2000\/svg["']/
  )?.[1];
  const xlinkNamespacePrefix = source.match(
    /xmlns:([A-Za-z_][\w.-]*)=["']http:\/\/www\.w3\.org\/1999\/xlink["']/
  )?.[1];
  let normalizedSource = svgNamespacePrefix
    ? source
        .replace(new RegExp(`(<\\/?)(?:${escapeRegExp(svgNamespacePrefix)}):`, "g"), "$1")
        .replace(new RegExp(`xmlns:${escapeRegExp(svgNamespacePrefix)}=`), "xmlns=")
    : source;
  for (const namespacePrefix of new Set(
    ["xlink", xlinkNamespacePrefix].filter(Boolean) as string[]
  )) {
    normalizedSource = normalizedSource.replace(
      new RegExp(`\\b${escapeRegExp(namespacePrefix)}:href\\s*=`, "gi"),
      "href="
    );
  }
  const clean = DOMPurify.sanitize(normalizedSource, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: ["use"],
    ADD_ATTR: ["href", "xlink:href"],
    FORBID_TAGS: ["script", "foreignObject", "iframe", "object", "embed"],
    FORBID_ATTR: ["onload", "onclick", "onerror", "onmouseover"]
  });
  const document = new DOMParser().parseFromString(clean, "image/svg+xml");
  const svg = document.documentElement;
  if (svg.localName !== "svg" || document.querySelector("parsererror")) {
    throw new Error("The imported file is not a valid SVG.");
  }
  const mapping = new Map<string, string>();
  svg.querySelectorAll("[id]").forEach((element) => {
    const oldId = element.id;
    const newId = `${prefix}-${oldId.replace(/[^a-zA-Z0-9_.:-]/g, "-")}`;
    mapping.set(oldId, newId);
    element.id = newId;
  });
  svg.querySelectorAll("*").forEach((element) => {
    [...element.attributes].forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      if (name.startsWith("xmlns")) return;
      if (name.startsWith("on")) {
        element.removeAttribute(attribute.name);
        return;
      }
      let value = attribute.value;
      const embeddedImage =
        ["href", "xlink:href", "src"].includes(name) && isSafeEmbeddedImageDataUrl(value);
      const externalHref =
        ["href", "xlink:href", "src"].includes(name) &&
        value !== "" &&
        !value.startsWith("#") &&
        !embeddedImage;
      if (
        EXECUTABLE.test(value) ||
        externalHref ||
        (URL_ATTRIBUTES.has(name) && NETWORK.test(value)) ||
        /url\(\s*["']?(?!#)/i.test(value)
      ) {
        if (element.localName === "use" && ["href", "xlink:href"].includes(name)) {
          element.remove();
        } else {
          element.removeAttribute(attribute.name);
        }
        return;
      }
      for (const [oldId, newId] of mapping) {
        if (["href", "xlink:href"].includes(name) && value === `#${oldId}`) {
          value = `#${newId}`;
        }
        value = value.replace(
          new RegExp(`url\\((['"]?)#${escapeRegExp(oldId)}\\1\\)`, "g"),
          `url(#${newId})`
        );
      }
      element.setAttribute(attribute.name, value);
    });
  });
  svg.querySelectorAll("style").forEach((style) => {
    let content = style.textContent ?? "";
    if (/@import|https?:|javascript:/i.test(content) || EXTERNAL_STYLE_URL.test(content)) {
      style.remove();
    } else {
      content = rewriteSvgCssSelectors(content, mapping);
      for (const [oldId, newId] of mapping) {
        content = content.replace(
          new RegExp(`url\\((['"]?)#${escapeRegExp(oldId)}\\1\\)`, "g"),
          `url(#${newId})`
        );
      }
      style.textContent = content;
    }
  });
  if (!svg.getAttribute("viewBox")) {
    throw new Error("The imported SVG must define a viewBox.");
  }
  return new XMLSerializer().serializeToString(svg);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
