import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import {
  ActiveSelection,
  Canvas,
  Circle,
  FabricImage,
  FabricObject,
  Gradient,
  Group,
  IText,
  Line,
  Path,
  Point as FabricPoint,
  Polygon,
  Rect,
  Textbox,
  Triangle,
  cache,
  util
} from "fabric";
import type {
  AssetFamily,
  AssetVariant,
  CanvasSettings,
  ConnectorBinding,
  ProjectRecord,
  ImportedMediaRecord
} from "@workspace/editor-core";
import { sanitizeImportedSvg } from "@/assets/browserSanitizer";
import { setPngDpi } from "@/export/png";
import { svgToPdfBlob } from "@/export/pdf";
import { downloadBlob, safeFilename } from "@/persistence/portable";
import { createVectorThumbnail } from "@/persistence/projectThumbnail";
import { GLOBAL_CREDIT } from "@/assets/credit";
import {
  connectorAppearance,
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
  configureSelectionControls,
  nextDeepSelection,
  SELECTION_STROKE_WIDTH_PX,
  selectionStrokeWidthAtZoom
} from "@/editor/selection";
import { CURSOR_GRAB, CURSOR_GRABBING } from "@/editor/cursors";
import { assetInsertionScale } from "@/editor/assetInsertion";
import { copySvgBlendModes, loadEditableSvg } from "@/editor/svg";
import { zoomedCanvasDimensions } from "@/editor/zoom";
import {
  applyElementStyle,
  captureElementStyle,
  elementStyleKey,
  loadSavedElementStyles,
  persistSavedElementStyles,
  styleTarget
} from "@/editor/elementStyles";
import {
  consumeRecognizedGroup,
  findRecognizedGroup,
  rememberRecognizedGroup,
  type RecognizedGroup
} from "@/editor/groupRecognition";
import {
  SELECTION_CLIPBOARD_MARKER_PREFIX,
  type SelectionClipboardFormat,
  writeSelectionToSystemClipboard
} from "@/editor/selectionClipboard";
import {
  clipboardContainsSelectionMarker,
  importedMediaFileFromClipboard
} from "@/editor/clipboardImport";
import {
  rememberProjectImports,
  saveImportedMedia as saveImportedMediaToLibrary
} from "@/persistence/database";
import { assetManifest } from "@/assets/manifest";
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
const svgStringCache = new Map<string, string>();
const bundledVariants = new Map(
  assetManifest.families.flatMap((family) =>
    family.variants.map((variant) => [variant.id, variant] as const)
  )
);
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

async function bundledSvgSource(assetId: string): Promise<string | null> {
  const cached = svgStringCache.get(assetId);
  if (cached) {
    cacheSvg(assetId, cached);
    return cached;
  }
  const variant = bundledVariants.get(assetId);
  if (!variant) return null;
  const response = await fetch(variant.assetPath);
  if (!response.ok) return null;
  const source = await response.text();
  cacheSvg(assetId, source);
  return source;
}

async function createBundledAssetGroup(family: AssetFamily, variant: AssetVariant): Promise<Group> {
  const source = await bundledSvgSource(variant.id);
  if (!source) throw new Error(`Could not load ${family.title}.`);
  const result = await loadEditableSvg(source);
  const objects = result.objects.filter((object): object is FabricObject => Boolean(object));
  const group = groupSvgElements(objects, result.options);
  group.assetId = variant.id;
  group.familyId = family.familyId;
  group.provenance = {
    nihSourcePage: family.nihSourcePage,
    commonsPage: family.commonsPage,
    author: family.author,
    license: family.license
  };
  group.originalPalette = Object.fromEntries(
    paletteFromObject(group).map((color) => [color, color])
  );
  rememberOriginalColors(group);
  configureEditableSvgParts(group);
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

interface EditorContextValue {
  projectId: string;
  canvas: Canvas | null;
  canvasReady: boolean;
  selection: FabricObject[];
  editingGroup: Group | null;
  zoom: number;
  historyState: { canUndo: boolean; canRedo: boolean };
  canvasSettings: CanvasSettings;
  alignmentEnabled: boolean;
  projectDescription: string;
  setCanvasElement: (element: HTMLCanvasElement | null) => void;
  setCanvasSettings: (settings: Partial<CanvasSettings>) => void;
  setAlignmentEnabled: (enabled: boolean) => void;
  setProjectName: (name: string) => void;
  setProjectDescription: (description: string) => void;
  selectParentAsset: () => void;
  closeGroupEdit: () => void;
  flushSave: () => Promise<void>;
  creationTool: CreationTool | null;
  creationDefaults: CreationDefaults;
  setCreationTool: (tool: CreationTool | null) => void;
  setCreationDefaults: (
    defaults: CreationDefaults | ((current: CreationDefaults) => CreationDefaults)
  ) => void;
  placeCreation: (point: Point, endPoint?: Point) => void;
  addAsset: (family: AssetFamily, variant: AssetVariant, point?: Point) => Promise<void>;
  setAssetVariant: (variantId: string) => Promise<void>;
  addImportedMedia: (media: ImportedMediaRecord, point?: Point) => Promise<void>;
  importMedia: (file: File, point?: Point) => Promise<ImportedMediaRecord>;
  deleteSelection: () => void;
  duplicateSelection: () => Promise<void>;
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
  undo: () => void;
  redo: () => void;
  setZoom: (value: number) => void;
  previewZoom: (value: number) => void;
  fitCanvas: () => void;
  fitRequest: number;
  exportSvg: (title?: string, description?: string) => void;
  exportPdf: (title?: string, description?: string) => Promise<void>;
  exportPng: (
    scale: number,
    transparent: boolean,
    dpi: number,
    background?: string
  ) => Promise<void>;
  commit: (label?: string) => void;
}

const EditorContext = createContext<EditorContextValue | null>(null);

function assignIdentity(object: FabricObject, name: string, type: string): void {
  object.objectId ??= crypto.randomUUID();
  object.name ??= name;
  object.OpenSketchType ??= type;
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

function directNestedParent(object: FabricObject | undefined): Group | null {
  const parent = object?.parent ?? object?.group;
  return parent instanceof Group && !(parent instanceof ActiveSelection) ? parent : null;
}

function configureEditableSvgParts(object: FabricObject): void {
  if (!(object instanceof Group)) return;
  object.subTargetCheck = true;
  object.interactive = false;
  object.getObjects().forEach((part, index) => {
    const typeName = part.type.charAt(0).toUpperCase() + part.type.slice(1);
    assignIdentity(part, `${typeName} ${index + 1}`, "svg-part");
    part.hoverCursor = "crosshair";
    part.perPixelTargetFind = true;
    if (part instanceof Group) configureEditableSvgParts(part);
  });
  object.setCoords();
}

function configureNestedSelection(object: FabricObject): void {
  if (!(object instanceof Group) || object instanceof ActiveSelection) return;
  object.subTargetCheck = true;
  object.interactive = false;
  object.getObjects().forEach(configureNestedSelection);
  object.setCoords();
}

function configureCanvasAssets(objects: FabricObject[]): void {
  objects.forEach((object) => {
    if (object.OpenSketchType === "upload") object.OpenSketchType = "import";
    if (object.connector && object instanceof Group) {
      normalizeConnectorHeadOffsets(object);
      const centerline = object.getObjects()[0];
      centerline?.set({
        strokeLineCap: connectorStrokeLineCap(
          object.connector.startArrowhead,
          object.connector.endArrowhead
        )
      });
      object.dirty = true;
    }
    if (
      object.OpenSketchType === "nih-asset" ||
      object.OpenSketchType === "import" ||
      object.OpenSketchType === "upload"
    ) {
      configureEditableSvgParts(object);
    } else if (object instanceof Group) {
      configureNestedSelection(object);
      configureCanvasAssets(object.getObjects());
    }
  });
}

function assignFreshCloneIds(object: FabricObject): void {
  object.objectId = crypto.randomUUID();
  if (object instanceof Group) object.getObjects().forEach(assignFreshCloneIds);
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

function deepHitObjects(
  canvas: Canvas,
  point: FabricPoint,
  activeObject?: FabricObject
): FabricObject[] {
  const topLevelHits = hitObjectsAtLevel(canvas, canvas.getObjects(), point);
  if (!activeObject || activeObject instanceof ActiveSelection) return topLevelHits;

  if (activeObject instanceof Group) {
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

function refreshTextMetrics(objects: FabricObject[]): void {
  cache.clearFontCache();
  const visit = (object: FabricObject) => {
    if (object instanceof IText) {
      object.initDimensions();
      object.dirty = true;
      object.setCoords();
    }
    if (object instanceof Group) object.getObjects().forEach(visit);
  };
  objects.forEach(visit);
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

function createArrowPath(doubleHeaded = false, curved = false): FabricObject {
  const data = curved
    ? "M 0 60 Q 90 -20 180 60 M 165 45 L 180 60 L 160 66"
    : doubleHeaded
      ? "M 0 40 L 180 40 M 15 25 L 0 40 L 15 55 M 165 25 L 180 40 L 165 55"
      : "M 0 40 L 180 40 M 165 25 L 180 40 L 165 55";
  return new Path(data, {
    fill: "",
    stroke: "#25494b",
    strokeWidth: 5,
    strokeLineCap: "round",
    strokeLineJoin: "round"
  });
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
  children
}: {
  project: ProjectRecord;
  onProjectChange: (project: ProjectRecord) => Promise<void>;
  children: ReactNode;
}) {
  const [canvas, setCanvas] = useState<Canvas | null>(null);
  const [canvasReady, setCanvasReady] = useState(false);
  const [selection, setSelection] = useState<FabricObject[]>([]);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const editingGroupRef = useRef<Group | null>(null);
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
  const setAlignmentEnabled = useCallback((enabled: boolean) => {
    setAlignmentEnabledState(enabled);
    try {
      localStorage.setItem("OpenSketch:alignment-enabled", String(enabled));
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
  const clipboardMarker = useRef<string | undefined>(undefined);
  const savedElementStyles = useRef(loadSavedElementStyles());
  const pendingSnapshot = useRef<{ snapshot: string; revision: number } | undefined>(undefined);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const saveRevision = useRef(0);
  const savedRevision = useRef(0);
  const lastSaveError = useRef<unknown>(undefined);
  const assetInsertQueue = useRef<Promise<void>>(Promise.resolve());
  const importQueue = useRef<Promise<void>>(Promise.resolve());
  const latestProject = useRef(project);
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
      }
    | undefined
  >(undefined);
  const createPointText = useRef<(point: Point) => void>(() => undefined);

  useEffect(() => {
    void rememberProjectImports(
      initialProjectImports.current.imports,
      initialProjectImports.current.updatedAt
    );
  }, []);

  const refreshConnectors = useCallback(
    (changedObjectId?: string) => {
      if (!canvas) return;
      const objects = canvas.getObjects();
      const byId = new Map(
        objects
          .filter((object) => Boolean(object.objectId))
          .map((object) => [object.objectId as string, object])
      );
      for (const connector of [...objects]) {
        const binding = connector.connector;
        if (
          !binding ||
          (changedObjectId &&
            binding.fromObjectId !== changedObjectId &&
            binding.toObjectId !== changedObjectId)
        ) {
          continue;
        }
        const fromObject = byId.get(binding.fromObjectId);
        const toObject = byId.get(binding.toObjectId);
        if (!fromObject || !toObject) continue;
        const obstacles = objects
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
        replacement.visible = connector.visible;
        replacement.selectable = connector.selectable;
        replacement.evented = connector.evented;
        const index = canvas.getObjects().indexOf(connector);
        const active = canvas.getActiveObject() === connector;
        canvas.remove(connector);
        canvas.insertAt(index, replacement);
        if (active) canvas.setActiveObject(replacement);
        byId.set(replacement.objectId!, replacement);
      }
      canvas.requestRenderAll();
    },
    [canvas]
  );

  const serialize = useCallback(() => {
    if (!canvas) return JSON.stringify(latestProject.current.objects);
    refreshTextMetrics(canvas.getObjects());
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
        latestProject.current = next;
        savedRevision.current = Math.max(savedRevision.current, revision);
        lastSaveError.current = undefined;
      } catch (reason) {
        lastSaveError.current = reason;
        throw reason;
      }
    },
    [onProjectChange]
  );

  const refreshThumbnail = useCallback(async () => {
    if (!canvas) return;
    try {
      const thumbnail = createVectorThumbnail(
        canvas,
        latestCanvasSettings.current,
        latestProject.current.updatedAt
      );
      const next = { ...latestProject.current, thumbnail };
      await onProjectChange(next);
      latestProject.current = next;
    } catch (reason) {
      // A preview is derived and optional. Never discard or block navigation
      // after the actual project snapshot has already been saved.
      console.warn("Project preview could not be refreshed; project data is saved.", reason);
    }
  }, [canvas, onProjectChange]);

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

  const flushSave = useCallback(async () => {
    // A toolbar click can follow a library click before its SVG has finished
    // parsing. Treat that insertion as part of the action being flushed.
    await Promise.all([assetInsertQueue.current, importQueue.current]);
    await saveQueue.current;
    if (pendingSnapshot.current) {
      await enqueuePendingSave().catch(() => undefined);
      await saveQueue.current;
    }
    if (savedRevision.current < saveRevision.current && lastSaveError.current) {
      throw lastSaveError.current;
    }
    await refreshThumbnail();
  }, [enqueuePendingSave, refreshThumbnail]);

  const persist = useCallback(
    (snapshot?: string) => {
      if (!canvas) return;
      const revision = saveRevision.current + 1;
      saveRevision.current = revision;
      pendingSnapshot.current = { snapshot: snapshot ?? serialize(), revision };
      void enqueuePendingSave().catch(() => undefined);
    },
    [canvas, enqueuePendingSave, serialize]
  );

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
    },
    [canvas, persist, serialize, updateHistoryState]
  );

  const setCanvasElement = useCallback(
    (element: HTMLCanvasElement | null) => {
      if (!element || element === canvasElement.current) return;
      canvasElement.current = element;
      const instance = new Canvas(element, {
        preserveObjectStacking: true,
        hoverCursor: CURSOR_GRAB,
        moveCursor: CURSOR_GRABBING,
        selectionColor: "rgba(18, 178, 175, 0.12)",
        selectionBorderColor: "#12b2af",
        selectionLineWidth: SELECTION_STROKE_WIDTH_PX
      });
      instance.setDimensions({ width: project.canvas.width, height: project.canvas.height });
      instance.backgroundColor = project.canvas.transparent ? "" : project.canvas.background;
      setCanvasReady(false);
      instance.loadFromJSON(project.objects).then(async () => {
        await restoreBundledSvgBlendModes(instance.getObjects());
        instance.getObjects().forEach((object) => {
          assignIdentity(
            object,
            object.name ?? "Untitled layer",
            object.OpenSketchType ?? object.type
          );
        });
        configureCanvasAssets(instance.getObjects());
        instance.requestRenderAll();
        const initial = JSON.stringify(instance.toJSON());
        history.current = [initial];
        historyIndex.current = 0;
        updateHistoryState();
        setCanvasReady(true);
      });
      setCanvas(instance);
    },
    [project, updateHistoryState]
  );

  useEffect(() => {
    if (!canvas) return;
    const select = () => {
      const activeObject = canvas.getActiveObject();
      if (activeObject) configureSelectionControls(activeObject, latestZoom.current);
      setSelection(canvas.getActiveObjects());
      canvas.requestRenderAll();
    };
    const selectDeeperObject = ({
      e,
      scenePoint
    }: {
      e: MouseEvent | PointerEvent | TouchEvent;
      scenePoint?: FabricPoint;
    }) => {
      if (!scenePoint) return;
      const currentEditingGroup = editingGroupRef.current;
      if (currentEditingGroup) {
        const nestedGroup = hitObjectsAtLevel(
          canvas,
          currentEditingGroup.getObjects(),
          scenePoint
        ).find(
          (object): object is Group =>
            object instanceof Group && !(object instanceof ActiveSelection)
        );
        if (!nestedGroup) return;
        editingGroupRef.current = nestedGroup;
        setEditingGroup(nestedGroup);
        canvas.discardActiveObject();
        setSelection([]);
        modifierDeepSelection.current = undefined;
        deepSelectionCycle.current = undefined;
        canvas.requestRenderAll();
        return;
      }
      const group = hitObjectsAtLevel(canvas, canvas.getObjects(), scenePoint).find(
        (object): object is Group =>
          object instanceof Group && !(object instanceof ActiveSelection)
      );
      if (group) {
        editingGroupRef.current = group;
        setEditingGroup(group);
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
        const selected = hitObjectsAtLevel(
          canvas,
          currentEditingGroup.getObjects(),
          scenePoint
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
        const objects =
          addsToSelection
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
        clones.forEach((clone, index) => {
          assignFreshCloneIds(clone);
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
      session.pendingAdd = addDragDuplicate(session);
      canvas.requestRenderAll();
    };
    const restoreDragDuplicateOpacity = (session: NonNullable<typeof dragDuplicate.current>) => {
      session.target.set("opacity", session.originalOpacity);
      session.target.dirty = true;
    };
    const modified = ({ target }: { target?: FabricObject } = {}) => {
      const changed = target ?? canvas.getActiveObject();
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
        if (changed?.objectId) refreshConnectors(changed.objectId);
        canvas.requestRenderAll();
        commit(duplicateSession ? "Duplicate drag" : "Transform");
      };
      const finishAfterFonts = () => {
        if (!(changed instanceof IText) || !("fonts" in document)) {
          finish();
          return;
        }
        const weight = String(changed.fontWeight ?? 400);
        const family = changed.fontFamily
          .split(",")[0]
          .trim()
          .replace(/^['"]|['"]$/g, "");
        void document.fonts
          .load(`${weight} ${changed.fontSize ?? 54}px "${family}"`)
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
      if (!alignmentEnabled || (e && "altKey" in e && e.altKey)) {
        snapSession.current = { target };
        guides.current = {};
        refreshConnectors(target.objectId);
        canvas.requestRenderAll();
        rememberNestedPosition();
        return;
      }
      const zoom = Math.max(latestZoom.current, 0.1);
      const result = snapBounds(
        target.getBoundingRect(),
        canvas
          .getObjects()
          .filter(
            (candidate) =>
              candidate !== target && !candidate.connector && candidate.visible !== false
          )
          .map((candidate) => candidate.getBoundingRect()),
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
      refreshConnectors(target.objectId);
      canvas.requestRenderAll();
      rememberNestedPosition();
    };
    const transform = ({ target }: { target?: FabricObject }) => {
      if (!target) return;
      configureSelectionControls(target, latestZoom.current);
      if (target.objectId) refreshConnectors(target.objectId);
    };
    const clearGuides = () => {
      snapSession.current = {};
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
      const group = editingGroupRef.current;
      if (!group) return;
      const bounds = group.getBoundingRect();
      const viewport = canvas.viewportTransform;
      const left = bounds.left * viewport[0] + viewport[4];
      const top = bounds.top * viewport[3] + viewport[5];
      const width = bounds.width * viewport[0];
      const height = bounds.height * viewport[3];
      const padding = 48;
      const focusLeft = Math.max(0, left - padding);
      const focusTop = Math.max(0, top - padding);
      const focusRight = Math.min(canvas.width, left + width + padding);
      const focusBottom = Math.min(canvas.height, top + height + padding);
      context.save();
      context.fillStyle = "rgba(247, 248, 245, 0.68)";
      context.fillRect(0, 0, canvas.width, focusTop);
      context.fillRect(0, focusBottom, canvas.width, canvas.height - focusBottom);
      context.fillRect(0, focusTop, focusLeft, focusBottom - focusTop);
      context.fillRect(
        focusRight,
        focusTop,
        canvas.width - focusRight,
        focusBottom - focusTop
      );
      context.restore();
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
      canvas.upperCanvasEl.removeEventListener("mousedown", preserveDeepSelectionForDrag, true);
      canvas.upperCanvasEl.removeEventListener("contextmenu", suppressModifierContextMenu, true);
      void enqueuePendingSave();
      setCanvasReady(false);
      canvas.dispose();
      setCanvas(null);
    };
  }, [alignmentEnabled, canvas, commit, enqueuePendingSave, refreshConnectors]);

  const restoreAt = useCallback(
    async (index: number) => {
      if (!canvas || !history.current[index]) return;
      restoring.current = true;
      await canvas.loadFromJSON(history.current[index]);
      configureCanvasAssets(canvas.getObjects());
      refreshConnectors();
      canvas.requestRenderAll();
      historyIndex.current = index;
      setSelection([]);
      updateHistoryState();
      restoring.current = false;
      persist(history.current[index]);
    },
    [canvas, persist, refreshConnectors, updateHistoryState]
  );

  const undo = useCallback(() => {
    if (historyIndex.current > 0) void restoreAt(historyIndex.current - 1);
  }, [restoreAt]);
  const redo = useCallback(() => {
    if (historyIndex.current < history.current.length - 1) {
      void restoreAt(historyIndex.current + 1);
    }
  }, [restoreAt]);

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
    object.defaultElementStyle ??= captureElementStyle(object);
    applyElementStyle(object, savedElementStyles.current[elementStyleKey(object) ?? ""]);
  }, []);

  const addObject = useCallback(
    (object: FabricObject, name: string, type: string, point?: Point) => {
      if (!canvas) return;
      assignIdentity(object, name, type);
      prepareElementStyle(object);
      centerObject(object, point);
      canvas.add(object);
      canvas.setActiveObject(object);
      canvas.requestRenderAll();
      setSelection([object]);
      commit(`Add ${name}`);
    },
    [canvas, centerObject, commit, prepareElementStyle]
  );

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
        lineHeight: 1.2
      };
      const object =
        kind === "box"
          ? new Textbox("Text box", { ...options, width: 420 })
          : new IText("Text", options);
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
    (kind: ShapeKind, point?: Point, connectorPreset?: ConnectorCreationPreset) => {
      if (
        kind !== "curved-line" &&
        ["line", "arrow", "double-arrow", "curved-arrow"].includes(kind) &&
        addAttachedConnector(
          kind as "line" | "arrow" | "double-arrow" | "curved-arrow",
          connectorPreset
        )
      ) {
        return;
      }
      const common = { ...creationDefaults.shape };
      let object: FabricObject;
      if (kind === "rectangle" || kind === "rounded-rectangle") {
        object = new Rect({
          ...common,
          width: 280,
          height: 170,
          rx: kind === "rounded-rectangle" ? 28 : 0,
          ry: kind === "rounded-rectangle" ? 28 : 0
        });
      } else if (kind === "circle") {
        object = new Circle({ ...common, radius: 95 });
      } else if (kind === "ellipse") {
        object = new Circle({ ...common, radius: 100, scaleX: 1.5, scaleY: 0.85 });
      } else if (kind === "pill") {
        object = new Rect({ ...common, width: 280, height: 120, rx: 60, ry: 60 });
      } else if (kind === "donut") {
        object = new Path("M 100 0 A 100 100 0 1 1 99.9 0 M 100 42 A 58 58 0 1 0 100.1 42 Z", {
          ...common,
          fillRule: "evenodd"
        });
      } else if (kind === "triangle") {
        object = new Triangle({ ...common, width: 210, height: 190 });
      } else if (kind === "right-triangle") {
        object = new Polygon(
          [
            { x: 0, y: 0 },
            { x: 0, y: 190 },
            { x: 220, y: 190 }
          ],
          common
        );
      } else if (kind === "pentagon") {
        object = new Polygon(
          [
            { x: 100, y: 0 },
            { x: 195, y: 69 },
            { x: 159, y: 181 },
            { x: 41, y: 181 },
            { x: 5, y: 69 }
          ],
          common
        );
      } else if (kind === "polygon") {
        object = new Polygon(
          [
            { x: 50, y: 0 },
            { x: 150, y: 0 },
            { x: 200, y: 86 },
            { x: 150, y: 172 },
            { x: 50, y: 172 },
            { x: 0, y: 86 }
          ],
          common
        );
      } else if (kind === "octagon") {
        object = new Polygon(
          [
            { x: 60, y: 0 },
            { x: 160, y: 0 },
            { x: 220, y: 60 },
            { x: 220, y: 160 },
            { x: 160, y: 220 },
            { x: 60, y: 220 },
            { x: 0, y: 160 },
            { x: 0, y: 60 }
          ],
          common
        );
      } else if (kind === "diamond") {
        object = new Polygon(
          [
            { x: 110, y: 0 },
            { x: 220, y: 90 },
            { x: 110, y: 180 },
            { x: 0, y: 90 }
          ],
          common
        );
      } else if (kind === "trapezoid") {
        object = new Polygon(
          [
            { x: 50, y: 0 },
            { x: 190, y: 0 },
            { x: 240, y: 170 },
            { x: 0, y: 170 }
          ],
          common
        );
      } else if (kind === "parallelogram") {
        object = new Polygon(
          [
            { x: 50, y: 0 },
            { x: 250, y: 0 },
            { x: 200, y: 170 },
            { x: 0, y: 170 }
          ],
          common
        );
      } else if (kind === "line") {
        object = new Line([0, 0, 220, 0], {
          stroke: creationDefaults.line.color,
          strokeWidth: creationDefaults.line.width,
          strokeLineCap: "round"
        });
      } else if (kind === "bracket") {
        object = new Path("M 32 0 H 0 V 180 H 32 M 168 0 H 200 V 180 H 168", {
          fill: "",
          stroke: creationDefaults.shape.stroke,
          strokeWidth: creationDefaults.shape.strokeWidth,
          strokeLineCap: "round",
          strokeLineJoin: "round"
        });
      } else if (kind === "callout") {
        object = new Polygon(
          [
            { x: 0, y: 0 },
            { x: 260, y: 0 },
            { x: 260, y: 150 },
            { x: 90, y: 150 },
            { x: 48, y: 200 },
            { x: 58, y: 150 },
            { x: 0, y: 150 }
          ],
          { ...common, strokeLineJoin: "round" }
        );
      } else if (kind === "membrane") {
        const lipids: FabricObject[] = [];
        for (let index = 0; index < 9; index += 1) {
          const x = index * 30;
          lipids.push(
            new Circle({ left: x, top: 0, radius: 8, fill: "#69bdb4", stroke: "#25494b" }),
            new Line([x + 8, 16, x + 8, 42], { stroke: "#25494b", strokeWidth: 3 }),
            new Circle({ left: x, top: 58, radius: 8, fill: "#69bdb4", stroke: "#25494b" }),
            new Line([x + 8, 32, x + 8, 58], { stroke: "#25494b", strokeWidth: 3 })
          );
        }
        object = new Group(lipids);
      } else {
        object = createArrowPath(kind === "double-arrow", kind === "curved-arrow");
      }
      addObject(
        object,
        kind === "polygon" ? "hexagon" : kind.replace("-", " "),
        kind.includes("arrow") ? "connector" : "shape",
        point
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
      prepareElementStyle(object);
      canvas.add(object);
      canvas.setActiveObject(object);
      setSelection([object]);
      canvas.requestRenderAll();
      commit(`Add ${object.name}`);
    },
    [canvas, commit, creationDefaults.line, prepareElementStyle]
  );

  const placeCreation = useCallback(
    (point: Point, endPoint?: Point) => {
      if (!creationTool) return;
      const tool = creationTool;
      setCreationTool(null);
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
    [addAttachedConnector, addFreeConnector, addShape, addText, canvas, creationTool]
  );

  const addAsset = useCallback(
    (family: AssetFamily, variant: AssetVariant, point?: Point) => {
      const operation = assetInsertQueue.current.then(async () => {
        if (!canvas) return;
        const group = await createBundledAssetGroup(family, variant);
        const scale = assetInsertionScale(family.title, group.width || 1, group.height || 1);
        group.scale(scale);
        addObject(group, family.title, "nih-asset", point);
      });
      assetInsertQueue.current = operation.catch(() => undefined);
      return operation;
    },
    [addObject, canvas]
  );

  const setAssetVariant = useCallback(
    (variantId: string) => {
      const operation = assetInsertQueue.current.then(async () => {
        if (!canvas) return;
        const current = canvas.getActiveObject();
        if (!(current instanceof Group) || !current.familyId || current.assetId === variantId)
          return;
        const family = assetManifest.families.find(
          (candidate) => candidate.familyId === current.familyId
        );
        const variant = family?.variants.find((candidate) => candidate.id === variantId);
        if (!family || !variant) return;

        const replacement = await createBundledAssetGroup(family, variant);
        if (!canvas.getObjects().includes(current)) return;
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

        const index = canvas.getObjects().indexOf(current);
        canvas.remove(current);
        canvas.insertAt(index, replacement);
        canvas.setActiveObject(replacement);
        setSelection([replacement]);
        if (replacement.objectId) refreshConnectors(replacement.objectId);
        canvas.requestRenderAll();
        commit("Change asset variant");
      });
      assetInsertQueue.current = operation.catch(() => undefined);
      return operation;
    },
    [canvas, commit, refreshConnectors]
  );

  const placeImportedMedia = useCallback(
    async (media: ImportedMediaRecord, point?: Point) => {
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
      configureEditableSvgParts(object);
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
      const operation = importQueue.current.then(async () => {
        await placeImportedMedia(media, point);
      });
      importQueue.current = operation.catch(() => undefined);
      return operation;
    },
    [placeImportedMedia]
  );

  const importMedia = useCallback(
    (file: File, point?: Point) => {
      const operation = importQueue.current.then(async () => {
        const extension = file.name.toLowerCase().split(".").at(-1);
        const inferredMimeType =
          extension === "svg"
            ? "image/svg+xml"
            : extension === "jpg" || extension === "jpeg"
              ? "image/jpeg"
              : extension === "png"
                ? "image/png"
                : extension === "webp"
                  ? "image/webp"
                  : file.type;
        if (
          !["image/svg+xml", "image/png", "image/jpeg", "image/webp"].includes(inferredMimeType)
        ) {
          throw new Error("Choose an SVG, PNG, JPEG, or WebP image.");
        }
        if (file.size > 25 * 1024 * 1024) {
          throw new Error("Images must be 25 MB or smaller.");
        }
        const importId = crypto.randomUUID();
        let dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
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
        return placeImportedMedia(media, point);
      });
      importQueue.current = operation.then(() => undefined).catch(() => undefined);
      return operation;
    },
    [placeImportedMedia]
  );

  const selectParentAsset = useCallback(() => {
    if (!canvas) return;
    const parent = editableAssetParent(canvas.getActiveObject());
    if (!parent) return;
    canvas.setActiveObject(parent);
    setSelection([parent]);
    canvas.requestRenderAll();
  }, [canvas]);

  const closeGroupEdit = useCallback(() => {
    const group = editingGroupRef.current;
    editingGroupRef.current = null;
    setEditingGroup(null);
    modifierDeepSelection.current = undefined;
    deepSelectionCycle.current = undefined;
    if (!canvas || !group) return;
    configureSelectionControls(group, latestZoom.current);
    canvas.setActiveObject(group);
    setSelection([group]);
    canvas.requestRenderAll();
  }, [canvas]);

  const deleteSelection = useCallback(() => {
    if (!canvas) return;
    const active = canvas.getActiveObjects();
    const nested = active.filter((object) => editableAssetParent(object));
    if (nested.length > 0) {
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
        canvas.setActiveObject(parentAsset);
        setSelection([parentAsset]);
      } else {
        parents.forEach((parent) => canvas.remove(parent));
        canvas.discardActiveObject();
        setSelection([]);
      }
      canvas.requestRenderAll();
      commit("Delete SVG part");
      return;
    }
    const removedIds = new Set(active.map((object) => object.objectId).filter(Boolean));
    const connected = canvas
      .getObjects()
      .filter(
        (object) =>
          object.connector &&
          (removedIds.has(object.connector.fromObjectId) ||
            removedIds.has(object.connector.toObjectId))
      );
    [...active, ...connected].forEach((object) => canvas.remove(object));
    canvas.discardActiveObject();
    setSelection([]);
    canvas.requestRenderAll();
    commit("Delete");
  }, [canvas, commit]);

  const duplicateSelection = useCallback(async () => {
    if (!canvas) return;
    const selectedObjects = canvas.getActiveObjects();
    const clones = await Promise.all(selectedObjects.map((object) => object.clone()));
    const nestedParent = editableAssetParent(selectedObjects[0]);
    if (
      nestedParent &&
      selectedObjects.every((object) => editableAssetParent(object) === nestedParent)
    ) {
      clones.forEach((clone) => {
        clone.set({ left: (clone.left ?? 0) + 12, top: (clone.top ?? 0) + 12 });
        clone.objectId = crypto.randomUUID();
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
    clones.forEach((clone) => {
      clone.set({ left: (clone.left ?? 0) + 28, top: (clone.top ?? 0) + 28 });
      clone.objectId = crypto.randomUUID();
      canvas.add(clone);
    });
    const active = clones.length === 1 ? clones[0] : new ActiveSelection(clones, { canvas });
    canvas.setActiveObject(active);
    setSelection(clones);
    canvas.requestRenderAll();
    commit("Duplicate");
  }, [canvas, commit]);

  const copySelectionToClipboard = useCallback(
    async (format: SelectionClipboardFormat = "png", cut = false) => {
      if (!canvas) return;
      const activeObject = canvas.getActiveObject();
      const selectedObjects = canvas.getActiveObjects();
      if (!activeObject || selectedObjects.length === 0) return;

      const marker = `${SELECTION_CLIPBOARD_MARKER_PREFIX}${crypto.randomUUID()}`;
      clipboardMarker.current = marker;
      const systemWrite = writeSelectionToSystemClipboard(activeObject, format, marker).catch(
        (error: unknown) => {
          console.warn(`Could not copy the selection as ${format.toUpperCase()}.`, error);
        }
      );
      clipboard.current = await Promise.all(selectedObjects.map((object) => object.clone()));
      await systemWrite;
      if (cut) deleteSelection();
    },
    [canvas, deleteSelection]
  );

  const pasteSelection = useCallback(async () => {
    if (!canvas || clipboard.current.length === 0) return;
    const [clones, nextClipboard] = await Promise.all([
      Promise.all(clipboard.current.map((object) => object.clone())),
      Promise.all(clipboard.current.map((object) => object.clone()))
    ]);
    clones.forEach((clone) => {
      clone.set({
        left: (clone.left ?? 0) + 24,
        top: (clone.top ?? 0) + 24
      });
      clone.objectId = crypto.randomUUID();
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
  }, [canvas, commit]);

  const groupSelection = useCallback(() => {
    if (!canvas || !(canvas.getActiveObject() instanceof ActiveSelection)) return;
    const active = canvas.getActiveObject() as ActiveSelection;
    const objects = active.removeAll();
    canvas.discardActiveObject();
    canvas.remove(...objects);
    const group = new Group(objects);
    const recognition = findRecognizedGroup(objects);
    if (recognition) restoreRecognizedGroup(group, objects, recognition);
    configureCanvasAssets([group]);
    canvas.add(group);
    canvas.setActiveObject(group);
    assignIdentity(group, "Group", "group");
    deepSelectionCycle.current = undefined;
    setSelection([group]);
    canvas.requestRenderAll();
    commit("Group");
  }, [canvas, commit]);

  const ungroupSelection = useCallback(() => {
    if (!canvas || !(canvas.getActiveObject() instanceof Group)) return;
    const group = canvas.getActiveObject() as Group;
    const parent = directNestedParent(group);
    const index = parent?.getObjects().indexOf(group) ?? -1;
    canvas.discardActiveObject();
    const objects = group.removeAll();
    rememberRecognizedGroup(objects, recognizedGroupRecord(group, objects));
    if (parent && index >= 0) {
      parent.remove(group);
      parent.insertAt(index, ...objects);
      parent.setCoords();
      parent.dirty = true;
    } else {
      canvas.remove(group);
      canvas.add(...objects);
    }
    const selectionObject = new ActiveSelection(objects, { canvas });
    configureSelectionControls(selectionObject, latestZoom.current);
    canvas.setActiveObject(selectionObject);
    deepSelectionCycle.current = undefined;
    setSelection(selectionObject.getObjects());
    canvas.requestRenderAll();
    commit("Ungroup");
  }, [canvas, commit]);

  const arrange = useCallback(
    (action: "front" | "forward" | "backward" | "back") => {
      if (!canvas) return;
      for (const object of canvas.getActiveObjects()) {
        const collection = object.group instanceof Group ? object.group : canvas;
        if (action === "front") collection.bringObjectToFront(object);
        if (action === "forward") collection.bringObjectForward(object);
        if (action === "backward") collection.sendObjectBackwards(object);
        if (action === "back") collection.sendObjectToBack(object);
        if (object.group instanceof Group) object.group.dirty = true;
      }
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
          lineHeight: 1.2,
          textAlign: "left",
          opacity: 1
        });
        changed = true;
      } else if (["line", "curved-line", "arrow", "double-arrow", "curved-arrow"].includes(type)) {
        object.set({
          stroke: DEFAULT_CREATION_DEFAULTS.line.color,
          strokeWidth: DEFAULT_CREATION_DEFAULTS.line.width,
          opacity: 1
        });
        if (object.connector) {
          object.connector = {
            ...object.connector,
            lineStyle: DEFAULT_CREATION_DEFAULTS.line.lineStyle,
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
                  : Math.max(1, DEFAULT_CREATION_DEFAULTS.line.width * 0.4)
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
      const family = assetManifest.families.find((item) => item.familyId === object.familyId);
      const profile = family ? colorProfileForFamily(family) : undefined;
      const preset = ASSET_COLOR_PRESETS.find((item) => item.id === presetId);
      if (!profile || !preset) return;
      const mapping = presetColorMap(originalPaints(object), profile, preset);
      restoreOriginalColors(object);
      applyPresetColors(object, mapping, preset.id);
      canvas.requestRenderAll();
      setSelection([...canvas.getActiveObjects()]);
      commit("Apply color preset");
    },
    [canvas, commit, selection]
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
      latestProject.current = { ...latestProject.current, name };
      persist();
    },
    [persist]
  );
  const setProjectDescription = useCallback(
    (description: string) => {
      latestProject.current = { ...latestProject.current, description };
      setProjectDescriptionState(description);
      persist();
    },
    [persist]
  );

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
      const usedAssets = canvas
        .getObjects()
        .filter((object) => object.assetId && object.provenance)
        .map((object) => ({
          assetId: object.assetId,
          familyId: object.familyId,
          ...object.provenance
        }));
      const metadata = `<metadata>${escapeXml(
        JSON.stringify({
          generator: "OpenSketch",
          formatVersion: 1,
          title,
          description,
          credit: GLOBAL_CREDIT,
          usedAssets
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
      const svg = buildSvg(title, description);
      const blob = await svgToPdfBlob(svg, canvasSettings.width, canvasSettings.height, {
        title,
        description,
        credit: GLOBAL_CREDIT
      });
      downloadBlob(blob, `${safeFilename(title)}.pdf`);
    },
    [buildSvg, canvasSettings.height, canvasSettings.width]
  );

  const exportPng = useCallback(
    async (
      scale: number,
      transparent: boolean,
      dpi: number,
      background = canvasSettings.background
    ) => {
      if (!canvas) return;
      const previous = canvas.backgroundColor;
      canvas.backgroundColor = transparent ? "" : background;
      let dataUrl: string;
      try {
        dataUrl = withLogicalViewport(canvas, canvasSettings, () =>
          canvas.toDataURL({
            format: "png",
            multiplier: scale,
            enableRetinaScaling: false
          })
        );
      } finally {
        canvas.backgroundColor = previous;
        canvas.requestRenderAll();
      }
      const response = await fetch(dataUrl);
      const blob = await setPngDpi(await response.blob(), dpi);
      downloadBlob(blob, `${safeFilename(latestProject.current.name)}-${dpi}dpi.png`);
    },
    [canvas, canvasSettings]
  );

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (
        !canvas ||
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      const activeObject = canvas.getActiveObject();
      if (activeObject instanceof IText && activeObject.isEditing) return;
      const data = event.clipboardData;
      if (!data) return;
      if (clipboardContainsSelectionMarker(data, clipboardMarker.current)) {
        event.preventDefault();
        void pasteSelection();
        return;
      }
      const media = importedMediaFileFromClipboard(data);
      if (media) {
        event.preventDefault();
        clipboard.current = [];
        clipboardMarker.current = undefined;
        void importMedia(media);
        return;
      }
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
        if (event.shiftKey) redo();
        else undo();
      } else if (modifier && event.key.toLowerCase() === "d") {
        event.preventDefault();
        void duplicateSelection();
      } else if (modifier && event.key.toLowerCase() === "c") {
        event.preventDefault();
        void copySelectionToClipboard("png");
      } else if (modifier && event.key.toLowerCase() === "x") {
        event.preventDefault();
        void copySelectionToClipboard("png", true);
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
        if (creationTool) {
          setCreationTool(null);
          return;
        }
        const parentAsset = editableAssetParent(canvas.getActiveObject());
        if (parentAsset) {
          canvas.setActiveObject(parentAsset);
          setSelection([parentAsset]);
          canvas.requestRenderAll();
        } else {
          canvas.discardActiveObject();
          setSelection([]);
          canvas.requestRenderAll();
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
    refreshConnectors,
    selectParentAsset,
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
      projectDescription,
      setCanvasElement,
      setCanvasSettings,
      setAlignmentEnabled,
      setProjectName,
      setProjectDescription,
      selectParentAsset,
      closeGroupEdit,
      flushSave,
      creationTool,
      creationDefaults,
      setCreationTool,
      setCreationDefaults,
      placeCreation,
      addAsset,
      setAssetVariant,
      addImportedMedia,
      importMedia,
      deleteSelection,
      duplicateSelection,
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
      exportPdf,
      exportPng,
      commit
    }),
    [
      addAsset,
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
      commit,
      copySelectionToClipboard,
      pasteSelection,
      deleteSelection,
      distribute,
      duplicateSelection,
      exportPng,
      exportPdf,
      exportSvg,
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
      placeCreation,
      redo,
      resetColors,
      selection,
      setAlignmentEnabled,
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
      flushSave,
      setZoom,
      undo,
      ungroupSelection,
      updateConnector,
      zoom
    ]
  );
  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
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
