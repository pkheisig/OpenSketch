import { describe, expect, it } from "vitest";
import { buildPdfXmpMetadata } from "../apps/web/src/export/pdf";

describe("PDF export metadata", () => {
  it("embeds the canonical provenance manifest in standards-compatible XMP", () => {
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
    const xmp = buildPdfXmpMetadata(metadata);

    expect(xmp).toContain('xmlns:opensketch="https://opensketch.app/ns/provenance/1.0/"');
    expect(xmp).toContain("<opensketch:provenanceManifest>");
    expect(xmp).toContain("&quot;assetId&quot;:&quot;asset-a&quot;");
    expect(xmp).toContain("https://example.org/alpha?a=1&amp;b=2");
    expect(xmp).toContain("&lt;figure&gt;");
    expect(xmp).toContain('<?xpacket end="w"?>');
  });
});
