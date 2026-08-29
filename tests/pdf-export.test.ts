import { describe, expect, it, vi } from "vitest";
import {
  buildPdfXmpMetadata,
  getJsPdfFontStyle,
  getPdfFontFamiliesReferencedBySvg,
  getPdfFontRegistrationPlan,
  loadPdfFontBase64,
  normalizePdfFontFamilyList,
  normalizePdfSvgFontFamilies
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
    expect(normalizePdfFontFamilyList("Georgia, 'Source Serif 4', serif")).toBe(
      "Noto Serif, 'Source Serif 4', serif"
    );
    const parsed = new DOMParser().parseFromString(
      `<svg xmlns="http://www.w3.org/2000/svg"><style>.label { font-family: Georgia, serif; }</style><g font-family="'Georgia', serif"><text class="label">x</text></g></svg>`,
      "image/svg+xml"
    );
    const svg = parsed.documentElement as SVGElement;
    expect(getPdfFontFamiliesReferencedBySvg(svg)).toContain("Georgia");
    normalizePdfSvgFontFamilies(svg);
    expect(svg.querySelector("g")?.getAttribute("font-family")).toBe("'Noto Serif', serif");
    expect(svg.querySelector("style")?.textContent).toContain("font-family: Noto Serif, serif");
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
