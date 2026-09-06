import { unzipSync, zipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";
import {
  PPTX_EMU_PER_INCH,
  exportPptx,
  parsePptxPackage,
  preparePptxImport
} from "../apps/web/src/interchange/pptx";
import { InterchangeImportError } from "../apps/web/src/interchange/formatCodecs";

async function blobBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === "function") return new Uint8Array(await blob.arrayBuffer());
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

function fileLike(bytes: Uint8Array, name: string, type: string): File {
  const copy = bytes.slice();
  return {
    name,
    type,
    size: copy.byteLength,
    arrayBuffer: async () => copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength),
    slice: (start?: number, end?: number) => {
      const sliced = copy.slice(start, end);
      return { arrayBuffer: async () => sliced.buffer } as Blob;
    }
  } as unknown as File;
}

async function packageFiles(blob: Blob): Promise<Record<string, Uint8Array>> {
  return unzipSync(await blobBytes(blob)) as Record<string, Uint8Array>;
}

function text(files: Record<string, Uint8Array>, path: string): string {
  return new TextDecoder().decode(files[path]);
}

function bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function readU16At(value: Uint8Array, offset: number): number {
  return value[offset] | (value[offset + 1] << 8);
}

function readU32At(value: Uint8Array, offset: number): number {
  return (
    (value[offset] |
      (value[offset + 1] << 8) |
      (value[offset + 2] << 16) |
      (value[offset + 3] * 0x1000000)) >>> 0
  );
}

function writeU16At(value: Uint8Array, offset: number, next: number): void {
  value[offset] = next & 0xff;
  value[offset + 1] = (next >>> 8) & 0xff;
}

function writeU32At(value: Uint8Array, offset: number, next: number): void {
  value[offset] = next & 0xff;
  value[offset + 1] = (next >>> 8) & 0xff;
  value[offset + 2] = (next >>> 16) & 0xff;
  value[offset + 3] = (next >>> 24) & 0xff;
}

function centralDirectoryOffsets(value: Uint8Array): number[] {
  const signature = 0x02014b50;
  const offsets: number[] = [];
  for (let offset = 0; offset + 46 <= value.length; offset += 1) {
    if (readU32At(value, offset) === signature) offsets.push(offset);
  }
  return offsets;
}

function expectPptxError(action: () => unknown, code: string): void {
  try {
    action();
    throw new Error(`Expected PPTX error ${code}.`);
  } catch (error) {
    expect(error).toMatchObject({ code });
  }
}

const PNG_FALLBACK = new Blob(
  [
    Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
      ),
      (char) => char.charCodeAt(0)
    )
  ],
  { type: "image/png" }
);

describe("bounded PPTX interchange", () => {
  it("exports one standards-shaped slide with exact EMU geometry and parses it back", async () => {
    const exported = await exportPptx({
      svg: '<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><rect width="1920" height="1080" fill="#fff"/></svg>',
      width: 1920,
      height: 1080,
      dpi: 120,
      rasterFallback: PNG_FALLBACK,
      title: "Exact geometry"
    });

    expect(exported.widthInches).toBe(16);
    expect(exported.heightInches).toBe(9);
    expect(exported.widthEmu).toBe(16 * PPTX_EMU_PER_INCH);
    expect(exported.heightEmu).toBe(9 * PPTX_EMU_PER_INCH);
    expect(exported.blob.type).toBe(
      "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    );

    const files = await packageFiles(exported.blob);
    const slideXml = text(files, "ppt/slides/slide1.xml");
    const themeXml = text(files, "ppt/theme/theme1.xml");
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining(["ppt/media/scene.png", "ppt/media/scene.svg"])
    );
    expect(slideXml).toContain('<a:blip r:embed="rId1">');
    expect(slideXml).toContain('<asvg:svgBlip r:embed="rId2"/>');
    expect(text(files, "ppt/slides/_rels/slide1.xml.rels")).toContain(
      'Target="../media/scene.png"'
    );
    expect((themeXml.match(/<a:fillStyleLst>/g) ?? []).length).toBe(1);
    expect((themeXml.match(/<a:solidFill>/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect((themeXml.match(/<a:ln /g) ?? []).length).toBe(3);
    expect((themeXml.match(/<a:effectStyle>/g) ?? []).length).toBe(3);
    expect((themeXml.match(/<a:bgFillStyleLst>/g) ?? []).length).toBe(1);
    const parsed = parsePptxPackage(await blobBytes(exported.blob));
    expect(parsed.widthEmu).toBe(16 * PPTX_EMU_PER_INCH);
    expect(parsed.heightEmu).toBe(9 * PPTX_EMU_PER_INCH);
    expect(parsed.slides).toHaveLength(1);
    expect(parsed.slides[0].flattenedCount).toBe(1);
    expect(parsed.slides[0].svg).toContain("data:image/png;base64,");
  });

  it("requires explicit selection for a multi-slide package and accepts multiple indices", async () => {
    const exported = await exportPptx({
      svg: '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 1000 1000"/>',
      width: 1000,
      height: 1000,
      dpi: 100,
      rasterFallback: PNG_FALLBACK,
      title: "Two slides"
    });
    const files = await packageFiles(exported.blob);
    files["ppt/slides/slide2.xml"] = files["ppt/slides/slide1.xml"];
    files["ppt/slides/_rels/slide2.xml.rels"] = files["ppt/slides/_rels/slide1.xml.rels"];
    files["ppt/presentation.xml"] = bytes(
      text(files, "ppt/presentation.xml").replace(
        '<p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst>',
        '<p:sldIdLst><p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId4"/></p:sldIdLst>'
      )
    );
    files["ppt/_rels/presentation.xml.rels"] = bytes(
      text(files, "ppt/_rels/presentation.xml.rels").replace(
        "</Relationships>",
        '<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/></Relationships>'
      )
    );
    files["[Content_Types].xml"] = bytes(
      text(files, "[Content_Types].xml").replace(
        "</Types>",
        '<Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>'
      )
    );
    const multi = fileLike(
      zipSync(files),
      "two-slides.pptx",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    );
    // Keep the fixture honest when fflate rewrites the central directory.
    expect(
      Object.keys(
        unzipSync(new Uint8Array(await multi.arrayBuffer())) as Record<string, Uint8Array>
      )
    ).toContain("ppt/slides/slide2.xml");
    expect(text(files, "ppt/presentation.xml")).toContain('r:id="rId4"');
    expect(text(files, "ppt/_rels/presentation.xml.rels")).toContain('Target="slides/slide2.xml"');

    await expect(preparePptxImport(multi)).rejects.toMatchObject<InterchangeImportError>({
      code: "pptx_slides_require_choice",
      slideIndices: [0, 1]
    });
    const selected = await preparePptxImport(multi, { selectedSlideIndices: [1, 0] });
    expect(selected.selectedSlideIndices).toEqual([1, 0]);
    expect(selected.slides).toHaveLength(2);
    expect(selected.fidelity.status).toBe("appearance-snapshot");
    expect(selected.fidelity.substitutions).toContain(
      "selected PPTX slides imported as project-owned SVG appearance snapshots"
    );
  });

  it("refuses macro-enabled filenames before package parsing", async () => {
    const exported = await exportPptx({
      svg: '<svg xmlns="http://www.w3.org/2000/svg"/>',
      width: 1000,
      height: 1000,
      dpi: 100,
      rasterFallback: PNG_FALLBACK
    });
    const macro = fileLike(
      await blobBytes(exported.blob),
      "unsafe.pptm",
      "application/vnd.ms-powerpoint.presentation.macroEnabled.main+xml"
    );
    await expect(preparePptxImport(macro)).rejects.toMatchObject({
      code: "pptx_macro_refused"
    });

    const files = await packageFiles(exported.blob);
    files["vbaProject.bin"] = bytes("VBA");
    expectPptxError(() => parsePptxPackage(zipSync(files)), "pptx_macro_refused");
  });

  it("rejects hostile ZIP paths, duplicates, ZIP64, overlap, and resource bounds", async () => {
    const exported = await exportPptx({
      svg: '<svg xmlns="http://www.w3.org/2000/svg"/>',
      width: 1000,
      height: 1000,
      dpi: 100,
      rasterFallback: PNG_FALLBACK
    });
    const baseFiles = await packageFiles(exported.blob);

    expectPptxError(
      () => parsePptxPackage(zipSync({ ...baseFiles, "../unsafe.bin": bytes("x") })),
      "pptx_path_rejected"
    );
    expectPptxError(
      () =>
        parsePptxPackage(
          zipSync({ ...baseFiles, "PPT/SLIDES/SLIDE1.XML": baseFiles["ppt/slides/slide1.xml"] })
        ),
      "pptx_duplicate_path"
    );

    const zip64 = new Uint8Array(await blobBytes(exported.blob));
    const zip64Central = centralDirectoryOffsets(zip64)[0];
    expect(zip64Central).toBeDefined();
    writeU32At(zip64, zip64Central + 20, 0xffffffff);
    expectPptxError(() => parsePptxPackage(zip64), "pptx_zip64_rejected");

    const overlap = zipSync({ "a.bin": bytes("a"), "b.bin": bytes("b") });
    const overlapRecords = centralDirectoryOffsets(overlap).sort(
      (left, right) => readU32At(overlap, left + 42) - readU32At(overlap, right + 42)
    );
    const firstCentral = overlapRecords[0];
    const secondLocal = readU32At(overlap, overlapRecords[1] + 42);
    const firstLocal = readU32At(overlap, firstCentral + 42);
    const firstNameLength = readU16At(overlap, firstLocal + 26);
    const firstExtraLength = readU16At(overlap, firstLocal + 28);
    const firstDataStart = firstLocal + 30 + firstNameLength + firstExtraLength;
    writeU16At(overlap, firstCentral + 8, readU16At(overlap, firstCentral + 8) | 0x8);
    writeU32At(overlap, firstCentral + 20, secondLocal - firstDataStart + 1);
    expectPptxError(() => parsePptxPackage(overlap), "pptx_zip_structure");

    const ratio = zipSync({ "ratio.bin": new Uint8Array(1_000) });
    const ratioCentral = centralDirectoryOffsets(ratio)[0];
    writeU32At(ratio, ratioCentral + 20, 1);
    expectPptxError(() => parsePptxPackage(ratio), "pptx_decompression_limit");

    const oversized = zipSync({ "oversized.bin": new Uint8Array(26 * 1024 * 1024) });
    expectPptxError(() => parsePptxPackage(oversized), "pptx_decompression_limit");

    const tooManySlides = await packageFiles(exported.blob);
    const slideIds = Array.from(
      { length: 101 },
      (_, index) => `<p:sldId id="${256 + index}" r:id="rId2"/>`
    ).join("");
    tooManySlides["ppt/presentation.xml"] = bytes(
      text(tooManySlides, "ppt/presentation.xml").replace(
        /<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/,
        `<p:sldIdLst>${slideIds}</p:sldIdLst>`
      )
    );
    expectPptxError(
      () => parsePptxPackage(zipSync(tooManySlides)),
      "pptx_slide_limit"
    );
  });

  it("rejects DTD/entity declarations and reports external media without fetching it", async () => {
    const exported = await exportPptx({
      svg: '<svg xmlns="http://www.w3.org/2000/svg"/>',
      width: 1000,
      height: 1000,
      dpi: 100,
      rasterFallback: PNG_FALLBACK
    });
    const files = await packageFiles(exported.blob);
    files["ppt/slides/slide1.xml"] = bytes(
      `<!DOCTYPE p:sld [<!ENTITY xxe SYSTEM "https://example.invalid/x">]>${text(files, "ppt/slides/slide1.xml")}`
    );
    const hostile = fileLike(
      zipSync(files),
      "hostile.pptx",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    );
    await expect(preparePptxImport(hostile)).rejects.toMatchObject({
      code: "pptx_xml_external_entity"
    });

    const externalFiles = await packageFiles(exported.blob);
    externalFiles["ppt/slides/_rels/slide1.xml.rels"] = bytes(
      text(externalFiles, "ppt/slides/_rels/slide1.xml.rels").replace(
        'Target="../media/scene.png"',
        'Target="https://example.invalid/scene.png" TargetMode="External"'
      )
    );
    const external = fileLike(
      zipSync(externalFiles),
      "external.pptx",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    );
    await expect(preparePptxImport(external)).rejects.toMatchObject({
      code: "pptx_slide_refused",
      report: expect.objectContaining({
        status: "unsupported/refused",
        refusedCount: expect.any(Number),
        diagnostics: expect.arrayContaining([
          expect.objectContaining({ code: "external_relationship_ignored", severity: "warning" })
        ])
      })
    });
  });

  it("refuses out-of-range physical export instead of silently scaling", async () => {
    await expect(
      exportPptx({
        svg: '<svg xmlns="http://www.w3.org/2000/svg"/>',
        width: 57_000,
        height: 1_000,
        dpi: 1_000
      })
    ).rejects.toMatchObject({ code: "pptx_geometry" });
  });

  it("refuses unsupported slide content instead of importing a partial snapshot", async () => {
    const exported = await exportPptx({
      svg: '<svg xmlns="http://www.w3.org/2000/svg"/>',
      width: 1000,
      height: 1000,
      dpi: 100,
      rasterFallback: PNG_FALLBACK
    });
    const files = await packageFiles(exported.blob);
    files["ppt/slides/slide1.xml"] = bytes(
      text(files, "ppt/slides/slide1.xml").replace("</p:spTree>", "<p:graphicFrame/></p:spTree>")
    );
    const unsupported = fileLike(
      zipSync(files),
      "unsupported.pptx",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    );
    await expect(preparePptxImport(unsupported)).rejects.toMatchObject({
      code: "pptx_slide_refused",
      slideIndices: [0]
    });
  });

  it("reports omitted slide, layout, and master appearance instead of fabricating content", async () => {
    const exported = await exportPptx({
      svg: '<svg xmlns="http://www.w3.org/2000/svg"/>',
      width: 1000,
      height: 1000,
      dpi: 100,
      rasterFallback: PNG_FALLBACK
    });
    const files = await packageFiles(exported.blob);
    const background =
      '<p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></p:bgPr></p:bg>';
    files["ppt/slides/slide1.xml"] = bytes(
      text(files, "ppt/slides/slide1.xml")
        .replace(/<p:pic>[\s\S]*?<\/p:pic>/, "")
        .replace("</p:spTree></p:cSld>", `</p:spTree>${background}</p:cSld>`)
    );
    files["ppt/slideLayouts/slideLayout1.xml"] = bytes(
      text(files, "ppt/slideLayouts/slideLayout1.xml").replace(
        "</p:spTree></p:cSld>",
        `</p:spTree>${background}</p:cSld>`
      )
    );
    files["ppt/slideMasters/slideMaster1.xml"] = bytes(
      text(files, "ppt/slideMasters/slideMaster1.xml").replace(
        "</p:spTree></p:cSld>",
        `</p:spTree>${background}</p:cSld>`
      )
    );

    const parsed = parsePptxPackage(zipSync(files));
    expect(parsed.slides[0].flattenedCount).toBe(0);
    expect(parsed.slides[0].refusedCount).toBeGreaterThanOrEqual(3);
    expect(parsed.slides[0].diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "unsupported_slide_background" }),
        expect.objectContaining({ code: "unsupported_inherited_slide_content" }),
        expect.objectContaining({ code: "empty_slide_snapshot" })
      ])
    );
    expect(parsed.diagnostics.length).toBeLessThanOrEqual(4_096);
  });

  it("preserves shape flips and reports unresolved text styling", async () => {
    const exported = await exportPptx({
      svg: '<svg xmlns="http://www.w3.org/2000/svg"/>',
      width: 1000,
      height: 1000,
      dpi: 100,
      rasterFallback: PNG_FALLBACK
    });
    const files = await packageFiles(exported.blob);
    files["ppt/slides/slide1.xml"] = bytes(
      text(files, "ppt/slides/slide1.xml").replace(
        "</p:spTree>",
        '<p:sp><p:nvSpPr><p:cNvPr id="3" name="Flipped text"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm flipH="1" flipV="true"><a:off x="0" y="0"/><a:ext cx="1000" cy="1000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr sz="1800"/><a:t>Flip me</a:t></a:r></a:p></p:txBody></p:sp></p:spTree>'
      )
    );
    const parsed = parsePptxPackage(zipSync(files));
    expect(parsed.slides[0].svg).toContain("matrix(-1 0 0 -1 1000 1000)");
    expect(parsed.slides[0].diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "font_substitution", severity: "warning" }),
        expect.objectContaining({ code: "text_layout_approximated", severity: "warning" })
      ])
    );
  });

  it("uses the browser rasterizer when no fallback is supplied", async () => {
    class FakeImage {
      onload?: () => void;
      onerror?: () => void;

      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    const context = {
      clearRect: vi.fn(),
      drawImage: vi.fn()
    } as unknown as CanvasRenderingContext2D;
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context);
    const toBlob = vi
      .spyOn(HTMLCanvasElement.prototype, "toBlob")
      .mockImplementation((callback) => callback(PNG_FALLBACK));
    vi.stubGlobal("Image", FakeImage);
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:opensketch-test"),
      revokeObjectURL: vi.fn()
    });
    try {
      const exported = await exportPptx({
        svg: '<svg xmlns="http://www.w3.org/2000/svg"/>',
        width: 1000,
        height: 1000,
        dpi: 100
      });
      expect(exported.blob.size).toBeGreaterThan(0);
      expect(context.drawImage).toHaveBeenCalledOnce();
      expect(exported.report.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "font_substitution", severity: "warning" })
        ])
      );
      const capped = await exportPptx({
        svg: '<svg xmlns="http://www.w3.org/2000/svg"/>',
        width: 6_000,
        height: 6_000,
        dpi: 300
      });
      expect(capped.report.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "pptx_raster_resolution_capped", severity: "warning" })
        ])
      );
      expect(
        capped.report.diagnostics.find((diagnostic) => diagnostic.code === "pptx_raster_resolution_capped")
          ?.message
      ).toContain("200.0 effective dpi");
    } finally {
      getContext.mockRestore();
      toBlob.mockRestore();
      vi.unstubAllGlobals();
    }
  });
});
