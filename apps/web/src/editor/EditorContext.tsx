import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import {
  ActiveSelection,
  Canvas,
  FabricImage,
  FabricObject,
  Gradient,
  Group,
  IText,
  Path,
  Point as FabricPoint,
  StaticCanvas,
  Text,
  Textbox,
  cache,
  util
} from "fabric";
import {
  type AssetFamily,
  type AssetVariant,
  type CanvasSettings,
  type ConnectorBinding,
  type ImportedMediaRecord,
  type ProjectRecord,
  type RasterInspection,
  imageDataUrlByteLength,
  inspectRasterBlob,
  inspectRasterDataUrl,
  isSupportedImageMimeType,
  isSupportedRasterMimeType,
  parseImageDataUrl,
  PORTABLE_PROJECT_LIMITS,
  rasterLimitMessage
} from "@workspace/editor-core";
import { sanitizeImportedSvg } from "@/assets/browserSanitizer";
import { calculatePngExportResource, setPngDpi } from "@/export/png";
import {
  normalizePdfFontStyle,
  normalizePdfFontWeight,
  svgToPdfBlob,
  warmPdfFontFaces
} from "@/export/pdf";
import { collectProvenanceManifest, formatProvenanceCredits } from "@/export/provenance";
import { downloadBlob, downloadProject, safeFilename } from "@/persistence/portable";
import { createVectorThumbnail } from "@/persistence/projectThumbnail";
import {
  hasUnsavedProjectRevision,
  normalizeProjectSaveError,
  type ProjectSaveState
} from "@/editor/projectSaveState";
import { GLOBAL_CREDIT } from "@/assets/credit";
import {
  connectorAppearance,
  connectorsForRemovedIds,
  createConnectorObject,
  createFreeConnectorObject,
  normalizeConnectorHeadOffsets
} from "@/editor/connectors";
import { connectorStrokeLineCap } from "@/editor/connectorGeometry";
import {
  ASSET_COLOR_PRESETS,
  colorProfileForFamily,
  normalizedPresetColor,
  presetColorMap
} from "@/editor/assetColorPresets";
import { saveAssetVariantDefault } from "@/editor/assetVariantDefaults";
import {
  anchorPoint,
  applySnapResistance,
  SNAP_CAPTURE_DISTANCE_PX,
  SNAP_MAX_ORTHOGONAL_GAP_PX,
  SNAP_RELEASE_DISTANCE_PX,
  snapBounds,
  type AxisSnapLock,
  type Point
} from "@/editor/geometry";
import {
  applyActiveSelectionTextScale,
  beginActiveSelectionTextScale,
  configureTextObject,
  configureSelectionControls,
  enableSelectionBoundsTarget,
  nextDeepSelection,
  restoreObjectTargeting,
  SELECTION_STROKE_WIDTH_PX,
  selectionStrokeWidthAtZoom,
  type ActiveSelectionTextScaleSession
} from "@/editor/selection";
import { CURSOR_GRAB, CURSOR_GRABBING } from "@/editor/cursors";
import { assetInsertionScale } from "@/editor/assetInsertion";
import { createShapeObject } from "@/editor/creationObjects";
import { copySvgBlendModes, loadEditableSvg } from "@/editor/svg";
import { refreshTextMetrics } from "@/editor/textMetrics";
import { zoomedCanvasDimensions } from "@/editor/zoom";
import {
  applyElementStyle,
  captureElementStyle,
  elementStyleKey,
  loadSavedElementStyles,
  persistSavedElementStyles,
  styleTarget
} from "@/editor/elementStyles";
import { assignFreshCloneIds } from "@/editor/cloneIdentity";
import {
  assertUniqueSceneObjectIds,
  isSceneDescendant,
  removeSceneObject,
  replaceSceneObject,
  sendSceneObjectToParentPlane,
  sceneObjectEntries,
  sceneObjectIndex,
  visitSceneObjects
} from "@/editor/sceneTree";
import {
  consumeRecognizedGroup,
  findRecognizedGroup,
  rememberRecognizedGroup,
  type RecognizedGroup
} from "@/editor/groupRecognition";
import {
  arrangeObjects,
  directNestedParent,
  isAtomicSvgAsset,
  isManualGroup,
  layerCollectionForObject
} from "@/editor/grouping";
import {
  SELECTION_CLIPBOARD_MARKER_PREFIX,
  type SelectionClipboardFormat,
  writeSelectionToSystemClipboard
} from "@/editor/selectionClipboard";
import { saveAssetTemplate, type AssetTemplate } from "@/editor/assetTemplates";
import {
  clipboardContainsSelectionMarker,
  importedMediaFilesFromClipboard
} from "@/editor/clipboardImport";
import {
  rememberProjectImports,
  saveImportedMedia as saveImportedMediaToLibrary,
  saveProjectThumbnail
} from "@/persistence/database";
import {
  CREATION_DEFAULTS_STORAGE_KEY,
  DEFAULT_CREATION_DEFAULTS,
  normalizeCreationDefaults,
  type ConnectorCreationPreset,
  type CreationDefaults,
  type CreationTool,
  type ShapeKind,
  type TextKind
} from "@/editor/creation";
import { EditorSnapshotProvider } from "@/editor/editorSnapshotProvider";
import { createSnapshotStore, type SnapshotStore } from "@/editor/editorStore";
import { DEFAULT_TEXT_LINE_HEIGHT } from "@/editor/text";
import { createSemanticEditorAdapter } from "@/semantic/semanticEditorAdapter";
import { installSemanticIntrospection } from "@/semantic/semanticIntrospection";
import { createSemanticRuntime, type SemanticRuntime } from "@/semantic/semanticRuntime";
import { createWebMcpAdapter, type WebMcpAdapter } from "@/semantic/webmcp";

FabricObject.customProperties = [
  "objectId",
  "name",
  "OpenSketchType",
  "assetId",
  "familyId",
  "provenance",
  "originalPalette",
  "originalFill",
  "originalStroke",
  "effectBaseFill",
  "effectBaseStroke",
  "originalGradientFill",
  "originalGradientStroke",
  "effectBaseGradientFill",
  "effectBaseGradientStroke",
  "connector",
  "freeConnectorBinding",
  "freeConnectorGeometry",
  "connectorHeadOffsetVersion",
  "assetTint",
  "assetTintAmount",
  "assetSaturation",
  "assetBrightness",
  "assetColorPreset",
  "recognizedGroups",
  "defaultElementStyle"
];

const RESTORABLE_GROUP_PROPERTIES = [
  "name",
  "OpenSketchType",
  "assetId",
  "familyId",
  "provenance",
  "originalPalette",
  "originalFill",
  "originalStroke",
  "effectBaseFill",
  "effectBaseStroke",
  "originalGradientFill",
  "originalGradientStroke",
  "effectBaseGradientFill",
  "effectBaseGradientStroke",
  "connector",
  "freeConnectorBinding",
  "freeConnectorGeometry",
  "assetTint",
  "assetTintAmount",
  "assetSaturation",
  "assetBrightness",
  "assetColorPreset",
  "recognizedGroups",
  "defaultElementStyle"
] as const;

const MAX_HISTORY = 120;
const SVG_CACHE_LIMIT = 64;
const DRAG_DUPLICATE_OPACITY = 0.35;
const TITLE_PERSISTENCE_DELAY_MS = 250;
const svgStringCache = new Map<string, string>();
let assetManifestPromise: Promise<typeof import("@/assets/manifest")> | undefined;
let bundledVariantsPromise: Promise<Map<string, AssetVariant>> | undefined;

function validateImportedMediaRecord(
  media: ImportedMediaRecord,
  existingRasterPixels = 0,
  knownInspection?: RasterInspection
): RasterInspection | undefined {
  const { inspection } = inspectImportedMediaRecord(media, knownInspection);
  if (!inspection) return undefined;
  const limitMessage = rasterLimitMessage(inspection, existingRasterPixels);
  if (limitMessage) throw new Error(limitMessage);
  return inspection;
}

function rasterMediaInScene(canvas: Canvas): ImportedMediaRecord[] {
  const media: ImportedMediaRecord[] = [];
  const roots = [
    ...canvas.getObjects(),
    canvas.backgroundImage,
    canvas.overlayImage,
    canvas.clipPath
  ].filter((object): object is FabricObject => object instanceof FabricObject);
  const visited = new Set<FabricObject>();
  const visit = (object: FabricObject): void => {
    if (visited.has(object)) return;
    visited.add(object);
    if (object instanceof FabricImage) {
      const source = object.getSrc();
      const parsed = parseImageDataUrl(source);
      if (!parsed)
        throw new Error("The document contains an external or unsupported image reference.");
      if (parsed.mimeType !== "image/svg+xml") {
        media.push({
          id: `scene-${media.length}`,
          name: "Scene image",
          mimeType: parsed.mimeType,
          dataUrl: source
        });
      }
    }
    if (object.clipPath) visit(object.clipPath as FabricObject);
    if (object instanceof Group) object.getObjects().forEach(visit);
  };
  roots.forEach(visit);
  return media;
}

interface ProjectMediaTotals {
  rasterPixels: number;
  dataUrlBytes: number;
}

interface ImportedMediaInspection {
  mimeType: string;
  byteLength: number;
  inspection?: RasterInspection;
}

const importedMediaInspectionCache = new Map<string, ImportedMediaInspection>();
const IMPORTED_MEDIA_INSPECTION_CACHE_MAX_CHARS = 8 * 1024 * 1024;
let importedMediaInspectionCacheChars = 0;

function cachedImportedMediaInspection(
  dataUrl: string,
  mimeType: string
): ImportedMediaInspection | undefined {
  const cached = importedMediaInspectionCache.get(dataUrl);
  if (!cached || cached.mimeType !== mimeType) return undefined;
  importedMediaInspectionCache.delete(dataUrl);
  importedMediaInspectionCache.set(dataUrl, cached);
  return cached;
}

function cacheImportedMediaInspection(dataUrl: string, inspection: ImportedMediaInspection): void {
  if (dataUrl.length > IMPORTED_MEDIA_INSPECTION_CACHE_MAX_CHARS) return;
  const previous = importedMediaInspectionCache.get(dataUrl);
  if (previous) {
    importedMediaInspectionCache.delete(dataUrl);
    importedMediaInspectionCacheChars -= dataUrl.length;
  }
  while (
    importedMediaInspectionCacheChars + dataUrl.length >
    IMPORTED_MEDIA_INSPECTION_CACHE_MAX_CHARS
  ) {
    const oldest = importedMediaInspectionCache.keys().next().value;
    if (oldest === undefined) return;
    importedMediaInspectionCache.delete(oldest);
    importedMediaInspectionCacheChars -= oldest.length;
  }
  importedMediaInspectionCache.set(dataUrl, inspection);
  importedMediaInspectionCacheChars += dataUrl.length;
}

function inspectImportedMediaRecord(
  media: ImportedMediaRecord,
  knownInspection?: RasterInspection
): ImportedMediaInspection {
  const mimeType = media.mimeType.toLowerCase();
  const cached = cachedImportedMediaInspection(media.dataUrl, mimeType);
  if (cached) return cached;

  if (!isSupportedImageMimeType(mimeType)) {
    throw new Error("Choose an SVG, PNG, JPEG, or WebP image.");
  }
  const parsed = parseImageDataUrl(media.dataUrl);
  if (!parsed || parsed.payload.length === 0) {
    throw new Error("The imported image data is invalid.");
  }
  if (parsed.mimeType !== mimeType) {
    throw new Error("The imported image type does not match its content type.");
  }
  if (
    parsed.base64 &&
    (() => {
      const payload = parsed.payload.replace(/[\t\n\f\r ]+/g, "");
      return payload.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(payload);
    })()
  ) {
    throw new Error("The imported image contains invalid encoded data.");
  }
  const byteLength = imageDataUrlByteLength(parsed);
  if (!Number.isFinite(byteLength) || byteLength > PORTABLE_PROJECT_LIMITS.maxDataUrlBytes) {
    throw new Error("The imported image exceeds the supported 25 MB size limit.");
  }
  const result: ImportedMediaInspection = {
    mimeType,
    byteLength,
    inspection:
      mimeType === "image/svg+xml"
        ? undefined
        : (knownInspection ?? inspectRasterDataUrl(media.dataUrl, mimeType))
  };
  if (mimeType !== "image/svg+xml" && !result.inspection) {
    throw new Error("The imported raster is malformed or its content does not match its type.");
  }
  if (result.inspection && result.inspection.mimeType !== mimeType) {
    throw new Error("The imported image type does not match its content type.");
  }
  cacheImportedMediaInspection(media.dataUrl, result);
  return result;
}

function projectMediaTotals(
  uploads: ImportedMediaRecord[],
  canvas: Canvas | null | undefined,
  excludedId?: string,
  excludedDataUrl?: string
): ProjectMediaTotals {
  const seenDataUrls = new Set<string>();
  let rasterPixels = 0;
  let dataUrlBytes = 0;
  for (const media of [...uploads, ...(canvas ? rasterMediaInScene(canvas) : [])]) {
    if (media.id === excludedId || media.dataUrl === excludedDataUrl) continue;
    if (seenDataUrls.has(media.dataUrl)) continue;
    seenDataUrls.add(media.dataUrl);
    const { byteLength, inspection } = inspectImportedMediaRecord(media);
    dataUrlBytes += byteLength;
    if (dataUrlBytes > PORTABLE_PROJECT_LIMITS.maxTotalDataUrlBytes) {
      throw new Error("The document already exceeds its embedded data budget.");
    }
    if (inspection) rasterPixels += inspection.pixels;
  }
  if (rasterPixels > PORTABLE_PROJECT_LIMITS.maxTotalRasterArea) {
    throw new Error("The document already exceeds its decoded raster area budget.");
  }
  return { rasterPixels, dataUrlBytes };
}

function loadAssetManifest() {
  if (!assetManifestPromise) assetManifestPromise = import("@/assets/manifest");
  return assetManifestPromise;
}

function loadBundledVariants(): Promise<Map<string, AssetVariant>> {
  if (!bundledVariantsPromise) {
    bundledVariantsPromise = loadAssetManifest().then(
      ({ assetManifest }) =>
        new Map(
          assetManifest.families.flatMap((family) =>
            family.variants.map((variant) => [variant.id, variant] as const)
          )
        )
    );
  }
  return bundledVariantsPromise;
}
const COALESCABLE_HISTORY_LABELS = new Set([
  "Change properties",
  "Edit connector",
  "Adjust asset color",
  "Recolor",
  "Canvas settings",
  "Nudge"
]);

function cacheSvg(assetId: string, source: string): void {
  svgStringCache.delete(assetId);
  svgStringCache.set(assetId, source);
  if (svgStringCache.size > SVG_CACHE_LIMIT) {
    const oldest = svgStringCache.keys().next().value as string | undefined;
    if (oldest) svgStringCache.delete(oldest);
  }
}

async function bundledSvgSource(assetId: string, assetPath?: string): Promise<string | null> {
  const cached = svgStringCache.get(assetId);
  if (cached) {
    cacheSvg(assetId, cached);
    return cached;
  }
  const variant = assetPath ? { assetPath } : (await loadBundledVariants()).get(assetId);
  if (!variant) return null;
  const response = await fetch(variant.assetPath);
  if (!response.ok) return null;
  const source = await response.text();
  cacheSvg(assetId, source);
  return source;
}

async function createBundledAssetGroup(family: AssetFamily, variant: AssetVariant): Promise<Group> {
  const source = await bundledSvgSource(variant.id, variant.assetPath);
  if (!source) throw new Error(`Could not load ${family.title}.`);
  const result = await loadEditableSvg(source);
  const objects = result.objects.filter((object): object is FabricObject => Boolean(object));
  const group = groupSvgElements(objects, result.options);
  group.assetId = variant.id;
  group.familyId = family.familyId;
  const sourcePage = family.sourcePage ?? family.commonsPage ?? family.nihSourcePage ?? "";
  group.provenance = {
    ...(family.nihSourcePage ? { nihSourcePage: family.nihSourcePage } : {}),
    sourcePage,
    ...(family.commonsPage ? { commonsPage: family.commonsPage } : {}),
    ...(family.sourceName ? { sourceName: family.sourceName } : {}),
    ...(family.licenseUrl ? { licenseUrl: family.licenseUrl } : {}),
    credit: family.credit,
    author: family.author,
    license: family.license
  };
  group.originalPalette = Object.fromEntries(
    paletteFromObject(group).map((color) => [color, color])
  );
  rememberOriginalColors(group);
  markSvgParts(group);
  configureAtomicSvgAsset(group);
  return group;
}

async function restoreBundledSvgBlendModes(objects: FabricObject[]): Promise<void> {
  await Promise.all(
    objects.map(async (object) => {
      if (!(object instanceof Group) || !object.assetId) return;
      const target = object.getObjects();
      if (target.some((child) => child.globalCompositeOperation !== "source-over")) return;
      const source = await bundledSvgSource(object.assetId);
      if (!source) return;
      const parsed = await loadEditableSvg(source);
      copySvgBlendModes(
        parsed.objects.filter((item): item is FabricObject => Boolean(item)),
        target
      );
      object.dirty = true;
    })
  );
}

export interface EditorContextValue {
  projectId: string;
  canvas: Canvas | null;
  canvasReady: boolean;
  selection: FabricObject[];
  editingGroup: Group | null;
  zoom: number;
  historyState: { canUndo: boolean; canRedo: boolean };
  canvasSettings: CanvasSettings;
  alignmentEnabled: boolean;
  autoEditEnabled: boolean;
  projectDescription: string;
  setCanvasElement: (element: HTMLCanvasElement | null) => void;
  setCanvasSettings: (settings: Partial<CanvasSettings>) => void;
  setAlignmentEnabled: (enabled: boolean) => void;
  setAutoEditEnabled: (enabled: boolean) => void;
  setProjectName: (name: string) => void;
  setProjectDescription: (description: string) => void;
  selectParentAsset: () => void;
  closeGroupEdit: () => void;
  saveState: ProjectSaveState;
  retrySave: () => void;
  flushSave: () => Promise<void>;
  exportProject: () => Promise<void>;
  creationTool: CreationTool | null;
  creationDefaults: CreationDefaults;
  setCreationTool: (tool: CreationTool | null) => void;
  setCreationDefaults: (
    defaults: CreationDefaults | ((current: CreationDefaults) => CreationDefaults)
  ) => void;
  placeCreationTool: (tool: CreationTool, point: Point, endPoint?: Point) => void;
  placeCreation: (point: Point, endPoint?: Point) => void;
  addAsset: (
    family: AssetFamily,
    variant: AssetVariant,
    point?: Point
  ) => Promise<string | undefined>;
  addTemplate: (template: AssetTemplate, point?: Point) => Promise<void>;
  setAssetVariant: (variantId: string) => Promise<void>;
  addImportedMedia: (media: ImportedMediaRecord, point?: Point) => Promise<void>;
  importMedia: (file: File, point?: Point) => Promise<ImportedMediaRecord>;
  deleteSelection: () => void;
  duplicateSelection: () => Promise<void>;
  saveSelectionAsTemplate: () => Promise<void>;
  copySelectionToClipboard: (format?: SelectionClipboardFormat, cut?: boolean) => Promise<void>;
  pasteSelection: () => Promise<void>;
  groupSelection: () => void;
  ungroupSelection: () => void;
  arrange: (action: "front" | "forward" | "backward" | "back") => void;
  align: (axis: "left" | "center" | "right" | "top" | "middle" | "bottom") => void;
  distribute: (axis: "horizontal" | "vertical") => void;
  flip: (axis: "x" | "y") => void;
  setObject: (properties: Record<string, unknown>) => void;
  saveSelectionStyle: () => void;
  resetSelectionStyle: () => void;
  updateConnector: (properties: Partial<ConnectorBinding>) => void;
  applyTextScript: (script: "normal" | "subscript" | "superscript") => void;
  resetColors: () => void;
  applyColorPreset: (presetId: string) => void;
  undo: () => Promise<boolean>;
  redo: () => Promise<boolean>;
  setZoom: (value: number) => void;
  previewZoom: (value: number) => void;
  fitCanvas: () => void;
  fitRequest: number;
  exportSvg: (title?: string, description?: string) => void;
  exportCredits: (title?: string, description?: string) => void;
  exportPdf: (title?: string, description?: string) => Promise<void>;
  exportPng: (transparent: boolean, dpi: number, background?: string) => Promise<void>;
  commit: (label?: string) => void;
  /** Transport-neutral semantic editor surface used by WebMCP and tests. */
  semanticRuntime: SemanticRuntime;
}

const EditorContext = createContext<EditorContextValue | null>(null);

function assignIdentity(object: FabricObject, name: string, type: string): void {
  object.objectId ??= crypto.randomUUID();
  object.name ??= name;
  object.OpenSketchType ??= type;
}

function assignSceneIdentities(objects: FabricObject | FabricObject[]): void {
  const roots = Array.isArray(objects) ? objects : [objects];
  roots.forEach((object) =>
    assignIdentity(object, object.name ?? "Untitled layer", object.OpenSketchType ?? object.type)
  );
  visitSceneObjects(objects, (object) => {
    object.objectId ??= crypto.randomUUID();
  });
}

function recognizedGroupRecord(group: Group, objects: FabricObject[]): RecognizedGroup {
  assignIdentity(group, "Group", "group");
  objects.forEach((object) =>
    assignIdentity(object, object.name ?? "Object", object.OpenSketchType ?? object.type)
  );
  const properties = Object.fromEntries(
    RESTORABLE_GROUP_PROPERTIES.flatMap((property) => {
      const value = group[property];
      return value === undefined ? [] : [[property, value]];
    })
  );
  return {
    objectId: group.objectId!,
    memberObjectIds: objects.map((object) => object.objectId!),
    properties
  };
}

function restoreRecognizedGroup(
  group: Group,
  objects: FabricObject[],
  recognition: RecognizedGroup
): void {
  group.objectId = recognition.objectId;
  Object.entries(recognition.properties).forEach(([property, value]) => {
    (group as unknown as Record<string, unknown>)[property] = value;
  });
  consumeRecognizedGroup(objects, recognition);
}

function editableAssetParent(object: FabricObject | undefined): Group | null {
  for (let parent = object?.group; parent; parent = parent.group) {
    if (
      parent instanceof Group &&
      (parent.OpenSketchType === "nih-asset" ||
        parent.OpenSketchType === "import" ||
        parent.OpenSketchType === "upload")
    ) {
      return parent;
    }
  }
  return null;
}

function markSvgParts(group: Group): void {
  group.getObjects().forEach((part) => {
    part.objectId ??= crypto.randomUUID();
    part.name ??= `SVG ${part.type}`;
    part.OpenSketchType = "svg-part";
    if (part instanceof Group) markSvgParts(part);
  });
}

function configureAtomicSvgAsset(object: FabricObject, editing = false): void {
  if (!(object instanceof Group)) return;
  object.subTargetCheck = editing;
  object.interactive = editing;
  // An illustration behaves as one canvas object. Its complete selector bounds
  // are therefore its hitbox, including transparent gaps between SVG paths,
  // until the user explicitly enters vector editing.
  object.perPixelTargetFind = false;
  object.getObjects().forEach((part) => {
    part.selectable = editing;
    part.evented = editing;
    part.perPixelTargetFind = false;
    if (part instanceof Group) configureAtomicSvgAsset(part, editing);
  });
  object.setCoords();
}

function configureNestedSelection(object: FabricObject): void {
  if (!isManualGroup(object)) return;
  object.subTargetCheck = true;
  object.interactive = false;
  object.getObjects().forEach((child) => {
    if (isAtomicSvgAsset(child)) configureAtomicSvgAsset(child);
    else if (isManualGroup(child)) configureNestedSelection(child);
    else if (child instanceof Group) {
      child.subTargetCheck = false;
      child.interactive = false;
    }
  });
  object.setCoords();
}

function configureCanvasAssets(objects: FabricObject[]): void {
  objects.forEach((object) => {
    configureTextObject(object);
    if (object.OpenSketchType === "upload") object.OpenSketchType = "import";
    if (object.connector && object instanceof Group) {
      normalizeConnectorHeadOffsets(object);
      const centerline = object.getObjects()[0];
      centerline?.set({
        strokeLineCap: connectorStrokeLineCap(
          object.connector.startArrowhead,
          object.connector.endArrowhead,
          object.connector.lineCap
        )
      });
      object.dirty = true;
    }
    if (isAtomicSvgAsset(object)) {
      markSvgParts(object);
      configureAtomicSvgAsset(object);
    } else if (isManualGroup(object)) {
      configureNestedSelection(object);
      configureCanvasAssets(object.getObjects());
    } else if (object instanceof Group) {
      object.subTargetCheck = false;
      object.interactive = false;
    }
  });
}

function hitObjectsAtLevel(
  canvas: Canvas,
  objects: FabricObject[],
  point: FabricPoint
): FabricObject[] {
  return [...objects].reverse().filter((object) => {
    if (object.visible === false || object.selectable === false) return false;
    return Boolean(canvas.searchPossibleTargets([object], point).target);
  });
}

function svgEditHitObjectsAtLevel(
  canvas: Canvas,
  objects: FabricObject[],
  point: FabricPoint
): FabricObject[] {
  const directHits = hitObjectsAtLevel(canvas, objects, point);
  const descendants: FabricObject[] = [];
  directHits.forEach((object) => {
    if (!(object instanceof Group) || object.OpenSketchType !== "svg-part") {
      descendants.push(object);
      return;
    }
    const nestedHits = svgEditHitObjectsAtLevel(canvas, object.getObjects(), point);
    descendants.push(...(nestedHits.length > 0 ? nestedHits : [object]));
  });
  return descendants;
}

function deepHitObjects(
  canvas: Canvas,
  point: FabricPoint,
  activeObject?: FabricObject
): FabricObject[] {
  const topLevelHits = hitObjectsAtLevel(canvas, canvas.getObjects(), point);
  if (!activeObject || activeObject instanceof ActiveSelection) return topLevelHits;

  if (isManualGroup(activeObject)) {
    const childHits = hitObjectsAtLevel(canvas, activeObject.getObjects(), point);
    if (childHits.length > 0) return childHits;
  }

  const parent = activeObject.group;
  if (parent instanceof Group && !(parent instanceof ActiveSelection)) {
    const siblingHits = hitObjectsAtLevel(canvas, parent.getObjects(), point);
    if (siblingHits.length > 0) return siblingHits;
  }
  return topLevelHits;
}

function refreshParentGroups(object: FabricObject | undefined): void {
  for (let parent = object?.group; parent instanceof Group; parent = parent.group) {
    parent.dirty = true;
    parent.triggerLayout();
  }
}

function groupSvgElements(objects: FabricObject[], options: Record<string, unknown>): Group {
  const grouped = util.groupSVGElements(objects, options);
  return grouped instanceof Group ? grouped : new Group([grouped]);
}

const TEMPLATE_PREVIEW_WIDTH = 320;
const TEMPLATE_PREVIEW_HEIGHT = 220;
const TEMPLATE_PREVIEW_PADDING = 28;

async function renderTemplateThumbnail(object: FabricObject): Promise<string> {
  const previewObject = await object.clone();
  const bounds = previewObject.getBoundingRect();
  const scale = Math.min(
    (TEMPLATE_PREVIEW_WIDTH - TEMPLATE_PREVIEW_PADDING * 2) / Math.max(bounds.width, 1),
    (TEMPLATE_PREVIEW_HEIGHT - TEMPLATE_PREVIEW_PADDING * 2) / Math.max(bounds.height, 1)
  );
  previewObject.set({
    left: TEMPLATE_PREVIEW_WIDTH / 2,
    top: TEMPLATE_PREVIEW_HEIGHT / 2,
    originX: "center",
    originY: "center",
    scaleX: (previewObject.scaleX ?? 1) * scale,
    scaleY: (previewObject.scaleY ?? 1) * scale
  });
  previewObject.setCoords();

  const previewCanvas = new StaticCanvas(undefined, {
    width: TEMPLATE_PREVIEW_WIDTH,
    height: TEMPLATE_PREVIEW_HEIGHT,
    enableRetinaScaling: false,
    renderOnAddRemove: false
  });
  previewCanvas.add(previewObject);
  previewCanvas.renderAll();
  const thumbnail = previewCanvas.toDataURL({ format: "png", multiplier: 1 });
  previewCanvas.dispose();
  return thumbnail;
}

interface TextFontStyle {
  fontFamily?: string;
  fontStyle?: string;
  fontWeight?: string | number;
  fontSize?: number;
}

function fontFamilyCandidates(value: string): string[] {
  return value
    .split(",")
    .map((candidate) => {
      const trimmed = candidate.trim();
      const quote = trimmed[0] === '"' || trimmed[0] === "'" ? trimmed[0] : "";
      return quote && trimmed.endsWith(quote) ? trimmed.slice(1, -1).trim() : trimmed;
    })
    .filter(Boolean);
}

function canvasTextFontFamilies(objects: FabricObject[]): string[] {
  const families = new Set<string>();
  const add = (value: string | undefined) => {
    if (!value) return;
    fontFamilyCandidates(value).forEach((family) => families.add(family));
  };
  const visit = (object: FabricObject) => {
    if (object instanceof Text) {
      add(object.fontFamily);
      object._textLines.forEach((line, lineIndex) => {
        line.forEach((_grapheme, charIndex) => {
          add(object.getCompleteStyleDeclaration(lineIndex, charIndex).fontFamily);
        });
      });
    }
    if (object instanceof Group) object.getObjects().forEach(visit);
  };
  objects.forEach(visit);
  return [...families];
}

function warmCanvasPdfFonts(canvas: Canvas): void {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  const families = canvasTextFontFamilies(canvas.getObjects());
  if (families.length === 0) return;
  void warmPdfFontFaces(families).catch(() => undefined);
}

async function waitForCanvasTextFonts(objects: FabricObject[]): Promise<void> {
  if (typeof document === "undefined" || !("fonts" in document)) return;

  const descriptors = new Map<string, { descriptor: string; texts: Set<string> }>();
  const addStyles = (object: Text, styles: TextFontStyle) => {
    const families = fontFamilyCandidates(styles.fontFamily ?? object.fontFamily);
    const fontStyle = normalizePdfFontStyle(styles.fontStyle ?? "normal");
    const fontWeight = String(
      normalizePdfFontWeight(styles.fontWeight ?? object.fontWeight ?? 400)
    );
    const fontSize =
      typeof styles.fontSize === "number" && Number.isFinite(styles.fontSize) && styles.fontSize > 0
        ? styles.fontSize
        : object.fontSize;
    for (const family of families) {
      const key = [fontStyle, fontWeight, family].join("|");
      const descriptor = `${fontStyle} ${fontWeight} ${fontSize}px "${family}"`;
      const existing = descriptors.get(key);
      if (existing) existing.texts.add(object.text);
      else descriptors.set(key, { descriptor, texts: new Set([object.text]) });
    }
  };
  const visit = (object: FabricObject) => {
    if (object instanceof Text) {
      addStyles(object, object);
      object._textLines.forEach((line, lineIndex) => {
        line.forEach((_grapheme, charIndex) => {
          addStyles(object, object.getCompleteStyleDeclaration(lineIndex, charIndex));
        });
      });
    }
    if (object instanceof Group) object.getObjects().forEach(visit);
  };
  objects.forEach(visit);

  const fontSet = document.fonts;
  await Promise.all(
    [...descriptors.values()].flatMap(({ descriptor, texts }) =>
      [...texts].map(async (text) => {
        try {
          await fontSet.load(descriptor, text);
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          throw new Error(`Could not load editor font for PDF export (${descriptor}): ${reason}`);
        }
      })
    )
  );
}

function assetIdsFromSnapshot(snapshot: Record<string, unknown>): string[] {
  const assetIds = new Set<string>();
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (typeof record.assetId === "string" && record.assetId) assetIds.add(record.assetId);
    if (Array.isArray(record.objects)) record.objects.forEach(visit);
  };
  visit(snapshot);
  return [...assetIds];
}

function solidColor(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value !== "" &&
    value !== "transparent" &&
    !value.startsWith("url(")
  );
}

function paletteFromObject(object: FabricObject): string[] {
  const colors = new Set<string>();
  const walk = (current: FabricObject) => {
    if (solidColor(current.fill)) colors.add(current.fill);
    if (solidColor(current.stroke)) colors.add(current.stroke);
    if (current instanceof Group) current.getObjects().forEach(walk);
  };
  walk(object);
  return [...colors];
}

function rememberOriginalColors(object: FabricObject): void {
  const walk = (current: FabricObject) => {
    if (solidColor(current.fill)) {
      current.originalFill = current.fill;
      current.effectBaseFill = current.fill;
    }
    if (solidColor(current.stroke)) {
      current.originalStroke = current.stroke;
      current.effectBaseStroke = current.stroke;
    }
    if (current.fill instanceof Gradient) {
      current.originalGradientFill = structuredClone(current.fill.toObject()) as Record<
        string,
        unknown
      >;
      current.effectBaseGradientFill = structuredClone(current.originalGradientFill);
    }
    if (current.stroke instanceof Gradient) {
      current.originalGradientStroke = structuredClone(current.stroke.toObject()) as Record<
        string,
        unknown
      >;
      current.effectBaseGradientStroke = structuredClone(current.originalGradientStroke);
    }
    if (current instanceof Group) current.getObjects().forEach(walk);
  };
  walk(object);
}

function restoreOriginalColors(object: FabricObject): void {
  const walk = (current: FabricObject) => {
    if (current.originalFill !== undefined) {
      current.set("fill", current.originalFill);
      current.effectBaseFill = current.originalFill;
    }
    if (current.originalStroke !== undefined) {
      current.set("stroke", current.originalStroke);
      current.effectBaseStroke = current.originalStroke;
    }
    if (current.originalGradientFill) {
      current.set("fill", new Gradient(structuredClone(current.originalGradientFill) as never));
      current.effectBaseGradientFill = structuredClone(current.originalGradientFill);
    }
    if (current.originalGradientStroke) {
      current.set("stroke", new Gradient(structuredClone(current.originalGradientStroke) as never));
      current.effectBaseGradientStroke = structuredClone(current.originalGradientStroke);
    }
    if (current instanceof Group) current.getObjects().forEach(walk);
  };
  walk(object);
  object.assetTint = "#ffffff";
  object.assetTintAmount = 0;
  object.assetSaturation = 0;
  object.assetBrightness = 0;
  object.assetColorPreset = undefined;
}

function originalPaints(object: FabricObject): string[] {
  const paints: string[] = [];
  const gradientPaints = (source: Record<string, unknown> | undefined) => {
    if (!source || !Array.isArray(source.colorStops)) return;
    source.colorStops.forEach((stop) => {
      const color = (stop as Record<string, unknown>).color;
      if (typeof color === "string") paints.push(color);
    });
  };
  const walk = (current: FabricObject) => {
    if (current.originalFill) paints.push(current.originalFill);
    if (current.originalStroke) paints.push(current.originalStroke);
    gradientPaints(current.originalGradientFill);
    gradientPaints(current.originalGradientStroke);
    if (current instanceof Group) current.getObjects().forEach(walk);
  };
  walk(object);
  return paints;
}

function applyPresetColors(
  object: FabricObject,
  mapping: Map<string, string>,
  presetId: string
): void {
  const mapped = (color: string) => mapping.get(normalizedPresetColor(color)) ?? color;
  const mappedGradient = (source: Record<string, unknown>) => {
    const colorStops = Array.isArray(source.colorStops)
      ? source.colorStops.map((stop) => {
          const record = stop as Record<string, unknown>;
          return {
            ...record,
            color: typeof record.color === "string" ? mapped(record.color) : record.color
          };
        })
      : [];
    return new Gradient({ ...structuredClone(source), colorStops } as never);
  };
  const walk = (current: FabricObject) => {
    if (current.originalFill) {
      const color = mapped(current.originalFill);
      current.set("fill", color);
      current.effectBaseFill = color;
    }
    if (current.originalStroke) {
      const color = mapped(current.originalStroke);
      current.set("stroke", color);
      current.effectBaseStroke = color;
    }
    if (current.originalGradientFill) {
      current.set("fill", mappedGradient(current.originalGradientFill));
      current.effectBaseGradientFill = structuredClone(current.originalGradientFill);
    }
    if (current.originalGradientStroke) {
      current.set("stroke", mappedGradient(current.originalGradientStroke));
      current.effectBaseGradientStroke = structuredClone(current.originalGradientStroke);
    }
    current.dirty = true;
    if (current instanceof Group) current.getObjects().forEach(walk);
  };
  walk(object);
  object.assetColorPreset = presetId;
  object.dirty = true;
}

function withLogicalViewport<T>(canvas: Canvas, settings: CanvasSettings, operation: () => T): T {
  const dimensions = { width: canvas.width, height: canvas.height };
  const viewport = [...canvas.viewportTransform] as [
    number,
    number,
    number,
    number,
    number,
    number
  ];
  canvas.setDimensions({ width: settings.width, height: settings.height });
  canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
  try {
    return operation();
  } finally {
    canvas.setDimensions(dimensions);
    canvas.setViewportTransform(viewport);
    canvas.requestRenderAll();
  }
}

export function EditorProvider({
  project,
  onProjectChange,
  onRequestExit,
  onNavigationGuardChange,
  children
}: {
  project: ProjectRecord;
  onProjectChange: (project: ProjectRecord) => Promise<void>;
  onRequestExit: () => void;
  onNavigationGuardChange: (guard: (() => boolean) | null) => void;
  children: ReactNode;
}) {
  const editorStore = useRef<SnapshotStore<EditorContextValue> | null>(null);
  if (!editorStore.current) editorStore.current = createSnapshotStore<EditorContextValue>();
  const [canvas, setCanvas] = useState<Canvas | null>(null);
  const [canvasReady, setCanvasReady] = useState(false);
  const canvasReadyRef = useRef(false);
  const [selection, setSelection] = useState<FabricObject[]>([]);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const editingGroupRef = useRef<Group | null>(null);
  const editingGroupPathRef = useRef<Group[]>([]);
  const [zoom, setZoomState] = useState(1);
  const [fitRequest, setFitRequest] = useState(0);
  const [creationTool, setCreationTool] = useState<CreationTool | null>(null);
  const [creationDefaults, setCreationDefaultsState] = useState<CreationDefaults>(() => {
    try {
      return normalizeCreationDefaults(
        JSON.parse(localStorage.getItem(CREATION_DEFAULTS_STORAGE_KEY) ?? "null")
      );
    } catch {
      return DEFAULT_CREATION_DEFAULTS;
    }
  });
  const [canvasSettings, setCanvasSettingsState] = useState(project.canvas);
  const [alignmentEnabled, setAlignmentEnabledState] = useState(() => {
    try {
      return localStorage.getItem("OpenSketch:alignment-enabled") !== "false";
    } catch {
      return true;
    }
  });
  const alignmentEnabledRef = useRef(alignmentEnabled);
  const setAlignmentEnabled = useCallback((enabled: boolean) => {
    alignmentEnabledRef.current = enabled;
    setAlignmentEnabledState(enabled);
    try {
      localStorage.setItem("OpenSketch:alignment-enabled", String(enabled));
    } catch {
      // Keep the session setting when storage is unavailable.
    }
  }, []);
  const [autoEditEnabled, setAutoEditEnabledState] = useState(() => {
    try {
      return localStorage.getItem("OpenSketch:auto-edit-enabled") === "true";
    } catch {
      return false;
    }
  });
  const setAutoEditEnabled = useCallback((enabled: boolean) => {
    setAutoEditEnabledState(enabled);
    try {
      localStorage.setItem("OpenSketch:auto-edit-enabled", String(enabled));
    } catch {
      // Keep the session setting when storage is unavailable.
    }
  }, []);
  const [projectDescription, setProjectDescriptionState] = useState(project.description ?? "");
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });
  const history = useRef<string[]>([]);
  const historyIndex = useRef(-1);
  const lastCommit = useRef<{ label: string; at: number } | null>(null);
  const restoring = useRef(false);
  const clipboard = useRef<FabricObject[]>([]);
  const pendingClipboardCopy = useRef<Promise<void> | null>(null);
  const clipboardMarker = useRef<string | undefined>(undefined);
  const savedElementStyles = useRef(loadSavedElementStyles());
  const pendingSnapshot = useRef<{ snapshot: string; revision: number } | undefined>(undefined);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const exitPending = useRef(false);
  const saveRevision = useRef(0);
  const savedRevision = useRef(0);
  const lastSaveError = useRef<unknown>(undefined);
  const [saveState, setSaveState] = useState<ProjectSaveState>({ phase: "saved" });
  const assetInsertQueue = useRef<Promise<unknown>>(Promise.resolve());
  const importQueue = useRef<Promise<void>>(Promise.resolve());
  const pendingEditorWork = useRef(0);
  const pendingEditorWorkPromises = useRef(new Set<Promise<void>>());
  const pendingTitlePersistence = useRef<{
    timer: number;
    complete: () => void;
  } | null>(null);
  const latestProject = useRef(project);
  const initialProjectObjects = useRef(project.objects);
  const hasPendingNavigationWork = useCallback(
    () =>
      pendingEditorWork.current > 0 ||
      hasUnsavedProjectRevision(
        saveRevision.current,
        savedRevision.current,
        Boolean(pendingSnapshot.current)
      ),
    []
  );
  const guardNavigation = useCallback(() => {
    const blocked = hasPendingNavigationWork();
    if (blocked) exitPending.current = false;
    return blocked;
  }, [hasPendingNavigationWork]);
  const markPendingEditorWorkComplete = useCallback(() => {
    pendingEditorWork.current = Math.max(0, pendingEditorWork.current - 1);
    if (!hasPendingNavigationWork()) {
      setSaveState((current) => (current.phase === "saving" ? { phase: "saved" } : current));
    }
  }, [hasPendingNavigationWork]);
  const beginPendingEditorWork = useCallback(() => {
    let resolvePendingWork: () => void = () => undefined;
    let completed = false;
    const settled = new Promise<void>((resolve) => {
      resolvePendingWork = resolve;
    });
    pendingEditorWorkPromises.current.add(settled);
    pendingEditorWork.current += 1;
    setSaveState((current) =>
      current.phase === "error"
        ? current
        : current.phase === "saving"
          ? current
          : { phase: "saving" }
    );
    return () => {
      if (completed) return;
      completed = true;
      pendingEditorWorkPromises.current.delete(settled);
      resolvePendingWork();
      markPendingEditorWorkComplete();
    };
  }, [markPendingEditorWorkComplete]);
  const waitForPendingEditorWork = useCallback(async () => {
    while (pendingEditorWorkPromises.current.size > 0) {
      await Promise.all([...pendingEditorWorkPromises.current]);
    }
  }, []);
  const trackPendingEditorWork = useCallback(
    <T,>(operation: Promise<T>) => {
      const complete = beginPendingEditorWork();
      void operation.then(complete, complete);
      return operation;
    },
    [beginPendingEditorWork]
  );
  const initialProjectImports = useRef({
    imports: project.uploads,
    updatedAt: project.updatedAt
  });
  const latestCanvasSettings = useRef(project.canvas);
  const latestZoom = useRef(1);
  const canvasElement = useRef<HTMLCanvasElement | null>(null);
  const guides = useRef<{ vertical?: number; horizontal?: number }>({});
  const snapSession = useRef<{
    target?: FabricObject;
    x?: AxisSnapLock;
    y?: AxisSnapLock;
  }>({});
  const deepSelectionCycle = useRef<
    | {
        point: FabricPoint;
        selected: FabricObject;
      }
    | undefined
  >(undefined);
  const modifierDeepSelection = useRef<FabricObject[] | undefined>(undefined);
  const modifierClick = useRef<{ at: number; point: FabricPoint } | undefined>(undefined);
  const deepSelectionStackOverride = useRef(false);
  const nestedDrag = useRef<
    | {
        target: FabricObject;
        parent: Group;
        startPointer: FabricPoint;
        startLeft: number;
        startTop: number;
        lastLeft: number;
        lastTop: number;
      }
    | undefined
  >(undefined);
  const dragDuplicate = useRef<
    | {
        target: FabricObject;
        sources: FabricObject[];
        sourceTransforms: ReturnType<FabricObject["calcTransformMatrix"]>[];
        parent?: Group;
        clones: Promise<FabricObject[]>;
        originalOpacity: number;
        activated: boolean;
        pendingAdd?: Promise<void>;
        pendingWorkComplete?: () => void;
      }
    | undefined
  >(undefined);
  const createPointText = useRef<(point: Point) => void>(() => undefined);

  const setEditingGroupPath = useCallback((path: Group[]) => {
    editingGroupPathRef.current = path;
    const currentGroup = path.at(-1) ?? null;
    editingGroupRef.current = currentGroup;
    setEditingGroup(currentGroup);
  }, []);

  useEffect(() => {
    void rememberProjectImports(
      initialProjectImports.current.imports,
      initialProjectImports.current.updatedAt
    );
  }, []);

  const refreshConnectors = useCallback(
    (changedObjectId?: string) => {
      if (!canvas) return;
      assertUniqueSceneObjectIds(canvas);
      const entries = sceneObjectEntries(canvas);
      const byId = sceneObjectIndex(canvas);
      const changedObject = changedObjectId ? byId.get(changedObjectId) : undefined;
      for (const entry of entries.filter(({ object }) => Boolean(object.connector))) {
        const connector = entry.object;
        const binding = connector.connector;
        const fromObject = binding ? byId.get(binding.fromObjectId) : undefined;
        const toObject = binding ? byId.get(binding.toObjectId) : undefined;
        if (
          !binding ||
          (changedObjectId &&
            binding.fromObjectId !== changedObjectId &&
            binding.toObjectId !== changedObjectId &&
            (!changedObject ||
              !fromObject ||
              !toObject ||
              (!isSceneDescendant(fromObject, changedObject) &&
                !isSceneDescendant(toObject, changedObject) &&
                !isSceneDescendant(changedObject, fromObject) &&
                !isSceneDescendant(changedObject, toObject))))
        ) {
          continue;
        }
        if (!fromObject || !toObject) continue;
        const obstacles = canvas
          .getObjects()
          .filter(
            (object) =>
              !object.connector &&
              object.visible !== false &&
              object.objectId !== binding.fromObjectId &&
              object.objectId !== binding.toObjectId
          )
          .map((object) => object.getBoundingRect());
        const replacement = createConnectorObject(
          anchorPoint(fromObject.getBoundingRect(), binding.fromAnchor),
          anchorPoint(toObject.getBoundingRect(), binding.toAnchor),
          binding,
          connectorAppearance(connector),
          obstacles
        );
        replacement.objectId = connector.objectId;
        replacement.name = connector.name;
        replacement.OpenSketchType = connector.OpenSketchType;
        replacement.defaultElementStyle = connector.defaultElementStyle
          ? structuredClone(connector.defaultElementStyle)
          : undefined;
        replacement.connectorHeadOffsetVersion = connector.connectorHeadOffsetVersion;
        replacement.visible = connector.visible;
        replacement.selectable = connector.selectable;
        replacement.evented = connector.evented;
        assignSceneIdentities(replacement);
        sendSceneObjectToParentPlane(replacement, entry.parent);
        const active = canvas.getActiveObject() === connector;
        replaceSceneObject(entry, replacement);
        if (active) canvas.setActiveObject(replacement);
        byId.set(replacement.objectId!, replacement);
      }
      assertUniqueSceneObjectIds(canvas);
      canvas.requestRenderAll();
    },
    [canvas]
  );

  const serialize = useCallback(() => {
    if (!canvas) return JSON.stringify(latestProject.current.objects);
    refreshTextMetrics(canvas.getObjects());
    assertUniqueSceneObjectIds(canvas);
    return JSON.stringify(canvas.toJSON());
  }, [canvas]);

  const updateHistoryState = useCallback(() => {
    setHistoryState({
      canUndo: historyIndex.current > 0,
      canRedo: historyIndex.current >= 0 && historyIndex.current < history.current.length - 1
    });
  }, []);

  const saveSnapshot = useCallback(
    async (snapshot: string, revision: number) => {
      try {
        const now = new Date().toISOString();
        const current = latestProject.current;
        const objects = JSON.parse(snapshot) as Record<string, unknown>;
        const next: ProjectRecord = {
          ...current,
          updatedAt: now,
          canvas: latestCanvasSettings.current,
          objects,
          usedAssetIds: assetIdsFromSnapshot(objects),
          // The project data is the durable source of truth. Its derived preview
          // is refreshed after the save queue drains or by the project overview.
          thumbnail: undefined
        };
        await onProjectChange(next);
        const isLatestRevision = revision === saveRevision.current && !pendingSnapshot.current;
        if (isLatestRevision) {
          latestProject.current = next;
        }
        savedRevision.current = Math.max(savedRevision.current, revision);
        if (isLatestRevision && pendingEditorWork.current === 0) {
          lastSaveError.current = undefined;
          setSaveState({ phase: "saved" });
        } else {
          setSaveState((current) => (current.phase === "saving" ? current : { phase: "saving" }));
        }
      } catch (reason) {
        if (revision === saveRevision.current) {
          lastSaveError.current = reason;
          setSaveState({ phase: "error", error: normalizeProjectSaveError(reason) });
        }
        throw reason;
      }
    },
    [onProjectChange]
  );

  const refreshThumbnail = useCallback(async () => {
    if (!canvas) return;
    try {
      const projectRevision = latestProject.current.updatedAt;
      const revision = saveRevision.current;
      const thumbnail = createVectorThumbnail(
        canvas,
        latestCanvasSettings.current,
        projectRevision
      );
      const next = await saveProjectThumbnail(latestProject.current.id, projectRevision, thumbnail);
      if (next?.updatedAt === projectRevision && revision === saveRevision.current) {
        latestProject.current = next;
      }
    } catch (reason) {
      // A preview is derived and optional. Never discard or block navigation
      // after the actual project snapshot has already been saved.
      console.warn("Project preview could not be refreshed; project data is saved.", reason);
    }
  }, [canvas]);

  const enqueuePendingSave = useCallback(() => {
    const pending = pendingSnapshot.current;
    if (!pending) return saveQueue.current;
    pendingSnapshot.current = undefined;
    const operation = saveQueue.current.then(() =>
      saveSnapshot(pending.snapshot, pending.revision)
    );
    saveQueue.current = operation.catch(() => {
      if (pending.revision === saveRevision.current && !pendingSnapshot.current) {
        pendingSnapshot.current = pending;
      }
    });
    return operation;
  }, [saveSnapshot]);

  const persist = useCallback(
    (snapshot?: string) => {
      const revision = saveRevision.current + 1;
      saveRevision.current = revision;
      const snapshotToSave =
        snapshot ??
        (canvas && canvasReadyRef.current
          ? serialize()
          : JSON.stringify(initialProjectObjects.current));
      pendingSnapshot.current = { snapshot: snapshotToSave, revision };
      setSaveState((current) => (current.phase === "saving" ? current : { phase: "saving" }));
      void enqueuePendingSave().catch(() => undefined);
    },
    [canvas, enqueuePendingSave, serialize]
  );

  const flushPendingTitle = useCallback(() => {
    const pending = pendingTitlePersistence.current;
    if (!pending) return;
    window.clearTimeout(pending.timer);
    pendingTitlePersistence.current = null;
    try {
      persist();
    } finally {
      pending.complete();
    }
  }, [persist]);

  const flushSave = useCallback(async () => {
    // A toolbar click can follow a library click before its SVG has finished
    // parsing. Treat that insertion as part of the action being flushed.
    flushPendingTitle();
    await Promise.all([assetInsertQueue.current, importQueue.current]);
    await waitForPendingEditorWork();
    while (true) {
      await saveQueue.current;
      if (!pendingSnapshot.current) break;
      try {
        await enqueuePendingSave();
      } catch {
        // The failed latest snapshot is requeued by enqueuePendingSave so the
        // explicit Retry action can attempt it again without spinning here.
        break;
      }
    }
    if (
      hasUnsavedProjectRevision(
        saveRevision.current,
        savedRevision.current,
        Boolean(pendingSnapshot.current)
      )
    ) {
      throw lastSaveError.current ?? new Error("The latest project revision was not saved.");
    }
    await refreshThumbnail();
  }, [enqueuePendingSave, flushPendingTitle, refreshThumbnail, waitForPendingEditorWork]);

  const retrySave = useCallback(() => {
    if (
      !hasUnsavedProjectRevision(
        saveRevision.current,
        savedRevision.current,
        Boolean(pendingSnapshot.current)
      )
    ) {
      return;
    }
    setSaveState((current) => (current.phase === "saving" ? current : { phase: "saving" }));
    void enqueuePendingSave().catch(() => undefined);
  }, [enqueuePendingSave]);

  const requestExit = useCallback(() => {
    if (exitPending.current) return;
    exitPending.current = true;
    void flushSave()
      .then(onRequestExit)
      .catch(() => {
        exitPending.current = false;
      });
  }, [flushSave, onRequestExit]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasPendingNavigationWork()) {
        return;
      }
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasPendingNavigationWork]);

  useEffect(() => {
    onNavigationGuardChange(guardNavigation);
    return () => onNavigationGuardChange(null);
  }, [guardNavigation, onNavigationGuardChange]);

  const commit = useCallback(
    (label = "Change") => {
      if (!canvas || restoring.current) return;
      const snapshot = serialize();
      if (history.current[historyIndex.current] === snapshot) return;
      const now = performance.now();
      const replaceCurrent =
        COALESCABLE_HISTORY_LABELS.has(label) &&
        lastCommit.current?.label === label &&
        now - lastCommit.current.at < 600 &&
        historyIndex.current === history.current.length - 1;
      if (replaceCurrent) {
        history.current[historyIndex.current] = snapshot;
      } else {
        history.current = history.current.slice(0, historyIndex.current + 1);
        history.current.push(snapshot);
      }
      if (history.current.length > MAX_HISTORY) history.current.shift();
      historyIndex.current = history.current.length - 1;
      lastCommit.current = { label, at: now };
      updateHistoryState();
      persist(snapshot);
      warmCanvasPdfFonts(canvas);
    },
    [canvas, persist, serialize, updateHistoryState]
  );

  const setCanvasElement = useCallback(
    (element: HTMLCanvasElement | null) => {
      if (!element || element === canvasElement.current) return;
      canvasElement.current = element;
      const instance = new Canvas(element, {
        preserveObjectStacking: true,
        selectionKey: ["metaKey", "ctrlKey"],
        hoverCursor: CURSOR_GRAB,
        moveCursor: CURSOR_GRABBING,
        selectionColor: "rgba(18, 178, 175, 0.12)",
        selectionBorderColor: "#12b2af",
        selectionLineWidth: SELECTION_STROKE_WIDTH_PX
      });
      instance.setDimensions({ width: project.canvas.width, height: project.canvas.height });
      instance.backgroundColor = project.canvas.transparent ? "" : project.canvas.background;
      canvasReadyRef.current = false;
      setCanvasReady(false);
      instance.loadFromJSON(project.objects).then(async () => {
        await restoreBundledSvgBlendModes(instance.getObjects());
        assignSceneIdentities(instance.getObjects());
        configureCanvasAssets(instance.getObjects());
        assertUniqueSceneObjectIds(instance);
        instance.requestRenderAll();
        const initial = JSON.stringify(instance.toJSON());
        history.current = [initial];
        historyIndex.current = 0;
        updateHistoryState();
        canvasReadyRef.current = true;
        setCanvasReady(true);
      });
      setCanvas(instance);
    },
    [project, updateHistoryState]
  );

  useEffect(() => {
    if (!canvas || !canvasReady) return;
    refreshConnectors();
  }, [canvas, canvasReady, refreshConnectors]);

  useEffect(() => {
    if (!canvas || !canvasReady) return;
    const warm = () => warmCanvasPdfFonts(canvas);
    warm();
    window.addEventListener("online", warm);
    return () => window.removeEventListener("online", warm);
  }, [canvas, canvasReady]);

  const closeGroupEdit = useCallback(() => {
    const path = editingGroupPathRef.current;
    const exitedGroup = path.at(-1);
    if (!exitedGroup) return;
    const parentPath = path.slice(0, -1);
    const svgAssetRoot = path[0];
    setEditingGroupPath(parentPath);
    modifierDeepSelection.current = undefined;
    deepSelectionCycle.current = undefined;
    if (!canvas) return;
    canvas.discardActiveObject();
    if (parentPath.length === 0) {
      if (isAtomicSvgAsset(svgAssetRoot)) configureAtomicSvgAsset(svgAssetRoot);
      configureSelectionControls(exitedGroup, latestZoom.current);
      canvas.setActiveObject(exitedGroup);
      setSelection([exitedGroup]);
    } else {
      setSelection([]);
    }
    canvas.requestRenderAll();
  }, [canvas, setEditingGroupPath]);

  useEffect(() => {
    if (!canvas) return;
    let boundsTarget: FabricObject | undefined;
    const activeSelectionTextScales = new WeakMap<
      ActiveSelection,
      ActiveSelectionTextScaleSession
    >();
    let connectorFrame: number | undefined;
    let pendingConnectorObjectId: string | undefined;
    let snapCandidateTarget: FabricObject | undefined;
    let snapCandidateBounds: ReturnType<FabricObject["getBoundingRect"]>[] = [];
    const cancelScheduledConnectorRefresh = () => {
      if (connectorFrame !== undefined) window.cancelAnimationFrame(connectorFrame);
      connectorFrame = undefined;
      pendingConnectorObjectId = undefined;
    };
    const scheduleConnectorRefresh = (objectId: string) => {
      pendingConnectorObjectId = objectId;
      if (connectorFrame !== undefined) return;
      connectorFrame = window.requestAnimationFrame(() => {
        connectorFrame = undefined;
        const changedObjectId = pendingConnectorObjectId;
        pendingConnectorObjectId = undefined;
        if (changedObjectId) refreshConnectors(changedObjectId);
      });
    };
    const refreshConnectorsImmediately = (objectId?: string) => {
      cancelScheduledConnectorRefresh();
      refreshConnectors(objectId);
    };
    const otherObjectBounds = (target: FabricObject) => {
      if (snapCandidateTarget !== target) {
        snapCandidateTarget = target;
        snapCandidateBounds = canvas
          .getObjects()
          .filter(
            (candidate) =>
              candidate !== target && !candidate.connector && candidate.visible !== false
          )
          .map((candidate) => candidate.getBoundingRect());
      }
      return snapCandidateBounds;
    };
    const select = () => {
      const activeObject = canvas.getActiveObject();
      if (boundsTarget && boundsTarget !== activeObject) {
        restoreObjectTargeting(boundsTarget);
        boundsTarget = undefined;
      }
      if (activeObject) {
        configureSelectionControls(activeObject, latestZoom.current);
        enableSelectionBoundsTarget(activeObject);
        boundsTarget = activeObject;
      }
      setSelection(canvas.getActiveObjects());
      canvas.requestRenderAll();
    };
    const selectDeeperObject = ({
      e,
      scenePoint,
      target: eventTarget
    }: {
      e: MouseEvent | PointerEvent | TouchEvent;
      scenePoint?: FabricPoint;
      target?: FabricObject;
    }) => {
      if (!scenePoint) return;
      const currentEditingGroup = editingGroupRef.current;
      if (currentEditingGroup) {
        const directHits = isAtomicSvgAsset(editingGroupPathRef.current[0])
          ? svgEditHitObjectsAtLevel(canvas, currentEditingGroup.getObjects(), scenePoint)
          : hitObjectsAtLevel(canvas, currentEditingGroup.getObjects(), scenePoint);
        const nestedGroup =
          directHits.find(isManualGroup) ??
          (isAtomicSvgAsset(editingGroupPathRef.current[0])
            ? directHits.find((object) => object instanceof Group)
            : undefined);
        if (nestedGroup) {
          setEditingGroupPath([...editingGroupPathRef.current, nestedGroup]);
          canvas.discardActiveObject();
          setSelection([]);
          modifierDeepSelection.current = undefined;
          deepSelectionCycle.current = undefined;
          canvas.requestRenderAll();
          return;
        }
        if (!currentEditingGroup.containsPoint(scenePoint)) {
          closeGroupEdit();
          return;
        }
        if (directHits.length === 0) {
          canvas.discardActiveObject();
          setSelection([]);
          modifierDeepSelection.current = undefined;
          deepSelectionCycle.current = undefined;
          canvas.requestRenderAll();
        }
        return;
      }
      const topLevelHits = hitObjectsAtLevel(canvas, canvas.getObjects(), scenePoint);
      const asset = topLevelHits.find(isAtomicSvgAsset);
      if (asset) {
        markSvgParts(asset);
        configureAtomicSvgAsset(asset, true);
        setEditingGroupPath([asset]);
        canvas.discardActiveObject();
        setSelection([]);
        modifierDeepSelection.current = undefined;
        deepSelectionCycle.current = undefined;
        canvas.requestRenderAll();
        return;
      }
      const group = topLevelHits.find(isManualGroup);
      if (group) {
        setEditingGroupPath([group]);
        canvas.discardActiveObject();
        setSelection([]);
        modifierDeepSelection.current = undefined;
        deepSelectionCycle.current = undefined;
        canvas.requestRenderAll();
        return;
      }
      const additiveModifier = e.metaKey || e.ctrlKey || e.altKey;
      const additiveObjects = additiveModifier ? modifierDeepSelection.current : undefined;
      const previousCycle = deepSelectionCycle.current;
      const activeObject = canvas.getActiveObject();
      const samePoint =
        previousCycle &&
        Math.hypot(previousCycle.point.x - scenePoint.x, previousCycle.point.y - scenePoint.y) <=
          4 / Math.max(latestZoom.current, 0.1);
      const cycleFrom =
        additiveObjects && additiveObjects.length > 0
          ? additiveObjects[additiveObjects.length - 1]
          : samePoint
            ? previousCycle.selected
            : activeObject;
      const hitObjects = deepHitObjects(canvas, scenePoint, cycleFrom);
      if (hitObjects.length === 0) {
        if (eventTarget instanceof IText) {
          configureSelectionControls(eventTarget, latestZoom.current);
          canvas.setActiveObject(eventTarget);
          setSelection([eventTarget]);
          if (!eventTarget.isEditing) eventTarget.enterEditing();
          canvas.requestRenderAll();
          return;
        }
        if (latestCanvasSettings.current.doubleClickCreatesText) {
          createPointText.current(scenePoint);
        }
        return;
      }
      const selected = nextDeepSelection(cycleFrom, hitObjects);
      if (!selected) return;
      const additiveParent =
        additiveObjects && additiveObjects.length > 0
          ? directNestedParent(additiveObjects[0])
          : null;
      if (
        additiveParent &&
        additiveObjects?.every((object) => directNestedParent(object) === additiveParent) &&
        directNestedParent(selected) === additiveParent
      ) {
        const objects = additiveObjects.includes(selected)
          ? additiveObjects
          : [...additiveObjects, selected];
        canvas.discardActiveObject();
        const activeSelection = new ActiveSelection(objects, { canvas });
        configureSelectionControls(activeSelection, latestZoom.current);
        canvas.setActiveObject(activeSelection);
        const nestedObjects = activeSelection.getObjects();
        setSelection(nestedObjects);
        modifierDeepSelection.current = nestedObjects;
        deepSelectionCycle.current = {
          point: new FabricPoint(scenePoint.x, scenePoint.y),
          selected
        };
        canvas.requestRenderAll();
        return;
      }
      configureSelectionControls(selected, latestZoom.current);
      canvas.setActiveObject(selected);
      setSelection([selected]);
      deepSelectionCycle.current = {
        point: new FabricPoint(scenePoint.x, scenePoint.y),
        selected
      };
      canvas.requestRenderAll();
    };
    const preserveDeepSelectionForDrag = (event: MouseEvent) => {
      if (event.button !== 0) return;
      const additiveModifier = event.metaKey || event.ctrlKey || event.altKey;
      const scenePoint = canvas.getScenePoint(event);
      const currentEditingGroup = editingGroupRef.current;
      if (currentEditingGroup) {
        const selected = (
          isAtomicSvgAsset(editingGroupPathRef.current[0])
            ? svgEditHitObjectsAtLevel(canvas, currentEditingGroup.getObjects(), scenePoint)
            : hitObjectsAtLevel(canvas, currentEditingGroup.getObjects(), scenePoint)
        )[0];
        if (!selected) {
          event.preventDefault();
          event.stopImmediatePropagation();
          canvas.discardActiveObject();
          setSelection([]);
          modifierDeepSelection.current = undefined;
          canvas.requestRenderAll();
          return;
        }
        const currentObjects = additiveModifier
          ? canvas
              .getActiveObjects()
              .filter((object) => directNestedParent(object) === currentEditingGroup)
          : [];
        const addsToSelection = additiveModifier && !currentObjects.includes(selected);
        const objects = addsToSelection
          ? [...currentObjects, selected]
          : additiveModifier
            ? currentObjects
            : [selected];
        canvas.discardActiveObject();
        if (objects.length > 1) {
          const activeSelection = new ActiveSelection(objects, { canvas });
          configureSelectionControls(activeSelection, latestZoom.current);
          canvas.setActiveObject(activeSelection);
        } else {
          configureSelectionControls(selected, latestZoom.current);
          canvas.setActiveObject(selected);
        }
        setSelection(objects);
        modifierDeepSelection.current = objects;
        deepSelectionCycle.current = {
          point: new FabricPoint(scenePoint.x, scenePoint.y),
          selected
        };
        canvas.requestRenderAll();
        if (addsToSelection) {
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }
      }
      if (additiveModifier && !modifierDeepSelection.current) {
        const selectedObjects = canvas.getActiveObjects();
        const parent = selectedObjects.length > 0 ? directNestedParent(selectedObjects[0]) : null;
        modifierDeepSelection.current =
          parent && selectedObjects.every((object) => directNestedParent(object) === parent)
            ? selectedObjects
            : undefined;
      } else if (!additiveModifier) {
        modifierDeepSelection.current = undefined;
        modifierClick.current = undefined;
      }
      if (additiveModifier && modifierDeepSelection.current) {
        const previousClick = modifierClick.current;
        const now = performance.now();
        const samePoint =
          previousClick &&
          Math.hypot(previousClick.point.x - scenePoint.x, previousClick.point.y - scenePoint.y) <=
            4 / Math.max(latestZoom.current, 0.1);
        if (previousClick && now - previousClick.at <= 500 && samePoint) {
          modifierClick.current = undefined;
          event.preventDefault();
          event.stopImmediatePropagation();
          selectDeeperObject({ e: event, scenePoint });
          return;
        }
        modifierClick.current = {
          at: now,
          point: new FabricPoint(scenePoint.x, scenePoint.y)
        };
      }
      const activeObject = canvas.getActiveObject();
      if (
        !activeObject ||
        activeObject !== deepSelectionCycle.current?.selected ||
        !canvas.searchPossibleTargets([activeObject], scenePoint).target
      ) {
        return;
      }
      // Fabric normally resolves a fresh pointer-down to the frontmost stack item.
      // For the object explicitly chosen by double-click, keep that active target
      // just long enough for Fabric to initialize its drag transform.
      canvas.preserveObjectStacking = false;
      deepSelectionStackOverride.current = true;
      const parent = activeObject.group;
      if (parent instanceof Group && !(parent instanceof ActiveSelection)) {
        nestedDrag.current = {
          target: activeObject,
          parent,
          startPointer: scenePoint,
          startLeft: activeObject.left ?? 0,
          startTop: activeObject.top ?? 0,
          lastLeft: activeObject.left ?? 0,
          lastTop: activeObject.top ?? 0
        };
      }
    };
    const suppressModifierContextMenu = (event: MouseEvent) => {
      if (modifierDeepSelection.current && (event.metaKey || event.ctrlKey || event.altKey)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    const restoreObjectStacking = () => {
      if (!deepSelectionStackOverride.current) return;
      canvas.preserveObjectStacking = true;
      deepSelectionStackOverride.current = false;
    };
    const prepareDragDuplicate = ({
      e,
      target
    }: {
      e: MouseEvent | PointerEvent | TouchEvent;
      target?: FabricObject;
    }) => {
      dragDuplicate.current = undefined;
      if (
        !target ||
        !("button" in e) ||
        e.button !== 0 ||
        !(e.metaKey || e.ctrlKey) ||
        (target instanceof IText && target.isEditing)
      ) {
        return;
      }
      const sources = target instanceof ActiveSelection ? target.getObjects() : [target];
      const parent =
        !(target instanceof ActiveSelection) &&
        target.group instanceof Group &&
        !(target.group instanceof ActiveSelection)
          ? target.group
          : undefined;
      dragDuplicate.current = {
        target,
        sources,
        sourceTransforms: sources.map((source) => source.calcTransformMatrix()),
        parent,
        clones: Promise.all(sources.map((source) => source.clone())),
        originalOpacity: target.opacity ?? 1,
        activated: false
      };
    };
    const addDragDuplicate = (session: NonNullable<typeof dragDuplicate.current>): Promise<void> =>
      session.clones.then((clones) => {
        assignFreshCloneIds(clones);
        clones.forEach((clone, index) => {
          const source = session.sources[index];
          clone.name = `${source.name ?? "Object"} copy`;
          if (session.parent) {
            util.applyTransformToObject(clone, session.sourceTransforms[index]);
            const sourceIndex = session.parent.getObjects().indexOf(source);
            session.parent.insertAt(Math.max(sourceIndex, 0), clone);
          } else {
            const sourceIndex = canvas.getObjects().indexOf(source);
            canvas.insertAt(Math.max(sourceIndex, 0), clone);
          }
        });
        if (session.parent) {
          session.parent.triggerLayout();
          session.parent.dirty = true;
        }
        configureCanvasAssets(clones);
        setSelection(canvas.getActiveObjects());
        canvas.requestRenderAll();
      });
    const activateDragDuplicate = (target: FabricObject) => {
      const session = dragDuplicate.current;
      if (!session || session.target !== target || session.activated) return;
      session.activated = true;
      target.set("opacity", Math.min(session.originalOpacity, DRAG_DUPLICATE_OPACITY));
      target.dirty = true;
      session.pendingWorkComplete = beginPendingEditorWork();
      session.pendingAdd = addDragDuplicate(session);
      canvas.requestRenderAll();
    };
    const restoreDragDuplicateOpacity = (session: NonNullable<typeof dragDuplicate.current>) => {
      session.target.set("opacity", session.originalOpacity);
      session.target.dirty = true;
    };
    const modified = ({ target }: { target?: FabricObject } = {}) => {
      const changed = target ?? canvas.getActiveObject();
      if (changed instanceof ActiveSelection) activeSelectionTextScales.delete(changed);
      const nestedSession =
        changed && nestedDrag.current?.target === changed ? nestedDrag.current : undefined;
      if (changed && nestedSession) {
        changed.set({
          left: nestedSession.lastLeft,
          top: nestedSession.lastTop
        });
        changed.setCoords();
      }
      const duplicateSession =
        changed && dragDuplicate.current?.target === changed && dragDuplicate.current.activated
          ? dragDuplicate.current
          : undefined;
      if (duplicateSession) restoreDragDuplicateOpacity(duplicateSession);
      const completeTextWork =
        !duplicateSession && changed instanceof IText && "fonts" in document
          ? beginPendingEditorWork()
          : undefined;
      const finish = () => {
        if (changed instanceof IText) {
          cache.clearFontCache(changed.fontFamily);
          changed.initDimensions();
          changed.dirty = true;
          changed.setCoords();
        }
        guides.current = {};
        snapSession.current = {};
        refreshParentGroups(changed);
        setSelection(canvas.getActiveObjects());
        if (changed?.objectId) refreshConnectorsImmediately(changed.objectId);
        else cancelScheduledConnectorRefresh();
        canvas.requestRenderAll();
        commit(duplicateSession ? "Duplicate drag" : "Transform");
        completeTextWork?.();
        duplicateSession?.pendingWorkComplete?.();
        if (duplicateSession) duplicateSession.pendingWorkComplete = undefined;
      };
      const finishAfterFonts = () => {
        if (!(changed instanceof IText) || !("fonts" in document)) {
          finish();
          return;
        }
        const weight = normalizePdfFontWeight(changed.fontWeight ?? 400);
        const fontStyle = normalizePdfFontStyle(changed.fontStyle ?? "normal");
        const family = changed.fontFamily
          .split(",")[0]
          .trim()
          .replace(/^['"]|['"]$/g, "");
        void document.fonts
          .load(`${fontStyle} ${weight} ${changed.fontSize ?? 54}px "${family}"`)
          .then(finish, finish);
      };
      if (duplicateSession?.pendingAdd) {
        void duplicateSession.pendingAdd.then(finishAfterFonts, finishAfterFonts);
      } else {
        finishAfterFonts();
      }
    };
    const moving = ({
      target,
      scenePoint,
      e
    }: {
      target?: FabricObject;
      scenePoint?: Point;
      e?: MouseEvent | PointerEvent | TouchEvent;
    }) => {
      if (!target?.objectId) return;
      const nestedSession = nestedDrag.current?.target === target ? nestedDrag.current : undefined;
      const rememberNestedPosition = () => {
        if (!nestedSession) return;
        nestedSession.lastLeft = target.left ?? nestedSession.lastLeft;
        nestedSession.lastTop = target.top ?? nestedSession.lastTop;
      };
      if (nestedSession && scenePoint) {
        const parentInverse = util.invertTransform(nestedSession.parent.calcTransformMatrix());
        const localStart = util.transformPoint(nestedSession.startPointer, parentInverse);
        const localCurrent = util.transformPoint(
          new FabricPoint(scenePoint.x, scenePoint.y),
          parentInverse
        );
        target.set({
          left: nestedSession.startLeft + localCurrent.x - localStart.x,
          top: nestedSession.startTop + localCurrent.y - localStart.y
        });
        target.setCoords();
        nestedSession.parent.dirty = true;
      }
      activateDragDuplicate(target);
      if (target.connector) {
        rememberNestedPosition();
        return;
      }
      if (snapSession.current.target !== target) {
        snapSession.current = { target };
      }
      if (!alignmentEnabledRef.current || (e && "altKey" in e && e.altKey)) {
        snapSession.current = { target };
        guides.current = {};
        scheduleConnectorRefresh(target.objectId);
        canvas.requestRenderAll();
        rememberNestedPosition();
        return;
      }
      const zoom = Math.max(latestZoom.current, 0.1);
      const result = snapBounds(
        target.getBoundingRect(),
        otherObjectBounds(target),
        SNAP_CAPTURE_DISTANCE_PX / zoom,
        {
          left: 0,
          top: 0,
          width: latestCanvasSettings.current.width,
          height: latestCanvasSettings.current.height
        },
        SNAP_MAX_ORTHOGONAL_GAP_PX / zoom
      );
      const proposedLeft = target.left ?? 0;
      const proposedTop = target.top ?? 0;
      const horizontal = applySnapResistance({
        proposedPosition: proposedLeft,
        pointer: scenePoint?.x ?? proposedLeft,
        snapDelta: result.dx,
        snapGuide: result.verticalGuide,
        lock: snapSession.current.x,
        releaseDistance: SNAP_RELEASE_DISTANCE_PX / zoom
      });
      const vertical = applySnapResistance({
        proposedPosition: proposedTop,
        pointer: scenePoint?.y ?? proposedTop,
        snapDelta: result.dy,
        snapGuide: result.horizontalGuide,
        lock: snapSession.current.y,
        releaseDistance: SNAP_RELEASE_DISTANCE_PX / zoom
      });
      snapSession.current.x = horizontal.lock;
      snapSession.current.y = vertical.lock;
      if (horizontal.position !== proposedLeft || vertical.position !== proposedTop) {
        target.set({
          left: horizontal.position,
          top: vertical.position
        });
        target.setCoords();
      }
      guides.current = {
        vertical: horizontal.guide,
        horizontal: vertical.guide
      };
      scheduleConnectorRefresh(target.objectId);
      canvas.requestRenderAll();
      rememberNestedPosition();
    };
    const transform = ({ target }: { target?: FabricObject }) => {
      if (!target) return;
      configureSelectionControls(target, latestZoom.current);
      if (target instanceof ActiveSelection) {
        let textScaleSession = activeSelectionTextScales.get(target);
        if (!textScaleSession) {
          textScaleSession = beginActiveSelectionTextScale(target) ?? undefined;
          if (textScaleSession) activeSelectionTextScales.set(target, textScaleSession);
        }
        if (textScaleSession && applyActiveSelectionTextScale(target, textScaleSession)) {
          target.dirty = true;
          canvas.requestRenderAll();
        }
      }
      if (target.objectId) scheduleConnectorRefresh(target.objectId);
    };
    const clearGuides = () => {
      snapSession.current = {};
      snapCandidateTarget = undefined;
      snapCandidateBounds = [];
      if (guides.current.vertical === undefined && guides.current.horizontal === undefined) return;
      guides.current = {};
      canvas.requestRenderAll();
    };
    const finishDragGesture = () => {
      if (dragDuplicate.current?.activated) {
        restoreDragDuplicateOpacity(dragDuplicate.current);
        canvas.requestRenderAll();
      }
      dragDuplicate.current = undefined;
      nestedDrag.current = undefined;
      snapCandidateTarget = undefined;
      snapCandidateBounds = [];
    };
    const drawGuides = ({ ctx: context }: { ctx: CanvasRenderingContext2D }) => {
      const { vertical, horizontal } = guides.current;
      if (vertical === undefined && horizontal === undefined) return;
      const viewport = canvas.viewportTransform;
      const x = (vertical ?? 0) * viewport[0] + viewport[4];
      const y = (horizontal ?? 0) * viewport[3] + viewport[5];
      context.save();
      context.strokeStyle = "#e65353";
      context.lineWidth = 1;
      context.setLineDash([5, 4]);
      if (vertical !== undefined) {
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, canvas.height);
        context.stroke();
      }
      if (horizontal !== undefined) {
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(canvas.width, y);
        context.stroke();
      }
      context.restore();
    };
    const drawGroupEditFocus = ({ ctx: context }: { ctx: CanvasRenderingContext2D }) => {
      const currentGroup = editingGroupRef.current;
      if (!currentGroup || context !== canvas.getContext()) return;
      context.save();
      context.fillStyle = "rgba(255, 255, 255, 0.82)";
      context.fillRect(0, 0, canvas.width, canvas.height);
      const viewport = canvas.viewportTransform;
      context.transform(...viewport);
      const parent = directNestedParent(currentGroup);
      if (parent) context.transform(...parent.calcTransformMatrix());
      currentGroup.render(context);
      context.restore();
      // Fabric draws selection controls before `after:render`. Redraw them after
      // the focus veil so group-edit handles remain fully opaque and legible.
      canvas.drawControls(context);
    };
    canvas.on("selection:created", select);
    canvas.on("selection:updated", select);
    canvas.on("selection:cleared", select);
    canvas.upperCanvasEl.addEventListener("mousedown", preserveDeepSelectionForDrag, true);
    canvas.upperCanvasEl.addEventListener("contextmenu", suppressModifierContextMenu, true);
    canvas.on("mouse:dblclick", selectDeeperObject);
    canvas.on("mouse:down", prepareDragDuplicate);
    canvas.on("object:modified", modified);
    canvas.on("object:moving", moving);
    canvas.on("object:scaling", transform);
    canvas.on("object:rotating", transform);
    canvas.on("after:render", drawGroupEditFocus);
    canvas.on("after:render", drawGuides);
    canvas.on("mouse:up", clearGuides);
    canvas.on("mouse:up", restoreObjectStacking);
    canvas.on("mouse:up", finishDragGesture);
    canvas.on("text:editing:exited", modified);
    return () => {
      if (boundsTarget) restoreObjectTargeting(boundsTarget);
      canvas.upperCanvasEl.removeEventListener("mousedown", preserveDeepSelectionForDrag, true);
      canvas.upperCanvasEl.removeEventListener("contextmenu", suppressModifierContextMenu, true);
      cancelScheduledConnectorRefresh();
      void enqueuePendingSave();
      canvasReadyRef.current = false;
      setCanvasReady(false);
      canvas.dispose();
      setCanvas(null);
    };
  }, [
    beginPendingEditorWork,
    canvas,
    closeGroupEdit,
    commit,
    enqueuePendingSave,
    refreshConnectors,
    setEditingGroupPath
  ]);

  const historyRestoreTail = useRef<Promise<void>>(Promise.resolve());
  const restoreHistory = useCallback(
    (offset: -1 | 1) => {
      const scheduled = historyRestoreTail.current.then(async () => {
        const index = historyIndex.current + offset;
        if (!canvas || !history.current[index] || index < 0 || index >= history.current.length) {
          return false;
        }
        const complete = beginPendingEditorWork();
        restoring.current = true;
        try {
          await canvas.loadFromJSON(history.current[index]);
          assignSceneIdentities(canvas.getObjects());
          configureCanvasAssets(canvas.getObjects());
          assertUniqueSceneObjectIds(canvas);
          refreshConnectors();
          canvas.requestRenderAll();
          historyIndex.current = index;
          const repairedSnapshot = serialize();
          history.current[index] = repairedSnapshot;
          setSelection([]);
          updateHistoryState();
          persist(repairedSnapshot);
          return true;
        } finally {
          restoring.current = false;
          complete();
        }
      });
      historyRestoreTail.current = scheduled.then(
        () => undefined,
        () => undefined
      );
      return scheduled;
    },
    [beginPendingEditorWork, canvas, persist, refreshConnectors, serialize, updateHistoryState]
  );

  const restoreSemanticSnapshot = useCallback(
    async (snapshot: string) => {
      if (!canvas) throw new Error("The OpenSketch canvas is not ready.");
      const complete = beginPendingEditorWork();
      restoring.current = true;
      try {
        // Semantic rollback restores scene state only; history and persistence
        // remain unchanged so the failed batch adds no history entry.
        await canvas.loadFromJSON(snapshot);
        assignSceneIdentities(canvas.getObjects());
        configureCanvasAssets(canvas.getObjects());
        assertUniqueSceneObjectIds(canvas);
        refreshConnectors();
        canvas.discardActiveObject();
        setSelection([]);
        canvas.requestRenderAll();
      } finally {
        restoring.current = false;
        complete();
      }
    },
    [beginPendingEditorWork, canvas, refreshConnectors]
  );

  const undo = useCallback(() => {
    return restoreHistory(-1);
  }, [restoreHistory]);
  const redo = useCallback(() => restoreHistory(1), [restoreHistory]);

  const centerObject = useCallback(
    (object: FabricObject, point?: Point) => {
      if (!canvas) return;
      const viewport = canvas.vptCoords;
      object.set({
        left: point?.x ?? (viewport.tl.x + viewport.br.x) / 2,
        top: point?.y ?? (viewport.tl.y + viewport.br.y) / 2,
        originX: "center",
        originY: "center"
      });
      object.setCoords();
    },
    [canvas]
  );

  const prepareElementStyle = useCallback((object: FabricObject) => {
    const key = elementStyleKey(object);
    object.defaultElementStyle ??= captureElementStyle(object);
    // A saved element style is a per-type override. Apply it after capturing the
    // creation defaults so the Defaults panel never overwrites it for new items.
    applyElementStyle(object, key ? savedElementStyles.current[key] : undefined);
  }, []);

  const addObject = useCallback(
    (object: FabricObject, name: string, type: string, point?: Point, select = true) => {
      if (!canvas) return null;
      assignIdentity(object, name, type);
      assignSceneIdentities(object);
      prepareElementStyle(object);
      centerObject(object, point);
      canvas.add(object);
      if (select) canvas.setActiveObject(object);
      canvas.requestRenderAll();
      if (select) setSelection([object]);
      commit(`Add ${name}`);
      return object;
    },
    [canvas, centerObject, commit, prepareElementStyle]
  );

  const applySemanticColorPreset = useCallback(
    (objectId: string, presetId: string): Promise<void> => {
      if (!canvas) return Promise.reject(new Error("The OpenSketch canvas is not ready."));
      const object = sceneObjectIndex(canvas).get(objectId);
      if (!object) return Promise.reject(new Error(`Scene object "${objectId}" does not exist.`));
      if (!(object instanceof Group) || !object.familyId) {
        return Promise.reject(new Error(`Scene object "${objectId}" is not a colorable asset.`));
      }
      const preset = ASSET_COLOR_PRESETS.find((item) => item.id === presetId);
      if (!preset)
        return Promise.reject(new Error(`Asset color preset "${presetId}" does not exist.`));
      const operation = loadAssetManifest().then(({ assetManifest }) => {
        const family = assetManifest.families.find((item) => item.familyId === object.familyId);
        const profile = family ? colorProfileForFamily(family) : undefined;
        if (!profile || sceneObjectIndex(canvas).get(objectId) !== object) {
          throw new Error(`Asset color preset target "${objectId}" is no longer available.`);
        }
        const mapping = presetColorMap(originalPaints(object), profile, preset);
        restoreOriginalColors(object);
        applyPresetColors(object, mapping, preset.id);
        canvas.requestRenderAll();
      });
      return trackPendingEditorWork(operation);
    },
    [canvas, trackPendingEditorWork]
  );

  const semanticCanvasRef = useRef<Canvas | null>(canvas);
  semanticCanvasRef.current = canvas;
  const semanticProjectIdRef = useRef(project.id);
  semanticProjectIdRef.current = project.id;
  const semanticCommitRef = useRef(commit);
  semanticCommitRef.current = commit;
  const semanticSerializeRef = useRef(serialize);
  semanticSerializeRef.current = serialize;
  const semanticRestoreRef = useRef(restoreSemanticSnapshot);
  semanticRestoreRef.current = restoreSemanticSnapshot;
  const semanticCreationDefaultsRef = useRef(creationDefaults);
  semanticCreationDefaultsRef.current = creationDefaults;
  const semanticPrepareElementStyleRef = useRef(prepareElementStyle);
  semanticPrepareElementStyleRef.current = prepareElementStyle;
  const semanticConfigureCanvasAssetsRef = useRef(configureCanvasAssets);
  semanticConfigureCanvasAssetsRef.current = configureCanvasAssets;
  const semanticRefreshConnectorsRef = useRef(refreshConnectors);
  semanticRefreshConnectorsRef.current = refreshConnectors;
  const semanticApplyColorPresetRef = useRef(applySemanticColorPreset);
  semanticApplyColorPresetRef.current = applySemanticColorPreset;
  const semanticUndoRef = useRef(undo);
  semanticUndoRef.current = undo;
  const semanticRedoRef = useRef(redo);
  semanticRedoRef.current = redo;
  const semanticExportSvgRef = useRef<EditorContextValue["exportSvg"]>(() => undefined);
  const semanticExportCreditsRef = useRef<EditorContextValue["exportCredits"]>(() => undefined);
  const semanticExportPdfRef = useRef<EditorContextValue["exportPdf"]>(async () => undefined);
  const semanticExportPngRef = useRef<EditorContextValue["exportPng"]>(async () => undefined);
  const semanticInsertAssetRef = useRef<
    (family: AssetFamily, variant: AssetVariant, point?: Point) => Promise<string | undefined>
  >(async () => undefined);
  const semanticReplaceAssetVariantRef = useRef<
    (objectId: string, variantId: string) => Promise<boolean>
  >(async () => false);
  const semanticRuntimeRef = useRef<SemanticRuntime | null>(null);
  if (!semanticRuntimeRef.current) {
    semanticRuntimeRef.current = createSemanticRuntime(
      createSemanticEditorAdapter({
        getCanvas: () => semanticCanvasRef.current,
        getProjectId: () => semanticProjectIdRef.current,
        isCanvasReady: () => canvasReadyRef.current,
        getCanvasSettings: () => latestCanvasSettings.current,
        setSelection,
        commit: (label) => semanticCommitRef.current(label),
        serialize: () => semanticSerializeRef.current(),
        restore: (snapshot) => semanticRestoreRef.current(snapshot),
        creationDefaults: () => semanticCreationDefaultsRef.current,
        prepareElementStyle: (object) => semanticPrepareElementStyleRef.current(object),
        configureCanvasAssets: (objects) => semanticConfigureCanvasAssetsRef.current(objects),
        refreshConnectors: (changedObjectId) =>
          semanticRefreshConnectorsRef.current(changedObjectId),
        applyColorPreset: (objectId, presetId) =>
          semanticApplyColorPresetRef.current(objectId, presetId),
        undo: () => semanticUndoRef.current(),
        redo: () => semanticRedoRef.current(),
        insertAsset: (...args) => semanticInsertAssetRef.current(...args),
        replaceAssetVariant: (...args) => semanticReplaceAssetVariantRef.current(...args),
        exportSvg: (...args) => semanticExportSvgRef.current(...args),
        exportCredits: (...args) => semanticExportCreditsRef.current(...args),
        exportPdf: (...args) => semanticExportPdfRef.current(...args),
        exportPng: (...args) => semanticExportPngRef.current(...args)
      })
    );
  }
  const semanticRuntime = semanticRuntimeRef.current;

  useEffect(() => installSemanticIntrospection(semanticRuntime), [semanticRuntime]);

  const semanticWebMcpRef = useRef<WebMcpAdapter | null>(null);
  if (!semanticWebMcpRef.current) {
    semanticWebMcpRef.current = createWebMcpAdapter({ runtime: semanticRuntime });
  }
  useEffect(() => {
    const adapter = semanticWebMcpRef.current;
    if (!adapter) return undefined;
    let disposed = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const sync = async () => {
      const result = await adapter.sync();
      if (!disposed && !result.supported) {
        retryTimer = setTimeout(() => void sync(), 250);
      }
    };
    void sync();
    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      adapter.dispose();
    };
  }, [canvasReady, project.id, semanticRuntime]);

  const setCreationDefaults = useCallback(
    (defaults: CreationDefaults | ((current: CreationDefaults) => CreationDefaults)) => {
      setCreationDefaultsState((current) => {
        const normalized = normalizeCreationDefaults(
          typeof defaults === "function" ? defaults(current) : defaults
        );
        localStorage.setItem(CREATION_DEFAULTS_STORAGE_KEY, JSON.stringify(normalized));
        return normalized;
      });
    },
    []
  );

  const addText = useCallback(
    (kind: TextKind = "point", point?: Point, fontSize?: number, fontWeight?: number) => {
      if (!canvas) return;
      const options = {
        fill: creationDefaults.text.color,
        fontFamily: creationDefaults.text.fontFamily,
        fontSize: fontSize ?? creationDefaults.text.fontSize,
        fontWeight: fontWeight ?? creationDefaults.text.fontWeight,
        lineHeight: DEFAULT_TEXT_LINE_HEIGHT
      };
      const object =
        kind === "box"
          ? new Textbox("Text box", { ...options, width: 420 })
          : new IText("Text", options);
      configureTextObject(object);
      addObject(object, kind === "box" ? "Text box" : "Text", "text", point);
      // Entering Fabric text editing during the canvas pointer-down handler can
      // race the React tool-state render and Fabric's hidden textarea setup.
      // Wait until the object and canvas have completed that frame first.
      requestAnimationFrame(() => {
        if (object.canvas !== canvas || canvas.getActiveObject() !== object) return;
        try {
          object.enterEditing();
          object.selectAll();
          canvas.requestRenderAll();
        } catch (reason) {
          // Keep the editor usable even if the browser rejects focus during a
          // transient lifecycle event (for example, a development hot update).
          console.error("Could not begin text editing.", reason);
        }
      });
    },
    [addObject, canvas, creationDefaults.text]
  );
  useEffect(() => {
    createPointText.current = (point) => addText("point", point);
  }, [addText]);

  const addAttachedConnector = useCallback(
    (
      kind: "line" | "arrow" | "double-arrow" | "curved-arrow",
      preset?: ConnectorCreationPreset
    ) => {
      if (!canvas) return false;
      const targets = canvas.getActiveObjects().filter((object) => !object.connector);
      if (targets.length !== 2) return false;
      const [fromObject, toObject] = targets;
      assignIdentity(
        fromObject,
        fromObject.name ?? "Object",
        fromObject.OpenSketchType ?? fromObject.type
      );
      assignIdentity(toObject, toObject.name ?? "Object", toObject.OpenSketchType ?? toObject.type);
      const fromCenter = fromObject.getCenterPoint();
      const toCenter = toObject.getCenterPoint();
      const horizontal = Math.abs(toCenter.x - fromCenter.x) >= Math.abs(toCenter.y - fromCenter.y);
      const forward = horizontal ? toCenter.x >= fromCenter.x : toCenter.y >= fromCenter.y;
      const binding: ConnectorBinding = {
        fromObjectId: fromObject.objectId!,
        fromAnchor: horizontal ? (forward ? "right" : "left") : forward ? "bottom" : "top",
        toObjectId: toObject.objectId!,
        toAnchor: horizontal ? (forward ? "left" : "right") : forward ? "top" : "bottom",
        startArrowhead:
          preset?.startArrowhead ??
          (kind === "line"
            ? "none"
            : kind === "double-arrow"
              ? creationDefaults.line.startArrowhead || "triangle"
              : creationDefaults.line.startArrowhead),
        endArrowhead:
          preset?.endArrowhead ?? (kind === "line" ? "none" : creationDefaults.line.endArrowhead),
        lineStyle: preset?.lineStyle ?? creationDefaults.line.lineStyle,
        routing: preset?.pathShape === "straight" ? "direct" : "orthogonal",
        pathShape: preset?.pathShape,
        curvature: preset?.curvature ?? (kind === "curved-arrow" ? 0.24 : 0)
      };
      const obstacles = canvas
        .getObjects()
        .filter(
          (object) =>
            !object.connector &&
            object.visible !== false &&
            object !== fromObject &&
            object !== toObject
        )
        .map((object) => object.getBoundingRect());
      const connector = createConnectorObject(
        anchorPoint(fromObject.getBoundingRect(), binding.fromAnchor),
        anchorPoint(toObject.getBoundingRect(), binding.toAnchor),
        binding,
        {
          color: creationDefaults.line.color,
          width: creationDefaults.line.width * (preset?.widthScale ?? 1),
          opacity: preset?.opacity ?? 1
        },
        obstacles
      );
      assignIdentity(connector, "Connector", "connector");
      assignSceneIdentities(connector);
      prepareElementStyle(connector);
      canvas.add(connector);
      canvas.sendObjectToBack(connector);
      canvas.setActiveObject(connector);
      setSelection([connector]);
      canvas.requestRenderAll();
      commit("Add connector");
      return true;
    },
    [canvas, commit, creationDefaults.line, prepareElementStyle]
  );

  const addShape = useCallback(
    (
      kind: ShapeKind,
      point?: Point,
      connectorPreset?: ConnectorCreationPreset,
      options: { select?: boolean; allowAttached?: boolean } = {}
    ) => {
      if (
        options.allowAttached !== false &&
        kind !== "curved-line" &&
        ["line", "arrow", "double-arrow", "curved-arrow"].includes(kind) &&
        addAttachedConnector(
          kind as "line" | "arrow" | "double-arrow" | "curved-arrow",
          connectorPreset
        )
      ) {
        return null;
      }
      return addObject(
        createShapeObject(kind, creationDefaults),
        kind === "polygon" ? "hexagon" : kind.replace("-", " "),
        kind.includes("arrow") ? "connector" : "shape",
        point,
        options.select !== false
      );
    },
    [addAttachedConnector, addObject, creationDefaults]
  );

  const addFreeConnector = useCallback(
    (
      kind: "line" | "curved-line" | "arrow" | "double-arrow" | "curved-arrow",
      from: Point,
      requestedTo?: Point,
      preset?: ConnectorCreationPreset
    ) => {
      if (!canvas) return;
      const distance = requestedTo ? Math.hypot(requestedTo.x - from.x, requestedTo.y - from.y) : 0;
      const requestedOffset =
        preset?.defaultOffset ??
        (preset?.pathShape.startsWith("bracket-") ? { x: 0, y: 220 } : { x: 220, y: 0 });
      const directDefault = {
        x: from.x + requestedOffset.x,
        y: from.y + requestedOffset.y
      };
      const defaultFits =
        directDefault.x >= 0 &&
        directDefault.x <= latestCanvasSettings.current.width &&
        directDefault.y >= 0 &&
        directDefault.y <= latestCanvasSettings.current.height;
      const mirroredDefault = {
        x: from.x - requestedOffset.x,
        y: from.y - requestedOffset.y
      };
      const defaultTo = defaultFits
        ? directDefault
        : {
            x: Math.max(0, Math.min(latestCanvasSettings.current.width, mirroredDefault.x)),
            y: Math.max(0, Math.min(latestCanvasSettings.current.height, mirroredDefault.y))
          };
      const to =
        requestedTo && distance >= 4 / Math.max(latestZoom.current, 0.1) ? requestedTo : defaultTo;
      const binding: ConnectorBinding = {
        fromObjectId: "",
        fromAnchor: "center",
        toObjectId: "",
        toAnchor: "center",
        startArrowhead:
          preset?.startArrowhead ??
          (kind === "line" || kind === "curved-line"
            ? "none"
            : kind === "double-arrow"
              ? creationDefaults.line.startArrowhead || "triangle"
              : creationDefaults.line.startArrowhead),
        endArrowhead:
          preset?.endArrowhead ??
          (kind === "line" || kind === "curved-line" ? "none" : creationDefaults.line.endArrowhead),
        lineStyle: preset?.lineStyle ?? creationDefaults.line.lineStyle,
        routing: "direct",
        pathShape: preset?.pathShape,
        curvature:
          preset?.curvature ?? (kind === "curved-arrow" || kind === "curved-line" ? 0.24 : 0)
      };
      if (kind === "double-arrow" && binding.startArrowhead === "none") {
        binding.startArrowhead = "triangle";
      }
      const object = createFreeConnectorObject(from, to, binding, {
        color: creationDefaults.line.color,
        width: creationDefaults.line.width * (preset?.widthScale ?? 1),
        opacity: preset?.opacity ?? 1
      });
      object.connector = undefined;
      object.OpenSketchType = kind;
      object.name = kind.replace("-", " ");
      object.lockScalingX = false;
      object.lockScalingY = false;
      assignIdentity(object, object.name, kind);
      assignSceneIdentities(object);
      prepareElementStyle(object);
      canvas.add(object);
      canvas.setActiveObject(object);
      setSelection([object]);
      canvas.requestRenderAll();
      commit(`Add ${object.name}`);
    },
    [canvas, commit, creationDefaults.line, prepareElementStyle]
  );

  const placeCreationTool = useCallback(
    (tool: CreationTool, point: Point, endPoint?: Point) => {
      if (tool.type === "text") {
        addText(tool.kind, point, tool.fontSize, tool.fontWeight);
        return;
      }
      if (["line", "curved-line", "arrow", "double-arrow", "curved-arrow"].includes(tool.kind)) {
        const dragged =
          endPoint &&
          Math.hypot(endPoint.x - point.x, endPoint.y - point.y) >=
            4 / Math.max(canvas?.getZoom() ?? 1, 0.1);
        if (
          !dragged &&
          tool.kind !== "curved-line" &&
          addAttachedConnector(
            tool.kind as "line" | "arrow" | "double-arrow" | "curved-arrow",
            tool.connectorPreset
          )
        ) {
          return;
        }
        addFreeConnector(
          tool.kind as "line" | "curved-line" | "arrow" | "double-arrow" | "curved-arrow",
          point,
          endPoint,
          tool.connectorPreset
        );
        return;
      }
      addShape(tool.kind, point, tool.connectorPreset);
    },
    [addAttachedConnector, addFreeConnector, addShape, addText, canvas]
  );

  const placeCreation = useCallback(
    (point: Point, endPoint?: Point) => {
      if (!creationTool) return;
      const tool = creationTool;
      setCreationTool(null);
      placeCreationTool(tool, point, endPoint);
    },
    [creationTool, placeCreationTool]
  );

  const insertBundledAsset = useCallback(
    (family: AssetFamily, variant: AssetVariant, point: Point | undefined, select: boolean) => {
      const operation = trackPendingEditorWork(
        assetInsertQueue.current.then(async () => {
          if (!canvas) return undefined;
          const group = await createBundledAssetGroup(family, variant);
          const scale = assetInsertionScale(family.title, group.width || 1, group.height || 1);
          group.scale(scale);
          const object = addObject(group, family.title, "nih-asset", point, select);
          return object?.objectId;
        })
      );
      assetInsertQueue.current = operation.catch(() => undefined);
      return operation;
    },
    [addObject, canvas, trackPendingEditorWork]
  );

  const addAsset = useCallback(
    (family: AssetFamily, variant: AssetVariant, point?: Point) =>
      insertBundledAsset(family, variant, point, true),
    [insertBundledAsset]
  );

  const insertSemanticAsset = useCallback(
    (family: AssetFamily, variant: AssetVariant, point?: Point) =>
      insertBundledAsset(family, variant, point, false),
    [insertBundledAsset]
  );
  semanticInsertAssetRef.current = insertSemanticAsset;

  const addTemplate = useCallback(
    (template: AssetTemplate, point?: Point) => {
      const operation = trackPendingEditorWork(
        assetInsertQueue.current.then(async () => {
          if (!canvas) return;
          const [object] = (await util.enlivenObjects([
            structuredClone(template.object)
          ])) as FabricObject[];
          if (!object) return;
          assignFreshCloneIds(object);
          configureCanvasAssets([object]);
          addObject(object, template.name, "group", point);
        })
      );
      assetInsertQueue.current = operation.catch(() => undefined);
      return operation;
    },
    [addObject, canvas, trackPendingEditorWork]
  );

  const replaceAssetVariant = useCallback(
    (objectId: string, variantId: string, selectReplacement = false) => {
      const operation = trackPendingEditorWork(
        assetInsertQueue.current.then(async () => {
          if (!canvas) return false;
          const current = sceneObjectIndex(canvas).get(objectId);
          if (!(current instanceof Group) || !current.familyId || current.assetId === variantId)
            return false;
          const { assetManifest } = await loadAssetManifest();
          const family = assetManifest.families.find(
            (candidate) => candidate.familyId === current.familyId
          );
          const variant = family?.variants.find((candidate) => candidate.id === variantId);
          if (!family || !variant) return false;

          const replacement = await createBundledAssetGroup(family, variant);
          if (!canvas.getObjects().includes(current)) return false;
          const center = current.getCenterPoint();
          const renderedMaxSide = Math.max(current.getScaledWidth(), current.getScaledHeight());
          const replacementMaxSide = Math.max(replacement.width || 1, replacement.height || 1);
          const scale = renderedMaxSide / replacementMaxSide;
          replacement.set({
            objectId: current.objectId,
            name: current.name ?? family.title,
            OpenSketchType: "nih-asset",
            scaleX: scale,
            scaleY: scale,
            angle: current.angle,
            flipX: current.flipX,
            flipY: current.flipY,
            opacity: current.opacity,
            visible: current.visible,
            selectable: current.selectable,
            evented: current.evented
          });
          replacement.setPositionByOrigin(center, "center", "center");
          replacement.setCoords();
          assignSceneIdentities(replacement);

          const activeIds = canvas
            .getActiveObjects()
            .map((object) => object.objectId)
            .filter((id): id is string => Boolean(id));
          const index = canvas.getObjects().indexOf(current);
          canvas.remove(current);
          canvas.insertAt(index, replacement);
          if (selectReplacement || activeIds.includes(objectId)) {
            canvas.setActiveObject(replacement);
            setSelection([replacement]);
          }
          if (replacement.objectId) refreshConnectors(replacement.objectId);
          canvas.requestRenderAll();
          commit("Change asset variant");
          return true;
        })
      );
      assetInsertQueue.current = operation.catch(() => undefined);
      return operation;
    },
    [canvas, commit, refreshConnectors, trackPendingEditorWork]
  );
  semanticReplaceAssetVariantRef.current = replaceAssetVariant;

  const setAssetVariant = useCallback(
    (variantId: string) => {
      const current = canvas?.getActiveObject();
      if (!current?.objectId) return Promise.resolve();
      return replaceAssetVariant(current.objectId, variantId, true).then(() => undefined);
    },
    [canvas, replaceAssetVariant]
  );

  const placeImportedMedia = useCallback(
    async (media: ImportedMediaRecord, point?: Point, knownInspection?: RasterInspection) => {
      const existingMedia = projectMediaTotals(
        latestProject.current.uploads,
        canvas,
        media.id,
        media.dataUrl
      );
      validateImportedMediaRecord(media, existingMedia.rasterPixels, knownInspection);
      const parsed = parseImageDataUrl(media.dataUrl);
      if (!parsed) throw new Error("The imported image data is invalid.");
      if (
        existingMedia.dataUrlBytes + imageDataUrlByteLength(parsed) >
        PORTABLE_PROJECT_LIMITS.maxTotalDataUrlBytes
      ) {
        throw new Error("Adding this image would exceed the document's embedded data budget.");
      }
      if (!canvas) return media;
      const stored = await saveImportedMediaToLibrary(media);
      let object: FabricObject;
      if (stored.mimeType === "image/svg+xml") {
        const source = sanitizeImportedSvg(
          await (await fetch(stored.dataUrl)).text(),
          `import-${stored.id}`
        );
        const result = await loadEditableSvg(source);
        object = groupSvgElements(
          result.objects.filter((item): item is FabricObject => Boolean(item)),
          result.options
        );
      } else {
        object = await FabricImage.fromURL(stored.dataUrl);
      }
      const maxSide = Math.max(object.width || 1, object.height || 1);
      object.scale(Math.min(1, 420 / maxSide));
      object.assetId = stored.id;
      object.originalPalette = Object.fromEntries(
        paletteFromObject(object).map((color) => [color, color])
      );
      rememberOriginalColors(object);
      if (object instanceof Group) markSvgParts(object);
      configureAtomicSvgAsset(object);
      latestProject.current = {
        ...latestProject.current,
        uploads: [
          ...latestProject.current.uploads.filter((candidate) => candidate.id !== stored.id),
          {
            id: stored.id,
            name: stored.name,
            mimeType: stored.mimeType,
            dataUrl: stored.dataUrl
          }
        ]
      };
      addObject(object, stored.name, "import", point);
      return stored;
    },
    [addObject, canvas]
  );

  const addImportedMedia = useCallback(
    (media: ImportedMediaRecord, point?: Point) => {
      const operation = trackPendingEditorWork(
        importQueue.current.then(async () => {
          await placeImportedMedia(media, point);
        })
      );
      importQueue.current = operation.catch(() => undefined);
      return operation;
    },
    [placeImportedMedia, trackPendingEditorWork]
  );

  const importMedia = useCallback(
    (file: File, point?: Point) => {
      const operation = trackPendingEditorWork(
        importQueue.current.then(async () => {
          const extension = file.name.toLowerCase().split(".").at(-1);
          if (file.size > PORTABLE_PROJECT_LIMITS.maxDataUrlBytes) {
            throw new Error("Images must be 25 MB or smaller.");
          }
          const rasterInspection = await inspectRasterBlob(file);
          const declaredRasterMimeType = file.type.toLowerCase();
          const rasterExtension = ["png", "jpg", "jpeg", "webp"].includes(extension ?? "");
          if (
            !rasterInspection &&
            (isSupportedRasterMimeType(declaredRasterMimeType) || rasterExtension)
          ) {
            throw new Error("The file is not a valid PNG, JPEG, or WebP image.");
          }
          const inferredMimeType =
            rasterInspection?.mimeType ??
            (file.type.toLowerCase() === "image/svg+xml" || extension === "svg"
              ? "image/svg+xml"
              : "");
          if (!inferredMimeType) {
            throw new Error("The file is not a valid PNG, JPEG, WebP, or SVG image.");
          }
          if (rasterInspection) {
            const limitMessage = rasterLimitMessage(rasterInspection);
            if (limitMessage) throw new Error(limitMessage);
          }
          const importId = crypto.randomUUID();
          let dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(reader.error ?? new Error("Unable to read the image."));
            reader.readAsDataURL(new Blob([file], { type: inferredMimeType }));
          });
          if (inferredMimeType === "image/svg+xml") {
            const source = sanitizeImportedSvg(await file.text(), `import-${importId}`);
            dataUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(source)))}`;
          }
          const media: ImportedMediaRecord = {
            id: importId,
            name: file.name,
            mimeType: inferredMimeType,
            dataUrl
          };
          return placeImportedMedia(media, point, rasterInspection);
        })
      );
      importQueue.current = operation.then(() => undefined).catch(() => undefined);
      return operation;
    },
    [placeImportedMedia, trackPendingEditorWork]
  );

  const selectParentAsset = useCallback(() => {
    if (!canvas) return;
    const parent = editableAssetParent(canvas.getActiveObject());
    if (!parent) return;
    if (editingGroupPathRef.current[0] === parent) {
      setEditingGroupPath([]);
      configureAtomicSvgAsset(parent);
    }
    canvas.setActiveObject(parent);
    setSelection([parent]);
    canvas.requestRenderAll();
  }, [canvas, setEditingGroupPath]);

  const deleteSelection = useCallback(() => {
    if (!canvas) return;
    const active = canvas.getActiveObjects();
    const nested = active.filter((object) => editableAssetParent(object));
    if (nested.length > 0) {
      const removedIds = new Set(
        nested.map((object) => object.objectId).filter((id): id is string => Boolean(id))
      );
      const parents = new Set<Group>();
      nested.forEach((object) => {
        const parent = object.group;
        if (!(parent instanceof Group)) return;
        parents.add(editableAssetParent(object) ?? parent);
        parent.remove(object);
        parent.triggerLayout();
        parent.dirty = true;
      });
      const parentAsset = [...parents][0];
      if (parentAsset && parentAsset.getObjects().length > 0) {
        sceneObjectEntries(canvas)
          .filter(({ object }) => connectorsForRemovedIds([object], removedIds).length > 0)
          .forEach(removeSceneObject);
        canvas.setActiveObject(parentAsset);
        setSelection([parentAsset]);
      } else {
        parents.forEach((parent) => {
          if (parent.objectId) removedIds.add(parent.objectId);
          const entry = sceneObjectEntries(canvas).find(({ object }) => object === parent);
          if (entry) removeSceneObject(entry);
        });
        sceneObjectEntries(canvas)
          .filter(({ object }) => connectorsForRemovedIds([object], removedIds).length > 0)
          .forEach(removeSceneObject);
        canvas.discardActiveObject();
        setSelection([]);
      }
      canvas.requestRenderAll();
      commit("Delete SVG part");
      return;
    }
    const removedIds = new Set<string>();
    visitSceneObjects(active, (object) => {
      if (object.objectId) removedIds.add(object.objectId);
    });
    const activeSet = new Set(active);
    const entries = sceneObjectEntries(canvas);
    entries
      .filter(
        ({ object }) =>
          !activeSet.has(object) && connectorsForRemovedIds([object], removedIds).length > 0
      )
      .forEach(removeSceneObject);
    const selectedRoots = active.filter(
      (object) =>
        !active.some((candidate) => candidate !== object && isSceneDescendant(object, candidate))
    );
    selectedRoots.forEach((object) => {
      const entry = entries.find((candidate) => candidate.object === object);
      if (entry) removeSceneObject(entry);
    });
    canvas.discardActiveObject();
    setSelection([]);
    canvas.requestRenderAll();
    commit("Delete");
  }, [canvas, commit]);

  const saveSelectionAsTemplate = useCallback(async () => {
    if (!canvas) return;
    const activeObject = canvas.getActiveObject();
    if (!isManualGroup(activeObject)) return;
    const defaultName =
      typeof activeObject.name === "string" && activeObject.name.trim()
        ? activeObject.name.trim()
        : "Group";
    const name = window.prompt("Save group as template", defaultName)?.trim();
    if (!name) return;

    const snapshotObject = await activeObject.clone();
    snapshotObject.set({ left: 0, top: 0, originX: "center", originY: "center" });
    snapshotObject.setCoords();
    let thumbnail = "";
    try {
      thumbnail = await renderTemplateThumbnail(activeObject);
    } catch (reason) {
      console.warn("Template preview could not be rendered; the template is still saved.", reason);
    }
    const now = new Date().toISOString();
    await saveAssetTemplate({
      id: crypto.randomUUID(),
      name,
      object: snapshotObject.toObject() as unknown as Record<string, unknown>,
      thumbnail,
      createdAt: now,
      updatedAt: now,
      schemaVersion: 1
    });
  }, [canvas]);

  const duplicateSelection = useCallback(async () => {
    if (!canvas) return;
    const complete = beginPendingEditorWork();
    try {
      const selectedObjects = canvas.getActiveObjects();
      const clones = await Promise.all(selectedObjects.map((object) => object.clone()));
      configureCanvasAssets(clones);
      const nestedParent = editableAssetParent(selectedObjects[0]);
      if (
        nestedParent &&
        selectedObjects.every((object) => editableAssetParent(object) === nestedParent)
      ) {
        assignFreshCloneIds(clones);
        clones.forEach((clone) => {
          clone.set({ left: (clone.left ?? 0) + 12, top: (clone.top ?? 0) + 12 });
          clone.name = `${selectedObjects[0].name ?? "Part"} copy`;
          clone.OpenSketchType = "svg-part";
          nestedParent.add(clone);
        });
        nestedParent.triggerLayout();
        nestedParent.dirty = true;
        canvas.setActiveObject(clones[0]);
        setSelection([clones[0]]);
        canvas.requestRenderAll();
        commit("Duplicate SVG part");
        return;
      }
      assignFreshCloneIds(clones);
      clones.forEach((clone) => {
        clone.set({ left: (clone.left ?? 0) + 28, top: (clone.top ?? 0) + 28 });
        canvas.add(clone);
      });
      const active = clones.length === 1 ? clones[0] : new ActiveSelection(clones, { canvas });
      canvas.setActiveObject(active);
      setSelection(clones);
      canvas.requestRenderAll();
      commit("Duplicate");
    } finally {
      complete();
    }
  }, [beginPendingEditorWork, canvas, commit]);

  const copySelectionToClipboard = useCallback(
    async (format: SelectionClipboardFormat = "png", cut = false) => {
      if (!canvas) return;
      const activeObject = canvas.getActiveObject();
      const selectedObjects = canvas.getActiveObjects();
      if (!activeObject || selectedObjects.length === 0) return;

      const complete = cut ? beginPendingEditorWork() : undefined;
      let internalCopy: Promise<void> | undefined;
      try {
        const marker = `${SELECTION_CLIPBOARD_MARKER_PREFIX}${crypto.randomUUID()}`;
        clipboardMarker.current = marker;
        const systemWrite = writeSelectionToSystemClipboard(activeObject, format, marker).catch(
          (error: unknown) => {
            console.warn(`Could not copy the selection as ${format.toUpperCase()}.`, error);
          }
        );
        internalCopy = Promise.all(selectedObjects.map((object) => object.clone())).then(
          (clones) => {
            clipboard.current = clones;
          }
        );
        pendingClipboardCopy.current = internalCopy ?? null;
        await Promise.all([internalCopy, systemWrite]);
        if (cut) deleteSelection();
      } finally {
        if (pendingClipboardCopy.current === internalCopy) {
          pendingClipboardCopy.current = null;
        }
        complete?.();
      }
    },
    [beginPendingEditorWork, canvas, deleteSelection]
  );

  const pasteSelection = useCallback(async () => {
    if (!canvas) return;
    const complete = beginPendingEditorWork();
    try {
      await pendingClipboardCopy.current;
      if (clipboard.current.length === 0) return;
      const [clones, nextClipboard] = await Promise.all([
        Promise.all(clipboard.current.map((object) => object.clone())),
        Promise.all(clipboard.current.map((object) => object.clone()))
      ]);
      configureCanvasAssets(clones);
      assignFreshCloneIds(clones);
      clones.forEach((clone) => {
        clone.set({
          left: (clone.left ?? 0) + 24,
          top: (clone.top ?? 0) + 24
        });
        canvas.add(clone);
      });
      nextClipboard.forEach((clone) => {
        clone.set({ left: (clone.left ?? 0) + 24, top: (clone.top ?? 0) + 24 });
      });
      clipboard.current = nextClipboard;
      canvas.setActiveObject(
        clones.length === 1 ? clones[0] : new ActiveSelection(clones, { canvas })
      );
      setSelection(clones);
      canvas.requestRenderAll();
      commit("Paste");
    } finally {
      complete();
    }
  }, [beginPendingEditorWork, canvas, commit]);

  const groupSelection = useCallback(() => {
    if (!canvas || !(canvas.getActiveObject() instanceof ActiveSelection)) return;
    const active = canvas.getActiveObject() as ActiveSelection;
    const selectedObjects = active.getObjects();
    if (selectedObjects.length < 2) return;
    const collection = layerCollectionForObject(selectedObjects[0], canvas);
    if (
      !selectedObjects.every((object) => layerCollectionForObject(object, canvas) === collection)
    ) {
      return;
    }
    const objects = [...selectedObjects].sort(
      (a, b) => collection.getObjects().indexOf(a) - collection.getObjects().indexOf(b)
    );
    const insertionIndex = collection.getObjects().indexOf(objects[0]);
    active.removeAll();
    canvas.discardActiveObject();
    collection.remove(...objects);
    const group = new Group(objects);
    const recognition = findRecognizedGroup(objects);
    if (recognition) restoreRecognizedGroup(group, objects, recognition);
    assignIdentity(group, "Group", "group");
    group.OpenSketchType = "group";
    configureCanvasAssets([group]);
    collection.insertAt(Math.max(0, insertionIndex), group);
    if (collection instanceof Group) {
      collection.triggerLayout();
      collection.dirty = true;
      collection.setCoords();
    }
    canvas.setActiveObject(group);
    deepSelectionCycle.current = undefined;
    setSelection([group]);
    refreshConnectors();
    canvas.requestRenderAll();
    commit("Group");
  }, [canvas, commit, refreshConnectors]);

  const ungroupSelection = useCallback(() => {
    if (!canvas || !isManualGroup(canvas.getActiveObject())) return;
    const group = canvas.getActiveObject() as Group;
    const removedIds = new Set(group.objectId ? [group.objectId] : []);
    const parent = layerCollectionForObject(group, canvas);
    const index = parent.getObjects().indexOf(group);
    canvas.discardActiveObject();
    const objects = group.removeAll();
    rememberRecognizedGroup(objects, recognizedGroupRecord(group, objects));
    if (index >= 0) {
      parent.remove(group);
      parent.insertAt(index, ...objects);
      if (parent instanceof Group) {
        parent.triggerLayout();
        parent.setCoords();
        parent.dirty = true;
      }
    }
    sceneObjectEntries(canvas)
      .filter(({ object }) => connectorsForRemovedIds([object], removedIds).length > 0)
      .forEach(removeSceneObject);
    const selectionObject = new ActiveSelection(objects, { canvas });
    configureSelectionControls(selectionObject, latestZoom.current);
    canvas.setActiveObject(selectionObject);
    deepSelectionCycle.current = undefined;
    setSelection(selectionObject.getObjects());
    refreshConnectors();
    canvas.requestRenderAll();
    commit("Ungroup");
  }, [canvas, commit, refreshConnectors]);

  const arrange = useCallback(
    (action: "front" | "forward" | "backward" | "back") => {
      if (!canvas) return;
      arrangeObjects(canvas.getActiveObjects(), canvas, action);
      canvas.requestRenderAll();
      commit("Arrange layers");
    },
    [canvas, commit]
  );

  const align = useCallback(
    (axis: "left" | "center" | "right" | "top" | "middle" | "bottom") => {
      if (!canvas) return;
      const objects = canvas.getActiveObjects();
      if (objects.length < 2) return;
      const bounds = canvas.getActiveObject()!.getBoundingRect();
      objects.forEach((object) => {
        const objectBounds = object.getBoundingRect();
        if (axis === "left") object.left! += bounds.left - objectBounds.left;
        if (axis === "center")
          object.left! +=
            bounds.left + bounds.width / 2 - (objectBounds.left + objectBounds.width / 2);
        if (axis === "right")
          object.left! += bounds.left + bounds.width - (objectBounds.left + objectBounds.width);
        if (axis === "top") object.top! += bounds.top - objectBounds.top;
        if (axis === "middle")
          object.top! +=
            bounds.top + bounds.height / 2 - (objectBounds.top + objectBounds.height / 2);
        if (axis === "bottom")
          object.top! += bounds.top + bounds.height - (objectBounds.top + objectBounds.height);
        object.setCoords();
        if (object.objectId) refreshConnectors(object.objectId);
      });
      canvas.requestRenderAll();
      commit("Align");
    },
    [canvas, commit, refreshConnectors]
  );

  const distribute = useCallback(
    (axis: "horizontal" | "vertical") => {
      if (!canvas) return;
      const objects = [...canvas.getActiveObjects()].sort((a, b) =>
        axis === "horizontal"
          ? a.getBoundingRect().left - b.getBoundingRect().left
          : a.getBoundingRect().top - b.getBoundingRect().top
      );
      if (objects.length < 3) return;
      const bounds = objects.map((object) => object.getBoundingRect());
      const first = axis === "horizontal" ? bounds[0].left : bounds[0].top;
      const lastBounds = bounds.at(-1)!;
      const last =
        axis === "horizontal"
          ? lastBounds.left + lastBounds.width
          : lastBounds.top + lastBounds.height;
      const occupied = bounds.reduce(
        (total, item) => total + (axis === "horizontal" ? item.width : item.height),
        0
      );
      const gap = (last - first - occupied) / (objects.length - 1);
      let cursor = first + (axis === "horizontal" ? bounds[0].width : bounds[0].height) + gap;
      objects.slice(1, -1).forEach((object, index) => {
        const objectBounds = bounds[index + 1];
        const current = axis === "horizontal" ? objectBounds.left : objectBounds.top;
        object.set(
          axis === "horizontal" ? "left" : "top",
          (axis === "horizontal" ? (object.left ?? 0) : (object.top ?? 0)) + cursor - current
        );
        object.setCoords();
        if (object.objectId) refreshConnectors(object.objectId);
        cursor += (axis === "horizontal" ? objectBounds.width : objectBounds.height) + gap;
      });
      canvas.requestRenderAll();
      commit("Distribute");
    },
    [canvas, commit, refreshConnectors]
  );

  const flip = useCallback(
    (axis: "x" | "y") => {
      canvas?.getActiveObjects().forEach((object) => {
        object.set(axis === "x" ? "flipX" : "flipY", axis === "x" ? !object.flipX : !object.flipY);
        refreshParentGroups(object);
      });
      canvas?.requestRenderAll();
      commit("Flip");
    },
    [canvas, commit]
  );

  const setObject = useCallback(
    (properties: Record<string, unknown>) => {
      if (!canvas) return;
      const objects = canvas.getActiveObjects();
      objects.forEach((object) => {
        object.set(properties);
        configureTextObject(object);
        if (
          object instanceof Group &&
          ["line", "curved-line", "arrow", "double-arrow", "curved-arrow"].includes(
            object.OpenSketchType ?? ""
          ) &&
          !object.connector
        ) {
          object.getObjects().forEach((part) => {
            if (typeof properties.stroke === "string") {
              part.set("stroke", properties.stroke);
              if (typeof part.fill === "string" && part.fill !== "") {
                part.set("fill", properties.stroke);
              }
            }
            if (typeof properties.strokeWidth === "number") {
              part.set(
                "strokeWidth",
                part instanceof Path
                  ? properties.strokeWidth
                  : Math.max(1, properties.strokeWidth * 0.4)
              );
            }
            if (Array.isArray(properties.strokeDashArray) || properties.strokeDashArray === null) {
              part.set("strokeDashArray", properties.strokeDashArray as number[] | null);
            }
            if (properties.strokeLineCap === "butt" || properties.strokeLineCap === "round") {
              part.set("strokeLineCap", properties.strokeLineCap);
            }
          });
          object.dirty = true;
        }
        object.setCoords();
        refreshParentGroups(object);
      });
      if (objects.some((object) => object.connector)) refreshConnectors();
      objects
        .filter((object) => !object.connector && object.objectId)
        .forEach((object) => refreshConnectors(object.objectId));
      canvas.requestRenderAll();
      setSelection([...canvas.getActiveObjects()]);
      commit("Change properties");
    },
    [canvas, commit, refreshConnectors]
  );

  const saveSelectionStyle = useCallback(() => {
    if (!canvas) return;
    const target = styleTarget(canvas.getActiveObjects()[0]);
    const key = elementStyleKey(target);
    if (!target || !key || canvas.getActiveObjects().length !== 1) return;
    savedElementStyles.current = {
      ...savedElementStyles.current,
      [key]: captureElementStyle(target)
    };
    persistSavedElementStyles(savedElementStyles.current);
    if (target.OpenSketchType === "nih-asset" && target.familyId && target.assetId) {
      saveAssetVariantDefault(target.familyId, target.assetId);
    }
  }, [canvas]);

  const resetSelectionStyle = useCallback(() => {
    if (!canvas) return;
    const selected = canvas.getActiveObjects();
    const objects = [
      ...new Set(selected.map((object) => styleTarget(object)).filter(Boolean))
    ] as FabricObject[];
    let changed = false;
    objects.forEach((object) => {
      const key = elementStyleKey(object);
      if (key && savedElementStyles.current[key]) {
        const remaining = { ...savedElementStyles.current };
        delete remaining[key];
        savedElementStyles.current = remaining;
        persistSavedElementStyles(savedElementStyles.current);
      }
      if (object.defaultElementStyle) {
        if (
          object.OpenSketchType === "nih-asset" ||
          object.OpenSketchType === "import" ||
          object.OpenSketchType === "upload"
        ) {
          restoreOriginalColors(object);
        }
        applyElementStyle(object, object.defaultElementStyle);
        changed = true;
        return;
      }
      const type = object.OpenSketchType ?? "";
      if (object instanceof IText || type === "text") {
        object.set({
          fill: DEFAULT_CREATION_DEFAULTS.text.color,
          fontFamily: DEFAULT_CREATION_DEFAULTS.text.fontFamily,
          fontSize: DEFAULT_CREATION_DEFAULTS.text.fontSize,
          fontWeight: DEFAULT_CREATION_DEFAULTS.text.fontWeight,
          fontStyle: "normal",
          underline: false,
          linethrough: false,
          overline: false,
          charSpacing: 0,
          lineHeight: DEFAULT_TEXT_LINE_HEIGHT,
          textAlign: "left",
          opacity: 1
        });
        changed = true;
      } else if (["line", "curved-line", "arrow", "double-arrow", "curved-arrow"].includes(type)) {
        object.set({
          stroke: DEFAULT_CREATION_DEFAULTS.line.color,
          strokeWidth: DEFAULT_CREATION_DEFAULTS.line.width,
          strokeLineCap: "round",
          opacity: 1
        });
        if (object.connector) {
          object.connector = {
            ...object.connector,
            lineStyle: DEFAULT_CREATION_DEFAULTS.line.lineStyle,
            lineCap: "round",
            startArrowhead:
              type === "double-arrow"
                ? DEFAULT_CREATION_DEFAULTS.line.startArrowhead || "triangle"
                : DEFAULT_CREATION_DEFAULTS.line.startArrowhead,
            endArrowhead: type === "line" ? "none" : DEFAULT_CREATION_DEFAULTS.line.endArrowhead
          };
        }
        if (object instanceof Group) {
          object.getObjects().forEach((part) => {
            part.set({
              stroke: DEFAULT_CREATION_DEFAULTS.line.color,
              strokeWidth:
                part instanceof Path
                  ? DEFAULT_CREATION_DEFAULTS.line.width
                  : Math.max(1, DEFAULT_CREATION_DEFAULTS.line.width * 0.4),
              strokeLineCap: "round"
            });
            if (typeof part.fill === "string" && part.fill !== "") {
              part.set("fill", DEFAULT_CREATION_DEFAULTS.line.color);
            }
          });
          object.dirty = true;
        }
        changed = true;
      } else if (type === "shape") {
        const applyShapeDefaults = (target: FabricObject) => {
          target.set({
            fill: DEFAULT_CREATION_DEFAULTS.shape.fill,
            stroke: DEFAULT_CREATION_DEFAULTS.shape.stroke,
            strokeWidth: DEFAULT_CREATION_DEFAULTS.shape.strokeWidth,
            opacity: 1
          });
          if (target instanceof Group) target.getObjects().forEach(applyShapeDefaults);
        };
        applyShapeDefaults(object);
        changed = true;
      } else if (type === "nih-asset" || type === "import" || type === "upload") {
        restoreOriginalColors(object);
        const restoreOpacity = (target: FabricObject) => {
          target.set("opacity", 1);
          if (target instanceof Group) target.getObjects().forEach(restoreOpacity);
        };
        restoreOpacity(object);
        if (object instanceof FabricImage) {
          object.filters = [];
          object.applyFilters();
        }
        changed = true;
      }
      object.setCoords();
    });
    if (!changed) return;
    if (objects.some((object) => object.connector)) refreshConnectors();
    canvas.requestRenderAll();
    setSelection([...canvas.getActiveObjects()]);
    commit("Reset styling");
  }, [canvas, commit, refreshConnectors]);

  const updateConnector = useCallback(
    (properties: Partial<ConnectorBinding>) => {
      if (!canvas) return;
      const connector = canvas.getActiveObject();
      if (!connector?.connector) return;
      connector.connector = { ...connector.connector, ...properties };
      refreshConnectors();
      setSelection(canvas.getActiveObjects());
      commit("Edit connector");
    },
    [canvas, commit, refreshConnectors]
  );

  const applyTextScript = useCallback(
    (script: "normal" | "subscript" | "superscript") => {
      if (!canvas) return;
      const text = canvas.getActiveObject();
      if (!(text instanceof IText)) return;
      const fontSize = text.fontSize || 40;
      const start = text.selectionStart !== text.selectionEnd ? (text.selectionStart ?? 0) : 0;
      const end =
        text.selectionStart !== text.selectionEnd
          ? (text.selectionEnd ?? text.text.length)
          : text.text.length;
      const style =
        script === "normal"
          ? { fontSize, deltaY: 0 }
          : script === "subscript"
            ? { fontSize: fontSize * 0.66, deltaY: fontSize * 0.28 }
            : { fontSize: fontSize * 0.66, deltaY: -fontSize * 0.34 };
      text.setSelectionStyles(style, start, end);
      text.dirty = true;
      canvas.requestRenderAll();
      setSelection([...canvas.getActiveObjects()]);
      commit(`Apply ${script}`);
    },
    [canvas, commit]
  );

  const applyColorPreset = useCallback(
    (presetId: string) => {
      if (!canvas || selection.length !== 1) return;
      const object = selection[0];
      if (!(object instanceof Group) || !object.familyId) return;
      const preset = ASSET_COLOR_PRESETS.find((item) => item.id === presetId);
      if (!preset) return;
      void trackPendingEditorWork(
        loadAssetManifest()
          .then(({ assetManifest }) => {
            const family = assetManifest.families.find((item) => item.familyId === object.familyId);
            const profile = family ? colorProfileForFamily(family) : undefined;
            if (
              !profile ||
              !canvas ||
              !canvas.getObjects().includes(object) ||
              canvas.getActiveObject() !== object
            ) {
              return;
            }
            const mapping = presetColorMap(originalPaints(object), profile, preset);
            restoreOriginalColors(object);
            applyPresetColors(object, mapping, preset.id);
            canvas.requestRenderAll();
            setSelection([...canvas.getActiveObjects()]);
            commit("Apply color preset");
          })
          .catch(() => undefined)
      );
    },
    [canvas, commit, selection, trackPendingEditorWork]
  );
  const resetColors = useCallback(() => {
    if (!canvas) return;
    canvas.getActiveObjects().forEach((object) => {
      restoreOriginalColors(object);
      const parentAsset = editableAssetParent(object);
      if (parentAsset) parentAsset.dirty = true;
      if (object instanceof FabricImage) {
        object.filters = [];
        object.applyFilters();
      }
    });
    canvas.requestRenderAll();
    commit("Reset colors");
  }, [canvas, commit]);

  const setZoom = useCallback(
    (value: number) => {
      if (!canvas) return;
      const next = Math.max(0.1, Math.min(4, value));
      const settings = latestCanvasSettings.current;
      latestZoom.current = next;
      canvas.setDimensions(zoomedCanvasDimensions(settings.width, settings.height, next));
      canvas.setViewportTransform([next, 0, 0, next, 0, 0]);
      canvas.selectionLineWidth = selectionStrokeWidthAtZoom(next);
      const activeObject = canvas.getActiveObject();
      if (activeObject) configureSelectionControls(activeObject, next);
      canvas.requestRenderAll();
      setZoomState(next);
    },
    [canvas]
  );
  const previewZoom = useCallback(
    (value: number) => {
      if (!canvas) return;
      const next = Math.max(0.1, Math.min(4, value));
      const settings = latestCanvasSettings.current;
      canvas.setDimensions(
        {
          width: Math.max(1, Math.round(settings.width * next)),
          height: Math.max(1, Math.round(settings.height * next))
        },
        { cssOnly: true }
      );
      const stage = canvas.wrapperEl.closest(".artboard-stage") as HTMLElement | null;
      if (stage) {
        stage.style.width = `${Math.max(1, settings.width * next)}px`;
        stage.style.height = `${Math.max(1, settings.height * next)}px`;
      }
    },
    [canvas]
  );
  const fitCanvas = useCallback(() => {
    if (!canvas) return;
    const host = canvas.wrapperEl.closest(".workspace-scroll") as HTMLElement | null;
    if (!host) return;
    const next = Math.min(
      (host.clientWidth - 120) / canvasSettings.width,
      (host.clientHeight - 120) / canvasSettings.height,
      1
    );
    setZoom(next);
    setFitRequest((current) => current + 1);
  }, [canvas, canvasSettings, setZoom]);

  const setCanvasSettings = useCallback(
    (settings: Partial<CanvasSettings>) => {
      const next = { ...latestCanvasSettings.current, ...settings };
      latestCanvasSettings.current = next;
      setCanvasSettingsState(next);
      if (canvas) {
        canvas.setDimensions(zoomedCanvasDimensions(next.width, next.height, zoom));
        canvas.setViewportTransform([zoom, 0, 0, zoom, 0, 0]);
        canvas.backgroundColor = next.transparent ? "" : next.background;
        canvas.requestRenderAll();
        commit("Canvas settings");
      }
    },
    [canvas, commit, zoom]
  );

  const setProjectName = useCallback(
    (name: string) => {
      latestProject.current = {
        ...latestProject.current,
        name: name.trim() || "Untitled figure"
      };
      saveRevision.current += 1;
      const pending = pendingTitlePersistence.current ?? {
        timer: 0,
        complete: beginPendingEditorWork()
      };
      pendingTitlePersistence.current = pending;
      window.clearTimeout(pending.timer);
      pending.timer = window.setTimeout(() => {
        if (pendingTitlePersistence.current !== pending) return;
        pendingTitlePersistence.current = null;
        try {
          persist();
        } finally {
          pending.complete();
        }
      }, TITLE_PERSISTENCE_DELAY_MS);
    },
    [beginPendingEditorWork, persist]
  );
  const setProjectDescription = useCallback(
    (description: string) => {
      latestProject.current = { ...latestProject.current, description };
      setProjectDescriptionState(description);
      persist();
    },
    [persist]
  );

  const exportProject = useCallback(async () => {
    flushPendingTitle();
    await waitForPendingEditorWork();
    const snapshot =
      canvas && canvasReady ? serialize() : JSON.stringify(initialProjectObjects.current);
    const objects = JSON.parse(snapshot) as Record<string, unknown>;
    downloadProject({
      ...latestProject.current,
      updatedAt: new Date().toISOString(),
      canvas: latestCanvasSettings.current,
      objects,
      usedAssetIds: assetIdsFromSnapshot(objects),
      thumbnail: undefined
    });
  }, [canvas, canvasReady, flushPendingTitle, serialize, waitForPendingEditorWork]);

  const buildSvg = useCallback(
    (title = latestProject.current.name, description = latestProject.current.description ?? "") => {
      if (!canvas) throw new Error("The figure canvas is not ready.");
      refreshTextMetrics(canvas.getObjects());
      let svg = withLogicalViewport(canvas, canvasSettings, () =>
        canvas.toSVG({
          suppressPreamble: false,
          width: `${canvasSettings.width}`,
          height: `${canvasSettings.height}`,
          viewBox: { x: 0, y: 0, width: canvasSettings.width, height: canvasSettings.height }
        })
      );
      const provenance = collectProvenanceManifest(canvas.getObjects());
      const metadata = `<metadata>${escapeXml(
        JSON.stringify({
          generator: "OpenSketch",
          formatVersion: 1,
          title,
          description,
          credit: GLOBAL_CREDIT,
          provenance,
          // Retain the original field for consumers of the initial export
          // metadata shape while making the versioned manifest canonical.
          usedAssets: provenance.assets
        })
      )}</metadata><title>${escapeXml(title)}</title>${
        description ? `<desc>${escapeXml(description)}</desc>` : ""
      }`;
      svg = svg.replace(/(<svg[^>]*>)/, `$1${metadata}`);
      return svg;
    },
    [canvas, canvasSettings]
  );

  const exportSvg = useCallback(
    (title = latestProject.current.name, description = latestProject.current.description ?? "") => {
      const svg = buildSvg(title, description);
      downloadBlob(new Blob([svg], { type: "image/svg+xml" }), `${safeFilename(title)}.svg`);
    },
    [buildSvg]
  );

  const exportPdf = useCallback(
    async (
      title = latestProject.current.name,
      description = latestProject.current.description ?? ""
    ) => {
      if (!canvas) throw new Error("The figure canvas is not ready.");
      await waitForPendingEditorWork();
      await waitForCanvasTextFonts(canvas.getObjects());
      const svg = buildSvg(title, description);
      const blob = await svgToPdfBlob(svg, canvasSettings.width, canvasSettings.height, {
        title,
        description,
        credit: GLOBAL_CREDIT,
        provenance: collectProvenanceManifest(canvas.getObjects())
      });
      downloadBlob(blob, `${safeFilename(title)}.pdf`);
    },
    [buildSvg, canvas, canvasSettings.height, canvasSettings.width, waitForPendingEditorWork]
  );

  const exportCredits = useCallback(
    (title = latestProject.current.name, description = latestProject.current.description ?? "") => {
      if (!canvas) throw new Error("The figure canvas is not ready.");
      const credits = formatProvenanceCredits(
        collectProvenanceManifest(canvas.getObjects()),
        title,
        description,
        GLOBAL_CREDIT
      );
      downloadBlob(
        new Blob([credits], { type: "text/plain;charset=utf-8" }),
        `${safeFilename(title)}-credits.txt`
      );
    },
    [canvas]
  );

  const exportPng = useCallback(
    async (transparent: boolean, dpi: number, background = canvasSettings.background) => {
      if (!canvas) return;
      const resource = calculatePngExportResource(
        canvasSettings.width,
        canvasSettings.height,
        canvasSettings.dpi,
        dpi
      );
      const previous = canvas.backgroundColor;
      canvas.backgroundColor = transparent ? "" : background;
      let dataUrl: string;
      try {
        dataUrl = withLogicalViewport(canvas, canvasSettings, () =>
          canvas.toDataURL({
            format: "png",
            multiplier: resource.scale,
            enableRetinaScaling: false
          })
        );
      } finally {
        canvas.backgroundColor = previous;
        canvas.requestRenderAll();
      }
      const response = await fetch(dataUrl);
      const blob = await setPngDpi(await response.blob(), dpi, {
        provenance: collectProvenanceManifest(canvas.getObjects())
      });
      downloadBlob(blob, `${safeFilename(latestProject.current.name)}-${dpi}dpi.png`);
    },
    [canvas, canvasSettings]
  );

  semanticExportSvgRef.current = exportSvg;
  semanticExportCreditsRef.current = exportCredits;
  semanticExportPdfRef.current = exportPdf;
  semanticExportPngRef.current = exportPng;

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (!canvas) return;
      const activeObject = canvas.getActiveObject();
      if (activeObject instanceof IText && activeObject.isEditing) return;
      const data = event.clipboardData;
      if (!data) return;
      const targetIsTextInput =
        event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
      if (!targetIsTextInput && clipboardContainsSelectionMarker(data, clipboardMarker.current)) {
        event.preventDefault();
        void pasteSelection();
        return;
      }
      const media = importedMediaFilesFromClipboard(data);
      if (media.length > 0) {
        event.preventDefault();
        clipboard.current = [];
        clipboardMarker.current = undefined;
        media.forEach((file, index) => {
          const offset = Math.min(index, 8) * 24;
          void importMedia(file, {
            x: canvasSettings.width / 2 + offset,
            y: canvasSettings.height / 2 + offset
          });
        });
        return;
      }
      if (targetIsTextInput) return;
      if (clipboard.current.length > 0) {
        event.preventDefault();
        void pasteSelection();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        !canvas ||
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      const activeObject = canvas.getActiveObject();
      if (activeObject instanceof IText && activeObject.isEditing) return;
      const modifier = event.metaKey || event.ctrlKey;
      const nativeSelection = window.getSelection();
      const hasSelectedPageText =
        Boolean(nativeSelection && !nativeSelection.isCollapsed) &&
        Boolean(nativeSelection?.toString().trim());
      if (modifier && ["c", "x"].includes(event.key.toLowerCase()) && hasSelectedPageText) {
        return;
      }
      if (modifier && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          void redo().catch((reason) => console.error("Could not redo editor change.", reason));
        } else {
          void undo().catch((reason) => console.error("Could not undo editor change.", reason));
        }
      } else if (modifier && event.key.toLowerCase() === "d") {
        event.preventDefault();
        void duplicateSelection();
      } else if (modifier && event.key.toLowerCase() === "c") {
        event.preventDefault();
        void copySelectionToClipboard("png");
      } else if (modifier && event.key.toLowerCase() === "x") {
        event.preventDefault();
        void copySelectionToClipboard("png", true);
      } else if (
        modifier &&
        event.key.toLowerCase() === "v" &&
        (pendingClipboardCopy.current || clipboard.current.length > 0)
      ) {
        event.preventDefault();
        void pasteSelection();
      } else if (modifier && event.key.toLowerCase() === "a") {
        event.preventDefault();
        const objects = canvas.getObjects().filter((object) => object.visible !== false);
        if (objects.length) {
          canvas.setActiveObject(new ActiveSelection(objects, { canvas }));
          setSelection(objects);
          canvas.requestRenderAll();
        }
      } else if (modifier && ["+", "="].includes(event.key)) {
        event.preventDefault();
        setZoom(zoom + 0.1);
      } else if (modifier && event.key === "-") {
        event.preventDefault();
        setZoom(zoom - 0.1);
      } else if (modifier && event.key === "0") {
        event.preventDefault();
        fitCanvas();
      } else if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        deleteSelection();
      } else if (event.key === "Escape") {
        const groupPath = editingGroupPathRef.current;
        if (groupPath.length > 0) {
          event.preventDefault();
          const rootGroup = groupPath[0];
          setEditingGroupPath([]);
          if (isAtomicSvgAsset(rootGroup)) configureAtomicSvgAsset(rootGroup);
          modifierDeepSelection.current = undefined;
          deepSelectionCycle.current = undefined;
          canvas.discardActiveObject();
          configureSelectionControls(rootGroup, latestZoom.current);
          canvas.setActiveObject(rootGroup);
          setSelection([rootGroup]);
          canvas.requestRenderAll();
          return;
        }
        if (creationTool) {
          event.preventDefault();
          setCreationTool(null);
          return;
        }
        const parentAsset = editableAssetParent(canvas.getActiveObject());
        if (parentAsset) {
          event.preventDefault();
          canvas.setActiveObject(parentAsset);
          setSelection([parentAsset]);
          canvas.requestRenderAll();
        } else if (canvas.getActiveObjects().length > 0) {
          event.preventDefault();
          canvas.discardActiveObject();
          setSelection([]);
          canvas.requestRenderAll();
        } else {
          event.preventDefault();
          requestExit();
        }
      } else if (event.key.startsWith("Arrow")) {
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        canvas.getActiveObjects().forEach((object) => {
          if (event.key === "ArrowLeft") object.left! -= step;
          if (event.key === "ArrowRight") object.left! += step;
          if (event.key === "ArrowUp") object.top! -= step;
          if (event.key === "ArrowDown") object.top! += step;
          object.setCoords();
          refreshParentGroups(object);
          if (object.objectId) refreshConnectors(object.objectId);
        });
        canvas.requestRenderAll();
      } else if (modifier && event.key.toLowerCase() === "g") {
        event.preventDefault();
        if (event.shiftKey) ungroupSelection();
        else groupSelection();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const activeObject = canvas?.getActiveObject();
      if (activeObject instanceof IText && activeObject.isEditing) return;
      if (event.key.startsWith("Arrow")) commit("Nudge");
    };
    window.addEventListener("paste", onPaste);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [
    canvas,
    canvasSettings.height,
    canvasSettings.width,
    beginPendingEditorWork,
    commit,
    copySelectionToClipboard,
    creationTool,
    deleteSelection,
    duplicateSelection,
    fitCanvas,
    groupSelection,
    importMedia,
    pasteSelection,
    redo,
    requestExit,
    refreshConnectors,
    selectParentAsset,
    setEditingGroupPath,
    setZoom,
    undo,
    ungroupSelection,
    zoom
  ]);

  const value = useMemo<EditorContextValue>(
    () => ({
      projectId: project.id,
      canvas,
      canvasReady,
      selection,
      editingGroup,
      zoom,
      historyState,
      canvasSettings,
      alignmentEnabled,
      autoEditEnabled,
      projectDescription,
      setCanvasElement,
      setCanvasSettings,
      setAlignmentEnabled,
      setAutoEditEnabled,
      setProjectName,
      setProjectDescription,
      selectParentAsset,
      closeGroupEdit,
      saveState,
      retrySave,
      flushSave,
      exportProject,
      creationTool,
      creationDefaults,
      setCreationTool,
      setCreationDefaults,
      placeCreationTool,
      placeCreation,
      addAsset,
      addTemplate,
      setAssetVariant,
      addImportedMedia,
      importMedia,
      deleteSelection,
      duplicateSelection,
      saveSelectionAsTemplate,
      copySelectionToClipboard,
      pasteSelection,
      groupSelection,
      ungroupSelection,
      arrange,
      align,
      distribute,
      flip,
      setObject,
      saveSelectionStyle,
      resetSelectionStyle,
      updateConnector,
      applyTextScript,
      resetColors,
      applyColorPreset,
      undo,
      redo,
      setZoom,
      previewZoom,
      fitCanvas,
      fitRequest,
      exportSvg,
      exportCredits,
      exportPdf,
      exportPng,
      commit,
      semanticRuntime
    }),
    [
      addAsset,
      addTemplate,
      addImportedMedia,
      setAssetVariant,
      creationDefaults,
      creationTool,
      importMedia,
      align,
      applyTextScript,
      arrange,
      canvas,
      canvasReady,
      canvasSettings,
      alignmentEnabled,
      autoEditEnabled,
      commit,
      copySelectionToClipboard,
      pasteSelection,
      deleteSelection,
      distribute,
      duplicateSelection,
      saveSelectionAsTemplate,
      exportPng,
      exportPdf,
      exportSvg,
      exportCredits,
      fitCanvas,
      fitRequest,
      flip,
      applyColorPreset,
      groupSelection,
      historyState,
      editingGroup,
      projectDescription,
      project.id,
      previewZoom,
      placeCreationTool,
      placeCreation,
      redo,
      resetColors,
      selection,
      setAlignmentEnabled,
      setAutoEditEnabled,
      setCanvasElement,
      setCanvasSettings,
      setCreationDefaults,
      setObject,
      saveSelectionStyle,
      resetSelectionStyle,
      setProjectName,
      setProjectDescription,
      selectParentAsset,
      closeGroupEdit,
      saveState,
      retrySave,
      flushSave,
      exportProject,
      setZoom,
      undo,
      ungroupSelection,
      updateConnector,
      zoom,
      semanticRuntime
    ]
  );
  const store = editorStore.current;
  store.setSnapshot(value);
  useLayoutEffect(() => {
    store.publish();
  }, [store, value]);
  return (
    <EditorSnapshotProvider store={store}>
      <EditorContext.Provider value={value}>{children}</EditorContext.Provider>
    </EditorSnapshotProvider>
  );
}

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (character) => {
    const values: Record<string, string> = {
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      "'": "&apos;",
      '"': "&quot;"
    };
    return values[character];
  });
}

export function useEditor(): EditorContextValue {
  const value = useContext(EditorContext);
  if (!value) throw new Error("useEditor must be used inside EditorProvider.");
  return value;
}
