import { describe, expect, it, vi } from "vitest";

describe("browser SVG sanitizer defensive cleanup", () => {
  it("preserves namespace declarations while removing surviving event attributes", async () => {
    vi.doMock("dompurify", () => ({
      default: {
        sanitize: (source: string) => source
      }
    }));

    const { sanitizeImportedSvg } = await import("../apps/web/src/assets/browserSanitizer");
    const clean = sanitizeImportedSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">
        <g xmlns:custom="urn:custom" oncustom="evil()"><rect width="10" height="10"/></g>
      </svg>`,
      "defensive"
    );

    expect(clean).toContain('xmlns:custom="urn:custom"');
    expect(clean).not.toContain("oncustom");
    vi.doUnmock("dompurify");
  });
});
