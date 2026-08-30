import { getPdfFontFamily, TEXT_FONT_REGISTRY } from "@/editor/fonts";
import { provenanceManifestJson, type ProvenanceManifest } from "@/export/provenance";
import { PDF_FONT_ASSETS } from "@/export/pdf-font-assets";
import type { PdfFontStyle, PdfFontWeight } from "@/export/pdf-font-types";

export interface PdfExportMetadata {
  title: string;
  description: string;
  credit: string;
  provenance: ProvenanceManifest;
  author?: string;
}

const PDF_FONT_STYLES: readonly PdfFontStyle[] = ["normal", "italic"];
const PDF_FONT_WEIGHTS: readonly PdfFontWeight[] = [400, 600, 700];
const fontData = new Map<string, Promise<string>>();

function isTrueTypeFont(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x00 &&
    bytes[1] === 0x01 &&
    bytes[2] === 0x00 &&
    bytes[3] === 0x00
  );
}

export function loadPdfFontBase64(url: string): Promise<string> {
  const cached = fontData.get(url);
  if (cached) return cached;
  const pending = fetch(url)
    .then((response) => {
      if (!response.ok) {
        throw new Error("Could not load the bundled PDF font (" + response.status + ").");
      }
      return response.arrayBuffer();
    })
    .then((buffer) => {
      const bytes = new Uint8Array(buffer);
      if (!isTrueTypeFont(bytes)) {
        throw new Error("The bundled PDF font at " + url + " is not a TrueType font.");
      }
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
      }
      return btoa(binary);
    });
  fontData.set(url, pending);
  void pending.catch(() => {
    if (fontData.get(url) === pending) fontData.delete(url);
  });
  return pending;
}

export function getJsPdfFontStyle(style: PdfFontStyle, weight: PdfFontWeight): string {
  if (weight === 400) return style === "italic" ? "italic" : "normal";
  if (weight === 700) return style === "italic" ? "bolditalic" : "bold";
  return String(weight) + style;
}

export function normalizePdfFontWeight(weight: string | number): PdfFontWeight {
  const normalized = typeof weight === "number" ? weight : weight.trim().toLowerCase();
  const numericWeight =
    normalized === "normal"
      ? 400
      : normalized === "bold"
        ? 700
        : normalized === "bolder"
          ? 700
          : normalized === "lighter"
            ? 400
            : typeof normalized === "number"
              ? normalized
              : Number(normalized);
  const clampedWeight = Number.isFinite(numericWeight)
    ? Math.max(1, Math.min(1_000, numericWeight))
    : 400;

  // Match CSS font selection with the bundled 400/600/700 faces. CSS checks
  // 400 before heavier faces for requests through 500, then checks 600 before
  // 700 for requests above 500.
  if (clampedWeight <= 500) return 400;
  if (clampedWeight <= 600) return 600;
  return 700;
}

export function normalizePdfFontStyle(style: string): PdfFontStyle {
  const normalized = style.trim().toLowerCase();
  return normalized === "italic" || normalized === "oblique" || normalized.startsWith("oblique ")
    ? "italic"
    : "normal";
}

export interface PdfFontRegistration {
  editorFamily: string;
  pdfFamily: string;
  assetKey: string;
  weight: PdfFontWeight;
  style: PdfFontStyle;
  jsPdfStyle: string;
  fileName: string;
  url: string;
}

export function getPdfFontRegistrationPlan(
  editorFamilies?: readonly string[]
): PdfFontRegistration[] {
  const requestedFamilies = new Set(
    (editorFamilies ?? TEXT_FONT_REGISTRY.map(({ family }) => family)).map((family) =>
      family.trim().toLowerCase()
    )
  );
  const selectedDefinitions = TEXT_FONT_REGISTRY.filter(({ family }) =>
    requestedFamilies.has(family.toLowerCase())
  );

  const seenPdfFaces = new Set<string>();
  return selectedDefinitions.flatMap((definition) => {
    const assets = PDF_FONT_ASSETS[definition.assetKey];
    if (!assets) {
      throw new Error("No bundled PDF font assets are configured for " + definition.family + ".");
    }
    return PDF_FONT_STYLES.flatMap((style) =>
      PDF_FONT_WEIGHTS.flatMap((weight) => {
        const faceKey = definition.pdfFamily + "|" + style + "|" + weight;
        if (seenPdfFaces.has(faceKey)) return [];
        seenPdfFaces.add(faceKey);
        return [
          {
            editorFamily: definition.family,
            pdfFamily: definition.pdfFamily,
            assetKey: definition.assetKey,
            weight,
            style,
            jsPdfStyle: getJsPdfFontStyle(style, weight),
            fileName: "OpenSketch-" + definition.assetKey + "-" + weight + "-" + style + ".ttf",
            url: assets[style][weight]
          }
        ];
      })
    );
  });
}

function assertRegisteredFont(pdf: import("jspdf").jsPDF, registration: PdfFontRegistration): void {
  try {
    pdf.setFont(registration.pdfFamily, registration.jsPdfStyle);
    const font = pdf.getFont();
    if (font.fontName !== registration.pdfFamily || !font.metadata?.cmap?.unicode) {
      throw new Error("jsPDF did not expose a parsed Unicode cmap.");
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      'Could not register the bundled PDF font "' +
        registration.editorFamily +
        '" (' +
        registration.weight +
        " " +
        registration.style +
        "): " +
        reason
    );
  }
}

async function registerBundledFonts(
  pdf: import("jspdf").jsPDF,
  svg: SVGSVGElement
): Promise<PdfFontRegistration[]> {
  const registrations = getPdfFontRegistrationsReferencedBySvg(svg);
  const loaded = await Promise.all(
    registrations.map(async (registration) => ({
      registration,
      data: await loadPdfFontBase64(registration.url)
    }))
  );
  for (const { registration, data } of loaded) {
    try {
      pdf.addFileToVFS(registration.fileName, data);
      pdf.addFont(
        registration.fileName,
        registration.pdfFamily,
        registration.style,
        registration.weight
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(
        'Could not register the bundled PDF font "' +
          registration.editorFamily +
          '" (' +
          registration.weight +
          " " +
          registration.style +
          "): " +
          reason
      );
    }
    assertRegisteredFont(pdf, registration);
  }
  return registrations;
}

function normalizeFontFamilyList(value: string): string {
  return value
    .split(",")
    .map((candidate) => {
      const trimmed = candidate.trim();
      const quote = trimmed[0] === '"' || trimmed[0] === "'" ? trimmed[0] : "";
      const unquoted = quote && trimmed.endsWith(quote) ? trimmed.slice(1, -1) : trimmed;
      const mapped = getPdfFontFamily(unquoted);
      return mapped === unquoted ? trimmed : quote + mapped + quote;
    })
    .join(", ");
}

function normalizeFontFamilyValue(value: string): string {
  const important = /\s*!important\s*$/i.test(value);
  const withoutImportant = value.replace(/\s*!important\s*$/i, "");
  return normalizeFontFamilyList(withoutImportant) + (important ? " !important" : "");
}

export function normalizePdfFontFamilyList(value: string): string {
  return normalizeFontFamilyList(value);
}

function normalizeFontWeightValue(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(
    /^(normal|bold|bolder|lighter|inherit|initial|unset|revert(?:-layer)?|[0-9]+(?:\.[0-9]+)?)(\s*!important)?$/i
  );
  if (!match) {
    throw new Error(
      `Unsupported imported font weight "${value}". Use a numeric weight, normal, bold, bolder, or lighter.`
    );
  }
  if (/^(?:inherit|initial|unset|revert(?:-layer)?)$/i.test(match[1])) {
    return match[1] + (match[2] ?? "");
  }
  return String(normalizePdfFontWeight(match[1])) + (match[2] ?? "");
}

function normalizeFontStyleValue(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(
    /^(normal|italic|oblique(?:\s+[-+]?(?:\d*\.\d+|\d+\.?\d*)deg)?|inherit|initial|unset|revert(?:-layer)?)(\s*!important)?$/i
  );
  if (!match) {
    throw new Error(
      `Unsupported imported font style "${value}". Use normal, italic, oblique, inherit, initial, unset, or revert.`
    );
  }
  if (/^(?:inherit|initial|unset|revert(?:-layer)?)$/i.test(match[1])) {
    return match[1] + (match[2] ?? "");
  }
  return normalizePdfFontStyle(match[1]) + (match[2] ?? "");
}

function normalizeCssFontValue(value: string, normalize: (value: string) => string): string {
  try {
    return normalize(value);
  } catch (error) {
    // The browser resolves valid var()/calc()/range-function declarations on
    // text elements before this stylesheet pass. Preserve the original rule
    // so the inline computed value remains authoritative without masking
    // malformed literal font declarations.
    if (/\b(?:var|calc|min|max|clamp)\s*\(/i.test(value)) return value;
    throw error;
  }
}

function stripCssComments(value: string): string {
  return value.replace(/\/\*[\s\S]*?\*\//g, "");
}

function normalizeCssFontFamilies(value: string): string {
  return stripCssComments(value).replace(
    /(font-family\s*:\s*)([^;}{]+)/gi,
    (_match, prefix: string, families: string) => prefix + normalizeFontFamilyValue(families)
  );
}

function normalizeCssFontWeights(value: string): string {
  return stripCssComments(value).replace(
    /(@font-face\s*\{[^{}]*\})|(^|[^-\w])(font-weight\s*:\s*)([^;}{]+)/gi,
    (
      match: string,
      fontFace: string | undefined,
      boundary: string | undefined,
      prefix: string | undefined,
      weight: string | undefined
    ) =>
      fontFace ??
      `${boundary ?? ""}${prefix}${normalizeCssFontValue(weight ?? match, normalizeFontWeightValue)}`
  );
}

function normalizeCssFontStyles(value: string): string {
  return stripCssComments(value).replace(
    /(^|[^-\w])(font-style\s*:\s*)([^;}{]+)/gi,
    (_match, boundary: string | undefined, prefix: string, style: string) =>
      `${boundary ?? ""}${prefix}${normalizeCssFontValue(style, normalizeFontStyleValue)}`
  );
}

const PDF_HIDDEN_TEXT_ATTRIBUTE = "data-opensketch-pdf-hidden";
const PDF_VISIBLE_TEXT_ATTRIBUTE = "data-opensketch-pdf-visible";
const PDF_DISPLAY_NONE_ATTRIBUTE = "data-opensketch-pdf-display-none";
const PDF_HIDDEN_ELEMENT_ATTRIBUTE = "data-opensketch-pdf-hidden-element";
const PDF_VISIBLE_ELEMENT_ATTRIBUTE = "data-opensketch-pdf-visible-element";
const PDF_ZERO_OPACITY_ATTRIBUTE = "data-opensketch-pdf-zero-opacity";
const PDF_USE_VISIBLE_TEXT_ATTRIBUTE = "data-opensketch-pdf-use-visible-text";
const PDF_COMPUTED_URL_REFERENCES_ATTRIBUTE = "data-opensketch-pdf-computed-url-references";
const PDF_URL_REFERENCE_ATTRIBUTES = new Set([
  "color-profile",
  "clip-path",
  "cursor",
  "fill",
  "filter",
  "marker-end",
  "marker-mid",
  "marker-start",
  "mask",
  "stroke"
]);
const PDF_URL_REFERENCE_PROPERTIES = new Set([
  ...PDF_URL_REFERENCE_ATTRIBUTES,
  "background",
  "background-image",
  "mask-image",
  "mask-border-source",
  "motion-path",
  "offset-path"
]);
const PDF_HREF_REFERENCE_ELEMENTS = new Set([
  "feimage",
  "filter",
  "image",
  "lineargradient",
  "mask",
  "mpath",
  "pattern",
  "radialgradient",
  "textpath",
  "use"
]);
const PDF_USE_TEXT_STYLE_PROPERTIES = [
  "font-family",
  "font-style",
  "font-weight",
  "font-size"
] as const;
const PDF_USE_PAINT_PROPERTIES = [
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-opacity",
  "stroke-width"
] as const;
const PDF_PAINTABLE_ELEMENT_NAMES = new Set([
  "circle",
  "ellipse",
  "image",
  "line",
  "path",
  "polygon",
  "polyline",
  "rect",
  "text",
  "tspan",
  "textpath",
  "use"
]);

function isZeroPdfOpacity(value: string | null | undefined): boolean {
  if (!value) return false;
  const opacity = Number.parseFloat(value.replace(/\s*!important\s*$/i, "").trim());
  return Number.isFinite(opacity) && opacity === 0;
}

function cssPdfAlpha(value: string): number | undefined {
  const normalized = value.trim().toLowerCase();
  if (normalized.endsWith("%")) {
    const percentage = Number.parseFloat(normalized.slice(0, -1));
    return Number.isFinite(percentage) ? Math.max(0, Math.min(1, percentage / 100)) : undefined;
  }
  const numeric = Number.parseFloat(normalized);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(1, numeric)) : undefined;
}

function pdfPaintAlpha(value: string): number {
  const normalized = value
    .replace(/\s*!important\s*$/i, "")
    .trim()
    .toLowerCase();
  if (normalized === "none" || normalized === "transparent") return 0;

  const hex = normalized.match(/^#([0-9a-f]{4}|[0-9a-f]{8})$/i)?.[1];
  if (hex) {
    const alpha = hex.length === 4 ? hex[3].repeat(2) : hex.slice(-2);
    return Number.parseInt(alpha, 16) / 255;
  }

  const rgb = normalized.match(/^rgba?\((.*)\)$/i)?.[1];
  if (rgb) {
    const components = rgb
      .split(/[\s,]+|\s*\/\s*/)
      .map((component) => component.trim())
      .filter(Boolean);
    const alpha = components.length >= 4 ? cssPdfAlpha(components[3]) : undefined;
    return alpha ?? 1;
  }

  return /\/\s*0(?:\.0*)?(?:%|\s*\))$/i.test(normalized) ? 0 : 1;
}

function pdfPaintIsInvisible(
  value: string | undefined,
  opacity: string | undefined,
  defaultPaint: string
): boolean {
  return (
    pdfPaintAlpha(value?.trim() ? value : defaultPaint) === 0 ||
    (opacity !== undefined && cssPdfAlpha(opacity.replace(/\s*!important\s*$/i, "")) === 0)
  );
}

function isZeroPdfStrokeWidth(value: string | undefined): boolean {
  if (!value) return false;
  const width = Number.parseFloat(value.replace(/\s*!important\s*$/i, "").trim());
  return Number.isFinite(width) && width === 0;
}

function declaredPdfPaintValue(element: Element, property: string): string | undefined {
  const value = svgInlineStyleValue(element, property);
  if (!value || /^(?:inherit|unset|revert(?:-layer)?)$/i.test(value.trim())) return undefined;
  return value;
}

function hasInvisiblePdfTextPaint(element: Element): boolean {
  let fill: string | undefined;
  let fillOpacity: string | undefined;
  let stroke: string | undefined;
  let strokeOpacity: string | undefined;
  let strokeWidth: string | undefined;
  for (let current: Element | null = element; current; current = current.parentElement) {
    fill ??= declaredPdfPaintValue(current, "fill");
    fillOpacity ??= declaredPdfPaintValue(current, "fill-opacity");
    stroke ??= declaredPdfPaintValue(current, "stroke");
    strokeOpacity ??= declaredPdfPaintValue(current, "stroke-opacity");
    strokeWidth ??= declaredPdfPaintValue(current, "stroke-width");
  }
  return (
    pdfPaintIsInvisible(fill, fillOpacity, "black") &&
    (pdfPaintIsInvisible(stroke, strokeOpacity, "none") || isZeroPdfStrokeWidth(strokeWidth))
  );
}

function isWithinPdfClipPath(element: Element): boolean {
  for (let current = element.parentElement; current; current = current.parentElement) {
    if (current.localName.toLowerCase() === "clippath") return true;
  }
  return false;
}

function computedPdfPaintIsInvisible(style: CSSStyleDeclaration): boolean {
  return (
    pdfPaintIsInvisible(
      style.getPropertyValue("fill"),
      style.getPropertyValue("fill-opacity"),
      "black"
    ) &&
    (pdfPaintIsInvisible(
      style.getPropertyValue("stroke"),
      style.getPropertyValue("stroke-opacity"),
      "none"
    ) ||
      isZeroPdfStrokeWidth(style.getPropertyValue("stroke-width")))
  );
}

type PdfVisibility = "hidden" | "visible";

function declaredPdfVisibility(element: Element): PdfVisibility | undefined {
  const attribute = element.getAttribute("visibility")?.trim().toLowerCase();
  if (attribute === "hidden" || attribute === "collapse") return "hidden";
  if (attribute === "visible") return "visible";

  const style = element.getAttribute("style") ?? "";
  const value = style
    .match(/(?:^|;)\s*visibility\s*:\s*([^;]+)/i)?.[1]
    .trim()
    .toLowerCase();
  if (value === "hidden" || value === "collapse") return "hidden";
  if (value === "visible") return "visible";
  return undefined;
}

function hasHiddenPdfTextAncestor(element: Element): boolean {
  let hasMaterializedTextState = false;
  for (let current: Element | null = element; current; current = current.parentElement) {
    if (
      current.getAttribute(PDF_HIDDEN_TEXT_ATTRIBUTE) === "true" ||
      current.getAttribute(PDF_VISIBLE_TEXT_ATTRIBUTE) === "true"
    ) {
      hasMaterializedTextState = true;
      break;
    }
  }
  if (
    !hasMaterializedTextState &&
    !isWithinPdfClipPath(element) &&
    hasInvisiblePdfTextPaint(element)
  ) {
    return true;
  }

  let resolvedVisibility: PdfVisibility | undefined;
  for (let current: Element | null = element; current; current = current.parentElement) {
    if (current.getAttribute(PDF_DISPLAY_NONE_ATTRIBUTE) === "true") return true;
    if (current.getAttribute(PDF_ZERO_OPACITY_ATTRIBUTE) === "true") return true;

    if (!hasMaterializedTextState) {
      const display = current.getAttribute("display")?.trim().toLowerCase();
      if (display === "none") return true;

      const style = current.getAttribute("style") ?? "";
      if (/(?:^|;)\s*display\s*:\s*none(?:\s*!important)?\s*(?:;|$)/i.test(style)) {
        return true;
      }
      if (isZeroPdfOpacity(current.getAttribute("opacity"))) return true;
      const opacity = style.match(/(?:^|;)\s*opacity\s*:\s*([^;]+)/i)?.[1];
      if (isZeroPdfOpacity(opacity)) return true;
    }

    if (resolvedVisibility === undefined) {
      const materializedVisibility =
        current.getAttribute(PDF_HIDDEN_TEXT_ATTRIBUTE) === "true"
          ? "hidden"
          : current.getAttribute(PDF_VISIBLE_TEXT_ATTRIBUTE) === "true"
            ? "visible"
            : undefined;
      resolvedVisibility =
        materializedVisibility ??
        (hasMaterializedTextState ? undefined : declaredPdfVisibility(current));
    }
  }
  return resolvedVisibility === "hidden";
}

export function normalizePdfSvgFontFamilies(svg: Element): void {
  const elements = [
    svg,
    ...Array.from(
      svg.querySelectorAll<SVGElement>("[font-family], [font-style], [font-weight], [style]")
    )
  ];
  for (const element of elements) {
    const fontFamily = element.getAttribute("font-family");
    if (fontFamily) element.setAttribute("font-family", normalizeFontFamilyValue(fontFamily));
    const fontStyle = element.getAttribute("font-style");
    if (fontStyle) element.setAttribute("font-style", normalizeFontStyleValue(fontStyle));
    const fontWeight = element.getAttribute("font-weight");
    if (fontWeight) element.setAttribute("font-weight", normalizeFontWeightValue(fontWeight));
    const style = element.getAttribute("style");
    if (style) {
      element.setAttribute(
        "style",
        normalizeCssFontStyles(normalizeCssFontWeights(normalizeCssFontFamilies(style)))
      );
    }
  }
  for (const style of svg.querySelectorAll("style")) {
    style.textContent = normalizeCssFontStyles(
      normalizeCssFontWeights(normalizeCssFontFamilies(style.textContent ?? ""))
    );
  }
}

function pdfElementsById(root: Element, id: string): Element | undefined {
  if (root.getAttribute("id") === id) return root;
  return Array.from(root.querySelectorAll<SVGElement>("[id]")).find(
    (element) => element.getAttribute("id") === id
  );
}

function pdfTextElements(root: Element): SVGElement[] {
  const elements: SVGElement[] = [];
  if (["text", "tspan", "textPath"].includes(root.localName.toLowerCase())) {
    elements.push(root as SVGElement);
  }
  elements.push(...Array.from(root.querySelectorAll<SVGElement>("text, tspan, textPath")));
  return elements;
}

function pdfUseElements(root: Element): SVGElement[] {
  const elements: SVGElement[] = [];
  if (root.localName.toLowerCase() === "use") elements.push(root as SVGElement);
  elements.push(...Array.from(root.querySelectorAll<SVGElement>("use")));
  return elements;
}

function pdfPaintElements(root: Element): SVGElement[] {
  const elements: SVGElement[] = [];
  if (PDF_PAINTABLE_ELEMENT_NAMES.has(root.localName.toLowerCase())) {
    elements.push(root as SVGElement);
  }
  elements.push(
    ...Array.from(root.querySelectorAll<SVGElement>([...PDF_PAINTABLE_ELEMENT_NAMES].join(",")))
  );
  return elements;
}

function pdfUseReferenceId(use: Element): string | undefined {
  return (use.getAttribute("href") ?? use.getAttribute("xlink:href"))?.trim().match(/^#(.+)$/)?.[1];
}

function pdfReferenceContainsText(
  root: SVGSVGElement,
  reference: Element,
  visitedIds = new Set<string>()
): boolean {
  if (pdfTextElements(reference).length > 0) return true;

  const referenceId = reference.getAttribute("id");
  if (referenceId) {
    if (visitedIds.has(referenceId)) return false;
    visitedIds = new Set(visitedIds).add(referenceId);
  }
  return pdfUseElements(reference).some((use) => {
    const nestedReferenceId = pdfUseReferenceId(use);
    const nestedReference = nestedReferenceId
      ? pdfElementsById(root, nestedReferenceId)
      : undefined;
    return nestedReference ? pdfReferenceContainsText(root, nestedReference, visitedIds) : false;
  });
}

function pdfReferenceContainsPaintableContent(reference: Element): boolean {
  return pdfPaintElements(reference).length > 0;
}

function pdfRootDefinitions(root: SVGSVGElement): SVGDefsElement {
  const existing = Array.from(root.children).find(
    (element) => element.localName.toLowerCase() === "defs"
  );
  if (existing) return existing as SVGDefsElement;
  const definitions = root.ownerDocument.createElementNS(
    "http://www.w3.org/2000/svg",
    "defs"
  ) as SVGDefsElement;
  root.insertBefore(definitions, root.firstChild);
  return definitions;
}

function pdfRetargetUse(use: Element, referenceId: string): void {
  for (const attribute of ["href", "xlink:href"]) {
    if (use.hasAttribute(attribute)) use.setAttribute(attribute, `#${referenceId}`);
  }
}

function pdfIsInsideDefinitions(element: Element): boolean {
  for (let current = element.parentElement; current; current = current.parentElement) {
    if (current.localName.toLowerCase() === "defs") return true;
  }
  return false;
}

function pdfInheritedSvgStyleValue(element: Element, property: string): string | undefined {
  for (let current: Element | null = element; current; current = current.parentElement) {
    const value = svgInlineStyleValue(current, property);
    if (value && !/^(?:inherit|initial|unset|revert(?:-layer)?)$/i.test(value.trim())) {
      return value;
    }
  }
  return undefined;
}

function pdfComputedFontProperty(
  frameWindow: Window,
  element: Element,
  property: (typeof PDF_USE_TEXT_STYLE_PROPERTIES)[number]
): string {
  const computed = frameWindow.getComputedStyle(element).getPropertyValue(property).trim();
  const declared = pdfInheritedSvgStyleValue(element, property);
  if (!declared) return computed;

  const normalizedComputed = computed
    .replace(/\s*!important\s*$/i, "")
    .trim()
    .toLowerCase();
  const normalizedDeclared = declared
    .replace(/\s*!important\s*$/i, "")
    .trim()
    .toLowerCase();
  const computedFamily = svgFontFamilyCandidates(normalizedComputed)[0];
  const declaredFamily = svgFontFamilyCandidates(normalizedDeclared)[0];
  if (
    property === "font-family" &&
    (computedFamily === "times" || computedFamily === "times new roman") &&
    declaredFamily
  ) {
    return declared;
  }
  return computed;
}

function materializePdfUseTextStyles(
  svg: SVGSVGElement,
  clone: SVGSVGElement,
  frameWindow: Window
): void {
  const sourceDefinitions = pdfRootDefinitions(svg);
  const cloneDefinitions = pdfRootDefinitions(clone);
  let materializedIdIndex = 0;
  const nextMaterializedId = (): string => {
    let materializedId = "";
    do {
      materializedId = `opensketch-pdf-use-${materializedIdIndex}`;
      materializedIdIndex += 1;
    } while (pdfElementsById(svg, materializedId) || pdfElementsById(clone, materializedId));
    return materializedId;
  };

  const materializeUse = (
    sourceUse: SVGElement,
    contextUse: SVGElement,
    outputSourceUse: SVGElement,
    outputCloneUse: SVGElement,
    materializedId: string,
    activeReferenceIds: ReadonlySet<string>
  ): boolean => {
    const referenceId = pdfUseReferenceId(sourceUse);
    if (!referenceId || activeReferenceIds.has(referenceId)) return false;

    const sourceReference = pdfElementsById(svg, referenceId);
    const clonedReference = pdfElementsById(clone, referenceId);
    if (
      !sourceReference ||
      !clonedReference ||
      !pdfReferenceContainsPaintableContent(sourceReference)
    ) {
      return false;
    }

    // svg2pdf renders <use> definitions with a fresh default text context and
    // does not carry the use element's inherited font properties into that
    // context. Probe an equivalent local clone in the browser so each use can
    // receive its own explicit text styles without changing shared definitions.
    const probeGroup = clone.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "g");
    for (const property of PDF_USE_TEXT_STYLE_PROPERTIES) {
      const value = pdfComputedFontProperty(frameWindow, contextUse, property);
      if (value) probeGroup.setAttribute(property, value);
    }
    const contextUseStyle = frameWindow.getComputedStyle(contextUse);
    for (const property of PDF_USE_PAINT_PROPERTIES) {
      const value = contextUseStyle.getPropertyValue(property).trim();
      if (value) probeGroup.style.setProperty(property, value, "important");
    }
    probeGroup.setAttribute("visibility", "hidden");
    const probeReference = clonedReference.cloneNode(true) as SVGElement;
    probeGroup.appendChild(probeReference);
    (clonedReference.parentElement ?? clone).appendChild(probeGroup);

    try {
      const sourceTextElements = pdfTextElements(sourceReference);
      const probeTextElements = pdfTextElements(probeReference);
      const sourcePaintElements = pdfPaintElements(sourceReference);
      const probePaintElements = pdfPaintElements(probeReference);
      const contextVisibility = frameWindow.getComputedStyle(contextUse).visibility;
      const contextIsHidden = ["hidden", "collapse"].includes(contextVisibility);
      const hasVisibleTextOverride =
        contextIsHidden &&
        probeTextElements.some(
          (probeTextElement) =>
            frameWindow.getComputedStyle(probeTextElement).visibility === "visible" &&
            hasPdfRenderableText(probeTextElement.textContent ?? "")
        );
      const hasVisibleTextInContext =
        hasVisibleTextOverride ||
        (contextVisibility === "visible" && pdfReferenceContainsText(svg, sourceReference));
      if (sourceTextElements.length !== probeTextElements.length) return hasVisibleTextInContext;

      const materializedSource = sourceReference.cloneNode(true) as SVGElement;
      const materializedClone = clonedReference.cloneNode(true) as SVGElement;
      materializedSource.setAttribute("id", materializedId);
      materializedClone.setAttribute("id", materializedId);
      const materializedSourceTextElements = pdfTextElements(materializedSource);
      const materializedCloneTextElements = pdfTextElements(materializedClone);
      const materializedSourcePaintElements = pdfPaintElements(materializedSource);
      const materializedClonePaintElements = pdfPaintElements(materializedClone);
      const sourceNestedUses = pdfUseElements(materializedSource);
      const cloneNestedUses = pdfUseElements(materializedClone);
      const contextNestedUses = pdfUseElements(probeReference);
      if (
        materializedSourceTextElements.length !== probeTextElements.length ||
        materializedCloneTextElements.length !== probeTextElements.length ||
        sourcePaintElements.length !== probePaintElements.length ||
        materializedSourcePaintElements.length !== probePaintElements.length ||
        materializedClonePaintElements.length !== probePaintElements.length ||
        sourceNestedUses.length !== cloneNestedUses.length ||
        sourceNestedUses.length !== contextNestedUses.length
      ) {
        return hasVisibleTextInContext;
      }

      probeTextElements.forEach((probeTextElement, index) => {
        for (const property of PDF_USE_TEXT_STYLE_PROPERTIES) {
          const value = pdfComputedFontProperty(frameWindow, probeTextElement, property);
          if (!value) continue;
          materializedSourceTextElements[index].style.setProperty(property, value, "important");
          materializedCloneTextElements[index].style.setProperty(property, value, "important");
        }
      });
      probePaintElements.forEach((probePaintElement, index) => {
        const computedPaint = frameWindow.getComputedStyle(probePaintElement);
        for (const property of PDF_USE_PAINT_PROPERTIES) {
          const value = computedPaint.getPropertyValue(property).trim();
          if (!value) continue;
          materializedSourcePaintElements[index].setAttribute(property, value);
          materializedClonePaintElements[index].setAttribute(property, value);
          materializedSourcePaintElements[index].style.setProperty(property, value, "important");
          materializedClonePaintElements[index].style.setProperty(property, value, "important");
        }
      });

      // Keep generated targets in <defs>. Appending a clone beside a target
      // that is already visible would render that target a second time.
      sourceDefinitions.appendChild(materializedSource);
      cloneDefinitions.appendChild(materializedClone);
      pdfRetargetUse(outputSourceUse, materializedId);
      pdfRetargetUse(outputCloneUse, materializedId);

      const nextActiveReferenceIds = new Set(activeReferenceIds).add(referenceId);
      let nestedVisibleText = false;
      sourceNestedUses.forEach((nestedSourceUse, index) => {
        const nestedCloneUse = cloneNestedUses[index];
        const nestedContextUse = contextNestedUses[index];
        if (!nestedCloneUse || !nestedContextUse) return;
        const nestedReferenceId = pdfUseReferenceId(nestedSourceUse);
        if (!nestedReferenceId || nextActiveReferenceIds.has(nestedReferenceId)) return;
        const nestedReference = pdfElementsById(svg, nestedReferenceId);
        const nestedVisibleInContext =
          frameWindow.getComputedStyle(nestedContextUse).visibility === "visible" &&
          Boolean(nestedReference && pdfReferenceContainsText(svg, nestedReference));
        const nestedHasVisibleText = materializeUse(
          nestedSourceUse,
          nestedContextUse,
          nestedSourceUse,
          nestedCloneUse,
          nextMaterializedId(),
          nextActiveReferenceIds
        );
        nestedVisibleText ||= nestedVisibleInContext || nestedHasVisibleText;
      });
      if (contextIsHidden && (hasVisibleTextOverride || nestedVisibleText)) {
        outputSourceUse.setAttribute(PDF_USE_VISIBLE_TEXT_ATTRIBUTE, "true");
        outputCloneUse.setAttribute(PDF_USE_VISIBLE_TEXT_ATTRIBUTE, "true");
      } else {
        outputSourceUse.removeAttribute(PDF_USE_VISIBLE_TEXT_ATTRIBUTE);
        outputCloneUse.removeAttribute(PDF_USE_VISIBLE_TEXT_ATTRIBUTE);
      }
      return hasVisibleTextInContext || nestedVisibleText;
    } finally {
      probeGroup.remove();
    }
  };

  const sourceUses = pdfUseElements(svg).filter((use) => !pdfIsInsideDefinitions(use));
  const clonedUses = pdfUseElements(clone).filter((use) => !pdfIsInsideDefinitions(use));
  sourceUses.forEach((sourceUse, useIndex) => {
    const clonedUse = clonedUses[useIndex];
    if (!clonedUse) return;
    materializeUse(sourceUse, clonedUse, sourceUse, clonedUse, nextMaterializedId(), new Set());
  });
}

function materializePdfTextStyles(svg: SVGSVGElement): void {
  if (typeof document === "undefined" || !document.body || typeof getComputedStyle !== "function") {
    return;
  }

  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText =
    "position:absolute;left:-100000px;top:-100000px;width:1px;height:1px;border:0;opacity:0;pointer-events:none;";
  document.body.appendChild(frame);
  const frameDocument = frame.contentDocument;
  const frameWindow = frame.contentWindow;
  if (!frameDocument?.body || !frameWindow) {
    frame.remove();
    return;
  }
  const clone = frameDocument.importNode(svg, true) as SVGSVGElement;
  frameDocument.body.appendChild(clone);
  try {
    materializePdfUseTextStyles(svg, clone, frameWindow);
    const sourceElements = [svg, ...Array.from(svg.querySelectorAll<SVGElement>("*"))];
    const clonedElements = [clone, ...Array.from(clone.querySelectorAll<SVGElement>("*"))];
    sourceElements.forEach((sourceElement, index) => {
      const clonedElement = clonedElements[index];
      if (!clonedElement) return;
      const computed = frameWindow.getComputedStyle(clonedElement);
      const computedUrlReferences = Array.from(PDF_URL_REFERENCE_PROPERTIES, (property) =>
        computed.getPropertyValue(property)
      )
        .filter((value) => /\burl\s*\(/i.test(value))
        .join("; ");
      if (computedUrlReferences) {
        sourceElement.setAttribute(PDF_COMPUTED_URL_REFERENCES_ATTRIBUTE, computedUrlReferences);
      } else {
        sourceElement.removeAttribute(PDF_COMPUTED_URL_REFERENCES_ATTRIBUTE);
      }
      const hasZeroOpacityAncestor = (() => {
        for (
          let current: Element | null = clonedElement;
          current;
          current = current.parentElement
        ) {
          if (isZeroPdfOpacity(frameWindow.getComputedStyle(current).opacity)) return true;
        }
        return false;
      })();
      if (computed.display === "none") {
        sourceElement.setAttribute(PDF_DISPLAY_NONE_ATTRIBUTE, "true");
      } else {
        sourceElement.removeAttribute(PDF_DISPLAY_NONE_ATTRIBUTE);
      }
      if (["hidden", "collapse"].includes(computed.visibility)) {
        sourceElement.setAttribute(PDF_HIDDEN_ELEMENT_ATTRIBUTE, "true");
        sourceElement.removeAttribute(PDF_VISIBLE_ELEMENT_ATTRIBUTE);
      } else {
        sourceElement.removeAttribute(PDF_HIDDEN_ELEMENT_ATTRIBUTE);
        sourceElement.setAttribute(PDF_VISIBLE_ELEMENT_ATTRIBUTE, "true");
      }
      if (hasZeroOpacityAncestor) sourceElement.setAttribute(PDF_ZERO_OPACITY_ATTRIBUTE, "true");
      else sourceElement.removeAttribute(PDF_ZERO_OPACITY_ATTRIBUTE);
    });

    const sourceTextElements = Array.from(
      svg.querySelectorAll<SVGElement>("text, tspan, textPath")
    );
    const clonedTextElements = Array.from(
      clone.querySelectorAll<SVGElement>("text, tspan, textPath")
    );
    sourceTextElements.forEach((sourceElement, index) => {
      const clonedElement = clonedTextElements[index];
      if (!clonedElement) return;
      const computed = frameWindow.getComputedStyle(clonedElement);
      const hidden =
        computed.display === "none" ||
        ["hidden", "collapse"].includes(computed.visibility) ||
        (!isWithinPdfClipPath(sourceElement) && computedPdfPaintIsInvisible(computed));
      if (computed.visibility === "collapse") {
        // svg2pdf only recognizes the exact `hidden` value. Materialize SVG's
        // collapse state so skipped text cannot leak into the PDF renderer.
        sourceElement.setAttribute("visibility", "hidden");
        sourceElement.style.setProperty("visibility", "hidden", "important");
      }
      if (hidden) {
        sourceElement.setAttribute(PDF_HIDDEN_TEXT_ATTRIBUTE, "true");
        sourceElement.removeAttribute(PDF_VISIBLE_TEXT_ATTRIBUTE);
      } else {
        sourceElement.removeAttribute(PDF_HIDDEN_TEXT_ATTRIBUTE);
        sourceElement.setAttribute(PDF_VISIBLE_TEXT_ATTRIBUTE, "true");
      }
      for (const [property, value] of [
        ["font-family", pdfComputedFontProperty(frameWindow, clonedElement, "font-family")],
        ["font-style", pdfComputedFontProperty(frameWindow, clonedElement, "font-style")],
        ["font-weight", pdfComputedFontProperty(frameWindow, clonedElement, "font-weight")],
        ["font-size", pdfComputedFontProperty(frameWindow, clonedElement, "font-size")]
      ] as const) {
        if (value) {
          // Keep both forms: svg2pdf reads presentation attributes while the
          // browser DOM exposes the computed declaration through CSSOM.
          sourceElement.setAttribute(property, value);
          sourceElement.style.setProperty(property, value, "important");
        }
      }
    });
  } finally {
    frame.remove();
  }
}

function svgInlineStyleValue(element: Element, property: string): string | undefined {
  const style = element.getAttribute("style") ?? "";
  const match = style.match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, "i"));
  if (match?.[1]) return match[1].trim();
  return element.getAttribute(property)?.trim();
}

function svgFontFamilyCandidates(value: string): string[] {
  return value
    .replace(/\s*!important\s*$/i, "")
    .split(",")
    .map((candidate) => {
      const trimmed = candidate.trim();
      const quote = trimmed[0] === '"' || trimmed[0] === "'" ? trimmed[0] : "";
      return quote && trimmed.endsWith(quote) ? trimmed.slice(1, -1).trim() : trimmed;
    })
    .filter(Boolean);
}

function pdfRegistrationForTextElement(
  element: Element,
  registrations: readonly PdfFontRegistration[]
): PdfFontRegistration | undefined {
  const familyValue = svgInlineStyleValue(element, "font-family");
  const family = familyValue ? svgFontFamilyCandidates(familyValue)[0] : undefined;
  if (!family) return undefined;
  const definition = TEXT_FONT_REGISTRY.find(
    (candidate) => candidate.family.toLowerCase() === family.toLowerCase()
  );
  if (!definition) return undefined;
  const styleValue = svgInlineStyleValue(element, "font-style") ?? "normal";
  const weightValue = svgInlineStyleValue(element, "font-weight") ?? "400";
  const style = normalizePdfFontStyle(styleValue.replace(/\s*!important\s*$/i, ""));
  const weight = normalizePdfFontWeight(weightValue.replace(/\s*!important\s*$/i, ""));
  return registrations.find(
    (registration) =>
      registration.pdfFamily === definition.pdfFamily &&
      registration.style === style &&
      registration.weight === weight
  );
}

function requirePdfRegistrationForTextElement(
  element: Element,
  registrations: readonly PdfFontRegistration[]
): PdfFontRegistration {
  const registration = pdfRegistrationForTextElement(element, registrations);
  if (registration) return registration;
  const family = svgFontFamilyCandidates(svgInlineStyleValue(element, "font-family") ?? "")[0];
  if (!family) {
    throw new Error(
      "PDF export cannot render text without a registered font family. Choose a bundled editor font."
    );
  }
  throw new Error(
    `PDF export cannot render text with unregistered font family "${family}". Choose a bundled editor font.`
  );
}

interface PdfTextRun {
  element: SVGElement;
  text: string;
}

function isPdfDefinitionElement(element: Element, svg: SVGSVGElement): boolean {
  for (
    let current: Element | null = element;
    current && current !== svg;
    current = current.parentElement
  ) {
    if (current.localName.toLowerCase() === "defs") return true;
  }
  return false;
}

function pdfReferenceIdsInValue(value: string, allowExactReference = false): string[] {
  const ids: string[] = [];
  if (allowExactReference) {
    const exactReference = value.trim().match(/^#([^\s]+)$/);
    if (exactReference) ids.push(exactReference[1]);
  }
  for (const match of value.matchAll(/url\(\s*["']?#([^"')\s]+)["']?\s*\)/gi)) {
    ids.push(match[1]);
  }
  return ids;
}

function pdfReferenceIdsInCssDeclarations(value: string): string[] {
  const references: string[] = [];
  for (const match of stripCssComments(value).matchAll(/(?:^|[;{])\s*([\w-]+)\s*:\s*([^;}{]+)/g)) {
    if (PDF_URL_REFERENCE_PROPERTIES.has(match[1].toLowerCase())) {
      references.push(...pdfReferenceIdsInValue(match[2]));
    }
  }
  return references;
}

function pdfUseHasVisibleTextOverride(svg: SVGSVGElement, use: Element): boolean {
  if (use.getAttribute(PDF_USE_VISIBLE_TEXT_ATTRIBUTE) === "true") return true;
  const referenceId = pdfUseReferenceId(use);
  const reference = referenceId ? pdfElementsById(svg, referenceId) : undefined;
  if (!reference) return false;
  return [reference, ...Array.from(reference.querySelectorAll<SVGElement>("*"))].some(
    (candidate) =>
      declaredPdfVisibility(candidate) === "visible" && pdfReferenceContainsText(svg, candidate)
  );
}

function pdfUseVisibilityIsHidden(use: Element): boolean {
  if (use.getAttribute(PDF_HIDDEN_ELEMENT_ATTRIBUTE) === "true") return true;
  if (use.getAttribute(PDF_VISIBLE_ELEMENT_ATTRIBUTE) === "true") return false;

  const path: Element[] = [];
  for (let current: Element | null = use; current; current = current.parentElement) {
    path.unshift(current);
  }
  let visibility: PdfVisibility = "visible";
  for (const current of path) {
    const declared = declaredPdfVisibility(current);
    if (declared) visibility = declared;
  }
  return visibility === "hidden";
}

function isPdfNonRenderedElement(element: Element): boolean {
  for (let current: Element | null = element; current; current = current.parentElement) {
    if (current.getAttribute(PDF_DISPLAY_NONE_ATTRIBUTE) === "true") return true;
    if (current.getAttribute(PDF_ZERO_OPACITY_ATTRIBUTE) === "true") return true;

    // Once the iframe has materialized computed state, do not let raw SVG
    // declarations override a stylesheet's winning display or opacity.
    const hasMaterializedElementState =
      current.hasAttribute(PDF_HIDDEN_ELEMENT_ATTRIBUTE) ||
      current.hasAttribute(PDF_VISIBLE_ELEMENT_ATTRIBUTE);
    if (hasMaterializedElementState) continue;

    if (
      svgInlineStyleValue(current, "display")
        ?.replace(/\s*!important\s*$/i, "")
        .trim()
        .toLowerCase() === "none"
    ) {
      return true;
    }
    if (isZeroPdfOpacity(svgInlineStyleValue(current, "opacity"))) return true;
  }
  return false;
}

function isPdfNonRenderedUse(svg: SVGSVGElement, element: Element): boolean {
  if (element.localName.toLowerCase() !== "use") return false;
  if (isPdfNonRenderedElement(element)) return true;

  return pdfUseVisibilityIsHidden(element) && !pdfUseHasVisibleTextOverride(svg, element);
}

function pdfTextRunElement(node: Node, svg: SVGSVGElement): SVGElement | undefined {
  for (
    let current: Element | null = node.parentElement;
    current && current !== svg;
    current = current.parentElement
  ) {
    if (["text", "tspan"].includes(current.localName.toLowerCase())) {
      return current as SVGElement;
    }
  }
  return undefined;
}

function addPdfReferenceIds(element: Element, references: string[]): void {
  for (const attribute of Array.from(element.attributes)) {
    const attributeName = attribute.name.toLowerCase();
    if (attributeName === "href" || attributeName === "xlink:href") {
      if (PDF_HREF_REFERENCE_ELEMENTS.has(element.localName.toLowerCase())) {
        references.push(...pdfReferenceIdsInValue(attribute.value, true));
      }
    } else if (attributeName === "style") {
      references.push(...pdfReferenceIdsInCssDeclarations(attribute.value));
    } else if (PDF_URL_REFERENCE_ATTRIBUTES.has(attributeName)) {
      references.push(...pdfReferenceIdsInValue(attribute.value));
    }
  }
  const computedUrlReferences = element.getAttribute(PDF_COMPUTED_URL_REFERENCES_ATTRIBUTE);
  if (computedUrlReferences) references.push(...pdfReferenceIdsInValue(computedUrlReferences));
}

function isPdfNestedDefinitionElement(element: Element, definition: Element): boolean {
  for (
    let current: Element | null = element;
    current && current !== definition;
    current = current.parentElement
  ) {
    if (current.localName.toLowerCase() === "defs") return true;
  }
  return false;
}

function getPdfReachableDefinitionIds(svg: SVGSVGElement): Set<string> {
  const definitionsById = new Map<string, Element>();
  const elements = [svg, ...Array.from(svg.querySelectorAll<SVGElement>("*"))];
  for (const element of elements) {
    if (!isPdfDefinitionElement(element, svg)) continue;
    const id = element.getAttribute("id");
    if (id) definitionsById.set(id, element);
  }

  const reachable = new Set<string>();
  const pending: string[] = [];
  let nextPendingIndex = 0;
  const collectReferences = (element: Element) => {
    if (isPdfNonRenderedElement(element) || isPdfNonRenderedUse(svg, element)) return;
    addPdfReferenceIds(element, pending);
  };

  for (const element of elements) {
    if (!isPdfDefinitionElement(element, svg)) collectReferences(element);
  }

  while (nextPendingIndex < pending.length) {
    const id = pending[nextPendingIndex];
    nextPendingIndex += 1;
    if (!id || reachable.has(id)) continue;
    reachable.add(id);
    const definition = definitionsById.get(id);
    if (!definition) continue;
    const definitionElements = [
      definition,
      ...Array.from(definition.querySelectorAll<SVGElement>("*"))
    ];
    for (const element of definitionElements) {
      if (isPdfNestedDefinitionElement(element, definition)) continue;
      collectReferences(element);
    }
  }
  return reachable;
}

function isPdfTextInUnreferencedDefinition(
  element: Element,
  svg: SVGSVGElement,
  reachableDefinitionIds: ReadonlySet<string>
): boolean {
  let current: Element | null = element;
  let insideDefinitions = false;
  while (current && current !== svg) {
    if (
      current.hasAttribute("id") &&
      reachableDefinitionIds.has(current.getAttribute("id") ?? "")
    ) {
      return false;
    }
    if (current.localName.toLowerCase() === "defs") {
      insideDefinitions = true;
      break;
    }
    current = current.parentElement;
  }
  return insideDefinitions;
}

function getPdfTextRuns(
  svg: SVGSVGElement,
  reachableDefinitionIds = getPdfReachableDefinitionIds(svg)
): PdfTextRun[] {
  const runs: PdfTextRun[] = [];
  const visit = (node: Node) => {
    if (node.nodeType === 3 || node.nodeType === 4) {
      const parent = node.parentElement;
      const textElement = parent ? pdfTextRunElement(node, svg) : undefined;
      if (
        parent &&
        textElement &&
        !isPdfTextInUnreferencedDefinition(parent, svg, reachableDefinitionIds) &&
        !hasHiddenPdfTextAncestor(parent)
      ) {
        runs.push({ element: textElement, text: node.nodeValue ?? "" });
      }
      return;
    }
    node.childNodes.forEach(visit);
  };
  visit(svg);
  return runs;
}

function hasPdfVisibleTextContent(element: Element): boolean {
  const candidates = [
    element,
    ...Array.from(element.querySelectorAll<SVGElement>("text, tspan, textPath"))
  ];
  return candidates.some((candidate) => {
    const hasDirectRenderableText = Array.from(candidate.childNodes).some(
      (node) =>
        (node.nodeType === 3 || node.nodeType === 4) && hasPdfRenderableText(node.nodeValue ?? "")
    );
    if (!hasDirectRenderableText) return false;
    if (candidate.getAttribute(PDF_HIDDEN_TEXT_ATTRIBUTE) === "true") return false;
    if (candidate.getAttribute(PDF_VISIBLE_TEXT_ATTRIBUTE) === "true") return true;
    return !hasHiddenPdfTextAncestor(candidate);
  });
}

function isPdfClipElementHidden(element: Element): boolean {
  const path: Element[] = [];
  for (let current: Element | null = element; current; current = current.parentElement) {
    path.unshift(current);
  }

  let hidden = false;
  for (const current of path) {
    if (current.getAttribute(PDF_DISPLAY_NONE_ATTRIBUTE) === "true") return true;
    if (current.getAttribute(PDF_HIDDEN_ELEMENT_ATTRIBUTE) === "true") {
      hidden = true;
      continue;
    }
    if (current.getAttribute(PDF_VISIBLE_ELEMENT_ATTRIBUTE) === "true") {
      hidden = false;
      continue;
    }
    if (
      svgInlineStyleValue(current, "display")
        ?.replace(/\s*!important\s*$/i, "")
        .trim()
        .toLowerCase() === "none"
    ) {
      return true;
    }
    const visibility = declaredPdfVisibility(current);
    if (visibility) hidden = visibility === "hidden";
  }
  return hidden;
}

function hasPdfVisibleClipTextContent(element: Element): boolean {
  return pdfTextElements(element).some((candidate) => {
    const hasDirectRenderableText = Array.from(candidate.childNodes).some(
      (node) =>
        (node.nodeType === 3 || node.nodeType === 4) && hasPdfRenderableText(node.nodeValue ?? "")
    );
    return hasDirectRenderableText && !isPdfClipElementHidden(candidate);
  });
}

function pdfReferenceContainsVisibleClipText(
  svg: SVGSVGElement,
  reference: Element,
  visitedIds = new Set<string>()
): boolean {
  if (hasPdfVisibleClipTextContent(reference)) return true;

  const referenceId = reference.getAttribute("id");
  if (referenceId) {
    if (visitedIds.has(referenceId)) return false;
    visitedIds = new Set(visitedIds).add(referenceId);
  }
  return pdfUseElements(reference).some((use) => {
    if (isPdfClipElementHidden(use)) return false;
    const nestedReferenceId = pdfUseReferenceId(use);
    const nestedReference = nestedReferenceId ? pdfElementsById(svg, nestedReferenceId) : undefined;
    return nestedReference
      ? pdfReferenceContainsVisibleClipText(svg, nestedReference, visitedIds)
      : false;
  });
}

function assertPdfTextPathsSupported(
  svg: SVGSVGElement,
  reachableDefinitionIds: ReadonlySet<string>
): void {
  for (const textPath of svg.querySelectorAll<SVGElement>("textPath")) {
    if (isPdfTextInUnreferencedDefinition(textPath, svg, reachableDefinitionIds)) continue;
    if (hasPdfVisibleTextContent(textPath)) {
      throw new Error(
        "PDF export cannot render <textPath> content yet. Convert text to regular text before exporting."
      );
    }
  }
}

function assertPdfTextClipPathsSupported(
  svg: SVGSVGElement,
  reachableDefinitionIds: ReadonlySet<string>
): void {
  for (const clipPath of svg.querySelectorAll<SVGElement>("clipPath")) {
    if (isPdfTextInUnreferencedDefinition(clipPath, svg, reachableDefinitionIds)) continue;
    if (pdfReferenceContainsVisibleClipText(svg, clipPath)) {
      throw new Error(
        "PDF export cannot render text-based clip paths yet. Convert clipping text to paths before exporting."
      );
    }
  }
}

export function getPdfFontRegistrationsReferencedBySvg(svg: SVGSVGElement): PdfFontRegistration[] {
  const reachableDefinitionIds = getPdfReachableDefinitionIds(svg);
  assertPdfTextClipPathsSupported(svg, reachableDefinitionIds);
  assertPdfTextPathsSupported(svg, reachableDefinitionIds);
  const candidates = getPdfFontRegistrationPlan(getPdfFontFamiliesReferencedBySvg(svg));
  const used = new Set<string>();
  for (const { element, text } of getPdfTextRuns(svg, reachableDefinitionIds)) {
    if (!hasPdfRenderableText(text)) continue;
    const registration = requirePdfRegistrationForTextElement(element, candidates);
    used.add(`${registration.pdfFamily}|${registration.style}|${registration.weight}`);
  }
  return candidates.filter(({ pdfFamily, style, weight }) =>
    used.has(`${pdfFamily}|${style}|${weight}`)
  );
}

function codePointLabel(codePoint: number): string {
  return `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`;
}

function requiresOpenTypeShaping(character: string, codePoint: number): boolean {
  if (/\p{Mark}/u.test(character)) return true;
  return (
    (codePoint >= 0x0590 && codePoint <= 0x08ff) ||
    (codePoint >= 0x0900 && codePoint <= 0x0dff) ||
    (codePoint >= 0x0f00 && codePoint <= 0x109f) ||
    (codePoint >= 0x1780 && codePoint <= 0x17ff) ||
    (codePoint >= 0x1a00 && codePoint <= 0x1cff) ||
    (codePoint >= 0xa800 && codePoint <= 0xa8ff) ||
    (codePoint >= 0xaa00 && codePoint <= 0xaaff) ||
    (codePoint >= 0xab00 && codePoint <= 0xabff) ||
    (codePoint >= 0xfb00 && codePoint <= 0xfeff)
  );
}

function isPdfLayoutWhitespace(character: string): boolean {
  const codePoint = character.codePointAt(0);
  return (
    codePoint !== undefined && (codePoint <= 0x20 || codePoint === 0x200b || codePoint === 0xfeff)
  );
}

function hasPdfRenderableText(text: string): boolean {
  return Array.from(text).some((character) => !isPdfLayoutWhitespace(character));
}

function assertPdfTextCoverage(
  svg: SVGSVGElement,
  pdf: import("jspdf").jsPDF,
  registrations: readonly PdfFontRegistration[]
): void {
  for (const { element, text } of getPdfTextRuns(svg)) {
    if (!hasPdfRenderableText(text)) continue;
    const registration = requirePdfRegistrationForTextElement(element, registrations);
    pdf.setFont(registration.pdfFamily, registration.jsPdfStyle);
    const codeMap = pdf.getFont().metadata?.cmap?.unicode?.codeMap as
      Record<string, number> | undefined;
    if (!codeMap) continue;
    for (const character of text) {
      const codePoint = character.codePointAt(0);
      if (codePoint === undefined || isPdfLayoutWhitespace(character)) continue;
      if (codePoint > 0xffff || codeMap[String(codePoint)] == null) {
        throw new Error(
          `PDF export cannot render ${codePointLabel(codePoint ?? 0)} in ${registration.editorFamily} ${registration.weight} ${registration.style}. Choose a font with that glyph.`
        );
      }
      if (requiresOpenTypeShaping(character, codePoint)) {
        throw new Error(
          `PDF export cannot shape ${codePointLabel(codePoint)} in ${registration.editorFamily}. Complex-script text is not supported yet.`
        );
      }
    }
  }
}

export function getPdfFontFamiliesReferencedBySvg(svg: Element): string[] {
  if (!svg.querySelector("text, tspan")) return [];

  const declaredFamilies: string[] = [];
  const collectDeclarations = (value: string | null) => {
    if (!value) return;
    const matches = value.matchAll(/(?:^|[;{])\s*font-family\s*:\s*([^;}{]+)/gi);
    for (const match of matches) declaredFamilies.push(match[1]);
  };

  const elements = [svg, ...Array.from(svg.querySelectorAll<SVGElement>("[font-family], [style]"))];
  for (const element of elements) {
    const attribute = element.getAttribute("font-family");
    if (attribute) declaredFamilies.push(attribute);
    collectDeclarations(element.getAttribute("style"));
  }
  for (const style of svg.querySelectorAll("style")) {
    collectDeclarations(style.textContent);
  }

  const normalizedDeclarations = declaredFamilies.flatMap((value) =>
    value.split(",").map((candidate) => {
      const trimmed = candidate.trim().replace(/\s*!important\s*$/i, "");
      const quote = trimmed[0] === '"' || trimmed[0] === "'" ? trimmed[0] : "";
      return quote && trimmed.endsWith(quote) ? trimmed.slice(1, -1).trim() : trimmed;
    })
  );
  const normalizedSet = new Set(normalizedDeclarations.map((family) => family.toLowerCase()));
  return TEXT_FONT_REGISTRY.filter(({ family }) => normalizedSet.has(family.toLowerCase())).map(
    ({ family }) => family
  );
}

function asciiBytes(value: string): Uint8Array {
  return Uint8Array.from(value, (character) => character.charCodeAt(0));
}

function findBytes(source: Uint8Array, needle: Uint8Array, fromIndex = 0): number {
  if (needle.length === 0) return fromIndex;
  outer: for (let index = fromIndex; index <= source.length - needle.length; index += 1) {
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (source[index + offset] !== needle[offset]) continue outer;
    }
    return index;
  }
  return -1;
}

function findLastBytes(source: Uint8Array, needle: Uint8Array): number {
  let lastIndex = -1;
  let fromIndex = 0;
  while (true) {
    const index = findBytes(source, needle, fromIndex);
    if (index < 0) return lastIndex;
    lastIndex = index;
    fromIndex = index + 1;
  }
}

function readAsciiInteger(source: Uint8Array, start: number, end: number): number | undefined {
  if (start >= end) return undefined;
  let value = 0;
  for (let index = start; index < end; index += 1) {
    const digit = source[index] - 0x30;
    if (digit < 0 || digit > 9) return undefined;
    value = value * 10 + digit;
  }
  return value;
}

function writeFixedAsciiInteger(
  target: Uint8Array,
  start: number,
  width: number,
  value: number
): void {
  const encoded = String(value).padStart(width, "0");
  if (encoded.length > width) throw new Error("The PDF cross-reference offset is too large.");
  for (let offset = 0; offset < width; offset += 1) {
    target[start + offset] = encoded.charCodeAt(offset);
  }
}

function isPdfWhitespace(value: number): boolean {
  return value === 0x09 || value === 0x0a || value === 0x0c || value === 0x0d || value === 0x20;
}

function findPdfInfoObjectNumber(
  source: Uint8Array,
  trailerIndex: number,
  trailerEnd: number
): number | undefined {
  const infoIndex = findBytes(source, asciiBytes("/Info"), trailerIndex);
  if (infoIndex < 0 || infoIndex >= trailerEnd) return undefined;

  let cursor = infoIndex + "/Info".length;
  while (cursor < trailerEnd && isPdfWhitespace(source[cursor])) cursor += 1;
  const objectStart = cursor;
  while (cursor < trailerEnd && source[cursor] >= 0x30 && source[cursor] <= 0x39) cursor += 1;
  const objectNumber = readAsciiInteger(source, objectStart, cursor);
  if (objectNumber === undefined) return undefined;
  while (cursor < trailerEnd && isPdfWhitespace(source[cursor])) cursor += 1;
  if (source[cursor] !== 0x30) return undefined;
  cursor += 1;
  while (cursor < trailerEnd && isPdfWhitespace(source[cursor])) cursor += 1;
  return source[cursor] === 0x52 ? objectNumber : undefined;
}

function readAsciiLine(source: Uint8Array, start: number, end: number): string {
  let line = "";
  for (let index = start; index < end; index += 1) line += String.fromCharCode(source[index]);
  return line.trim();
}

function findPdfObjectOffset(
  source: Uint8Array,
  xrefIndex: number,
  trailerIndex: number,
  objectNumber: number
): number | undefined {
  let lineStart = xrefIndex + "xref\n".length;
  let subsectionObject = -1;
  let entriesRemaining = 0;
  while (lineStart < trailerIndex) {
    const lineEnd = findBytes(source, Uint8Array.of(0x0a), lineStart);
    if (lineEnd < 0 || lineEnd > trailerIndex) return undefined;
    const fields = readAsciiLine(source, lineStart, lineEnd).split(/\s+/);
    if (fields.length === 2 && fields.every((field) => /^\d+$/.test(field))) {
      subsectionObject = Number(fields[0]);
      entriesRemaining = Number(fields[1]);
    } else if (entriesRemaining > 0) {
      if (subsectionObject === objectNumber && fields[2] === "n") {
        return readAsciiInteger(source, lineStart, lineStart + 10);
      }
      subsectionObject += 1;
      entriesRemaining -= 1;
    }
    lineStart = lineEnd + 1;
  }
  return undefined;
}

function findPdfObjectEnd(source: Uint8Array, start: number): number {
  let literalDepth = 0;
  let escaped = false;
  let hexString = false;
  let comment = false;
  for (let index = start; index < source.length; index += 1) {
    const value = source[index];
    if (comment) {
      if (value === 0x0a || value === 0x0d) comment = false;
      continue;
    }
    if (literalDepth > 0) {
      if (escaped) escaped = false;
      else if (value === 0x5c) escaped = true;
      else if (value === 0x28) literalDepth += 1;
      else if (value === 0x29) literalDepth -= 1;
      continue;
    }
    if (hexString) {
      if (value === 0x3e) hexString = false;
      continue;
    }
    if (value === 0x25) comment = true;
    else if (value === 0x28) literalDepth = 1;
    else if (value === 0x3c && source[index + 1] !== 0x3c && source[index - 1] !== 0x3c) {
      hexString = true;
    } else if (
      value === 0x65 &&
      findBytes(source, asciiBytes("endobj"), index) === index &&
      (index === start || isPdfWhitespace(source[index - 1])) &&
      (index + "endobj".length >= source.length || isPdfWhitespace(source[index + "endobj".length]))
    ) {
      return index;
    }
  }
  return -1;
}

function findPdfProducerMarker(
  source: Uint8Array,
  start: number,
  end: number,
  marker: Uint8Array
): number {
  let literalDepth = 0;
  let escaped = false;
  let hexString = false;
  let comment = false;
  for (let index = start; index < end; index += 1) {
    const value = source[index];
    if (comment) {
      if (value === 0x0a || value === 0x0d) comment = false;
      continue;
    }
    if (literalDepth > 0) {
      if (escaped) escaped = false;
      else if (value === 0x5c) escaped = true;
      else if (value === 0x28) literalDepth += 1;
      else if (value === 0x29) literalDepth -= 1;
      continue;
    }
    if (hexString) {
      if (value === 0x3e) hexString = false;
      continue;
    }
    if (value === 0x25) comment = true;
    else if (value === 0x28) literalDepth = 1;
    else if (value === 0x3c && source[index + 1] !== 0x3c && source[index - 1] !== 0x3c) {
      hexString = true;
    } else if (value === 0x2f && findBytes(source, marker, index) === index) return index;
  }
  return -1;
}

export function replacePdfProducer(
  arrayBuffer: ArrayBuffer,
  sourceProducer: string,
  targetProducer = "OpenSketch"
): ArrayBuffer {
  if (!/^[\x20-\x7e]+$/.test(targetProducer) || /[()\\]/.test(targetProducer)) {
    throw new Error("The PDF producer contains characters that cannot be written safely.");
  }

  const source = new Uint8Array(arrayBuffer);
  const sourceMarker = asciiBytes(`/Producer (${sourceProducer})`);

  const xrefLine = asciiBytes("\nxref\n");
  const xrefPrefixIndex = findLastBytes(source, xrefLine);
  const xrefIndex =
    xrefPrefixIndex >= 0 ? xrefPrefixIndex + 1 : findLastBytes(source, asciiBytes("xref\n"));
  const trailerIndex =
    xrefIndex < 0 ? -1 : findBytes(source, asciiBytes("trailer\n"), xrefIndex + "xref\n".length);
  const startxrefIndex = findLastBytes(source, asciiBytes("startxref\n"));
  if (xrefIndex < 0 || trailerIndex < 0 || startxrefIndex < 0 || trailerIndex >= startxrefIndex) {
    throw new Error("The PDF output did not contain a patchable cross-reference table.");
  }

  const infoObjectNumber = findPdfInfoObjectNumber(source, trailerIndex, startxrefIndex);
  const infoOffset =
    infoObjectNumber === undefined
      ? undefined
      : findPdfObjectOffset(source, xrefIndex, trailerIndex, infoObjectNumber);
  const infoEnd = infoOffset === undefined ? -1 : findPdfObjectEnd(source, infoOffset);
  const candidateSourceIndex =
    infoOffset === undefined
      ? -1
      : findPdfProducerMarker(source, infoOffset, infoEnd, sourceMarker);
  const sourceIndex =
    candidateSourceIndex >= 0 && candidateSourceIndex < infoEnd ? candidateSourceIndex : -1;
  if (sourceIndex < 0) {
    throw new Error(
      `The PDF Info dictionary did not contain the expected producer "${sourceProducer}".`
    );
  }

  const replacement = asciiBytes(`/Producer (${targetProducer})`);
  const byteShift = replacement.length - sourceMarker.length;
  const patched = new Uint8Array(source.length + byteShift);
  patched.set(source.subarray(0, sourceIndex));
  patched.set(replacement, sourceIndex);
  patched.set(source.subarray(sourceIndex + sourceMarker.length), sourceIndex + replacement.length);

  const patchedXrefPrefixIndex = findLastBytes(patched, xrefLine);
  const patchedXrefIndex =
    patchedXrefPrefixIndex >= 0
      ? patchedXrefPrefixIndex + 1
      : findLastBytes(patched, asciiBytes("xref\n"));
  const patchedTrailerIndex =
    patchedXrefIndex < 0
      ? -1
      : findBytes(patched, asciiBytes("trailer\n"), patchedXrefIndex + "xref\n".length);
  if (patchedXrefIndex < 0 || patchedTrailerIndex < 0) {
    throw new Error("The PDF output did not contain a patchable cross-reference table.");
  }

  let lineStart = patchedXrefIndex + "xref\n".length;
  while (lineStart < patchedTrailerIndex) {
    const lineEnd = findBytes(patched, Uint8Array.of(0x0a), lineStart);
    if (lineEnd < 0 || lineEnd > patchedTrailerIndex) break;
    if (lineEnd - lineStart >= 18 && patched[lineStart + 17] === 0x6e) {
      const offset = readAsciiInteger(patched, lineStart, lineStart + 10);
      if (offset !== undefined && offset > sourceIndex) {
        writeFixedAsciiInteger(patched, lineStart, 10, offset + byteShift);
      }
    }
    lineStart = lineEnd + 1;
  }

  const patchedStartxrefIndex = findLastBytes(patched, asciiBytes("startxref\n"));
  const startxrefStart = patchedStartxrefIndex + "startxref\n".length;
  const startxrefEnd =
    patchedStartxrefIndex < 0 ? -1 : findBytes(patched, Uint8Array.of(0x0a), startxrefStart);
  const startxref =
    patchedStartxrefIndex < 0 || startxrefEnd < 0
      ? undefined
      : readAsciiInteger(patched, startxrefStart, startxrefEnd);
  if (startxref === undefined) {
    throw new Error("The PDF output did not contain a valid cross-reference offset.");
  }
  writeFixedAsciiInteger(
    patched,
    startxrefStart,
    startxrefEnd - startxrefStart,
    startxref + byteShift
  );

  return patched.buffer as ArrayBuffer;
}

function escapeXml(value: string): string {
  const xmlSafeValue = Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    const valid =
      codePoint === 0x09 ||
      codePoint === 0x0a ||
      codePoint === 0x0d ||
      (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
      (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
      (codePoint >= 0x10000 && codePoint <= 0x10ffff);
    return valid ? character : "\uFFFD";
  }).join("");
  return xmlSafeValue.replace(/[<>&'"]/g, (character) => {
    const values: Record<string, string> = {
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      "'": "&apos;",
      '"': "&quot;"
    };
    return values[character];
  });
}

export function buildPdfXmpMetadata(metadata: PdfExportMetadata): string {
  const manifest = escapeXml(provenanceManifestJson(metadata.provenance));
  const author = metadata.author?.trim();
  const creator = author
    ? "\n      <dc:creator><rdf:Seq><rdf:li>" +
      escapeXml(author) +
      "</rdf:li></rdf:Seq></dc:creator>"
    : "";
  return (
    '<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>\n' +
    '<x:xmpmeta xmlns:x="adobe:ns:meta/">\n' +
    '  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n' +
    '    <rdf:Description rdf:about=""\n' +
    '      xmlns:dc="http://purl.org/dc/elements/1.1/"\n' +
    '      xmlns:pdf="http://ns.adobe.com/pdf/1.3/"\n' +
    '      xmlns:opensketch="https://opensketch.app/ns/provenance/1.0/">\n' +
    '      <dc:title><rdf:Alt><rdf:li xml:lang="x-default">' +
    escapeXml(metadata.title) +
    "</rdf:li></rdf:Alt></dc:title>\n" +
    '      <dc:description><rdf:Alt><rdf:li xml:lang="x-default">' +
    escapeXml(metadata.description) +
    "</rdf:li></rdf:Alt></dc:description>" +
    creator +
    "\n" +
    "      <pdf:Producer>OpenSketch</pdf:Producer>\n" +
    "      <opensketch:applicationCredit>" +
    escapeXml(metadata.credit) +
    "</opensketch:applicationCredit>\n" +
    "      <opensketch:provenanceManifest>" +
    manifest +
    "</opensketch:provenanceManifest>\n" +
    "    </rdf:Description>\n" +
    "  </rdf:RDF>\n" +
    "</x:xmpmeta>\n" +
    '<?xpacket end="w"?>'
  );
}

export async function svgToPdfBlob(
  svgSource: string,
  width: number,
  height: number,
  metadata: PdfExportMetadata
): Promise<Blob> {
  const [{ jsPDF }] = await Promise.all([import("jspdf"), import("svg2pdf.js")]);
  const parsed = new DOMParser().parseFromString(svgSource, "image/svg+xml");
  if (parsed.querySelector("parsererror")) {
    throw new Error("The generated SVG could not be parsed for PDF export.");
  }
  const svg = parsed.documentElement as unknown as SVGSVGElement;
  materializePdfTextStyles(svg);
  normalizePdfSvgFontFamilies(svg);
  const pdf = new jsPDF({
    orientation: width >= height ? "landscape" : "portrait",
    unit: "px",
    format: [width, height],
    hotfixes: ["px_scaling"],
    compress: true,
    putOnlyUsedFonts: true
  });
  const properties: import("jspdf").DocumentProperties = {
    title: metadata.title,
    subject: [
      metadata.description,
      metadata.credit,
      ...metadata.provenance.assets.map((asset) => asset.credit).filter(Boolean)
    ]
      .filter(Boolean)
      .join("\n\n"),
    creator: "OpenSketch",
    keywords: "scientific figure, biology, vector illustration"
  };
  const author = metadata.author?.trim();
  if (author) properties.author = author;
  pdf.setProperties(properties);
  pdf.addMetadata(buildPdfXmpMetadata(metadata), true);
  pdf.setDisplayMode("fullpage", "single");
  const registrations = await registerBundledFonts(pdf, svg);
  assertPdfTextCoverage(svg, pdf, registrations);
  try {
    await pdf.svg(svg, {
      x: 0,
      y: 0,
      width,
      height,
      loadExternalStyleSheets: false
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error("PDF export could not render the figure: " + reason);
  }
  const output = pdf.output("arraybuffer") as ArrayBuffer;
  return new Blob([replacePdfProducer(output, "jsPDF " + jsPDF.version)], {
    type: "application/pdf"
  });
}
