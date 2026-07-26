import { JSDOM } from "jsdom";
import createDOMPurify from "dompurify";
import { optimize } from "svgo";

const BLOCKED_TAGS = ["script", "foreignObject", "iframe", "object", "embed", "audio", "video"];
const URL_ATTRIBUTES = [
  "href",
  "xlink:href",
  "src",
  "fill",
  "stroke",
  "filter",
  "mask",
  "clip-path",
  "cursor"
];
const NETWORK_PATTERN = /(?:https?:|\/\/|data:text\/html|javascript:)/i;
const URL_FUNCTION_PATTERN = /url\(\s*(['"]?)(?!#)([^)'"]+)\1\s*\)/gi;

function prefixInternalIds(svg: SVGSVGElement, assetId: string): void {
  const idMap = new Map<string, string>();
  svg.querySelectorAll("[id]").forEach((element) => {
    const previous = element.id;
    const next = `${assetId}-${previous.replace(/[^a-zA-Z0-9_.:-]/g, "-")}`;
    idMap.set(previous, next);
    element.id = next;
  });
  svg.querySelectorAll("*").forEach((element) => {
    for (const attribute of [...element.attributes]) {
      let value = attribute.value;
      for (const [previous, next] of idMap) {
        if (
          ["href", "xlink:href"].includes(attribute.name.toLowerCase()) &&
          value === `#${previous}`
        ) {
          value = `#${next}`;
        }
        value = value.replace(
          new RegExp(`url\\((['"]?)#${escapeRegExp(previous)}\\1\\)`, "g"),
          `url(#${next})`
        );
      }
      element.setAttribute(attribute.name, value);
    }
  });
  svg.querySelectorAll("style").forEach((style) => {
    let content = style.textContent ?? "";
    for (const [previous, next] of idMap) {
      content = content.replace(
        new RegExp(`(^|[},>+~])(\\s*)#${escapeRegExp(previous)}(?=\\s*[{,.:[>+~#])`, "gm"),
        `$1$2#${next}`
      );
      content = content.replace(
        new RegExp(`url\\((['"]?)#${escapeRegExp(previous)}\\1\\)`, "g"),
        `url(#${next})`
      );
    }
    style.textContent = content;
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function rejectUnsafeReferences(svg: SVGSVGElement): void {
  svg.querySelectorAll("*").forEach((element) => {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (name.startsWith("on")) {
        element.removeAttribute(attribute.name);
        continue;
      }
      if (URL_ATTRIBUTES.includes(name)) {
        const externalHref =
          ["href", "xlink:href", "src"].includes(name) && value !== "" && !value.startsWith("#");
        if (
          externalHref ||
          NETWORK_PATTERN.test(value) ||
          new RegExp(URL_FUNCTION_PATTERN.source, "i").test(value)
        ) {
          if (element.localName === "use" && ["href", "xlink:href"].includes(name)) {
            element.remove();
          } else {
            element.removeAttribute(attribute.name);
          }
        }
      }
      if (name === "style") {
        const cleaned = value
          .replace(/@import[^;]+;?/gi, "")
          .replace(URL_FUNCTION_PATTERN, "")
          .replace(/expression\s*\([^)]*\)/gi, "");
        if (NETWORK_PATTERN.test(cleaned)) element.removeAttribute("style");
        else element.setAttribute("style", cleaned);
      }
    }
  });
  svg.querySelectorAll("style").forEach((style) => {
    const content = style.textContent ?? "";
    if (/@import|https?:|javascript:|url\(\s*[^#]/i.test(content)) style.remove();
  });
}

export function assertSafeSvg(svgText: string): void {
  const checks: Array<[RegExp, string]> = [
    [/<\s*script\b/i, "script element"],
    [/<\s*foreignObject\b/i, "foreignObject element"],
    [/\son[a-z]+\s*=/i, "inline event handler"],
    [/(?:href|src)\s*=\s*["']\s*(?:https?:|\/\/|javascript:)/i, "external reference"],
    [/@import/i, "external CSS import"],
    [/url\(\s*["']?\s*(?:https?:|\/\/)/i, "external CSS URL"]
  ];
  for (const [pattern, label] of checks) {
    if (pattern.test(svgText)) throw new Error(`Unsafe SVG contains ${label}.`);
  }
  const dom = new JSDOM(svgText, { contentType: "image/svg+xml" });
  const svg = dom.window.document.documentElement;
  if (svg.localName !== "svg" || !svg.getAttribute("viewBox")) {
    throw new Error("Sanitized file must contain a root SVG element with a viewBox.");
  }
  if (svg.querySelector("use:not([href])")) {
    throw new Error("Sanitized SVG contains an unresolved use reference.");
  }
}

export function sanitizeSvg(source: string, assetId: string): string {
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) {
    throw new Error("SVG document type and entity declarations are not allowed.");
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
  for (const prefix of new Set(["xlink", xlinkNamespacePrefix].filter(Boolean) as string[])) {
    normalizedSource = normalizedSource.replace(
      new RegExp(`\\b${escapeRegExp(prefix)}:href\\s*=`, "gi"),
      "href="
    );
  }
  const sourceDom = new JSDOM(normalizedSource, { contentType: "image/svg+xml" });
  const sourceDocument = sourceDom.window.document;
  const sourceRoot = sourceDocument.documentElement;
  if (sourceRoot.localName !== "svg") throw new Error("Downloaded XML is not an SVG.");
  const purifier = createDOMPurify(sourceDom.window);
  purifier.sanitize(sourceRoot, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: ["use"],
    ADD_ATTR: ["href", "xlink:href"],
    FORBID_TAGS: BLOCKED_TAGS,
    FORBID_ATTR: ["onload", "onclick", "onerror", "onmouseover"],
    IN_PLACE: true
  });
  const isolated = new sourceDom.window.XMLSerializer().serializeToString(sourceRoot);
  const svgDom = new JSDOM(isolated, { contentType: "image/svg+xml" });
  const svg = svgDom.window.document.documentElement as unknown as SVGSVGElement;
  rejectUnsafeReferences(svg);
  prefixInternalIds(svg, assetId);
  const serialized = new svgDom.window.XMLSerializer().serializeToString(svg);
  const optimized = optimize(serialized, {
    multipass: false,
    plugins: [
      {
        name: "preset-default",
        params: {
          overrides: {
            cleanupIds: false,
            collapseGroups: false,
            convertShapeToPath: false,
            mergePaths: false,
            convertColors: false
          }
        }
      },
      "removeDimensions"
    ]
  }).data;
  assertSafeSvg(optimized);
  return optimized.endsWith("\n") ? optimized : `${optimized}\n`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [input, assetId = "uploaded"] = process.argv.slice(2);
  if (!input) {
    console.error("Usage: tsx sanitize-svg.ts <file.svg> [asset-id]");
    process.exitCode = 2;
  } else {
    import("node:fs/promises")
      .then(({ readFile }) => readFile(input, "utf8"))
      .then((source) => process.stdout.write(sanitizeSvg(source, assetId)))
      .catch((error) => {
        console.error(error);
        process.exitCode = 1;
      });
  }
}
