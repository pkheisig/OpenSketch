import { describe, expect, it } from "vitest";
import { sanitizeImportedSvg } from "../apps/web/src/assets/browserSanitizer";
import { assertSafeSvg, sanitizeSvg } from "../scripts/assets/sanitize-svg";

describe("SVG sanitization", () => {
  it("removes malformed exporter payloads appended after a single SVG root", () => {
    const clean = sanitizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>orphaned-export-payload</svg>',
      "asset"
    );

    expect(clean).toContain("<circle");
    expect(clean).not.toContain("orphaned-export-payload");
  });

  const unsafe = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
    <defs><linearGradient id="gradient1"><stop stop-color="#fff"/></linearGradient></defs>
    <script>alert(1)</script>
    <path id="shape" onclick="evil()" fill="url(#gradient1)" d="M0 0h20v20z"/>
    <image href="https://example.org/tracker.png"/>
  </svg>`;

  it("sanitizes and namespaces imported assets", () => {
    const clean = sanitizeSvg(unsafe, "nih-17-a");
    expect(clean).not.toMatch(/script|onclick|https:\/\/example/);
    expect(clean).toContain("nih-17-a-gradient1");
    expect(clean).toContain("url(#nih-17-a-gradient1)");
    expect(() => assertSafeSvg(clean)).not.toThrow();
  });

  it("strips harmless SVG document type declarations", () => {
    const clean = sanitizeSvg(
      '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>',
      "doctype"
    );
    expect(clean).not.toContain("<!DOCTYPE");
    expect(clean).toContain("<circle");
  });

  it("expands bounded literal namespace entities from legacy Illustrator SVGs", () => {
    const clean = sanitizeSvg(
      `<!DOCTYPE svg [
        <!ENTITY ns_ai "http://ns.adobe.com/AdobeIllustrator/10.0/">
      ]><svg xmlns="http://www.w3.org/2000/svg" xmlns:i="&ns_ai;" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>`,
      "illustrator"
    );
    expect(clean).not.toContain("<!DOCTYPE");
    expect(clean).not.toContain("&ns_ai;");
    expect(clean).toContain("<circle");
  });

  it("rejects executable imported media before insertion", () => {
    expect(() => sanitizeImportedSvg(unsafe)).toThrow("external or executable");
  });

  it("accepts local SVG namespaces and internal references", () => {
    const safe = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">
      <defs><linearGradient id="g"><stop stop-color="#fff"/></linearGradient></defs>
      <rect width="10" height="10" fill="url(#g)"/>
    </svg>`;
    const clean = sanitizeImportedSvg(safe, "local");
    expect(clean).toContain("local-g");
    expect(clean).toContain("url(#local-g)");
  });

  it("preserves bounded embedded image data URLs while removing external references", () => {
    const embedded =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    const source = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><image href="${embedded}" width="10" height="10"/><image href="https://example.org/lost.png" width="10" height="10"/></svg>`;
    const clean = sanitizeImportedSvg(source, "local");
    expect(clean).toContain(embedded);
    expect(clean).not.toContain("example.org");
  });

  it("removes external references embedded in imported SVG styles", () => {
    const styled = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">
      <style>.tracked { fill: url(https://example.org/paint.svg); }</style>
      <rect class="tracked" width="10" height="10"/>
    </svg>`;
    const clean = sanitizeImportedSvg(styled, "local");
    expect(clean).not.toContain("example.org");
    expect(clean).not.toContain("<style");
  });

  it("removes external paint URLs from ordinary SVG attributes", () => {
    const styled = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">
      <rect width="10" height="10" fill="url(https://example.org/paint.svg)"/>
    </svg>`;
    const clean = sanitizeImportedSvg(styled, "local");
    expect(clean).not.toContain("example.org");
  });

  it("preserves safe inline styles while namespacing internal references", () => {
    const styled = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">
      <defs><linearGradient id="paint"><stop stop-color="#fff"/></linearGradient></defs>
      <style>#shape { fill: url('#paint'); }</style>
      <rect id="shape" width="10" height="10"/>
    </svg>`;
    const clean = sanitizeImportedSvg(styled, "safe");
    expect(clean).toContain("#safe-shape");
    expect(clean).toContain("url(#safe-paint)");
  });

  it("rewrites namespaced IDs throughout supported CSS selectors in both sanitizers", () => {
    const styled = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
      <style>
        .parent #shape,
        g #shape,
        .a > #shape,
        .a + #shape,
        .a ~ #shape,
        #shape.class,
        .scope :not(#shape),
        .scope :is(#shape) { fill: #fff; stroke: #112233; mix-blend-mode: multiply; }
      </style>
      <g class="parent"><rect id="shape" class="class" width="10" height="10"/></g>
    </svg>`;

    const imported = sanitizeImportedSvg(styled, "import");
    expect(imported).toContain("#import-shape");
    expect(imported).not.toContain("#shape");
    expect(imported).toContain("#fff");
    expect(imported).toContain("#112233");

    const built = sanitizeSvg(styled, "import");
    expect(built).not.toContain("#shape");
    expect(built).toContain("fill:#fff");
    expect(built).toContain("mix-blend-mode:multiply");
  });

  it("preserves browser rewriting for numeric-start IDs", () => {
    const source = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">
      <style>#123abc { fill: #456; }</style>
      <rect id="123abc" width="10" height="10" />
    </svg>`;

    expect(sanitizeImportedSvg(source, "import")).toContain("#import-123abc");
  });

  it("does not confuse hex colors with internal IDs", () => {
    const colorLikeId = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">
      <style>#fff { stroke: #fff; }</style>
      <rect id="fff" width="10" height="10" fill="#fff"/>
    </svg>`;
    const clean = sanitizeSvg(colorLikeId, "asset");
    expect(clean).toContain('fill="#fff"');
    expect(clean).toContain("stroke:#fff");
    expect(clean).not.toContain("#asset-fff;}");
  });

  it("preserves and namespaces internal use references", () => {
    const reusable = `<ns0:svg xmlns:ns0="http://www.w3.org/2000/svg"
      xmlns:ns1="http://www.w3.org/1999/xlink" viewBox="0 0 10 10">
      <ns0:defs><ns0:rect id="shape" width="10" height="10"/></ns0:defs>
      <ns0:use ns1:href="#shape"/>
    </ns0:svg>`;
    const clean = sanitizeSvg(reusable, "asset");
    expect(clean).toContain('id="asset-shape"');
    expect(clean).toContain('href="#asset-shape"');
    const imported = sanitizeImportedSvg(reusable, "import");
    expect(imported).toContain('href="#import-shape"');
  });

  it("preserves internal masks and filters while namespacing their references", () => {
    const effects = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
      <defs>
        <mask id="fade"><rect width="20" height="20" fill="white"/></mask>
        <filter id="shadow"><feDropShadow dx="1" dy="1" stdDeviation="1"/></filter>
      </defs>
      <circle cx="10" cy="10" r="8" mask="url(#fade)" filter="url(#shadow)"/>
    </svg>`;
    const clean = sanitizeImportedSvg(effects, "import");
    expect(clean).toContain('id="import-fade"');
    expect(clean).toContain('id="import-shadow"');
    expect(clean).toContain("url(#import-fade)");
    expect(clean).toContain("url(#import-shadow)");
  });

  it("removes external use references", () => {
    const externalUse = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">
      <use href="https://example.org/shapes.svg#cell"/>
    </svg>`;
    expect(sanitizeSvg(externalUse, "asset")).not.toContain("<use");
    expect(sanitizeImportedSvg(externalUse, "import")).not.toContain("<use");
  });

  it("rejects malformed SVGs and SVGs without a viewBox", () => {
    expect(() => sanitizeImportedSvg("not svg", "import")).toThrow("not a valid SVG");
    expect(() =>
      sanitizeImportedSvg('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>', "import")
    ).toThrow("must define a viewBox");
  });
});
