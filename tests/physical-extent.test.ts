import { describe, expect, it } from "vitest";
import { calculatePngExportResource } from "../apps/web/src/export/png";
import {
  assertPdfPageSize,
  applyPhysicalSvgViewport,
  calculateDocumentPhysicalExtent,
  formatPhysicalMillimeters
} from "../apps/web/src/export/physicalExtent";

describe("document physical extent", () => {
  it("converts logical pixels to the declared physical size without a 96-DPI fallback", () => {
    const extent = calculateDocumentPhysicalExtent({ width: 2480, height: 3508, dpi: 300 });

    expect(extent.widthPoints).toBeCloseTo(595.2, 8);
    expect(extent.heightPoints).toBeCloseTo(841.92, 8);
    expect(extent.widthMillimeters).toBeCloseTo(209.9733333333, 8);
    expect(extent.heightMillimeters).toBeCloseTo(297.0106666667, 8);
    expect(formatPhysicalMillimeters(extent.widthMillimeters)).toBe("209.973333mm");
    expect(formatPhysicalMillimeters(extent.heightMillimeters)).toBe("297.010667mm");
  });

  it("preserves the same physical extent across different document DPIs", () => {
    const at96 = calculateDocumentPhysicalExtent({ width: 816, height: 1056, dpi: 96 });
    const at300 = calculateDocumentPhysicalExtent({ width: 2550, height: 3300, dpi: 300 });

    expect(at96.widthMillimeters).toBeCloseTo(at300.widthMillimeters, 8);
    expect(at96.heightMillimeters).toBeCloseTo(at300.heightMillimeters, 8);
  });

  it("keeps PNG raster resolution changes on the same physical extent", () => {
    const documentSize = { width: 2480, height: 3508, dpi: 300 };
    const extent = calculateDocumentPhysicalExtent(documentSize);

    for (const outputDpi of [150, 600]) {
      const raster = calculatePngExportResource(
        documentSize.width,
        documentSize.height,
        documentSize.dpi,
        outputDpi
      );
      expect((raster.width / outputDpi) * 25.4).toBeCloseTo(extent.widthMillimeters, 8);
      expect((raster.height / outputDpi) * 25.4).toBeCloseTo(extent.heightMillimeters, 8);
    }
  });

  it("fails closed for non-finite and non-positive document dimensions", () => {
    for (const size of [
      { width: 0, height: 100, dpi: 300 },
      { width: 100, height: -1, dpi: 300 },
      { width: 100, height: 100, dpi: 0 },
      { width: Number.POSITIVE_INFINITY, height: 100, dpi: 300 },
      { width: 100, height: 100, dpi: Number.NaN }
    ]) {
      expect(() => calculateDocumentPhysicalExtent(size)).toThrow(
        "Document dimensions must be finite and positive"
      );
    }
  });

  it("rejects a physical page that exceeds the PDF format limit before generation", () => {
    const extent = calculateDocumentPhysicalExtent({ width: 20_000, height: 1_000, dpi: 1 });

    expect(() => assertPdfPageSize(extent)).toThrow("PDF page dimensions exceed the supported");
  });

  it("declares physical SVG dimensions without changing logical geometry", () => {
    const extent = calculateDocumentPhysicalExtent({ width: 2480, height: 3508, dpi: 300 });
    const source =
      '<svg xmlns="http://www.w3.org/2000/svg" width="2480" height="3508" viewBox="0 0 2480 3508">' +
      '<rect x="12" y="24" width="80" height="40" /></svg>';

    const output = applyPhysicalSvgViewport(source, extent);

    expect(output).toContain('width="209.973333mm"');
    expect(output).toContain('height="297.010667mm"');
    expect(output).toContain('viewBox="0 0 2480 3508"');
    expect(output).toContain('<rect x="12" y="24" width="80" height="40" />');
  });
});
