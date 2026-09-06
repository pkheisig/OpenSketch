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
    } finally {
      getContext.mockRestore();
      toBlob.mockRestore();
      vi.unstubAllGlobals();
    }
  });
});
