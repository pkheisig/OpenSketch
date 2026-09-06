import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";

const cases = [
  {
    name: "A4 portrait",
    width: 2480,
    height: 3508,
    dpi: 300,
    widthPoints: 595.2,
    heightPoints: 841.92
  },
  {
    name: "A4 landscape",
    width: 3508,
    height: 2480,
    dpi: 300,
    widthPoints: 841.92,
    heightPoints: 595.2
  },
  {
    name: "Letter portrait",
    width: 816,
    height: 1056,
    dpi: 96,
    widthPoints: 612,
    heightPoints: 792
  },
  {
    name: "Letter at 150 DPI",
    width: 1275,
    height: 1650,
    dpi: 150,
    widthPoints: 612,
    heightPoints: 792
  },
  {
    name: "Letter at 600 DPI",
    width: 5100,
    height: 6600,
    dpi: 600,
    widthPoints: 612,
    heightPoints: 792
  },
  {
    name: "custom fractional extent",
    width: 1234.5,
    height: 987.25,
    dpi: 150,
    widthPoints: 592.56,
    heightPoints: 473.88
  }
] as const;

test("writes actual PDF pages at the document physical extent", async ({ page }) => {
  await page.goto("./");
  const encodedPdfs = await page.evaluate(async (sizes) => {
    const moduleUrl = new URL("src/export/pdf.ts", document.baseURI).href;
    const { svgToPdfBlob } = await import(moduleUrl);
    const metadata = {
      title: "Physical export dimensions",
      description: "PDF page-size contract",
      credit: "OpenSketch",
      provenance: { version: 1 as const, assets: [] }
    };

    return Promise.all(
      sizes.map(async ({ width, height, dpi }) => {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="white" /></svg>`;
        const blob = await svgToPdfBlob(svg, { width, height, dpi }, metadata);
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = "";
        for (let offset = 0; offset < bytes.length; offset += 0x8000) {
          binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
        }
        return btoa(binary);
      })
    );
  }, cases);

  for (const [index, testCase] of cases.entries()) {
    const pdf = await PDFDocument.load(Buffer.from(encodedPdfs[index], "base64"));
    const size = pdf.getPage(0).getSize();
    expect(size.width, testCase.name).toBeCloseTo(testCase.widthPoints, 2);
    expect(size.height, testCase.name).toBeCloseTo(testCase.heightPoints, 2);
  }
});

test("rejects an unrepresentable PDF page before creating an artifact", async ({ page }) => {
  await page.goto("./");
  const error = await page.evaluate(async () => {
    const moduleUrl = new URL("src/export/pdf.ts", document.baseURI).href;
    const { svgToPdfBlob } = await import(moduleUrl);
    const metadata = {
      title: "Physical export dimensions",
      description: "PDF page-size contract",
      credit: "OpenSketch",
      provenance: { version: 1 as const, assets: [] }
    };
    try {
      await svgToPdfBlob(
        '<svg xmlns="http://www.w3.org/2000/svg" width="20000" height="1000"><rect width="20000" height="1000" /></svg>',
        { width: 20_000, height: 1_000, dpi: 1 },
        metadata
      );
      return null;
    } catch (caught) {
      return caught instanceof Error ? caught.message : String(caught);
    }
  });

  expect(error).toContain("PDF page dimensions exceed the supported");
});
