import { unzipSync, zipSync, type Zippable } from "fflate";
import {
  createFidelityReport,
  probeInterchangeBytes,
  type InterchangeDiagnostic,
  type InterchangeFidelityReport,
  type InterchangeImportPreparation,
  type InterchangeProbe,
  type InterchangeSourceResource
} from "@workspace/editor-core";
import { InterchangeImportError } from "./errors";
import {
  PPTX_EMU_PER_INCH,
  PPTX_MAX_BASE64_LENGTH,
  PPTX_MAX_INCHES,
  PPTX_MAX_PACKAGE_BYTES,
  PPTX_MIN_INCHES,
  PPTX_MIME_TYPE,
  svgDataUrlForPptx
} from "./pptxShared";

export {
  PPTX_EMU_PER_INCH,
  PPTX_MAX_BASE64_LENGTH,
  PPTX_MAX_INCHES,
  PPTX_MAX_PACKAGE_BYTES,
  PPTX_MIN_INCHES,
  PPTX_MIME_TYPE,
  svgDataUrlForPptx,
  svgForPptxCanvas
} from "./pptxShared";
const PPTX_MAX_DECOMPRESSED_BYTES = 100 * 1024 * 1024;
const PPTX_MAX_ENTRY_BYTES = 25 * 1024 * 1024;
const PPTX_MAX_ENTRIES = 4_096;
const PPTX_MAX_RELATIONSHIPS = 4_096;
const PPTX_MAX_SLIDES = 100;
const PPTX_MAX_XML_BYTES = 4 * 1024 * 1024;
const PPTX_MAX_XML_ELEMENTS = 250_000;
const PPTX_MAX_XML_ATTRIBUTES = 750_000;
const PPTX_MAX_XML_TEXT_BYTES = 16 * 1024 * 1024;
const PPTX_MAX_XML_DEPTH = 2_048;
const PPTX_MAX_COMPRESSION_RATIO = 500;
const PPTX_MAX_DIAGNOSTICS = 4_096;
const PPTX_MAX_RENDERED_SNAPSHOT_BYTES = 64 * 1024 * 1024;
const ZIP_EOCD_SIGNATURE = 0x06054b50;
const ZIP_CENTRAL_SIGNATURE = 0x02014b50;
const ZIP_LOCAL_SIGNATURE = 0x04034b50;
const PPTX_PRESENTATION_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml";
const PPTX_SLIDE_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.presentationml.slide+xml";
const PPTX_OFFICE_DOCUMENT_RELATIONSHIP =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument";
const PPTX_SLIDE_RELATIONSHIP =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide";
const PPTX_IMAGE_RELATIONSHIP_SUFFIX = "/image";
const PPTX_SVG_EXTENSION_NAMESPACE = "http://schemas.microsoft.com/office/drawing/2016/SVG/main";
const PPTX_SVG_EXTENSION_URI = "{96DAC541-7B7A-43D3-8B79-37D633B846F1}";
const XML_RELATIONSHIP_NAMESPACE = "http://schemas.openxmlformats.org/package/2006/relationships";
const XML_CONTENT_TYPES_NAMESPACE = "http://schemas.openxmlformats.org/package/2006/content-types";
const PPTX_PRESENTATION_NAMESPACE = "http://schemas.openxmlformats.org/presentationml/2006/main";

interface ZipEntryMeta {
  name: string;
  compressedSize: number;
  uncompressedSize: number;
  compression: number;
  flags: number;
  localHeaderOffset: number;
  isDirectory: boolean;
}

interface PackageRelationship {
  id: string;
  type: string;
  target: string;
  targetMode?: string;
}

interface SlideTransform {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  flipH: boolean;
  flipV: boolean;
}

interface MediaDataUrlCache {
  byPath: Map<string, string | undefined>;
  byContentHash: Map<string, string | undefined>;
}

export interface PptxRenderedSlide {
  index: number;
  stableId: string;
  title: string;
  svg: string;
  mappedCount: number;
  flattenedCount: number;
  refusedCount: number;
  diagnostics: InterchangeDiagnostic[];
}

export interface PptxParsedPackage {
  widthEmu: number;
  heightEmu: number;
  slides: readonly PptxRenderedSlide[];
  diagnostics: readonly InterchangeDiagnostic[];
}

export interface PptxImportOptions {
  signal?: AbortSignal;
  selectedSlideIndices?: readonly number[];
}

export interface PptxImportPreparation extends InterchangeImportPreparation {
  normalized: Blob;
  normalizedMimeType: "image/svg+xml";
  requiresDecision: boolean;
  slides: readonly PptxRenderedSlide[];
  selectedSlideIndices: readonly number[];
}

export interface PptxExportOptions {
  svg: string;
  width: number;
  height: number;
  dpi: number;
  title?: string;
  description?: string;
  signal?: AbortSignal;
  /** Optional pre-rasterized fallback for non-browser callers and deterministic tests. */
  rasterFallback?: Blob;
}

export interface PptxExportResult {
  blob: Blob;
  report: InterchangeFidelityReport;
  widthEmu: number;
  heightEmu: number;
  widthInches: number;
  heightInches: number;
}

function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new InterchangeImportError("The PPTX operation was canceled.", { code: "canceled" });
  }
}

function readU16(bytes: Uint8Array, offset: number): number | undefined {
  if (offset < 0 || offset + 2 > bytes.length) return undefined;
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readU32(bytes: Uint8Array, offset: number): number | undefined {
  if (offset < 0 || offset + 4 > bytes.length) return undefined;
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] * 0x1000000)) >>>
    0
  );
}

function decodeUtf8(bytes: Uint8Array, context: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new InterchangeImportError(`The PPTX ${context} is not valid UTF-8.`, {
      code: "pptx_zip_name"
    });
  }
}

function packagePath(name: string): string {
  if (
    !name ||
    name.includes("\\") ||
    name.includes("\0") ||
    name.startsWith("/") ||
    /^[A-Za-z]:/.test(name)
  ) {
    throw new InterchangeImportError(`The PPTX package path is unsafe: ${name || "<empty>"}.`, {
      code: "pptx_path_rejected"
    });
  }
  const segments = name.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new InterchangeImportError(`The PPTX package path is unsafe: ${name}.`, {
      code: "pptx_path_rejected"
    });
  }
  return name;
}

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  const minimumOffset = Math.max(0, bytes.length - 22 - 0xffff);
  for (let offset = bytes.length - 22; offset >= minimumOffset; offset -= 1) {
    if (readU32(bytes, offset) !== ZIP_EOCD_SIGNATURE) continue;
    const commentLength = readU16(bytes, offset + 20);
    if (commentLength === undefined || offset + 22 + commentLength !== bytes.length) continue;
    return offset;
  }
  throw new InterchangeImportError("The PPTX ZIP end record is missing or malformed.", {
    code: "pptx_zip_structure"
  });
}

function readZipEntries(bytes: Uint8Array): ZipEntryMeta[] {
  if (bytes.length < 22 || bytes.length > PPTX_MAX_PACKAGE_BYTES) {
    throw new InterchangeImportError("PPTX packages must be non-empty and 25 MB or smaller.", {
      code: "pptx_package_limit"
    });
  }
  if (readU32(bytes, 0) !== ZIP_LOCAL_SIGNATURE) {
    throw new InterchangeImportError("The PPTX file does not begin with a ZIP local-file header.", {
      code: "pptx_zip_signature"
    });
  }
  const eocd = findEndOfCentralDirectory(bytes);
  const disk = readU16(bytes, eocd + 4);
  const centralDisk = readU16(bytes, eocd + 6);
  const diskEntries = readU16(bytes, eocd + 8);
  const totalEntries = readU16(bytes, eocd + 10);
  const centralSize = readU32(bytes, eocd + 12);
  const centralOffset = readU32(bytes, eocd + 16);
  if (
    disk !== 0 ||
    centralDisk !== 0 ||
    diskEntries === undefined ||
    totalEntries === undefined ||
    diskEntries !== totalEntries ||
    centralSize === undefined ||
    centralOffset === undefined ||
    totalEntries === 0xffff ||
    centralSize === 0xffffffff ||
    centralOffset === 0xffffffff ||
    totalEntries > PPTX_MAX_ENTRIES ||
    centralOffset + centralSize > eocd
  ) {
    throw new InterchangeImportError("The PPTX ZIP directory is unsupported or exceeds bounds.", {
      code: "pptx_zip_structure"
    });
  }

  const entries: ZipEntryMeta[] = [];
  const names = new Set<string>();
  const foldedNames = new Set<string>();
  let offset = centralOffset;
  let totalCompressed = 0;
  let totalUncompressed = 0;
  for (let index = 0; index < totalEntries; index += 1) {
    if (readU32(bytes, offset) !== ZIP_CENTRAL_SIGNATURE || offset + 46 > eocd) {
      throw new InterchangeImportError("The PPTX ZIP central directory is malformed.", {
        code: "pptx_zip_structure"
      });
    }
    const flags = readU16(bytes, offset + 8);
    const compression = readU16(bytes, offset + 10);
    const compressedSize = readU32(bytes, offset + 20);
    const uncompressedSize = readU32(bytes, offset + 24);
    const nameLength = readU16(bytes, offset + 28);
    const extraLength = readU16(bytes, offset + 30);
    const commentLength = readU16(bytes, offset + 32);
    const localHeaderOffset = readU32(bytes, offset + 42);
    if (
      flags === undefined ||
      compression === undefined ||
      compressedSize === undefined ||
      uncompressedSize === undefined ||
      nameLength === undefined ||
      extraLength === undefined ||
      commentLength === undefined ||
      localHeaderOffset === undefined ||
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      localHeaderOffset === 0xffffffff
    ) {
      throw new InterchangeImportError("The PPTX ZIP entry uses unsupported ZIP64 fields.", {
        code: "pptx_zip64_rejected"
      });
    }
    const recordLength = 46 + nameLength + extraLength + commentLength;
    if (offset + recordLength > eocd) {
      throw new InterchangeImportError("The PPTX ZIP central directory entry is truncated.", {
        code: "pptx_zip_structure"
      });
    }
    const name = packagePath(
      decodeUtf8(bytes.slice(offset + 46, offset + 46 + nameLength), "ZIP entry name")
    );
    const foldedName = name.toLocaleLowerCase("en-US");
    if (names.has(name) || foldedNames.has(foldedName)) {
      throw new InterchangeImportError(`The PPTX package contains a duplicate path: ${name}.`, {
        code: "pptx_duplicate_path"
      });
    }
    names.add(name);
    foldedNames.add(foldedName);
    if ((flags & 0x1) !== 0 || ![0, 8].includes(compression)) {
      throw new InterchangeImportError(
        `The PPTX ZIP entry ${name} is encrypted or uses an unsupported compression method.`,
        { code: "pptx_zip_method" }
      );
    }
    if (
      compressedSize > PPTX_MAX_ENTRY_BYTES ||
      uncompressedSize > PPTX_MAX_ENTRY_BYTES ||
      totalCompressed + compressedSize > PPTX_MAX_PACKAGE_BYTES ||
      totalUncompressed + uncompressedSize > PPTX_MAX_DECOMPRESSED_BYTES ||
      (uncompressedSize > 0 &&
        (compressedSize === 0 || uncompressedSize / compressedSize > PPTX_MAX_COMPRESSION_RATIO))
    ) {
      throw new InterchangeImportError(`The PPTX ZIP entry ${name} exceeds decompression bounds.`, {
        code: "pptx_decompression_limit"
      });
    }
    totalCompressed += compressedSize;
    totalUncompressed += uncompressedSize;
    entries.push({
      name,
      compressedSize,
      uncompressedSize,
      compression,
      flags,
      localHeaderOffset,
      isDirectory: name.endsWith("/")
    });
    offset += recordLength;
  }
  if (offset !== centralOffset + centralSize) {
    throw new InterchangeImportError("The PPTX ZIP central directory size is inconsistent.", {
      code: "pptx_zip_structure"
    });
  }

  const dataRanges: Array<{ start: number; end: number }> = [];
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const local = entry.localHeaderOffset;
    if (readU32(bytes, local) !== ZIP_LOCAL_SIGNATURE || local + 30 > centralOffset) {
      throw new InterchangeImportError(
        `The PPTX ZIP local header for ${entry.name} is malformed.`,
        {
          code: "pptx_zip_structure"
        }
      );
    }
    const localFlags = readU16(bytes, local + 6);
    const localCompression = readU16(bytes, local + 8);
    const localNameLength = readU16(bytes, local + 26);
    const localExtraLength = readU16(bytes, local + 28);
    if (
      localFlags === undefined ||
      localCompression === undefined ||
      localNameLength === undefined ||
      localExtraLength === undefined
    ) {
      throw new InterchangeImportError(
        `The PPTX ZIP local header for ${entry.name} is truncated.`,
        {
          code: "pptx_zip_structure"
        }
      );
    }
    const dataStart = local + 30 + localNameLength + localExtraLength;
    const localName = decodeUtf8(
      bytes.slice(local + 30, dataStart - localExtraLength),
      "ZIP local entry name"
    );
    if (
      localName !== entry.name ||
      localCompression !== entry.compression ||
      (localFlags & 0x1) !== 0 ||
      dataStart < local + 30 ||
      dataStart + entry.compressedSize > centralOffset
    ) {
      throw new InterchangeImportError(`The PPTX ZIP local entry ${entry.name} is inconsistent.`, {
        code: "pptx_zip_structure"
      });
    }
    if ((entry.flags & 0x8) === 0) {
      const localCompressed = readU32(bytes, local + 18);
      const localUncompressed = readU32(bytes, local + 22);
      if (
        localCompressed !== entry.compressedSize ||
        localUncompressed !== entry.uncompressedSize
      ) {
        throw new InterchangeImportError(`The PPTX ZIP sizes for ${entry.name} are inconsistent.`, {
          code: "pptx_zip_structure"
        });
      }
    }
    dataRanges.push({ start: local, end: dataStart + entry.compressedSize });
  }
  dataRanges.sort((left, right) => left.start - right.start);
  for (let index = 1; index < dataRanges.length; index += 1) {
    if (dataRanges[index - 1].end > dataRanges[index].start) {
      throw new InterchangeImportError("The PPTX ZIP entries overlap.", {
        code: "pptx_zip_structure"
      });
    }
  }
  return entries;
}

function unzipPackage(bytes: Uint8Array): Record<string, Uint8Array> {
  const entries = readZipEntries(bytes);
  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(bytes) as Record<string, Uint8Array>;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown ZIP decoder error";
    throw new InterchangeImportError(`The PPTX ZIP could not be decompressed: ${message}.`, {
      code: "pptx_zip_decode"
    });
  }
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const content = unzipped[entry.name];
    if (!content || content.byteLength !== entry.uncompressedSize) {
      throw new InterchangeImportError(`The PPTX ZIP entry ${entry.name} has invalid contents.`, {
        code: "pptx_zip_decode"
      });
    }
  }
  return unzipped;
}

function xmlElementCount(root: Document): {
  elements: number;
  attributes: number;
  textBytes: number;
} {
  let elements = 0;
  let attributes = 0;
  let textBytes = 0;
  const encoder = new TextEncoder();
  const stack: Array<{ node: Node; depth: number }> = [{ node: root, depth: 0 }];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) break;
    const { node, depth } = current;
    if (depth > PPTX_MAX_XML_DEPTH) {
      throw new InterchangeImportError("The PPTX XML exceeds the maximum nesting depth.", {
        code: "pptx_xml_limit"
      });
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      elements += 1;
      attributes += (node as Element).attributes.length;
    } else if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE) {
      textBytes += encoder.encode(node.nodeValue ?? "").byteLength;
    }
    if (
      elements > PPTX_MAX_XML_ELEMENTS ||
      attributes > PPTX_MAX_XML_ATTRIBUTES ||
      textBytes > PPTX_MAX_XML_TEXT_BYTES
    ) {
      throw new InterchangeImportError("The PPTX XML exceeds structural limits.", {
        code: "pptx_xml_limit"
      });
    }
    const children = Array.from(node.childNodes);
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push({ node: children[index], depth: depth + 1 });
    }
  }
  return { elements, attributes, textBytes };
}

function parseXml(bytes: Uint8Array, path: string): Document {
  if (bytes.byteLength > PPTX_MAX_XML_BYTES) {
    throw new InterchangeImportError(`The PPTX XML part ${path} is too large.`, {
      code: "pptx_xml_limit"
    });
  }
  const source = decodeUtf8(bytes, `XML part ${path}`);
  if (/<!DOCTYPE\b|<!ENTITY\b|\b(?:SYSTEM|PUBLIC)\s+["']/i.test(source)) {
    throw new InterchangeImportError(
      `The PPTX XML part ${path} contains a DTD or entity declaration.`,
      {
        code: "pptx_xml_external_entity"
      }
    );
  }
  if (typeof DOMParser === "undefined") {
    throw new InterchangeImportError("PPTX XML parsing is unavailable in this browser.", {
      code: "pptx_xml_parser_unavailable"
    });
  }
  const parsed = new DOMParser().parseFromString(source, "application/xml");
  if (parsed.getElementsByTagName("parsererror").length > 0 || !parsed.documentElement) {
    throw new InterchangeImportError(`The PPTX XML part ${path} is malformed.`, {
      code: "pptx_xml_malformed"
    });
  }
  xmlElementCount(parsed);
  return parsed;
}

function requireXmlRoot(document: Document, name: string, namespace: string, path: string): void {
  const root = document.documentElement;
  if (localName(root) !== name || root.namespaceURI !== namespace) {
    throw new InterchangeImportError(`The PPTX XML part ${path} has an invalid root element.`, {
      code: "pptx_xml_structure"
    });
  }
}

function localName(node: Node | null | undefined): string {
  return (
    (node && node.nodeType === 1 ? (node as Element).localName : undefined) ??
    node?.nodeName.split(":").at(-1) ??
    ""
  );
}

function childElements(node: Element, name?: string): Element[] {
  return Array.from(node.children).filter((child) => !name || localName(child) === name);
}

function firstDescendant(node: Element | Document, name: string): Element | undefined {
  if (node instanceof Element && localName(node) === name) return node;
  return Array.from(node.getElementsByTagName("*")).find(
    (candidate) => localName(candidate) === name
  );
}

function descendants(node: Element, name: string): Element[] {
  return Array.from(node.getElementsByTagName("*")).filter(
    (candidate) => localName(candidate) === name
  );
}

function attr(node: Element | undefined, name: string): string | undefined {
  if (!node) return undefined;
  return node.getAttribute(name) ?? node.getAttribute(`a:${name}`) ?? undefined;
}

function boundedDiagnostics(
  diagnostics: readonly InterchangeDiagnostic[]
): InterchangeDiagnostic[] {
  if (diagnostics.length <= PPTX_MAX_DIAGNOSTICS) return [...diagnostics];
  return [
    ...diagnostics.slice(0, PPTX_MAX_DIAGNOSTICS - 1),
    {
      code: "diagnostics_truncated",
      severity: "warning",
      message: `Additional PPTX diagnostics were omitted after the ${PPTX_MAX_DIAGNOSTICS}-item limit.`
    }
  ];
}

function requiredPositiveInteger(value: string | undefined, message: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new InterchangeImportError(message, { code: "pptx_geometry" });
  }
  return parsed;
}

function relationshipsFor(
  entries: Record<string, Uint8Array>,
  relsPath: string
): { relations: PackageRelationship[]; diagnostics: InterchangeDiagnostic[] } {
  const bytes = entries[relsPath];
  if (!bytes) return { relations: [], diagnostics: [] };
  const document = parseXml(bytes, relsPath);
  requireXmlRoot(document, "Relationships", XML_RELATIONSHIP_NAMESPACE, relsPath);
  const relations = Array.from(document.getElementsByTagName("*")).filter(
    (node) => localName(node) === "Relationship"
  );
  if (relations.length > PPTX_MAX_RELATIONSHIPS) {
    throw new InterchangeImportError(`The PPTX relationship part ${relsPath} is too large.`, {
      code: "pptx_relationship_limit"
    });
  }
  const diagnostics: InterchangeDiagnostic[] = [];
  const result: PackageRelationship[] = [];
  const ids = new Set<string>();
  for (const relation of relations) {
    const id = attr(relation, "Id");
    const type = attr(relation, "Type");
    const target = attr(relation, "Target");
    const targetMode = attr(relation, "TargetMode");
    if (!id || !type || !target) {
      throw new InterchangeImportError(
        `The PPTX relationship part ${relsPath} has an incomplete relation.`,
        {
          code: "pptx_relationship_malformed"
        }
      );
    }
    if (ids.has(id)) {
      throw new InterchangeImportError(
        `The PPTX relationship part ${relsPath} duplicates ID ${id}.`,
        {
          code: "pptx_relationship_malformed"
        }
      );
    }
    ids.add(id);
    if (targetMode?.toLowerCase() === "external" || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target)) {
      diagnostics.push({
        code: "external_relationship_ignored",
        severity: "warning",
        message: `External PPTX relationship ${id} was not fetched or executed; linked media is unavailable.`
      });
      result.push({ id, type, target, targetMode });
      continue;
    }
    result.push({ id, type, target, ...(targetMode ? { targetMode } : {}) });
  }
  return { relations: result, diagnostics };
}

function resolveTarget(basePart: string, target: string): string {
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target) || target.startsWith("/")) {
    throw new InterchangeImportError(`The PPTX relationship target is external: ${target}.`, {
      code: "pptx_external_target"
    });
  }
  const baseSegments = basePart.split("/");
  baseSegments.pop();
  const result: string[] = [...baseSegments];
  for (const segment of target.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (result.length === 0) {
        throw new InterchangeImportError(
          `The PPTX relationship target escapes the package: ${target}.`,
          {
            code: "pptx_path_rejected"
          }
        );
      }
      result.pop();
    } else {
      result.push(segment);
    }
  }
  return packagePath(result.join("/"));
}

function relationTarget(
  relations: readonly PackageRelationship[],
  id: string,
  basePart: string
): string | undefined {
  const relation = relations.find((candidate) => candidate.id === id);
  if (!relation || relation.targetMode?.toLowerCase() === "external") return undefined;
  return resolveTarget(basePart, relation.target);
}

function relationshipsPath(partPath: string): string {
  return partPath.replace(/\/([^/]+)$/, "/_rels/$1.rels");
}

function hasVisibleShapeTreeContent(document: Document): boolean {
  const tree = firstDescendant(document.documentElement, "spTree");
  return Boolean(
    tree &&
      childElements(tree).some((child) => !["nvGrpSpPr", "grpSpPr"].includes(localName(child)))
  );
}

function hasBackgroundContent(document: Document): boolean {
  const cSld = firstDescendant(document.documentElement, "cSld");
  return Boolean(
    childElements(document.documentElement, "bg").length > 0 ||
      (cSld && childElements(cSld, "bg").length > 0)
  );
}

function inheritedSlideAppearanceDiagnostics(
  slidePath: string,
  slideRelations: readonly PackageRelationship[],
  entries: Record<string, Uint8Array>,
  relationPart: (path: string) => { relations: PackageRelationship[]; diagnostics: InterchangeDiagnostic[] }
): InterchangeDiagnostic[] {
  const diagnostics: InterchangeDiagnostic[] = [];
  const layoutRelation = slideRelations.find((relation) =>
    relation.type.endsWith("/slideLayout")
  );
  if (!layoutRelation) return diagnostics;
  const layoutPath = relationTarget(slideRelations, layoutRelation.id, slidePath);
  if (!layoutPath || !entries[layoutPath]) {
    diagnostics.push({
      code: "inherited_slide_content_unavailable",
      severity: "warning",
      message: "The slide layout was unavailable, so inherited slide appearance could not be rendered."
    });
    return diagnostics;
  }
  const layoutXml = parseXml(entries[layoutPath], layoutPath);
  requireXmlRoot(layoutXml, "sldLayout", PPTX_PRESENTATION_NAMESPACE, layoutPath);
  if (hasBackgroundContent(layoutXml) || hasVisibleShapeTreeContent(layoutXml)) {
    diagnostics.push({
      code: "unsupported_inherited_slide_content",
      severity: "warning",
      message:
        "Inherited slide-layout background or decorations were not rendered; the imported appearance snapshot may omit them."
    });
  }
  const layoutRelations = relationPart(relationshipsPath(layoutPath)).relations;
  const masterRelation = layoutRelations.find((relation) =>
    relation.type.endsWith("/slideMaster")
  );
  if (!masterRelation) return diagnostics;
  const masterPath = relationTarget(layoutRelations, masterRelation.id, layoutPath);
  if (!masterPath || !entries[masterPath]) {
    diagnostics.push({
      code: "inherited_slide_content_unavailable",
      severity: "warning",
      message: "The slide master was unavailable, so inherited slide appearance could not be rendered."
    });
    return diagnostics;
  }
  const masterXml = parseXml(entries[masterPath], masterPath);
  requireXmlRoot(masterXml, "sldMaster", PPTX_PRESENTATION_NAMESPACE, masterPath);
  if (hasBackgroundContent(masterXml) || hasVisibleShapeTreeContent(masterXml)) {
    diagnostics.push({
      code: "unsupported_inherited_slide_content",
      severity: "warning",
      message:
        "Inherited slide-master background or decorations were not rendered; the imported appearance snapshot may omit them."
    });
  }
  return diagnostics;
}

function mimeForPackagePath(path: string): string | undefined {
  const extension = path.toLowerCase().split(".").at(-1);
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "gif") return "image/gif";
  if (extension === "webp") return "image/webp";
  if (extension === "svg") return "image/svg+xml";
  return undefined;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  if (value.length > PPTX_MAX_BASE64_LENGTH) {
    throw new InterchangeImportError("The encoded PPTX exceeds the package size limit.", {
      code: "pptx_package_limit"
    });
  }
  let decoded: string;
  try {
    decoded = atob(value);
  } catch {
    throw new InterchangeImportError("The PPTX source is not valid base64.", {
      code: "pptx_base64"
    });
  }
  if (decoded.length > PPTX_MAX_PACKAGE_BYTES) {
    throw new InterchangeImportError("The decoded PPTX exceeds the package size limit.", {
      code: "pptx_package_limit"
    });
  }
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index);
  return bytes;
}

function safeEmbeddedSvg(source: string): string | undefined {
  if (
    /<!DOCTYPE\b|<!ENTITY\b|<script\b|<foreignObject\b|<iframe\b|<object\b|<embed\b|<animate\b|<style\b/i.test(
      source
    ) ||
    /\bon[a-z]+\s*=|(?:href|src)\s*=\s*["']\s*(?:https?:|file:|javascript:|data:)|url\s*\(/i.test(
      source
    )
  ) {
    return undefined;
  }
  return source;
}

function mediaContentHash(bytes: Uint8Array): string {
  let first = 2_166_136_261;
  let second = 2_246_822_519;
  for (const value of bytes) {
    first = Math.imul(first ^ value, 16_777_619);
    second = Math.imul(second ^ value, 2_654_435_761);
  }
  return `${bytes.byteLength}:${first >>> 0}:${second >>> 0}`;
}

function dataUrlForMediaWithCache(
  path: string,
  bytes: Uint8Array,
  cache: MediaDataUrlCache
): string | undefined {
  if (cache.byPath.has(path)) return cache.byPath.get(path);
  const mimeType = mimeForPackagePath(path);
  if (!mimeType) {
    cache.byPath.set(path, undefined);
    return undefined;
  }
  const contentKey = `${mimeType}:${mediaContentHash(bytes)}`;
  if (cache.byContentHash.has(contentKey)) {
    const cached = cache.byContentHash.get(contentKey);
    cache.byPath.set(path, cached);
    return cached;
  }
  if (mimeType === "image/svg+xml") {
    const source = safeEmbeddedSvg(decodeUtf8(bytes, `embedded image ${path}`));
    if (!source) {
      cache.byContentHash.set(contentKey, undefined);
      cache.byPath.set(path, undefined);
      return undefined;
    }
    const dataUrl = svgDataUrlForPptx(source).replace("data:image/svg+xml", `data:${mimeType}`);
    cache.byContentHash.set(contentKey, dataUrl);
    cache.byPath.set(path, dataUrl);
    return dataUrl;
  }
  const dataUrl = `data:${mimeType};base64,${bytesToBase64(bytes)}`;
  cache.byContentHash.set(contentKey, dataUrl);
  cache.byPath.set(path, dataUrl);
  return dataUrl;
}

function colorFrom(node: Element | undefined, fallback: string): string {
  const color = node && firstDescendant(node, "srgbClr");
  const value = attr(color, "val");
  return value && /^[0-9a-f]{6}$/i.test(value) ? `#${value}` : fallback;
}

function qualifiedPaintColor(node: Element | undefined): string | undefined {
  if (!node) return undefined;
  const paint = childElements(node).find((child) =>
    ["noFill", "solidFill"].includes(localName(child))
  );
  if (!paint || localName(paint) === "noFill") return paint ? "none" : undefined;
  const solidFill = paint;
  if (!solidFill) return undefined;
  const color = firstDescendant(solidFill, "srgbClr");
  const value = attr(color, "val");
  return value && /^[0-9a-f]{6}$/i.test(value) ? `#${value}` : undefined;
}

function booleanAttribute(value: string | undefined): boolean {
  return value === "1" || value?.toLowerCase() === "true";
}

function transformFor(node: Element | undefined): SlideTransform | undefined {
  const xfrm = node && firstDescendant(node, "xfrm");
  const off = xfrm && firstDescendant(xfrm, "off");
  const ext = xfrm && firstDescendant(xfrm, "ext");
  const x = Number(attr(off, "x"));
  const y = Number(attr(off, "y"));
  const width = Number(attr(ext, "cx"));
  const height = Number(attr(ext, "cy"));
  if (
    ![x, y, width, height].every((value) => Number.isSafeInteger(value) && value >= 0) ||
    width <= 0 ||
    height <= 0
  ) {
    return undefined;
  }
  const rotation = (Number(attr(xfrm, "rot") ?? 0) || 0) / 60_000;
  return {
    x,
    y,
    width,
    height,
    rotation,
    flipH: booleanAttribute(attr(xfrm, "flipH")),
    flipV: booleanAttribute(attr(xfrm, "flipV"))
  };
}

function transformAttribute(transform: SlideTransform): string {
  const cx = transform.x + transform.width / 2;
  const cy = transform.y + transform.height / 2;
  if (!transform.rotation && !transform.flipH && !transform.flipV) return "";
  const radians = (transform.rotation * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const scaleX = transform.flipH ? -1 : 1;
  const scaleY = transform.flipV ? -1 : 1;
  const a = cosine * scaleX;
  const b = sine * scaleX;
  const c = -sine * scaleY;
  const d = cosine * scaleY;
  const e = cx - a * cx - c * cy;
  const f = cy - b * cx - d * cy;
  return ` transform="matrix(${a} ${b} ${c} ${d} ${e} ${f})"`;
}

function rotationAttribute(transform: SlideTransform): string {
  if (!transform.rotation) return "";
  const cx = transform.x + transform.width / 2;
  const cy = transform.y + transform.height / 2;
  const radians = (transform.rotation * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const e = cx - cosine * cx + sine * cy;
  const f = cy - sine * cx - cosine * cy;
  return ` transform="matrix(${cosine} ${sine} ${-sine} ${cosine} ${e} ${f})"`;
}

function svgText(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    if (character === "&") return "&amp;";
    if (character === "<") return "&lt;";
    if (character === ">") return "&gt;";
    if (character === '"') return "&quot;";
    return "&apos;";
  });
}

function textContent(shape: Element): string {
  const body = firstDescendant(shape, "txBody");
  if (!body) return "";
  return descendants(body, "p")
    .map((paragraph) =>
      descendants(paragraph, "t")
        .map((text) => text.textContent ?? "")
        .join("")
    )
    .filter((paragraph) => paragraph.length > 0)
    .join("\n");
}

function textStyle(shape: Element): {
  fontFamily: string;
  fontSize: number;
  color: string;
  fontSubstituted: boolean;
} {
  const runProperties = firstDescendant(shape, "rPr");
  const font = firstDescendant(runProperties ?? shape, "latin");
  const explicitTypeface = attr(font, "typeface")?.replace(/["<>]/g, "").trim();
  const typeface = explicitTypeface || "Arial";
  const points = Number(attr(runProperties, "sz") ?? 1800) / 100;
  return {
    fontFamily: typeface,
    fontSize: Math.max(1, points * (PPTX_EMU_PER_INCH / 72)),
    color: colorFrom(runProperties, "#111827"),
    fontSubstituted: !explicitTypeface
  };
}

type RenderedContent = {
  svg: string;
  mapped: number;
  diagnostics?: InterchangeDiagnostic[];
};

function renderShape(shape: Element): RenderedContent | undefined {
  const shapeProperties = firstDescendant(shape, "spPr");
  const transform = transformFor(shapeProperties);
  if (!shapeProperties || !transform) return undefined;
  const geometry = firstDescendant(shapeProperties, "prstGeom");
  const preset = attr(geometry, "prst") ?? "rect";
  if (!["rect", "roundRect", "ellipse", "line"].includes(preset)) return undefined;
  const fill =
    preset === "line"
      ? (qualifiedPaintColor(shapeProperties) ?? "none")
      : qualifiedPaintColor(shapeProperties);
  if (!fill) return undefined;
  const line = firstDescendant(shapeProperties, "ln");
  const stroke = line ? qualifiedPaintColor(line) : "none";
  if (!stroke) return undefined;
  const strokeWidth = Number(attr(line, "w") ?? 9525);
  if (!Number.isFinite(strokeWidth) || strokeWidth < 0) return undefined;
  const rotation = transformAttribute(transform);
  let svg = "";
  if (preset === "ellipse") {
    svg = `<ellipse cx="${transform.x + transform.width / 2}" cy="${transform.y + transform.height / 2}" rx="${transform.width / 2}" ry="${transform.height / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${Math.max(1, strokeWidth)}"${rotation} />`;
  } else if (preset === "line") {
    svg = `<line x1="${transform.x}" y1="${transform.y}" x2="${transform.x + transform.width}" y2="${transform.y + transform.height}" stroke="${stroke === "none" ? "#1f2937" : stroke}" stroke-width="${Math.max(1, strokeWidth)}"${rotation} />`;
  } else {
    const radius = preset === "roundRect" ? Math.min(transform.width, transform.height) * 0.08 : 0;
    svg = `<rect x="${transform.x}" y="${transform.y}" width="${transform.width}" height="${transform.height}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${Math.max(1, strokeWidth)}"${rotation} />`;
  }
  const value = textContent(shape);
  const diagnostics: InterchangeDiagnostic[] = [];
  if (value) {
    const style = textStyle(shape);
    if (style.fontSubstituted) {
      diagnostics.push({
        code: "font_substitution",
        severity: "warning",
        message:
          "Slide text did not declare a usable font face in its run properties; Arial was used as an explicit fallback."
      });
    }
    diagnostics.push({
      code: "text_layout_approximated",
      severity: "warning",
      message:
        "Slide text alignment, anchors, inheritance, and per-run styling were not fully resolved; the text remains part of an appearance snapshot."
    });
    const lines = value.split("\n");
    const x = transform.x + Math.min(transform.width * 0.08, 24_000);
    const firstY = transform.y + style.fontSize * 1.2;
    const lineHeight = style.fontSize * 1.2;
    const text = lines
      .map(
        (lineValue, index) =>
          `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}"${index === 0 ? "" : ""}>${svgText(lineValue)}</tspan>`
      )
      .join("");
    svg += `<text x="${x}" y="${firstY}" fill="${style.color}" font-family="${svgText(style.fontFamily)}" font-size="${style.fontSize}"${rotationAttribute(transform)}>${text}</text>`;
  }
  return { svg, mapped: 1, diagnostics };
}

function renderPicture(
  picture: Element,
  relations: readonly PackageRelationship[],
  slidePath: string,
  entries: Record<string, Uint8Array>,
  mediaCache: MediaDataUrlCache
): RenderedContent | undefined {
  const shapeProperties = firstDescendant(picture, "spPr");
  const transform = transformFor(shapeProperties);
  if (!transform || firstDescendant(picture, "srcRect")) return undefined;
  const blip = firstDescendant(picture, "blip");
  const embedId = attr(blip, "r:embed") ?? attr(blip, "embed");
  if (!embedId) return undefined;
  const relation = relations.find((candidate) => candidate.id === embedId);
  if (!relation || !relation.type.endsWith(PPTX_IMAGE_RELATIONSHIP_SUFFIX)) return undefined;
  const target = relationTarget(relations, embedId, slidePath);
  const bytes = target ? entries[target] : undefined;
  if (!target || !bytes) return undefined;
  const dataUrl = dataUrlForMediaWithCache(target, bytes, mediaCache);
  if (!dataUrl) return undefined;
  return {
    mapped: 1,
    svg: `<image x="${transform.x}" y="${transform.y}" width="${transform.width}" height="${transform.height}" href="${dataUrl}" preserveAspectRatio="none"${transformAttribute(transform)} />`
  };
}

function renderSlide(
  index: number,
  stableId: string,
  slidePath: string,
  slideXml: Document,
  relations: readonly PackageRelationship[],
  entries: Record<string, Uint8Array>,
  widthEmu: number,
  heightEmu: number,
  mediaCache: MediaDataUrlCache,
  inheritedDiagnostics: readonly InterchangeDiagnostic[] = []
): PptxRenderedSlide {
  const diagnostics: InterchangeDiagnostic[] = [...inheritedDiagnostics];
  let mappedCount = 0;
  let flattenedCount = 0;
  let refusedCount = inheritedDiagnostics.length;
  const root = slideXml.documentElement;
  if (hasBackgroundContent(slideXml)) {
    refusedCount += 1;
    diagnostics.push({
      code: "unsupported_slide_background",
      severity: "warning",
      message:
        "Slide-local background content was not rendered; the imported appearance snapshot may omit it."
    });
  }
  const tree = firstDescendant(root, "spTree");
  const content: string[] = [];
  for (const child of tree ? childElements(tree) : []) {
    const name = localName(child);
    let rendered: RenderedContent | undefined;
    if (name === "sp") rendered = renderShape(child);
    else if (name === "pic") rendered = renderPicture(child, relations, slidePath, entries, mediaCache);
    if (rendered) {
      content.push(rendered.svg);
      mappedCount += rendered.mapped;
      flattenedCount += 1;
      diagnostics.push(...(rendered.diagnostics ?? []));
      continue;
    }
    if (["nvGrpSpPr", "grpSpPr", "extLst"].includes(name)) continue;
    refusedCount += 1;
    diagnostics.push({
      code: "unsupported_slide_content",
      severity: "warning",
      message: `Slide ${index + 1} contains unsupported ${name || "content"}; it was not approximated.`
    });
  }
  if (content.length === 0) {
    diagnostics.push({
      code: "empty_slide_snapshot",
      severity: "warning",
      message:
        "No supported slide content was rendered; the imported appearance snapshot is empty rather than fabricated."
    });
  }
  const title = textContent(root).split("\n")[0] || `Slide ${index + 1}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${widthEmu}" height="${heightEmu}" viewBox="0 0 ${widthEmu} ${heightEmu}">${content.join("")}</svg>`;
  if (mappedCount > 0) {
    diagnostics.push({
      code: "native_mapping_not_qualified",
      severity: "info",
      message:
        "Basic PresentationML content was rendered into a project-owned SVG snapshot; native OpenSketch mapping remains unqualified."
    });
  }
  return {
    index,
    stableId,
    title,
    svg,
    mappedCount,
    flattenedCount,
    refusedCount,
    diagnostics: boundedDiagnostics(diagnostics)
  };
}

function parseContentTypes(entries: Record<string, Uint8Array>): Document {
  const bytes = entries["[Content_Types].xml"];
  if (!bytes) {
    throw new InterchangeImportError("The PPTX package is missing [Content_Types].xml.", {
      code: "pptx_content_types"
    });
  }
  const document = parseXml(bytes, "[Content_Types].xml");
  requireXmlRoot(document, "Types", XML_CONTENT_TYPES_NAMESPACE, "[Content_Types].xml");
  const presentation = Array.from(document.getElementsByTagName("*")).find(
    (node) => localName(node) === "Override" && attr(node, "PartName") === "/ppt/presentation.xml"
  );
  if (!presentation || attr(presentation, "ContentType") !== PPTX_PRESENTATION_CONTENT_TYPE) {
    throw new InterchangeImportError("The PPTX package has no valid PresentationML content type.", {
      code: "pptx_content_types"
    });
  }
  const macroType = Array.from(document.getElementsByTagName("*")).some((node) =>
    /macroEnabled|vbaProject/i.test(attr(node, "ContentType") ?? "")
  );
  if (
    macroType ||
    Object.keys(entries).some((path) => /(?:^|\/)vbaproject\.bin$/i.test(path))
  ) {
    throw new InterchangeImportError(
      "Macro-enabled PPTX content is refused; executable VBA parts are never imported.",
      { code: "pptx_macro_refused" }
    );
  }
  return document;
}

export function parsePptxPackage(bytes: Uint8Array, signal?: AbortSignal): PptxParsedPackage {
  checkAbort(signal);
  const entries = unzipPackage(bytes);
  const contentTypes = parseContentTypes(entries);
  const relationParts = new Map<
    string,
    { relations: PackageRelationship[]; diagnostics: InterchangeDiagnostic[] }
  >();
  let relationshipCount = 0;
  for (const path of Object.keys(entries).filter((entry) =>
    entry.toLowerCase().endsWith(".rels")
  )) {
    checkAbort(signal);
    const parsed = relationshipsFor(entries, path);
    relationParts.set(path, parsed);
    relationshipCount += parsed.relations.length;
    if (relationshipCount > PPTX_MAX_RELATIONSHIPS) {
      throw new InterchangeImportError(
        "The PPTX relationship traversal exceeds the import limit.",
        {
          code: "pptx_relationship_limit"
        }
      );
    }
  }
  const relationPart = (path: string) =>
    relationParts.get(path) ?? { relations: [], diagnostics: [] as InterchangeDiagnostic[] };
  const rootRels = relationPart("_rels/.rels");
  const diagnostics = [...relationParts.values()].flatMap((part) => part.diagnostics);
  for (const path of Object.keys(entries)) {
    const lower = path.toLowerCase();
    if (lower.includes("/activex/") || lower.includes("/embeddings/")) {
      diagnostics.push({
        code: "executable_part_ignored",
        severity: "warning",
        message: `Executable or embedded Office part ${path} was ignored and never executed.`
      });
      continue;
    }
    if (
      lower.startsWith("ppt/media/") &&
      !["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(lower.split(".").at(-1) ?? "")
    ) {
      diagnostics.push({
        code: "unsupported_media_ignored",
        severity: "warning",
        message: `Non-image media ${path} was ignored; it was not decoded or executed.`
      });
    }
  }
  const officeDocument = rootRels.relations.find(
    (relation) => relation.type === PPTX_OFFICE_DOCUMENT_RELATIONSHIP
  );
  if (!officeDocument || officeDocument.targetMode?.toLowerCase() === "external") {
    throw new InterchangeImportError(
      "The PPTX package has no internal office document relationship.",
      {
        code: "pptx_relationship_structure"
      }
    );
  }
  const presentationPath = resolveTarget("", officeDocument.target);
  if (presentationPath !== "ppt/presentation.xml" || !entries[presentationPath]) {
    throw new InterchangeImportError("The PPTX office document relationship is invalid.", {
      code: "pptx_relationship_structure"
    });
  }
  const presentationXml = parseXml(entries[presentationPath], presentationPath);
  requireXmlRoot(presentationXml, "presentation", PPTX_PRESENTATION_NAMESPACE, presentationPath);
  const size = firstDescendant(presentationXml, "sldSz");
  const widthEmu = requiredPositiveInteger(attr(size, "cx"), "The PPTX slide width is invalid.");
  const heightEmu = requiredPositiveInteger(attr(size, "cy"), "The PPTX slide height is invalid.");
  const widthInches = widthEmu / PPTX_EMU_PER_INCH;
  const heightInches = heightEmu / PPTX_EMU_PER_INCH;
  if (
    widthInches < PPTX_MIN_INCHES ||
    heightInches < PPTX_MIN_INCHES ||
    widthInches > PPTX_MAX_INCHES ||
    heightInches > PPTX_MAX_INCHES
  ) {
    throw new InterchangeImportError(
      `The PPTX slide is ${widthInches.toFixed(3)} × ${heightInches.toFixed(3)} inches, outside the supported 1–56 inch range.`,
      { code: "pptx_geometry" }
    );
  }
  const presentationRels = relationPart("ppt/_rels/presentation.xml.rels");
  const slideIds = firstDescendant(presentationXml, "sldIdLst");
  const slideIdElements = slideIds ? childElements(slideIds, "sldId") : [];
  if (slideIdElements.length === 0 || slideIdElements.length > PPTX_MAX_SLIDES) {
    throw new InterchangeImportError("The PPTX slide list is empty or exceeds the import limit.", {
      code: "pptx_slide_limit"
    });
  }
  const slides: PptxRenderedSlide[] = [];
  const mediaCache: MediaDataUrlCache = { byPath: new Map(), byContentHash: new Map() };
  let renderedSnapshotBytes = 0;
  const seenTargets = new Set<string>();
  const seenStableIds = new Set<string>();
  for (let index = 0; index < slideIdElements.length; index += 1) {
    checkAbort(signal);
    const slideId = attr(slideIdElements[index], "r:id") ?? attr(slideIdElements[index], "id");
    const stableId = attr(slideIdElements[index], "id");
    if (!slideId || !stableId) {
      throw new InterchangeImportError(
        `PPTX slide ${index + 1} has no stable relationship identity.`,
        {
          code: "pptx_slide_structure"
        }
      );
    }
    if (seenStableIds.has(stableId)) {
      throw new InterchangeImportError(
        `The PPTX slide list contains a duplicate stable ID: ${stableId}.`,
        {
          code: "pptx_duplicate_slide"
        }
      );
    }
    seenStableIds.add(stableId);
    const slideRelation = presentationRels.relations.find((relation) => relation.id === slideId);
    if (!slideRelation || slideRelation.type !== PPTX_SLIDE_RELATIONSHIP) {
      throw new InterchangeImportError(
        `PPTX slide ${index + 1} has an invalid slide relationship.`,
        {
          code: "pptx_slide_structure"
        }
      );
    }
    const target = relationTarget(presentationRels.relations, slideId, presentationPath);
    if (!target || !entries[target] || !target.startsWith("ppt/slides/")) {
      throw new InterchangeImportError(`PPTX slide ${index + 1} has no internal slide part.`, {
        code: "pptx_slide_structure"
      });
    }
    if (seenTargets.has(target)) {
      throw new InterchangeImportError(
        `The PPTX slide list contains a duplicate target: ${target}.`,
        {
          code: "pptx_duplicate_slide"
        }
      );
    }
    seenTargets.add(target);
    const contentType = Array.from(contentTypes.getElementsByTagName("*")).find(
      (node) => localName(node) === "Override" && attr(node, "PartName") === `/${target}`
    );
    if (!contentType || attr(contentType, "ContentType") !== PPTX_SLIDE_CONTENT_TYPE) {
      throw new InterchangeImportError(`PPTX slide ${target} has an invalid content type.`, {
        code: "pptx_content_types"
      });
    }
    const slideXml = parseXml(entries[target], target);
    requireXmlRoot(slideXml, "sld", PPTX_PRESENTATION_NAMESPACE, target);
    const slideRels = relationPart(relationshipsPath(target));
    const inheritedDiagnostics = inheritedSlideAppearanceDiagnostics(
      target,
      slideRels.relations,
      entries,
      relationPart
    );
    const rendered = renderSlide(
      index,
      stableId,
      target,
      slideXml,
      slideRels.relations,
      entries,
      widthEmu,
      heightEmu,
      mediaCache,
      inheritedDiagnostics
    );
    const renderedBytes = new TextEncoder().encode(rendered.svg).byteLength;
    if (
      renderedBytes > PPTX_MAX_RENDERED_SNAPSHOT_BYTES ||
      renderedSnapshotBytes > PPTX_MAX_RENDERED_SNAPSHOT_BYTES - renderedBytes
    ) {
      throw new InterchangeImportError(
        `Rendered PPTX appearance snapshots exceed the ${PPTX_MAX_RENDERED_SNAPSHOT_BYTES}-byte import limit.`,
        { code: "pptx_render_limit" }
      );
    }
    renderedSnapshotBytes += renderedBytes;
    slides.push(rendered);
  }
  return { widthEmu, heightEmu, slides, diagnostics: boundedDiagnostics(diagnostics) };
}

async function checksum(bytes: Uint8Array): Promise<string | undefined> {
  if (!globalThis.crypto?.subtle) return undefined;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes.slice().buffer);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function sourceForPptx(
  file: Pick<File, "name" | "type" | "size">,
  bytes: Uint8Array
): InterchangeSourceResource {
  return {
    name: file.name,
    mimeType: file.type || PPTX_MIME_TYPE,
    byteLength: file.size,
    bytes
  };
}

function probeForPptx(
  bytes: Uint8Array,
  source: { name: string; type: string; size: number },
  parsed: PptxParsedPackage
): InterchangeProbe {
  const base = probeInterchangeBytes(bytes, {
    mimeType: source.type || PPTX_MIME_TYPE,
    name: source.name,
    byteLength: source.size
  });
  return {
    ...base,
    format: "pptx",
    signature: "zip",
    dimensions: { width: parsed.widthEmu, height: parsed.heightEmu },
    pageCount: parsed.slides.length,
    diagnostics: boundedDiagnostics([...base.diagnostics, ...parsed.diagnostics])
  };
}

function reportForPptx(
  source: InterchangeSourceResource,
  probe: InterchangeProbe,
  selected: readonly PptxRenderedSlide[],
  checksumValue?: string,
  extraDiagnostics: readonly InterchangeDiagnostic[] = []
): InterchangeFidelityReport {
  const diagnostics = boundedDiagnostics([
    ...selected.flatMap((slide) => slide.diagnostics),
    ...extraDiagnostics
  ]);
  return createFidelityReport({
    source,
    probe,
    checksum: checksumValue,
    status: "appearance-snapshot",
    diagnostics,
    mappedCount: 0,
    flattenedCount: selected.length,
    refusedCount: selected.reduce((total, slide) => total + slide.refusedCount, 0),
    substitutions: [
      "selected PPTX slides imported as project-owned SVG appearance snapshots",
      "native OpenSketch editability was not claimed without qualified renderer and round-trip evidence"
    ]
  });
}

export async function preparePptxImport(
  file: Pick<File, "name" | "type" | "size" | "arrayBuffer" | "slice">,
  options: PptxImportOptions = {}
): Promise<PptxImportPreparation> {
  checkAbort(options.signal);
  if (
    file.name.toLowerCase().endsWith(".pptm") ||
    file.type.toLowerCase().includes("macroenabled")
  ) {
    throw new InterchangeImportError(
      "Macro-enabled .pptm packages are refused; executable content is never imported.",
      { code: "pptx_macro_refused" }
    );
  }
  if (file.size <= 0 || file.size > PPTX_MAX_PACKAGE_BYTES) {
    throw new InterchangeImportError("PPTX packages must be non-empty and 25 MB or smaller.", {
      code: "pptx_package_limit"
    });
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  checkAbort(options.signal);
  const probeBytes = bytes.slice(0, Math.min(bytes.length, 1_048_576));
  const initialSource = sourceForPptx(file, probeBytes);
  let parsed: PptxParsedPackage;
  try {
    parsed = parsePptxPackage(bytes, options.signal);
  } catch (reason) {
    if (reason instanceof InterchangeImportError) {
      const probe = probeInterchangeBytes(probeBytes, {
        mimeType: file.type || PPTX_MIME_TYPE,
        name: file.name,
        byteLength: file.size
      });
      const diagnostic: InterchangeDiagnostic = {
        code: reason.code,
        severity: "error",
        message: reason.message
      };
      const report = createFidelityReport({
        source: initialSource,
        probe: {
          ...probe,
          format: "pptx",
          signature: "zip",
          diagnostics: [...probe.diagnostics, diagnostic]
        },
        status: "unsupported/refused",
        diagnostics: [diagnostic],
        mappedCount: 0,
        flattenedCount: 0,
        refusedCount: 1
      });
      throw new InterchangeImportError(reason.message, {
        code: reason.code,
        probe: {
          ...probe,
          format: "pptx",
          signature: "zip",
          diagnostics: [...probe.diagnostics, diagnostic]
        },
        report
      });
    }
    throw reason;
  }
  const checksumValue = await checksum(bytes);
  const source = { ...initialSource, ...(checksumValue ? { sha256: checksumValue } : {}) };
  const probe = probeForPptx(probeBytes, file, parsed);
  const selectedIndices = options.selectedSlideIndices
    ? [...new Set(options.selectedSlideIndices)]
    : parsed.slides.length === 1
      ? [0]
      : undefined;
  if (
    !selectedIndices ||
    selectedIndices.length === 0 ||
    selectedIndices.some(
      (index) => !Number.isSafeInteger(index) || index < 0 || index >= parsed.slides.length
    )
  ) {
    const report = reportForPptx(source, probe, [], checksumValue, [
      {
        code: "pptx_slides_require_choice",
        severity: "warning",
        message: "A multi-slide PPTX requires an explicit slide selection."
      }
    ]);
    throw new InterchangeImportError(
      `Choose one or more slides from this ${parsed.slides.length}-slide presentation before importing.`,
      {
        code: "pptx_slides_require_choice",
        probe,
        report,
        slideIndices: parsed.slides.map((slide) => slide.index)
      }
    );
  }
  const selected = selectedIndices.map((index) => parsed.slides[index]);
  const refusedSlides = selected.filter((slide) => slide.refusedCount > 0);
  if (refusedSlides.length > 0) {
    const refusalDiagnostics: InterchangeDiagnostic[] = [
      ...selected.flatMap((slide) => slide.diagnostics),
      {
        code: "pptx_slide_refused",
        severity: "error",
        message:
          "One or more selected slides contain content outside the qualified local renderer; the slide was refused rather than approximated."
      }
    ];
    const report = createFidelityReport({
      source,
      probe,
      status: "unsupported/refused",
      diagnostics: refusalDiagnostics,
      mappedCount: 0,
      flattenedCount: 0,
      refusedCount: Math.max(
        refusedSlides.length,
        selected.reduce((total, slide) => total + slide.refusedCount, 0)
      )
    });
    throw new InterchangeImportError(
      `The selected PPTX slide${refusedSlides.length === 1 ? "" : "s"} contain${
        refusedSlides.length === 1 ? "s" : ""
      } unsupported content and cannot be imported safely.`,
      {
        code: "pptx_slide_refused",
        probe,
        report,
        slideIndices: refusedSlides.map((slide) => slide.index)
      }
    );
  }
  const report = reportForPptx(source, probe, selected, checksumValue);
  const normalized = new Blob([selected[0].svg], { type: "image/svg+xml" });
  return {
    source,
    probe,
    fidelity: report,
    normalized,
    normalizedMimeType: "image/svg+xml",
    requiresDecision: parsed.slides.length > 1 && !options.selectedSlideIndices,
    slides: selected,
    selectedSlideIndices: selectedIndices
  };
}

function xml(value: string | number): string {
  return String(value).replace(/[&<>"']/g, (character) => {
    if (character === "&") return "&amp;";
    if (character === "<") return "&lt;";
    if (character === ">") return "&gt;";
    if (character === '"') return "&quot;";
    return "&apos;";
  });
}

function emuForInches(inches: number): number {
  return Math.round(inches * PPTX_EMU_PER_INCH);
}

function physicalExtent(
  width: number,
  height: number,
  dpi: number
): {
  widthInches: number;
  heightInches: number;
  widthEmu: number;
  heightEmu: number;
} {
  if (![width, height, dpi].every((value) => Number.isFinite(value) && value > 0)) {
    throw new InterchangeImportError("PPTX export dimensions must be finite and positive.", {
      code: "pptx_geometry"
    });
  }
  const widthInches = width / dpi;
  const heightInches = height / dpi;
  if (
    widthInches < PPTX_MIN_INCHES ||
    heightInches < PPTX_MIN_INCHES ||
    widthInches > PPTX_MAX_INCHES ||
    heightInches > PPTX_MAX_INCHES
  ) {
    throw new InterchangeImportError(
      `PPTX export size ${widthInches.toFixed(3)} × ${heightInches.toFixed(3)} inches is outside PowerPoint's 1–56 inch range; hidden scaling was not applied.`,
      { code: "pptx_geometry" }
    );
  }
  return {
    widthInches,
    heightInches,
    widthEmu: emuForInches(widthInches),
    heightEmu: emuForInches(heightInches)
  };
}

const THEME_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="OpenSketch">
  <a:themeElements>
    <a:clrScheme name="OpenSketch"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F2937"/></a:dk2><a:lt2><a:srgbClr val="F9FAFB"/></a:lt2><a:accent1><a:srgbClr val="2563EB"/></a:accent1><a:accent2><a:srgbClr val="0F766E"/></a:accent2><a:accent3><a:srgbClr val="C2410C"/></a:accent3><a:accent4><a:srgbClr val="7C3AED"/></a:accent4><a:accent5><a:srgbClr val="BE123C"/></a:accent5><a:accent6><a:srgbClr val="A16207"/></a:accent6><a:hlink><a:srgbClr val="2563EB"/></a:hlink><a:folHlink><a:srgbClr val="7C3AED"/></a:folHlink></a:clrScheme>
    <a:fontScheme name="OpenSketch"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>
    <a:fmtScheme name="OpenSketch">
      <a:fillStyleLst>
        <a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>
        <a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:srgbClr val="FFFFFF"/></a:gs><a:gs pos="100000"><a:srgbClr val="F9FAFB"/></a:gs></a:gsLst><a:lin ang="5400000" scaled="1"/></a:gradFill>
        <a:solidFill><a:srgbClr val="F9FAFB"/></a:solidFill>
      </a:fillStyleLst>
      <a:lnStyleLst>
        <a:ln w="9525"><a:solidFill><a:srgbClr val="1F2937"/></a:solidFill><a:prstDash val="solid"/></a:ln>
        <a:ln w="19050"><a:solidFill><a:srgbClr val="1F2937"/></a:solidFill><a:prstDash val="solid"/></a:ln>
        <a:ln w="28575"><a:solidFill><a:srgbClr val="1F2937"/></a:solidFill><a:prstDash val="solid"/></a:ln>
      </a:lnStyleLst>
      <a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>
      <a:bgFillStyleLst>
        <a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>
        <a:solidFill><a:srgbClr val="F9FAFB"/></a:solidFill>
        <a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>
      </a:bgFillStyleLst>
    </a:fmtScheme>
  </a:themeElements>
</a:theme>`;

function packageRelationships(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${XML_RELATIONSHIP_NAMESPACE}">
  <Relationship Id="rId1" Type="${PPTX_OFFICE_DOCUMENT_RELATIONSHIP}" Target="ppt/presentation.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
}

function presentationXml(widthEmu: number, heightEmu: number): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
  <p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst>
  <p:sldSz cx="${widthEmu}" cy="${heightEmu}" type="custom"/><p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`;
}

function presentationRelationships(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${XML_RELATIONSHIP_NAMESPACE}">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>
</Relationships>`;
}

function masterXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld name="OpenSketch Master"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="1" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`;
}

function masterRelationships(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${XML_RELATIONSHIP_NAMESPACE}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>`;
}

function layoutXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
}

function layoutRelationships(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${XML_RELATIONSHIP_NAMESPACE}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`;
}

function slideXml(widthEmu: number, heightEmu: number, title: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:asvg="${PPTX_SVG_EXTENSION_NAMESPACE}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld name="${xml(title)}"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${widthEmu}" cy="${heightEmu}"/><a:chOff x="0" y="0"/><a:chExt cx="${widthEmu}" cy="${heightEmu}"/></a:xfrm></p:grpSpPr><p:pic><p:nvPicPr><p:cNvPr id="2" name="OpenSketch appearance snapshot"/><p:cNvPicPr preferRelativeResize="0"/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId1"><a:extLst><a:ext uri="${PPTX_SVG_EXTENSION_URI}"><asvg:svgBlip r:embed="rId2"/></a:ext></a:extLst></a:blip><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${widthEmu}" cy="${heightEmu}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

function slideRelationships(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${XML_RELATIONSHIP_NAMESPACE}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/scene.png"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/scene.svg"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`;
}

function contentTypes(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="svg" ContentType="image/svg+xml"/><Override PartName="/ppt/presentation.xml" ContentType="${PPTX_PRESENTATION_CONTENT_TYPE}"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="${PPTX_SLIDE_CONTENT_TYPE}"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
}

function coreProperties(title: string, description: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"><dc:title>${xml(title)}</dc:title><dc:description>${xml(description)}</dc:description><dc:creator>OpenSketch</dc:creator></cp:coreProperties>`;
}

function appProperties(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>OpenSketch</Application><PresentationFormat>On-screen Show (16:9)</PresentationFormat><Slides>1</Slides></Properties>`;
}

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const PPTX_RASTER_MAX_DIMENSION = 4_096;
const PPTX_RASTER_MAX_PIXELS = 16_000_000;

function isPng(bytes: Uint8Array): boolean {
  return (
    bytes.length >= PNG_SIGNATURE.length &&
    PNG_SIGNATURE.every((value, index) => bytes[index] === value)
  );
}

interface PptxRasterizationResult {
  bytes: Uint8Array;
  width: number;
  height: number;
  scale: number;
}

function readBlobBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === "function") {
    return blob.arrayBuffer().then((buffer) => new Uint8Array(buffer));
  }
  if (typeof FileReader === "undefined") {
    return Promise.reject(new Error("The browser cannot read the PNG fallback."));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error("The PNG fallback could not be read."));
    reader.readAsArrayBuffer(blob);
  });
}

async function rasterizeSvgForPptx(
  source: string,
  width: number,
  height: number,
  signal?: AbortSignal
): Promise<PptxRasterizationResult> {
  checkAbort(signal);
  if (typeof document === "undefined" || typeof Image === "undefined" || !URL.createObjectURL) {
    throw new InterchangeImportError(
      "PPTX export needs a browser PNG rasterizer for its standards-valid fallback image.",
      { code: "pptx_rasterization" }
    );
  }
  const scale = Math.min(
    1,
    PPTX_RASTER_MAX_DIMENSION / width,
    PPTX_RASTER_MAX_DIMENSION / height,
    Math.sqrt(PPTX_RASTER_MAX_PIXELS / (width * height))
  );
  const rasterWidth = Math.max(1, Math.round(width * scale));
  const rasterHeight = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = rasterWidth;
  canvas.height = rasterHeight;
  let context: CanvasRenderingContext2D | null = null;
  try {
    context = canvas.getContext("2d");
  } catch {
    context = null;
  }
  if (!context) {
    throw new InterchangeImportError("PPTX export could not create a browser 2D rasterizer.", {
      code: "pptx_rasterization"
    });
  }
  const sourceUrl = URL.createObjectURL(new Blob([source], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(new Error("The SVG appearance snapshot could not be rasterized."));
      image.src = sourceUrl;
    });
    checkAbort(signal);
    context.clearRect(0, 0, rasterWidth, rasterHeight);
    context.drawImage(image, 0, 0, rasterWidth, rasterHeight);
    const png = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("The browser did not produce a PNG fallback."));
      }, "image/png");
    });
    const bytes = await readBlobBytes(png);
    if (!isPng(bytes)) throw new Error("The browser produced an invalid PNG fallback.");
    return { bytes, width: rasterWidth, height: rasterHeight, scale };
  } catch (error) {
    if (error instanceof InterchangeImportError) throw error;
    throw new InterchangeImportError(
      error instanceof Error
        ? error.message
        : "The SVG appearance snapshot could not be rasterized.",
      { code: "pptx_rasterization" }
    );
  } finally {
    URL.revokeObjectURL(sourceUrl);
    canvas.width = 0;
    canvas.height = 0;
  }
}

export async function exportPptx(options: PptxExportOptions): Promise<PptxExportResult> {
  checkAbort(options.signal);
  const extent = physicalExtent(options.width, options.height, options.dpi);
  const svgBytes = new TextEncoder().encode(options.svg);
  if (svgBytes.byteLength > PPTX_MAX_ENTRY_BYTES) {
    throw new InterchangeImportError("The SVG appearance snapshot exceeds the PPTX entry limit.", {
      code: "pptx_package_limit"
    });
  }
  const rasterization = options.rasterFallback
    ? {
        bytes: await readBlobBytes(options.rasterFallback),
        width: options.width,
        height: options.height,
        scale: 1
      }
    : await rasterizeSvgForPptx(options.svg, options.width, options.height, options.signal);
  const pngBytes = rasterization.bytes;
  if (!isPng(pngBytes) || pngBytes.byteLength === 0 || pngBytes.byteLength > PPTX_MAX_ENTRY_BYTES) {
    throw new InterchangeImportError(
      "The PPTX PNG fallback is invalid or exceeds the entry limit.",
      {
        code: "pptx_rasterization"
      }
    );
  }
  const rasterDiagnostics: InterchangeDiagnostic[] = [];
  if (!options.rasterFallback && rasterization.scale < 1) {
    const effectiveWidthDpi = rasterization.width / extent.widthInches;
    const effectiveHeightDpi = rasterization.height / extent.heightInches;
    const effectiveDpi = Math.min(effectiveWidthDpi, effectiveHeightDpi);
    rasterDiagnostics.push({
      code: "pptx_raster_resolution_capped",
      severity: "warning",
      message: `The requested ${options.dpi} dpi raster fallback was capped to ${effectiveDpi.toFixed(1)} effective dpi at ${rasterization.width} × ${rasterization.height} pixels; the embedded SVG remains available through the DrawingML extension.`
    });
  }
  if (!options.rasterFallback) {
    rasterDiagnostics.push({
      code: "font_substitution",
      severity: "warning",
      message:
        "The PNG fallback was rasterized from serialized SVG without embedding OpenSketch web fonts; text may use a browser or system fallback. The retained SVG layer likewise depends on matching viewer fonts."
    });
  }
  const title = options.title || "OpenSketch export";
  const description = options.description || "";
  const files: Zippable = {
    "[Content_Types].xml": new TextEncoder().encode(contentTypes()),
    "_rels/.rels": new TextEncoder().encode(packageRelationships()),
    "docProps/core.xml": new TextEncoder().encode(coreProperties(title, description)),
    "docProps/app.xml": new TextEncoder().encode(appProperties()),
    "ppt/presentation.xml": new TextEncoder().encode(
      presentationXml(extent.widthEmu, extent.heightEmu)
    ),
    "ppt/_rels/presentation.xml.rels": new TextEncoder().encode(presentationRelationships()),
    "ppt/theme/theme1.xml": new TextEncoder().encode(THEME_XML),
    "ppt/slideMasters/slideMaster1.xml": new TextEncoder().encode(masterXml()),
    "ppt/slideMasters/_rels/slideMaster1.xml.rels": new TextEncoder().encode(masterRelationships()),
    "ppt/slideLayouts/slideLayout1.xml": new TextEncoder().encode(layoutXml()),
    "ppt/slideLayouts/_rels/slideLayout1.xml.rels": new TextEncoder().encode(layoutRelationships()),
    "ppt/slides/slide1.xml": new TextEncoder().encode(
      slideXml(extent.widthEmu, extent.heightEmu, title)
    ),
    "ppt/slides/_rels/slide1.xml.rels": new TextEncoder().encode(slideRelationships()),
    "ppt/media/scene.png": pngBytes,
    "ppt/media/scene.svg": svgBytes
  };
  checkAbort(options.signal);
  let zipped: Uint8Array;
  try {
    zipped = zipSync(files, { level: 6 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown ZIP writer error";
    throw new InterchangeImportError(`PPTX export failed: ${message}.`, { code: "pptx_export" });
  }
  if (zipped.byteLength > PPTX_MAX_PACKAGE_BYTES) {
    throw new InterchangeImportError("The generated PPTX exceeds the package size limit.", {
      code: "pptx_package_limit"
    });
  }
  const blob = new Blob([zipped], { type: PPTX_MIME_TYPE });
  const source: InterchangeSourceResource = {
    name: `${title}.pptx`,
    mimeType: PPTX_MIME_TYPE,
    byteLength: blob.size
  };
  const report = createFidelityReport({
    source,
    probe: {
      format: "pptx",
      signature: "zip",
      dimensions: { width: extent.widthEmu, height: extent.heightEmu },
      diagnostics: rasterDiagnostics
    },
    status: "appearance-snapshot",
    mappedCount: 0,
    flattenedCount: 1,
    refusedCount: 0,
    substitutions: [
      "the resolved OpenSketch scene was materialized as one SVG appearance snapshot",
      "a standards-valid PNG fallback was rasterized for broad PowerPoint compatibility; the SVG was retained through the DrawingML SVG extension",
      "OpenSketch layout constraints were not exported as fake PowerPoint metadata",
      ...rasterDiagnostics.map((diagnostic) => diagnostic.message)
    ]
  });
  return {
    blob,
    report,
    widthEmu: extent.widthEmu,
    heightEmu: extent.heightEmu,
    widthInches: extent.widthInches,
    heightInches: extent.heightInches
  };
}
