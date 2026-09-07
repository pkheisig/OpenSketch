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
      (value[offset + 3] * 0x1000000)) >>>
    0
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
    const presentationXml = text(files, "ppt/presentation.xml");
    const masterXml = text(files, "ppt/slideMasters/slideMaster1.xml");
    const masterId = Number(presentationXml.match(/<p:sldMasterId id="(\d+)"/)?.[1]);
    const slideId = Number(presentationXml.match(/<p:sldId id="(\d+)"/)?.[1]);
    const layoutId = Number(masterXml.match(/<p:sldLayoutId id="(\d+)"/)?.[1]);
    expect(masterId).toBeGreaterThanOrEqual(2_147_483_648);
    expect(slideId).toBeGreaterThanOrEqual(256);
    expect(layoutId).toBeGreaterThanOrEqual(2_147_483_648);
    expect(new Set([masterId, slideId, layoutId]).size).toBe(3);
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

  it("passes independent package-structure validation", async () => {
    const exported = await exportPptx({
      svg: '<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><rect width="1920" height="1080" fill="#fff"/></svg>',
      width: 1920,
      height: 1080,
      dpi: 120,
      rasterFallback: PNG_FALLBACK,
      title: "Independent package check"
    });
    const files = await packageFiles(exported.blob);
    const requiredParts = [
      "[Content_Types].xml",
      "_rels/.rels",
      "ppt/presentation.xml",
      "ppt/_rels/presentation.xml.rels",
      "ppt/slides/slide1.xml",
      "ppt/slides/_rels/slide1.xml.rels",
      "ppt/theme/theme1.xml",
      "docProps/core.xml",
      "docProps/app.xml",
      "ppt/media/scene.png",
      "ppt/media/scene.svg"
    ];
    expect(Object.keys(files)).toEqual(expect.arrayContaining(requiredParts));

    const contentTypes = text(files, "[Content_Types].xml");
    expect(contentTypes).toContain(
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    );
    expect(contentTypes).toContain(
      '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>'
    );
    expect(contentTypes).toContain(
      '<Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>'
    );
    expect(contentTypes).toContain(
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'
    );
    expect(text(files, "_rels/.rels")).toContain('Target="ppt/presentation.xml"');
    expect(text(files, "ppt/_rels/presentation.xml.rels")).toContain(
      'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"'
    );
    const slideRels = text(files, "ppt/slides/_rels/slide1.xml.rels");
    expect(slideRels).toContain('Target="../media/scene.png"');
    expect(slideRels).toContain('Target="../media/scene.svg"');
    expect(text(files, "ppt/slides/slide1.xml")).toContain("<p:spTree>");
    expect(Object.keys(files).some((path) => /(?:^|\/)vbaProject\.bin$/i.test(path))).toBe(false);
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
    expectPptxError(() => parsePptxPackage(zipSync(tooManySlides)), "pptx_slide_limit");
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

    const implicitExternalFiles = await packageFiles(exported.blob);
    implicitExternalFiles["ppt/slides/_rels/slide1.xml.rels"] = bytes(
      text(implicitExternalFiles, "ppt/slides/_rels/slide1.xml.rels").replace(
        'Target="../media/scene.png"',
        'Target="https://example.invalid/scene.png"'
      )
    );
    const implicitExternal = fileLike(
      zipSync(implicitExternalFiles),
      "implicit-external.pptx",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    );
    await expect(preparePptxImport(implicitExternal)).rejects.toMatchObject({
      code: "pptx_slide_refused",
      report: expect.objectContaining({
        diagnostics: expect.arrayContaining([
          expect.objectContaining({ code: "external_relationship_ignored" })
        ])
      })
    });
  });

  it("accepts ordinary SYSTEM and PUBLIC text", async () => {
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
        '<p:sp><p:nvSpPr><p:cNvPr id="3" name="Text"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1000" cy="1000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr sz="1800"/><a:t>Follow the PUBLIC "safe" guide or SYSTEM "check" list</a:t></a:r></a:p></p:txBody></p:sp></p:spTree>'
      )
    );
    const textDeck = fileLike(
      zipSync(files),
      "system-public-text.pptx",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    );
    const parsed = parsePptxPackage(await blobBytes(textDeck));
    expect(parsed.slides[0].svg).toContain("PUBLIC");
    expect(parsed.slides[0].svg).toContain("SYSTEM");
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

  it("refuses custom geometry instead of defaulting to a rectangle", async () => {
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
        '<p:sp><p:nvSpPr><p:cNvPr id="3" name="Custom geometry"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1000" cy="1000"/></a:xfrm><a:custGeom><a:avLst/><a:pathLst><a:path w="1000" h="1000"><a:lnTo><a:pt x="1000" y="1000"/></a:lnTo></a:path></a:pathLst></a:custGeom><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill></p:spPr></p:sp></p:spTree>'
      )
    );
    const customGeometry = fileLike(
      zipSync(files),
      "custom-geometry.pptx",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    );
    const parsed = parsePptxPackage(await blobBytes(customGeometry));
    expect(parsed.slides[0].svg).not.toContain('fill="#ff0000"');
    expect(parsed.slides[0].diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "unsupported_slide_content" })])
    );
    await expect(preparePptxImport(customGeometry)).rejects.toMatchObject({
      code: "pptx_slide_refused",
      slideIndices: [0]
    });
  });

  it("preserves standard and adjusted roundRect geometry", async () => {
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
        '<p:sp><p:nvSpPr><p:cNvPr id="3" name="Default roundRect"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1000" cy="1000"/></a:xfrm><a:prstGeom prst="roundRect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill></p:spPr></p:sp><p:sp><p:nvSpPr><p:cNvPr id="4" name="Adjusted roundRect"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="1000" y="0"/><a:ext cx="1000" cy="1000"/></a:xfrm><a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 25000"/></a:avLst></a:prstGeom><a:solidFill><a:srgbClr val="00FF00"/></a:solidFill></p:spPr></p:sp></p:spTree>'
      )
    );
    const parsed = parsePptxPackage(zipSync(files));
    expect(parsed.slides[0].svg).toContain('rx="166.67"');
    expect(parsed.slides[0].svg).toContain('rx="250"');
    expect(parsed.slides[0].mappedCount).toBe(3);
  });

  it("refuses line shapes without a resolved stroke instead of fabricating one", async () => {
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
        '<p:sp><p:nvSpPr><p:cNvPr id="3" name="Invisible line"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1000" cy="1000"/></a:xfrm><a:prstGeom prst="line"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr></p:sp></p:spTree>'
      )
    );
    const lineOnly = fileLike(
      zipSync(files),
      "line-without-stroke.pptx",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    );
    const parsed = parsePptxPackage(await blobBytes(new Blob([await lineOnly.arrayBuffer()])));
    expect(parsed.slides[0].svg).not.toContain("<line ");
    expect(parsed.slides[0].refusedCount).toBeGreaterThan(0);
    await expect(preparePptxImport(lineOnly)).rejects.toMatchObject({
      code: "pptx_slide_refused",
      slideIndices: [0]
    });
  });

  it("refuses tiled pictures instead of stretching them", async () => {
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
        "<a:stretch><a:fillRect/></a:stretch>",
        '<a:tile tx="0" ty="0" sx="100000" sy="100000"/>'
      )
    );
    const tiled = fileLike(
      zipSync(files),
      "tiled-picture.pptx",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    );
    const parsed = parsePptxPackage(await blobBytes(tiled));
    expect(parsed.slides[0].svg).not.toContain("<image ");
    expect(parsed.slides[0].diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "unsupported_slide_content" })])
    );
    await expect(preparePptxImport(tiled)).rejects.toMatchObject({
      code: "pptx_slide_refused",
      slideIndices: [0]
    });
  });

  it("refuses theme-inherited outlines instead of dropping them silently", async () => {
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
        '<p:sp><p:nvSpPr><p:cNvPr id="3" name="Theme outline"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:style><a:lnRef idx="1"><a:schemeClr val="accent1"/></a:lnRef></p:style><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1000" cy="1000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></p:spPr></p:sp></p:spTree>'
      )
    );
    const themeOutline = fileLike(
      zipSync(files),
      "theme-outline.pptx",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    );
    const parsed = parsePptxPackage(await blobBytes(themeOutline));
    expect(parsed.slides[0].svg).not.toContain('fill="#ffffff"');
    expect(parsed.slides[0].diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "theme_inherited_stroke_unsupported", severity: "warning" })
      ])
    );
    await expect(preparePptxImport(themeOutline)).rejects.toMatchObject({
      code: "pptx_slide_refused",
      slideIndices: [0]
    });
  });

  it("accepts standard zero-extent lines and off-slide coordinates", async () => {
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
        '<p:sp><p:nvSpPr><p:cNvPr id="3" name="Horizontal line"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="-914400" y="0"/><a:ext cx="1828800" cy="0"/></a:xfrm><a:prstGeom prst="line"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill></a:ln></p:spPr></p:sp></p:spTree>'
      )
    );
    const lineFile = fileLike(
      zipSync(files),
      "line.pptx",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    );
    const parsed = parsePptxPackage(await blobBytes(new Blob([await lineFile.arrayBuffer()])));
    expect(parsed.slides[0].svg).toContain('<line x1="-914400" y1="0"');
    expect(parsed.slides[0].refusedCount).toBe(0);
    await expect(preparePptxImport(lineFile)).resolves.toMatchObject({
      fidelity: { refusedCount: 0 }
    });
  });

  it("resolves package-absolute internal relationship targets", async () => {
    const exported = await exportPptx({
      svg: '<svg xmlns="http://www.w3.org/2000/svg"/>',
      width: 1000,
      height: 1000,
      dpi: 100,
      rasterFallback: PNG_FALLBACK
    });
    const files = await packageFiles(exported.blob);
    files["ppt/slides/_rels/slide1.xml.rels"] = bytes(
      text(files, "ppt/slides/_rels/slide1.xml.rels").replace(
        "../slideLayouts/slideLayout1.xml",
        "/ppt/slideLayouts/slideLayout1.xml"
      )
    );
    const absoluteTarget = fileLike(
      zipSync(files),
      "absolute-target.pptx",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    );
    await expect(preparePptxImport(absoluteTarget)).resolves.toMatchObject({
      probe: { format: "pptx" },
      slides: [{ index: 0 }]
    });
  });

  it("labels non-16:9 exports as custom presentations", async () => {
    const exported = await exportPptx({
      svg: '<svg xmlns="http://www.w3.org/2000/svg"/>',
      width: 1000,
      height: 1000,
      dpi: 100,
      rasterFallback: PNG_FALLBACK
    });
    const files = await packageFiles(exported.blob);
    expect(text(files, "docProps/app.xml")).toContain(
      "<PresentationFormat>Custom</PresentationFormat>"
    );
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

  it("does not treat a layout or master extension list as visible content", async () => {
    const exported = await exportPptx({
      svg: '<svg xmlns="http://www.w3.org/2000/svg"/>',
      width: 1000,
      height: 1000,
      dpi: 100,
      rasterFallback: PNG_FALLBACK
    });
    const files = await packageFiles(exported.blob);
    files["ppt/slideLayouts/slideLayout1.xml"] = bytes(
      text(files, "ppt/slideLayouts/slideLayout1.xml").replace(
        "</p:spTree>",
        '<p:extLst><p:ext uri="{test}"/></p:extLst></p:spTree>'
      )
    );
    files["ppt/slideMasters/slideMaster1.xml"] = bytes(
      text(files, "ppt/slideMasters/slideMaster1.xml").replace(
        "</p:spTree>",
        '<p:extLst><p:ext uri="{test}"/></p:extLst></p:spTree>'
      )
    );
    const extensionOnly = fileLike(
      zipSync(files),
      "extension-only-appearance.pptx",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    );
    const parsed = parsePptxPackage(await blobBytes(extensionOnly));
    expect(parsed.slides[0].diagnostics).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "unsupported_inherited_slide_content" })
      ])
    );
    await expect(preparePptxImport(extensionOnly)).resolves.toMatchObject({
      fidelity: { refusedCount: 0 }
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

  it("reports dropped text hyperlinks and actions", async () => {
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
        '<p:sp><p:nvSpPr><p:cNvPr id="3" name="Linked text"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1000" cy="1000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr sz="1800"><a:hlinkClick r:id="rId3"/></a:rPr><a:t>Linked</a:t></a:r></a:p></p:txBody></p:sp></p:spTree>'
      )
    );
    const linkedText = fileLike(
      zipSync(files),
      "linked-text.pptx",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    );
    const parsed = parsePptxPackage(await blobBytes(linkedText));
    expect(parsed.slides[0].diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "hyperlink_dropped", severity: "warning" })
      ])
    );
  });

  it("refuses malformed text sizes instead of emitting NaN SVG metrics", async () => {
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
        '<p:sp><p:nvSpPr><p:cNvPr id="3" name="Malformed text size"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1000" cy="1000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr sz="not-a-number"/><a:t>Malformed</a:t></a:r></a:p></p:txBody></p:sp></p:spTree>'
      )
    );
    const malformed = fileLike(
      zipSync(files),
      "malformed-text-size.pptx",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    );
    const parsed = parsePptxPackage(await blobBytes(malformed));
    expect(parsed.slides[0].svg).not.toContain("NaN");
    expect(parsed.slides[0].diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "unsupported_slide_content" })])
    );
    await expect(preparePptxImport(malformed)).rejects.toMatchObject({
      code: "pptx_slide_refused",
      slideIndices: [0]
    });
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
        capped.report.diagnostics.find(
          (diagnostic) => diagnostic.code === "pptx_raster_resolution_capped"
        )?.message
      ).toContain("200.0 effective dpi");
    } finally {
      getContext.mockRestore();
      toBlob.mockRestore();
      vi.unstubAllGlobals();
    }
  });
});
