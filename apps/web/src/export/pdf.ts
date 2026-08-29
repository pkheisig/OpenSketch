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
  editorFamilies: readonly string[]
): Promise<void> {
  const registrations = getPdfFontRegistrationPlan(editorFamilies);
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

export function normalizePdfFontFamilyList(value: string): string {
  return normalizeFontFamilyList(value);
}

function normalizeFontWeightValue(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^(normal|bold|[0-9]+(?:\.[0-9]+)?)(\s*!important)?$/i);
  if (!match) return trimmed;
  return String(normalizePdfFontWeight(match[1])) + (match[2] ?? "");
}

function normalizeCssFontFamilies(value: string): string {
  return value.replace(
    /(font-family\s*:\s*)([^;}{]+)/gi,
    (_match, prefix: string, families: string) => prefix + normalizeFontFamilyList(families)
  );
}

function normalizeCssFontWeights(value: string): string {
  return value.replace(
    /(font-weight\s*:\s*)([^;}{]+)/gi,
    (_match, prefix: string, weight: string) => prefix + normalizeFontWeightValue(weight)
  );
}

export function normalizePdfSvgFontFamilies(svg: Element): void {
  const elements = [
    svg,
    ...Array.from(svg.querySelectorAll<SVGElement>("[font-family], [font-weight], [style]"))
  ];
  for (const element of elements) {
    const fontFamily = element.getAttribute("font-family");
    if (fontFamily) element.setAttribute("font-family", normalizeFontFamilyList(fontFamily));
    const fontWeight = element.getAttribute("font-weight");
    if (fontWeight) element.setAttribute("font-weight", normalizeFontWeightValue(fontWeight));
    const style = element.getAttribute("style");
    if (style) {
      element.setAttribute("style", normalizeCssFontWeights(normalizeCssFontFamilies(style)));
    }
  }
  for (const style of svg.querySelectorAll("style")) {
    style.textContent = normalizeCssFontWeights(normalizeCssFontFamilies(style.textContent ?? ""));
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
      const trimmed = candidate.trim();
      const quote = trimmed[0] === '"' || trimmed[0] === "'" ? trimmed[0] : "";
      return quote && trimmed.endsWith(quote) ? trimmed.slice(1, -1).trim() : trimmed;
    })
  );
  const normalizedSet = new Set(normalizedDeclarations.map((family) => family.toLowerCase()));
  return TEXT_FONT_REGISTRY.filter(({ family }) => normalizedSet.has(family.toLowerCase())).map(
    ({ family }) => family
  );
}

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (character) => {
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
  const svg = parsed.documentElement;
  const referencedFamilies = getPdfFontFamiliesReferencedBySvg(svg);
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
  await registerBundledFonts(pdf, referencedFamilies);
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
  return pdf.output("blob");
}
