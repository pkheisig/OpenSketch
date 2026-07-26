import { describe, expect, it } from "vitest";
import { sanitizeUploadedSvg } from "../apps/web/src/assets/browserSanitizer";
import { assertSafeSvg, sanitizeSvg } from "../scripts/assets/sanitize-svg";

describe("SVG sanitization", () => {
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

  it("rejects executable user uploads before insertion", () => {
    expect(() => sanitizeUploadedSvg(unsafe)).toThrow("external or executable");
  });

  it("accepts local SVG namespaces and internal references", () => {
    const safe = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">
      <defs><linearGradient id="g"><stop stop-color="#fff"/></linearGradient></defs>
      <rect width="10" height="10" fill="url(#g)"/>
    </svg>`;
    const clean = sanitizeUploadedSvg(safe, "local");
    expect(clean).toContain("local-g");
    expect(clean).toContain("url(#local-g)");
  });

  it("removes external references embedded in uploaded SVG styles", () => {
    const styled = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">
      <style>.tracked { fill: url(https://example.org/paint.svg); }</style>
      <rect class="tracked" width="10" height="10"/>
    </svg>`;
    const clean = sanitizeUploadedSvg(styled, "local");
    expect(clean).not.toContain("example.org");
    expect(clean).not.toContain("<style");
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
    const uploaded = sanitizeUploadedSvg(reusable, "upload");
    expect(uploaded).toContain('href="#upload-shape"');
  });

  it("preserves internal masks and filters while namespacing their references", () => {
    const effects = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
      <defs>
        <mask id="fade"><rect width="20" height="20" fill="white"/></mask>
        <filter id="shadow"><feDropShadow dx="1" dy="1" stdDeviation="1"/></filter>
      </defs>
      <circle cx="10" cy="10" r="8" mask="url(#fade)" filter="url(#shadow)"/>
    </svg>`;
    const clean = sanitizeUploadedSvg(effects, "upload");
    expect(clean).toContain('id="upload-fade"');
    expect(clean).toContain('id="upload-shadow"');
    expect(clean).toContain("url(#upload-fade)");
    expect(clean).toContain("url(#upload-shadow)");
  });

  it("removes external use references", () => {
    const externalUse = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">
      <use href="https://example.org/shapes.svg#cell"/>
    </svg>`;
    expect(sanitizeSvg(externalUse, "asset")).not.toContain("<use");
    expect(sanitizeUploadedSvg(externalUse, "upload")).not.toContain("<use");
  });
});
