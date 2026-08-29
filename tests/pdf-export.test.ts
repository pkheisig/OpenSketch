import { describe, expect, it, vi } from "vitest";
import {
  buildPdfXmpMetadata,
  getJsPdfFontStyle,
  getPdfFontFamiliesReferencedBySvg,
  getPdfFontRegistrationPlan,
  loadPdfFontBase64,
  normalizePdfFontFamilyList,
  normalizePdfFontStyle,
  normalizePdfFontWeight,
  normalizePdfSvgFontFamilies,
  replacePdfProducer
} from "../apps/web/src/export/pdf";
import {
  getPdfFontFamily,
  TEXT_FONT_FAMILIES,
  TEXT_FONT_REGISTRY
} from "../apps/web/src/editor/fonts";

const metadata = {
  title: "A <figure>",
  description: "A figure & description",
  credit: "OpenSketch's application credit",
  provenance: {
    version: 1 as const,
    assets: [
      {
        assetId: "asset-a",
        name: "Alpha",
        source: "https://example.org/alpha?a=1&b=2",
        author: "A. Author",
        license: "CC-BY-4.0",
        credit: "A. Author / Example"
      }
    ]
  }
};

describe("PDF export metadata", () => {
  it("embeds the canonical provenance manifest in standards-compatible XMP", () => {
    const xmp = buildPdfXmpMetadata(metadata);

    expect(xmp).toContain('xmlns:opensketch="https://opensketch.app/ns/provenance/1.0/"');
    expect(xmp).toContain("<opensketch:provenanceManifest>");
    expect(xmp).toContain("&quot;assetId&quot;:&quot;asset-a&quot;");
    expect(xmp).toContain("https://example.org/alpha?a=1&amp;b=2");
    expect(xmp).toContain("&lt;figure&gt;");
    expect(xmp).not.toContain("<dc:creator>");
    expect(xmp).toContain("<pdf:Producer>OpenSketch</pdf:Producer>");
    expect(xmp).toContain('<?xpacket end="w"?>');
  });

  it("writes an explicit document author only when supplied", () => {
    const xmp = buildPdfXmpMetadata({
      ...metadata,
      author: "Ada & <Research>"
    });

    expect(xmp).toContain(
      "<dc:creator><rdf:Seq><rdf:li>Ada &amp; &lt;Research&gt;</rdf:li></rdf:Seq></dc:creator>"
    );
  });

  it("keeps the standard PDF producer aligned with the application", () => {
    const header = "%PDF-1.3\n";
    const info = "1 0 obj\n<<\n/Producer (jsPDF 4.2.1)\n>>\nendobj\n";
    const infoOffset = header.length;
    const xrefOffset = header.length + info.length;
    const source =
      header +
      info +
      `xref\n0 2\n0000000000 65535 f \n${String(infoOffset).padStart(10, "0")} 00000 n \ntrailer\n<< /Size 2 >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
    const sourceBytes = Uint8Array.from(source, (character) => character.charCodeAt(0));
    const patched = replacePdfProducer(sourceBytes.buffer, "jsPDF 4.2.1");
    const rawPdf = Buffer.from(patched).toString("latin1");

    expect(rawPdf).toContain("/Producer (OpenSketch)");
    expect(rawPdf).not.toContain("/Producer (jsPDF");
    const xrefIndex = rawPdf.indexOf("\nxref\n") + 1;
    const infoRow = rawPdf.indexOf("\n0000000009") + 1;
    expect(Number(rawPdf.slice(infoRow, infoRow + 10))).toBe(infoOffset);
    expect(Number(rawPdf.match(/startxref\n(\d+)/)?.[1])).toBe(xrefIndex);
  });

  it("maps every editor choice to all PDF weight and style registrations", () => {
    expect(TEXT_FONT_REGISTRY.map(({ family }) => family)).toEqual(TEXT_FONT_FAMILIES);
    expect(getPdfFontRegistrationPlan()).toHaveLength(72);
    expect(getPdfFontRegistrationPlan([])).toEqual([]);
    expect(getJsPdfFontStyle("normal", 400)).toBe("normal");
    expect(getJsPdfFontStyle("normal", 600)).toBe("600normal");
    expect(getJsPdfFontStyle("normal", 700)).toBe("bold");
    expect(getJsPdfFontStyle("italic", 400)).toBe("italic");
    expect(getJsPdfFontStyle("italic", 600)).toBe("600italic");
    expect(getJsPdfFontStyle("italic", 700)).toBe("bolditalic");

    for (const family of TEXT_FONT_FAMILIES) {
      const registrations = getPdfFontRegistrationPlan([family]);
      expect(registrations).toHaveLength(6);
      expect(new Set(registrations.map(({ pdfFamily }) => pdfFamily))).toEqual(
        new Set([getPdfFontFamily(family)])
      );
      expect(new Set(registrations.map(({ weight, style }) => `${weight}-${style}`))).toEqual(
        new Set([
          "400-normal",
          "600-normal",
          "700-normal",
          "400-italic",
          "600-italic",
          "700-italic"
        ])
      );
    }
  });

  it("discovers only declared font families in text-bearing SVGs", () => {
    const textFree = new DOMParser().parseFromString(
      `<svg xmlns="http://www.w3.org/2000/svg"><title>Inter and Noto Serif</title><desc>font-family: Lato</desc><metadata>{"fontFamily":"Roboto Mono"}</metadata></svg>`,
      "image/svg+xml"
    );
    expect(getPdfFontFamiliesReferencedBySvg(textFree.documentElement)).toEqual([]);

    const declared = new DOMParser().parseFromString(
      `<svg xmlns="http://www.w3.org/2000/svg"><style>.label { font-family: "Georgia", serif; }</style><text style="font-family: 'Inter', sans-serif">x</text></svg>`,
      "image/svg+xml"
    );
    expect(getPdfFontFamiliesReferencedBySvg(declared.documentElement)).toEqual([
      "Inter",
      "Georgia"
    ]);
  });

  it("normalizes the system Georgia choice to the bundled serif face", () => {
    expect(getPdfFontFamily("georgia")).toBe("Noto Serif");
    expect(getPdfFontRegistrationPlan(["georgia"])).toHaveLength(6);
    expect(normalizePdfFontFamilyList("Georgia, 'Source Serif 4', serif")).toBe(
      "Noto Serif, 'Source Serif 4', serif"
    );
    expect(normalizePdfFontFamilyList("georgia, inter")).toBe("Noto Serif, Inter");
    const parsed = new DOMParser().parseFromString(
      `<svg xmlns="http://www.w3.org/2000/svg"><style>.label { font-family: Georgia, serif; font-weight: 500; }.heavy { font-weight: 800; }.heavier { font-weight: 900 !important; }</style><g font-family="'Georgia', serif" font-weight="500"><text class="label heavier" style="font-weight: 800">x</text></g></svg>`,
      "image/svg+xml"
    );
    const svg = parsed.documentElement as SVGElement;
    expect(getPdfFontFamiliesReferencedBySvg(svg)).toContain("Georgia");
    normalizePdfSvgFontFamilies(svg);
    expect(svg.querySelector("g")?.getAttribute("font-family")).toBe("'Noto Serif', serif");
    expect(svg.querySelector("g")?.getAttribute("font-weight")).toBe("400");
    expect(svg.querySelector("text")?.getAttribute("style")).toBe("font-weight: 700");
    expect(svg.querySelector("style")?.textContent).toContain(
      "font-family: Noto Serif, serif; font-weight: 400"
    );
    expect(svg.querySelector("style")?.textContent).toContain("font-weight: 700");
    expect(svg.querySelector("style")?.textContent).toContain("font-weight: 700 !important");
  });

  it("maps imported CSS weights to the bundled PDF faces", () => {
    expect(normalizePdfFontWeight(500)).toBe(400);
    expect(normalizePdfFontWeight(800)).toBe(700);
    expect(normalizePdfFontWeight(900)).toBe(700);
    expect(normalizePdfFontWeight("normal")).toBe(400);
    expect(normalizePdfFontWeight("bold")).toBe(700);
    expect(normalizePdfFontWeight("bolder")).toBe(700);
    expect(normalizePdfFontWeight("lighter")).toBe(400);
    expect(normalizePdfFontStyle("oblique 12deg")).toBe("italic");
  });

  it("resolves imported relative weights and oblique styles", () => {
    const parsed = new DOMParser().parseFromString(
      `<svg xmlns="http://www.w3.org/2000/svg"><style>.relative { font-weight: bolder; font-style: oblique 12deg; }.light { font-weight: lighter !important; font-style: oblique !important; }</style><text font-weight="bolder" font-style="oblique">bold</text><text style="font-weight: lighter !important; font-style: oblique 8deg">light</text></svg>`,
      "image/svg+xml"
    );
    const svg = parsed.documentElement;

    normalizePdfSvgFontFamilies(svg);

    expect(svg.querySelectorAll("text")[0]?.getAttribute("font-weight")).toBe("700");
    expect(svg.querySelectorAll("text")[0]?.getAttribute("font-style")).toBe("italic");
    expect(svg.querySelectorAll("text")[1]?.getAttribute("style")).toBe(
      "font-weight: 400 !important; font-style: italic"
    );
    expect(svg.querySelector("style")?.textContent).toContain(
      "font-weight: 700; font-style: italic"
    );
    expect(svg.querySelector("style")?.textContent).toContain(
      "font-weight: 400 !important; font-style: italic"
    );
  });

  it("fails clearly when a bundled PDF font cannot be loaded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503
      })
    );

    await expect(loadPdfFontBase64("/missing-pdf-font-503.ttf")).rejects.toThrow(
      "Could not load the bundled PDF font (503)."
    );
    vi.unstubAllGlobals();
  });
});
