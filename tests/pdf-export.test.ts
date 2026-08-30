import { describe, expect, it, vi } from "vitest";
import {
  buildPdfXmpMetadata,
  getJsPdfFontStyle,
  getPdfFontFamiliesReferencedBySvg,
  getPdfFontRegistrationsReferencedBySvg,
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
      `xref\n0 2\n0000000000 65535 f \n${String(infoOffset).padStart(10, "0")} 00000 n \ntrailer\n<< /Size 2 /Info 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
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

  it("patches the Info dictionary when XMP contains the same producer marker", () => {
    const header = "%PDF-1.3\n";
    const xmp =
      "1 0 obj\n<< /Type /Metadata /Subtype /XML /Length 24 >>\nstream\n/Producer (jsPDF 4.2.1)\nendstream\nendobj\n";
    const info = "2 0 obj\n<< /Producer (jsPDF 4.2.1) >>\nendobj\n";
    const infoOffset = header.length + xmp.length;
    const xrefOffset = infoOffset + info.length;
    const source =
      header +
      xmp +
      info +
      `xref\n0 3\n0000000000 65535 f \n${String(header.length).padStart(10, "0")} 00000 n \n${String(infoOffset).padStart(10, "0")} 00000 n \ntrailer\n<< /Size 3 /Info 2 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
    const patched = replacePdfProducer(
      Uint8Array.from(source, (character) => character.charCodeAt(0)).buffer,
      "jsPDF 4.2.1"
    );
    const rawPdf = Buffer.from(patched).toString("latin1");

    expect(rawPdf).toContain("/Length 24");
    expect(rawPdf).toContain("stream\n/Producer (jsPDF 4.2.1)\nendstream");
    expect(rawPdf).toContain("2 0 obj\n<< /Producer (OpenSketch) >>");
    expect(rawPdf).not.toContain("2 0 obj\n<< /Producer (jsPDF 4.2.1) >>");
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

  it("selects only the weight and style faces used by text runs", () => {
    const parsed = new DOMParser().parseFromString(
      `<svg xmlns="http://www.w3.org/2000/svg"><text font-family="Inter" font-weight="600" font-style="italic">x</text><text font-family="Source Sans 3">y</text></svg>`,
      "image/svg+xml"
    );

    expect(
      getPdfFontRegistrationsReferencedBySvg(
        parsed.documentElement as unknown as SVGSVGElement
      ).map(({ pdfFamily, weight, style }) => `${pdfFamily}|${weight}-${style}`)
    ).toEqual(["Source Sans 3|400-normal", "Inter|600-italic"]);
  });

  it("includes CDATA text in PDF font registration", () => {
    const parsed = new DOMParser().parseFromString(
      `<svg xmlns="http://www.w3.org/2000/svg"><text font-family="Inter"><![CDATA[PDF text]]></text></svg>`,
      "image/svg+xml"
    );

    expect(
      getPdfFontRegistrationsReferencedBySvg(parsed.documentElement as unknown as SVGSVGElement)
    ).toEqual(expect.arrayContaining([expect.objectContaining({ pdfFamily: "Inter" })]));
  });

  it("preserves variable-font ranges in embedded CSS", () => {
    const parsed = new DOMParser().parseFromString(
      `<svg xmlns="http://www.w3.org/2000/svg"><style>@font-face { font-family: "Inter"; font-weight: 100 900; src: url(font.woff2); } .label { font-family: "Inter"; font-weight: 800; }</style><text class="label">x</text></svg>`,
      "image/svg+xml"
    );

    expect(() => normalizePdfSvgFontFamilies(parsed.documentElement)).not.toThrow();
    expect(parsed.querySelector("style")?.textContent).toContain("font-weight: 100 900");
    expect(parsed.querySelector("style")?.textContent).toContain("font-weight: 700");
  });

  it("preserves unresolved CSS font functions after text styles are materialized", () => {
    const parsed = new DOMParser().parseFromString(
      `<svg xmlns="http://www.w3.org/2000/svg"><style>.label { font-weight: var(--weight); font-style: var(--style); }.calculated { font-weight: calc(400 + 300); font-style: oblique calc(12deg); }</style><text class="label calculated">x</text></svg>`,
      "image/svg+xml"
    );

    expect(() => normalizePdfSvgFontFamilies(parsed.documentElement)).not.toThrow();
    expect(parsed.querySelector("style")?.textContent).toContain("font-weight: var(--weight)");
    expect(parsed.querySelector("style")?.textContent).toContain("font-style: var(--style)");
    expect(parsed.querySelector("style")?.textContent).toContain("font-weight: calc(400 + 300)");
    expect(parsed.querySelector("style")?.textContent).toContain("font-style: oblique calc(12deg)");
  });

  it("rejects referenced text clip paths instead of changing their geometry", () => {
    const parsed = new DOMParser().parseFromString(
      `<svg xmlns="http://www.w3.org/2000/svg"><defs><clipPath id="label-clip"><text font-family="Inter" fill="none">Label</text></clipPath></defs><rect width="100" height="40" clip-path="url(#label-clip)"/></svg>`,
      "image/svg+xml"
    );

    expect(() =>
      getPdfFontRegistrationsReferencedBySvg(parsed.documentElement as unknown as SVGSVGElement)
    ).toThrow("text-based clip paths");
  });

  it("ignores text in unreferenced SVG definitions", () => {
    const parsed = new DOMParser().parseFromString(
      `<svg xmlns="http://www.w3.org/2000/svg"><defs><text font-family="Atkinson Hyperlegible">AΓB</text></defs><rect width="100" height="40"/></svg>`,
      "image/svg+xml"
    );

    expect(
      getPdfFontRegistrationsReferencedBySvg(parsed.documentElement as unknown as SVGSVGElement)
    ).toEqual([]);
  });

  it("ignores font declarations inside CSS comments", () => {
    const parsed = new DOMParser().parseFromString(
      `<svg xmlns="http://www.w3.org/2000/svg"><style>.label { /* font-weight: invalid; font-style: invalid; */ font-weight: 400; font-style: normal; }</style><text class="label">x</text></svg>`,
      "image/svg+xml"
    );

    expect(() => normalizePdfSvgFontFamilies(parsed.documentElement)).not.toThrow();
    expect(parsed.querySelector("style")?.textContent).not.toContain("font-weight: invalid");
    expect(parsed.querySelector("style")?.textContent).toContain("font-weight: 400");
    expect(parsed.querySelector("style")?.textContent).toContain("font-style: normal");
  });

  it("rejects visible textPath content instead of silently dropping it", () => {
    const parsed = new DOMParser().parseFromString(
      `<svg xmlns="http://www.w3.org/2000/svg"><path id="curve" d="M0 0"/><text font-family="Inter"><textPath href="#curve">x</textPath></text></svg>`,
      "image/svg+xml"
    );

    expect(() =>
      getPdfFontRegistrationsReferencedBySvg(parsed.documentElement as unknown as SVGSVGElement)
    ).toThrow("textPath");
  });

  it("ignores hidden textPath content when selecting PDF fonts", () => {
    const parsed = new DOMParser().parseFromString(
      `<svg xmlns="http://www.w3.org/2000/svg"><path id="curve" d="M0 0"/><text visibility="hidden"><textPath href="#curve">x</textPath></text></svg>`,
      "image/svg+xml"
    );

    expect(
      getPdfFontRegistrationsReferencedBySvg(parsed.documentElement as unknown as SVGSVGElement)
    ).toEqual([]);
  });

  it("fails closed for an unregistered imported font family", () => {
    const parsed = new DOMParser().parseFromString(
      `<svg xmlns="http://www.w3.org/2000/svg"><text font-family="Arial, 'Source Sans 3'">x</text></svg>`,
      "image/svg+xml"
    );

    expect(() =>
      getPdfFontRegistrationsReferencedBySvg(parsed.documentElement as unknown as SVGSVGElement)
    ).toThrow('unregistered font family "Arial"');
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

  it("retries a PDF font after a transient fetch failure", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => Uint8Array.of(0x00, 0x01, 0x00, 0x00).buffer
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadPdfFontBase64("/retryable-pdf-font.ttf")).rejects.toThrow("offline");
    await expect(loadPdfFontBase64("/retryable-pdf-font.ttf")).resolves.toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  it("replaces XML-invalid metadata code points", () => {
    const xmp = buildPdfXmpMetadata({
      ...metadata,
      title: "Bad\u0000\u000b title",
      author: "Author\u001f"
    });

    expect(xmp).toContain("Bad�� title");
    expect(xmp).toContain("Author�");
    expect(
      [...xmp].some((character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        return codePoint < 0x20 && ![0x09, 0x0a, 0x0d].includes(codePoint);
      })
    ).toBe(false);
    expect(
      new DOMParser().parseFromString(xmp, "application/xml").querySelector("parsererror")
    ).toBeNull();
  });

  it("ignores text with no effective paint when selecting PDF fonts", () => {
    const parsed = new DOMParser().parseFromString(
      '<svg xmlns="http://www.w3.org/2000/svg"><text font-family="Atkinson Hyperlegible" fill-opacity="0">AΓB</text><text font-family="Inter" fill="transparent">AΓB</text></svg>',
      "image/svg+xml"
    );

    expect(
      getPdfFontRegistrationsReferencedBySvg(parsed.documentElement as unknown as SVGSVGElement)
    ).toEqual([]);
  });

  it("respects inline paint declarations over presentation attributes", () => {
    const parsed = new DOMParser().parseFromString(
      '<svg xmlns="http://www.w3.org/2000/svg"><text font-family="Inter" fill="none" style="fill: black">AΓB</text></svg>',
      "image/svg+xml"
    );

    expect(
      getPdfFontRegistrationsReferencedBySvg(parsed.documentElement as unknown as SVGSVGElement)
    ).toEqual(expect.arrayContaining([expect.objectContaining({ pdfFamily: "Inter" })]));
  });
});
