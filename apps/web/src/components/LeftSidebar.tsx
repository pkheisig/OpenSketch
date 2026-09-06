import { SCIENTIFIC_PRESETS } from "@/editor/scientific/catalog";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode
} from "react";
import { FixedSizeList as List, type ListChildComponentProps } from "react-window";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  Bookmark,
  Edit3,
  ExternalLink,
  FileInput,
  Heart,
  ImagePlus,
  Info,
  Search,
  Shapes,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Type,
  X
} from "lucide-react";
import {
  ASSET_CATEGORY_ORDER,
  filterAssetFamilies,
  type AssetManifest,
  type AssetFamily,
  type AssetVariant,
  type ConnectorArrowhead,
  type ConnectorLineStyle
} from "@workspace/editor-core";
import { AssetPreviewImage } from "@/components/AssetPreviewImage";
import { MotionCollapse } from "@/components/MotionCollapse";
import { MotionPresence } from "@/components/MotionPresence";
import { useEditorFields } from "@/editor/editorHooks";
import {
  buildConnectorGeometry,
  connectorArrowheadPoint,
  connectorStrokeLineCap
} from "@/editor/connectorGeometry";
import {
  CONNECTOR_FAMILIES,
  CONNECTOR_PRESETS,
  creationToolForConnectorPreset,
  connectorPreviewEndpoints,
  type ConnectorFamily,
  type ConnectorPreset
} from "@/editor/connectorPresets";
import { setConnectorPresetDragPayload, setShapePresetDragPayload } from "@/editor/creationDrag";
import {
  ASSET_FAVORITES_CHANGED_EVENT,
  loadAssetFavorites,
  saveAssetFavorites
} from "@/editor/assetFavorites";
import {
  loadSavedElementStyles,
  SAVED_ELEMENT_STYLES_CHANGED_EVENT,
  type ElementStyleSnapshot,
  type SavedElementStyles
} from "@/editor/elementStyles";
import { TEXT_FONT_FAMILIES } from "@/editor/fonts";
import {
  setAssetDragImage,
  setAssetDragPayload,
  setImportedMediaDragPayload
} from "@/editor/assetDrag";
import { loadStringList, saveStringList } from "@/editor/stringListStorage";
import {
  ASSET_TEMPLATES_CHANGED_EVENT,
  ASSET_TEMPLATES_ERROR_EVENT,
  setTemplateDragPayload,
  type AssetTemplate
} from "@/editor/assetTemplates";
import {
  ASSET_VARIANT_DEFAULTS_CHANGED_EVENT,
  loadAssetVariantDefaults,
  saveAssetVariantDefault
} from "@/editor/assetVariantDefaults";
import { AssetVariantPicker } from "@/components/AssetVariantPicker";
import { ColorPalettePicker } from "@/components/ColorPalettePicker";
import { OfflineAssetLibraryCard } from "@/components/OfflineAssetLibraryCard";
import { InspectorContent, LayersPanel } from "@/components/Inspector";
import { UiSelect } from "@/components/UiSelect";
import {
  useOpenSketchHostServices,
  useOpenSketchPortalRoot,
  type ImportedMediaLibraryRecord
} from "@/application/hostServices";
import { IMPORT_LIBRARY_CHANGED_EVENT } from "@/persistence/database";

type Tab = "assets" | "imports" | "edit";
type Flyout = "lines" | "shapes" | "defaults" | null;
type CreationDefaultsSection = "text" | "shape" | "line";

const CREATION_DEFAULTS_DISCLOSURE_STORAGE_KEY = "OpenSketch:creation-defaults-disclosures";
const RECENT_ASSETS_STORAGE_KEY = "OpenSketch:recent-assets";
const ALL_ASSET_FILTER_VALUE = "__all__";
const SINGLE_VARIANT_FILTER_VALUE = "single";
const MULTIPLE_VARIANT_FILTER_VALUE = "multiple";
const NIH_BIOART_SOURCE_LABEL = "NIH BioArt";
const SOURCE_POPOVER_WIDTH = 220;
const SOURCE_POPOVER_MARGIN = 12;
const SOURCE_POPOVER_GAP = 8;
const DEFAULT_CREATION_DEFAULTS_DISCLOSURES: Record<CreationDefaultsSection, boolean> = {
  text: true,
  shape: true,
  line: true
};
const ASSET_CATEGORIES = ["All", ...ASSET_CATEGORY_ORDER];

function userErrorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

function loadCreationDefaultsDisclosures(
  getItem: (key: string) => string | null = (key) => localStorage.getItem(key)
): Record<CreationDefaultsSection, boolean> {
  try {
    const stored = JSON.parse(
      getItem(CREATION_DEFAULTS_DISCLOSURE_STORAGE_KEY) ?? "null"
    ) as Partial<Record<CreationDefaultsSection, unknown>> | null;
    return {
      text: typeof stored?.text === "boolean" ? stored.text : true,
      shape: typeof stored?.shape === "boolean" ? stored.shape : true,
      line: typeof stored?.line === "boolean" ? stored.line : true
    };
  } catch {
    return DEFAULT_CREATION_DEFAULTS_DISCLOSURES;
  }
}

function assetSourceLabel(family: AssetFamily): string {
  if (family.nihSourcePage) return NIH_BIOART_SOURCE_LABEL;
  return family.sourceName ?? family.author;
}

function assetSourceFilterLabel(family: AssetFamily): string {
  return assetSourceLabel(family) === "BioIcons / Servier Medical Art"
    ? "BioIcons"
    : assetSourceLabel(family);
}

function assetSourcePage(family: AssetFamily): string {
  return family.sourcePage ?? family.commonsPage ?? family.nihSourcePage ?? "";
}

function assetFilterOptions(values: string[], allLabel: string) {
  return [
    { value: ALL_ASSET_FILTER_VALUE, label: allLabel },
    ...[...new Set(values)]
      .sort((left, right) => left.localeCompare(right))
      .map((value) => ({
        value,
        label: value
      }))
  ];
}

const ASSET_VARIANT_OPTIONS = [
  { value: ALL_ASSET_FILTER_VALUE, label: "Any variants" },
  { value: SINGLE_VARIANT_FILTER_VALUE, label: "Single variant" },
  { value: MULTIPLE_VARIANT_FILTER_VALUE, label: "Multiple variants" }
] as const;

const SHAPE_GROUPS = {
  scientific: SCIENTIFIC_PRESETS.map((preset) => [preset.id, "ellipse", preset.label] as const),
  basic: [
    ["rectangle", "rectangle", "Rectangle"],
    ["rounded-rectangle", "rounded-rectangle", "Rounded rectangle"],
    ["pill", "pill", "Pill"],
    ["circle", "circle", "Circle"],
    ["ellipse", "ellipse", "Ellipse"],
    ["donut", "donut", "Donut"]
  ],
  polygons: [
    ["triangle", "triangle", "Triangle"],
    ["right-triangle", "right-triangle", "Right triangle"],
    ["pentagon", "pentagon", "Pentagon"],
    ["polygon", "hexagon", "Hexagon"],
    ["octagon", "octagon", "Octagon"],
    ["diamond", "diamond", "Diamond"],
    ["trapezoid", "trapezoid", "Trapezoid"],
    ["parallelogram", "parallelogram", "Parallelogram"]
  ]
} as const;

function ConnectorPresetIcon({ value }: { value: ConnectorPreset }) {
  const graphicRef = useRef<SVGGElement>(null);
  const [viewBox, setViewBox] = useState("-1 -2 34 28");
  const { from, to } = connectorPreviewEndpoints(value);
  const geometry = buildConnectorGeometry(from, to, value.pathShape, value.curvature);
  const line = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8 * Math.min(value.widthScale ?? 1, 1.45),
    strokeLinecap: connectorStrokeLineCap(value.startArrowhead, value.endArrowhead),
    strokeLinejoin: "round" as const
  };
  const dash =
    value.lineStyle === "dashed" ? "5 3" : value.lineStyle === "dotted" ? "1 4" : undefined;
  const head = (kind: ConnectorArrowhead, point: { x: number; y: number }, angle: number) => {
    if (kind === "none") return null;
    const degrees = (angle * 180) / Math.PI;
    const headPoint = connectorArrowheadPoint(kind, point, angle, line.strokeWidth);
    if (kind === "circle" || kind === "open-circle") {
      return (
        <circle
          cx={headPoint.x}
          cy={headPoint.y}
          r="2.4"
          fill={kind === "circle" ? "currentColor" : "#fffefa"}
          stroke="currentColor"
          strokeWidth={kind === "open-circle" ? "1.45" : "0"}
        />
      );
    }
    const pathData =
      kind === "bar"
        ? "M0 -4.5V4.5"
        : kind === "neuron"
          ? "M 0 0 L -5 -3 L -3.9 0 L -5 3 Z"
          : kind === "triangle"
            ? "M 0 0 L -5 -3.1 L -5 3.1 Z"
            : "M -6 -3.8 L 0 0 L -6 3.8";
    return (
      <path
        d={pathData}
        transform={`translate(${headPoint.x} ${headPoint.y}) rotate(${degrees})`}
        fill={kind === "triangle" || kind === "neuron" ? "currentColor" : "none"}
        stroke={kind === "triangle" || kind === "neuron" ? "none" : "currentColor"}
        strokeWidth={kind === "triangle" || kind === "neuron" ? "0" : "1.7"}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  };
  useLayoutEffect(() => {
    const graphic = graphicRef.current;
    if (!graphic) return;
    const bounds = graphic.getBBox();
    if (!Number.isFinite(bounds.width) || !Number.isFinite(bounds.height)) return;
    const aspectRatio = 30 / 26;
    let width = Math.max(34, bounds.width + 5);
    let height = Math.max(24.5, bounds.height + 5);
    if (width / height < aspectRatio) {
      width = height * aspectRatio;
    } else {
      height = width / aspectRatio;
    }
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    const next = `${centerX - width / 2} ${centerY - height / 2} ${width} ${height}`;
    setViewBox((current) => (current === next ? current : next));
  }, [
    geometry.pathData,
    geometry.startAngle,
    geometry.endAngle,
    value.startArrowhead,
    value.endArrowhead,
    value.lineStyle,
    value.widthScale
  ]);
  return (
    <svg
      width="30"
      height="26"
      viewBox={viewBox}
      aria-hidden="true"
      style={{ opacity: value.opacity ?? 1 }}
    >
      <title>{value.label}</title>
      <g ref={graphicRef}>
        <path {...line} strokeDasharray={dash} d={geometry.pathData} />
        {head(value.startArrowhead, geometry.startPoint, geometry.startAngle)}
        {head(value.endArrowhead, geometry.endPoint, geometry.endAngle)}
      </g>
    </svg>
  );
}

function ShapePresetIcon({ glyph }: { glyph: string }) {
  const outline = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const
  };
  return (
    <svg width="30" height="26" viewBox="0 0 32 28" aria-hidden="true">
      {glyph === "rectangle" && <rect {...outline} x="4" y="5" width="24" height="18" />}
      {glyph === "rounded-rectangle" && (
        <rect {...outline} x="4" y="5" width="24" height="18" rx="4" />
      )}
      {glyph === "pill" && <rect {...outline} x="2" y="7" width="28" height="14" rx="7" />}
      {glyph === "circle" && <circle {...outline} cx="16" cy="14" r="10" />}
      {glyph === "ellipse" && <ellipse {...outline} cx="16" cy="14" rx="13" ry="8" />}
      {glyph === "donut" && (
        <>
          <circle {...outline} cx="16" cy="14" r="11" />
          <circle {...outline} cx="16" cy="14" r="5" />
        </>
      )}
      {glyph === "triangle" && <path {...outline} d="M16 3 29 24H3Z" />}
      {glyph === "right-triangle" && <path {...outline} d="M4 4v20h24Z" />}
      {glyph === "pentagon" && <path {...outline} d="m16 2 13 9-5 15H8L3 11Z" />}
      {glyph === "hexagon" && <path {...outline} d="m9 3 14 0 7 11-7 11H9L2 14Z" />}
      {glyph === "octagon" && <path {...outline} d="m9 2 14 0 7 7v10l-7 7H9l-7-7V9Z" />}
      {glyph === "diamond" && <path {...outline} d="m16 2 14 12-14 12L2 14Z" />}
      {glyph === "trapezoid" && <path {...outline} d="M8 5h16l6 18H2Z" />}
      {glyph === "parallelogram" && <path {...outline} d="M9 5h21l-7 18H2Z" />}
    </svg>
  );
}

export function LeftSidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const services = useOpenSketchHostServices();
  const [tab, setTab] = useState<Tab>("assets");
  const [flyout, setFlyout] = useState<Flyout>(null);
  const [lineFamily, setLineFamily] = useState<ConnectorFamily | null>(null);
  const [shapeFamily, setShapeFamily] = useState<keyof typeof SHAPE_GROUPS | null>(null);
  const [secondaryTop, setSecondaryTop] = useState(0);
  const [assetQuery, setAssetQuery] = useState("");
  const [assetCategory, setAssetCategory] = useState("Favorites");
  const [assetSearchFocusRequest, setAssetSearchFocusRequest] = useState(0);
  const [assetFiltersOpen, setAssetFiltersOpen] = useState(false);
  const [assetSourceFilter, setAssetSourceFilter] = useState(ALL_ASSET_FILTER_VALUE);
  const [assetVariantFilter, setAssetVariantFilter] = useState(ALL_ASSET_FILTER_VALUE);
  const [assetCatalog, setAssetCatalog] = useState<AssetManifest | null>(null);
  const [assetPackVersion, setAssetPackVersion] = useState<string | null>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const primaryFamilyButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const handledSelection = useRef("");
  const draggedLinePreset = useRef(false);
  const pressedLinePreset = useRef(false);
  const draggedShapePreset = useRef(false);
  const pressedShapePreset = useRef(false);
  const draggedAsset = useRef(false);
  const editor = useEditorFields([
    "autoEditEnabled",
    "canvas",
    "creationTool",
    "selection",
    "setCreationDefaults",
    "setCreationTool"
  ]);
  const autoEditWasEnabled = useRef(editor.autoEditEnabled);
  const setCreationTool = editor.setCreationTool;
  const canEdit = editor.selection.length > 0;
  const panelOpen = !collapsed && (tab !== "edit" || canEdit);
  const selectionKey = editor.selection
    .map((object, index) => object.objectId ?? `${object.type}:${object.name ?? index}`)
    .join("|");
  const openPanel = (next: Tab) => {
    const shouldClose = !collapsed && tab === next;
    if (next === "assets" && !shouldClose) {
      if (!assetQuery) setAssetCategory("Favorites");
      setAssetSearchFocusRequest((current) => current + 1);
    }
    setTab(next);
    setFlyout(null);
    setLineFamily(null);
    setShapeFamily(null);
    editor.setCreationTool(null);
    if (shouldClose || collapsed) onToggle();
  };
  const openFlyout = (next: Exclude<Flyout, null>) => {
    const shouldClose = flyout === next;
    setFlyout(shouldClose ? null : next);
    setLineFamily(null);
    setShapeFamily(null);
    editor.setCreationTool(null);
    if (!shouldClose && !collapsed) onToggle();
  };
  const activeFlyoutFamily =
    flyout === "lines" ? lineFamily : flyout === "shapes" ? shapeFamily : null;
  useLayoutEffect(() => {
    const activeButton = activeFlyoutFamily
      ? primaryFamilyButtonRefs.current[activeFlyoutFamily]
      : null;
    const nextTop = activeButton?.offsetTop ?? 0;
    setSecondaryTop((current) => (current === nextTop ? current : nextTop));
  }, [activeFlyoutFamily]);
  const chooseLinePreset = (value: ConnectorPreset, family: ConnectorFamily) => {
    editor.setCreationDefaults((current) => ({
      ...current,
      line: {
        ...current.line,
        lineStyle: value.lineStyle,
        startArrowhead: value.startArrowhead,
        endArrowhead: value.endArrowhead
      }
    }));
    editor.setCreationTool(creationToolForConnectorPreset(value, family));
    setFlyout(null);
    setLineFamily(null);
  };
  useEffect(() => {
    if (!selectionKey) {
      handledSelection.current = "";
      if (tab === "edit" && !collapsed && editor.canvas?.getActiveObjects().length === 0) {
        onToggle();
      }
      return;
    }
    if (!editor.autoEditEnabled) return;
    if (editor.creationTool || handledSelection.current === selectionKey) return;
    handledSelection.current = selectionKey;
    setTab("edit");
    if (collapsed) onToggle();
  }, [
    collapsed,
    editor.autoEditEnabled,
    editor.canvas,
    editor.creationTool,
    onToggle,
    selectionKey,
    tab
  ]);
  useEffect(() => {
    const wasEnabled = autoEditWasEnabled.current;
    autoEditWasEnabled.current = editor.autoEditEnabled;
    if (wasEnabled && !editor.autoEditEnabled) {
      handledSelection.current = "";
      if (tab === "edit" && !collapsed) onToggle();
    }
  }, [collapsed, editor.autoEditEnabled, onToggle, tab]);
  useEffect(() => {
    if (!editor.creationTool || collapsed) return;
    onToggle();
  }, [collapsed, editor.creationTool, onToggle]);
  useEffect(() => {
    if (collapsed || tab !== "assets" || assetCatalog) return;
    let active = true;
    void Promise.all([services.assets.getManifest(), services.assets.getVersion()]).then(
      ([assetManifest, version]) => {
        if (active) {
          setAssetCatalog(assetManifest);
          setAssetPackVersion(version);
        }
      }
    );
    return () => {
      active = false;
    };
  }, [assetCatalog, collapsed, services, tab]);
  useEffect(() => {
    const clearAssetDrag = () => {
      window.setTimeout(() => {
        draggedAsset.current = false;
      }, 0);
    };
    window.addEventListener("dragend", clearAssetDrag);
    window.addEventListener("drop", clearAssetDrag);
    return () => {
      window.removeEventListener("dragend", clearAssetDrag);
      window.removeEventListener("drop", clearAssetDrag);
    };
  }, [services]);
  useEffect(() => {
    const closeOutsideSidebar = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (draggedAsset.current) return;
      if (sidebarRef.current?.contains(target)) return;
      if (
        target.closest(
          ".ui-select-menu, .color-palette-popover, .asset-palette-popover, .asset-variant-menu, " +
            ".selection-quick-toolbar, .selection-toolbar-menu"
        )
      ) {
        return;
      }
      if (tab === "edit" && editor.selection.length > 0) return;
      setFlyout(null);
      setLineFamily(null);
      setShapeFamily(null);
      if (!collapsed) onToggle();
    };
    document.addEventListener("pointerdown", closeOutsideSidebar, true);
    return () => document.removeEventListener("pointerdown", closeOutsideSidebar, true);
  }, [collapsed, editor.selection.length, onToggle, tab]);
  useEffect(() => {
    const clearCreationToolOutsideSidebar = (event: MouseEvent) => {
      const target = event.target;
      const sidebar = sidebarRef.current;
      if (!(target instanceof Element) || (sidebar && event.composedPath().includes(sidebar))) {
        return;
      }
      if (
        target.closest(
          ".ui-select-menu, .color-palette-popover, .asset-palette-popover, .asset-variant-menu, " +
            ".selection-quick-toolbar, .selection-toolbar-menu"
        )
      ) {
        return;
      }
      setCreationTool(null);
    };
    document.addEventListener("click", clearCreationToolOutsideSidebar);
    return () => document.removeEventListener("click", clearCreationToolOutsideSidebar);
  }, [setCreationTool]);
  return (
    <aside
      ref={sidebarRef}
      className={`left-sidebar floating-sidebar ${collapsed ? "panel-closed" : ""}`}
    >
      <nav className="floating-tool-rail" aria-label="Editor tools" role="tablist">
        <button
          className={tab === "assets" && !collapsed ? "active" : ""}
          onClick={() => openPanel("assets")}
          role="tab"
          aria-label="Assets"
          aria-selected={tab === "assets" && !collapsed}
          title="Assets"
          data-label="Assets"
        >
          <Search size={20} />
        </button>
        <button
          onClick={() => {
            editor.setCreationTool({ type: "text", kind: "point" });
            setFlyout(null);
            setLineFamily(null);
            setShapeFamily(null);
          }}
          className={editor.creationTool?.type === "text" ? "active" : ""}
          aria-label="Text"
          aria-pressed={editor.creationTool?.type === "text"}
          title="Text"
          data-label="Text"
        >
          <Type size={20} />
        </button>
        <button
          onClick={() => openFlyout("lines")}
          className={flyout === "lines" ? "active" : ""}
          aria-label="Lines"
          aria-expanded={flyout === "lines"}
          title="Lines"
          data-label="Lines"
        >
          <ArrowRight size={20} />
        </button>
        <button
          onClick={() => openFlyout("shapes")}
          className={flyout === "shapes" ? "active" : ""}
          role="tab"
          aria-label="Shapes"
          aria-selected={flyout === "shapes"}
          aria-expanded={flyout === "shapes"}
          title="Shapes"
          data-label="Shapes"
        >
          <Shapes size={20} />
        </button>
        <button
          onClick={() => openFlyout("defaults")}
          className={flyout === "defaults" ? "active" : ""}
          aria-label="Defaults"
          aria-expanded={flyout === "defaults"}
          title="Defaults"
          data-label="Defaults"
        >
          <SlidersHorizontal size={20} />
        </button>
        <button
          className={tab === "imports" && !collapsed ? "active" : ""}
          onClick={() => openPanel("imports")}
          role="tab"
          aria-label="Imports"
          aria-selected={tab === "imports" && !collapsed}
          title="Imports"
          data-label="Imports"
        >
          <FileInput size={20} />
        </button>
        {canEdit ? (
          <button
            className={tab === "edit" && !collapsed ? "active" : ""}
            onClick={() => openPanel("edit")}
            aria-label="Edit"
            title="Edit"
            data-label="Edit"
          >
            <Edit3 size={20} />
          </button>
        ) : null}
      </nav>
      <MotionPresence open={flyout === "lines"} exitMs={150}>
        {flyout === "lines" ? (
          <div
            className="tool-flyout line-tool-flyout"
            role="menu"
            aria-label="Line and arrow tools"
            onPointerLeave={() => {
              if (!pressedLinePreset.current && !draggedLinePreset.current) setLineFamily(null);
            }}
          >
            <div className="tool-flyout-primary">
              {CONNECTOR_FAMILIES.map(({ id: family, label }) => {
                const sample = CONNECTOR_PRESETS[family][0];
                return (
                  <button
                    key={family}
                    ref={(element) => {
                      primaryFamilyButtonRefs.current[family] = element;
                    }}
                    className={lineFamily === family ? "active" : ""}
                    onPointerEnter={() => setLineFamily(family)}
                    onClick={() => setLineFamily(family)}
                    role="menuitem"
                  >
                    <ConnectorPresetIcon value={sample} />
                    {label}
                  </button>
                );
              })}
            </div>
            <MotionPresence open={Boolean(lineFamily)} exitMs={120}>
              {lineFamily ? (
                <div
                  className={`tool-flyout-secondary connector-family-${lineFamily}`}
                  style={{ marginTop: secondaryTop }}
                >
                  {CONNECTOR_PRESETS[lineFamily].map((value) => {
                    return (
                      <button
                        key={value.label}
                        draggable
                        onPointerDown={() => {
                          pressedLinePreset.current = true;
                        }}
                        onPointerUp={() => {
                          pressedLinePreset.current = false;
                        }}
                        onPointerCancel={() => {
                          pressedLinePreset.current = false;
                        }}
                        onDragStart={(event) => {
                          draggedLinePreset.current = true;
                          setConnectorPresetDragPayload(event.dataTransfer, lineFamily, value);
                        }}
                        onDragEnd={() => {
                          window.setTimeout(() => {
                            draggedLinePreset.current = false;
                            pressedLinePreset.current = false;
                          }, 0);
                        }}
                        onClick={() => {
                          if (!draggedLinePreset.current) chooseLinePreset(value, lineFamily);
                        }}
                        role="menuitem"
                        aria-label={value.label}
                        title={value.label}
                      >
                        <ConnectorPresetIcon value={value} />
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </MotionPresence>
          </div>
        ) : null}
      </MotionPresence>
      <MotionPresence open={flyout === "shapes"} exitMs={150}>
        {flyout === "shapes" ? (
          <div
            className="tool-flyout shape-tool-flyout"
            role="menu"
            aria-label="Shape tools"
            onPointerLeave={() => {
              if (!pressedShapePreset.current && !draggedShapePreset.current) setShapeFamily(null);
            }}
          >
            <div className="tool-flyout-primary">
              <button
                ref={(element) => {
                  primaryFamilyButtonRefs.current.basic = element;
                }}
                className={shapeFamily === "basic" ? "active" : ""}
                onPointerEnter={() => setShapeFamily("basic")}
                onClick={() => setShapeFamily("basic")}
                role="menuitem"
              >
                <ShapePresetIcon glyph="rectangle" /> Shapes
              </button>
              <button
                ref={(element) => {
                  primaryFamilyButtonRefs.current.polygons = element;
                }}
                className={shapeFamily === "polygons" ? "active" : ""}
                onPointerEnter={() => setShapeFamily("polygons")}
                onClick={() => setShapeFamily("polygons")}
                role="menuitem"
              >
                <ShapePresetIcon glyph="hexagon" /> Polygons
              </button>
              <button
                ref={(element) => {
                  primaryFamilyButtonRefs.current.scientific = element;
                }}
                className={shapeFamily === "scientific" ? "active" : ""}
                onPointerEnter={() => setShapeFamily("scientific")}
                onClick={() => setShapeFamily("scientific")}
                role="menuitem"
              >
                <ShapePresetIcon glyph="ellipse" /> Scientific structures
              </button>
            </div>
            <MotionPresence open={Boolean(shapeFamily)} exitMs={120}>
              {shapeFamily ? (
                <div
                  className={`tool-flyout-secondary ${shapeFamily === "scientific" ? "scientific-preset-list" : "shape-flyout-grid"}`}
                  style={{ marginTop: secondaryTop }}
                >
                  {SHAPE_GROUPS[shapeFamily].map(([kind, glyph, label]) => (
                    <button
                      key={kind}
                      draggable
                      onPointerDown={() => {
                        pressedShapePreset.current = true;
                      }}
                      onPointerUp={() => {
                        pressedShapePreset.current = false;
                      }}
                      onPointerCancel={() => {
                        pressedShapePreset.current = false;
                      }}
                      onDragStart={(event) => {
                        draggedShapePreset.current = true;
                        setShapePresetDragPayload(event.dataTransfer, kind);
                      }}
                      onDragEnd={() => {
                        window.setTimeout(() => {
                          draggedShapePreset.current = false;
                          pressedShapePreset.current = false;
                        }, 0);
                      }}
                      onClick={() => {
                        if (!draggedShapePreset.current) {
                          editor.setCreationTool({ type: "shape", kind });
                          setFlyout(null);
                          setShapeFamily(null);
                        }
                      }}
                      role="menuitem"
                      aria-label={label}
                      title={label}
                    >
                      <>
                        {shapeFamily === "scientific" ? (
                          <img
                            src={`${import.meta.env.BASE_URL}assets/scientific-structures/${kind}.svg`}
                            alt=""
                            width={30}
                            height={30}
                          />
                        ) : (
                          <ShapePresetIcon glyph={glyph} />
                        )}
                      </>
                      {shapeFamily === "scientific" && <span>{label}</span>}
                    </button>
                  ))}
                </div>
              ) : null}
            </MotionPresence>
          </div>
        ) : null}
      </MotionPresence>
      <MotionPresence open={flyout === "defaults"} exitMs={150}>
        {flyout === "defaults" ? (
          <div
            className="tool-flyout tool-defaults-flyout"
            role="dialog"
            aria-label="New object defaults"
          >
            <ShapesPanel />
          </div>
        ) : null}
      </MotionPresence>
      <MotionPresence open={panelOpen} exitMs={180}>
        {panelOpen ? (
          <div className="sidebar-expanded floating-panel">
            {tab !== "edit" ? (
              <div className="floating-panel-header">
                <strong>{tab === "assets" ? "Assets" : "Imports"}</strong>
                <button className="panel-close-button" onClick={onToggle} aria-label="Close panel">
                  ×
                </button>
              </div>
            ) : null}
            <div
              key={tab}
              className={`sidebar-content sidebar-content-${tab}`}
              id={`insert-panel-${tab}`}
              role="tabpanel"
              aria-label={`${tab} tools`}
            >
              {tab === "assets" &&
                (assetCatalog && assetPackVersion ? (
                  <AssetsPanel
                    assetManifest={assetCatalog}
                    offlinePackVersion={assetPackVersion}
                    query={assetQuery}
                    onQueryChange={setAssetQuery}
                    category={assetCategory}
                    onCategoryChange={setAssetCategory}
                    focusRequest={assetSearchFocusRequest}
                    filtersOpen={assetFiltersOpen}
                    onFiltersOpenChange={setAssetFiltersOpen}
                    sourceFilter={assetSourceFilter}
                    onSourceFilterChange={setAssetSourceFilter}
                    variantFilter={assetVariantFilter}
                    onVariantFilterChange={setAssetVariantFilter}
                    onAssetDragStart={() => {
                      draggedAsset.current = true;
                    }}
                    onAssetDragEnd={() => {
                      window.setTimeout(() => {
                        draggedAsset.current = false;
                      }, 0);
                    }}
                  />
                ) : (
                  <div className="empty-library" role="status">
                    <Search size={23} />
                    <h3>Loading asset library…</h3>
                  </div>
                ))}
              {tab === "imports" && <ImportsPanel />}
              {tab === "edit" && <InspectorContent onClose={onToggle} />}
            </div>
            <LayersPanel />
          </div>
        ) : null}
      </MotionPresence>
    </aside>
  );
}

function AssetsPanel({
  assetManifest,
  offlinePackVersion,
  query,
  onQueryChange,
  category,
  onCategoryChange,
  focusRequest,
  filtersOpen,
  onFiltersOpenChange,
  sourceFilter,
  onSourceFilterChange,
  variantFilter,
  onVariantFilterChange,
  onAssetDragStart,
  onAssetDragEnd
}: {
  assetManifest: AssetManifest;
  offlinePackVersion: string;
  query: string;
  onQueryChange: (query: string) => void;
  category: string;
  onCategoryChange: (category: string) => void;
  focusRequest: number;
  filtersOpen: boolean;
  onFiltersOpenChange: (open: boolean) => void;
  sourceFilter: string;
  onSourceFilterChange: (value: string) => void;
  variantFilter: string;
  onVariantFilterChange: (value: string) => void;
  onAssetDragStart: () => void;
  onAssetDragEnd: () => void;
}) {
  const services = useOpenSketchHostServices();
  const editor = useEditorFields(["addAsset", "addTemplate"]);
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [variants, setVariants] = useState(() =>
    loadAssetVariantDefaults(services.preferences.storage)
  );
  const [favorites, setFavorites] = useState<Set<string>>(() =>
    loadAssetFavorites(services.preferences.storage)
  );
  const [templates, setTemplates] = useState<AssetTemplate[]>([]);
  const [recent, setRecent] = useState<string[]>(() =>
    loadStringList(RECENT_ASSETS_STORAGE_KEY, services.preferences.storage)
  );
  const [assetError, setAssetError] = useState("");
  const [assetListHeight, setAssetListHeight] = useState(0);
  const [savedStyles, setSavedStyles] = useState<SavedElementStyles>(() =>
    loadSavedElementStyles(services.preferences.storage)
  );
  const assetListRef = useRef<HTMLDivElement>(null);
  const sourceOptions = useMemo(
    () =>
      assetFilterOptions(
        assetManifest.families.map((family) => assetSourceFilterLabel(family)),
        "All sources"
      ),
    [assetManifest.families]
  );
  useEffect(() => {
    if (
      sourceFilter !== ALL_ASSET_FILTER_VALUE &&
      !assetManifest.families.some((family) => assetSourceFilterLabel(family) === sourceFilter)
    ) {
      onSourceFilterChange(ALL_ASSET_FILTER_VALUE);
    }
  }, [assetManifest.families, sourceFilter, onSourceFilterChange]);
  const families = useMemo(() => {
    if (category === "Templates") return [];
    const matches = filterAssetFamilies(
      assetManifest.families,
      debouncedQuery,
      category === "Favorites" ? "All" : category
    );
    const filtered = matches.filter((family) => {
      const matchesSource =
        sourceFilter === ALL_ASSET_FILTER_VALUE || assetSourceFilterLabel(family) === sourceFilter;
      const matchesVariants =
        variantFilter === ALL_ASSET_FILTER_VALUE ||
        (variantFilter === SINGLE_VARIANT_FILTER_VALUE && family.variants.length === 1) ||
        (variantFilter === MULTIPLE_VARIANT_FILTER_VALUE && family.variants.length > 1);
      return matchesSource && matchesVariants;
    });
    return category === "Favorites"
      ? filtered.filter((family) => favorites.has(family.familyId))
      : filtered;
  }, [assetManifest.families, category, debouncedQuery, favorites, sourceFilter, variantFilter]);
  const matchingTemplates = useMemo(() => {
    const normalizedQuery = debouncedQuery.trim().toLowerCase();
    return normalizedQuery
      ? templates.filter((template) => template.name.toLowerCase().includes(normalizedQuery))
      : templates;
  }, [debouncedQuery, templates]);
  const activeFilterCount = [sourceFilter, variantFilter].filter(
    (value) => value !== ALL_ASSET_FILTER_VALUE
  ).length;
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(query), 160);
    return () => window.clearTimeout(timeout);
  }, [query]);
  useEffect(() => {
    if (focusRequest < 1) return;
    searchInputRef.current?.focus();
    searchInputRef.current?.select();
  }, [focusRequest]);
  useEffect(() => {
    const updateSavedStyles = () =>
      setSavedStyles(loadSavedElementStyles(services.preferences.storage));
    window.addEventListener(SAVED_ELEMENT_STYLES_CHANGED_EVENT, updateSavedStyles);
    return () => window.removeEventListener(SAVED_ELEMENT_STYLES_CHANGED_EVENT, updateSavedStyles);
  }, [services]);
  useEffect(() => {
    const updateFavorites = () => setFavorites(loadAssetFavorites(services.preferences.storage));
    window.addEventListener(ASSET_FAVORITES_CHANGED_EVENT, updateFavorites);
    return () => window.removeEventListener(ASSET_FAVORITES_CHANGED_EVENT, updateFavorites);
  }, [services]);
  useEffect(() => {
    let active = true;
    const updateTemplates = () => {
      void services.templates
        .list()
        .then((next) => {
          if (active) setTemplates(next);
        })
        .catch((reason) => {
          if (active) setAssetError(userErrorMessage(reason));
        });
    };
    const updateTemplateError = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const message = event.detail?.message;
      if (typeof message === "string" && message) setAssetError(message);
    };
    updateTemplates();
    window.addEventListener(ASSET_TEMPLATES_CHANGED_EVENT, updateTemplates);
    window.addEventListener(ASSET_TEMPLATES_ERROR_EVENT, updateTemplateError);
    return () => {
      active = false;
      window.removeEventListener(ASSET_TEMPLATES_CHANGED_EVENT, updateTemplates);
      window.removeEventListener(ASSET_TEMPLATES_ERROR_EVENT, updateTemplateError);
    };
  }, [services]);
  useEffect(() => {
    const updateVariants = () =>
      setVariants(loadAssetVariantDefaults(services.preferences.storage));
    window.addEventListener(ASSET_VARIANT_DEFAULTS_CHANGED_EVENT, updateVariants);
    return () => window.removeEventListener(ASSET_VARIANT_DEFAULTS_CHANGED_EVENT, updateVariants);
  }, [services]);
  useLayoutEffect(() => {
    const list = assetListRef.current;
    if (!list) return;
    const updateHeight = () => {
      const next = Math.max(1, Math.floor(list.getBoundingClientRect().height));
      setAssetListHeight((current) => (current === next ? current : next));
    };
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(list);
    return () => observer.disconnect();
  }, [families.length]);
  const rows = Math.ceil(families.length / 2);
  const selectedVariant = (family: AssetFamily) =>
    family.variants.find((variant) => variant.id === variants[family.familyId]) ??
    family.variants.find((variant) => variant.id === family.defaultVariantId) ??
    family.variants[0];

  const toggleFavorite = (familyId: string) => {
    const next = new Set(favorites);
    if (next.has(familyId)) next.delete(familyId);
    else next.add(familyId);
    setFavorites(next);
    saveAssetFavorites(next, services.preferences.storage);
  };

  const insert = (family: AssetFamily, variant: AssetVariant) => {
    const next = [family.familyId, ...recent.filter((id) => id !== family.familyId)].slice(0, 8);
    setRecent(next);
    saveStringList(RECENT_ASSETS_STORAGE_KEY, next, services.preferences.storage);
    setAssetError("");
    void editor
      .addAsset(family, variant)
      .catch((reason) => setAssetError(userErrorMessage(reason)));
  };

  const insertTemplate = (template: AssetTemplate) => {
    setAssetError("");
    void editor.addTemplate(template).catch((reason) => setAssetError(userErrorMessage(reason)));
  };

  const Row = ({ index, style }: ListChildComponentProps) => (
    <div style={style} className="asset-row">
      {families.slice(index * 2, index * 2 + 2).map((family) => {
        const variant = selectedVariant(family);
        return (
          <AssetCard
            key={family.familyId}
            family={family}
            variant={variant}
            preferredVariantId={variants[family.familyId]}
            savedStyle={savedStyles[`asset:${variant.id}`]}
            favorite={favorites.has(family.familyId)}
            onFavorite={() => toggleFavorite(family.familyId)}
            onInsert={() => insert(family, variant)}
            onVariant={(variantId) =>
              saveAssetVariantDefault(family.familyId, variantId, services.preferences.storage)
            }
            onAssetDragStart={onAssetDragStart}
            onAssetDragEnd={onAssetDragEnd}
          />
        );
      })}
    </div>
  );
  const navigateAssets = (event: KeyboardEvent<HTMLElement>) => {
    if (!event.key.startsWith("Arrow")) return;
    const buttons = [
      ...(assetListRef.current?.querySelectorAll<HTMLButtonElement>(".asset-card-image") ?? [])
    ];
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (current < 0) return;
    const delta =
      event.key === "ArrowLeft"
        ? -1
        : event.key === "ArrowRight"
          ? 1
          : event.key === "ArrowUp"
            ? -2
            : 2;
    const target = buttons[current + delta];
    if (target) {
      event.preventDefault();
      target.focus();
    }
  };

  return (
    <div className="assets-panel">
      <div className="asset-search-row">
        <label className="search-box">
          <Search size={16} />
          <input
            ref={searchInputRef}
            value={query}
            onChange={(event) => {
              const nextQuery = event.target.value;
              onQueryChange(nextQuery);
              if (nextQuery && category === "Favorites") onCategoryChange("All");
            }}
            placeholder="Search cells, proteins, equipment…"
          />
          {query && (
            <button type="button" onClick={() => onQueryChange("")} aria-label="Clear search">
              <X size={14} />
            </button>
          )}
        </label>
        {category !== "Templates" ? (
          <button
            type="button"
            className={`asset-filter-toggle${filtersOpen ? " active" : ""}`}
            aria-label="Toggle asset filters"
            aria-expanded={filtersOpen}
            title="Filter assets"
            onClick={() => onFiltersOpenChange(!filtersOpen)}
          >
            <SlidersHorizontal size={15} aria-hidden="true" />
            <span>Filter</span>
            {activeFilterCount > 0 ? (
              <span
                className="asset-filter-count"
                aria-label={`${activeFilterCount} active filters`}
              >
                {activeFilterCount}
              </span>
            ) : null}
          </button>
        ) : null}
      </div>
      <OfflineAssetLibraryCard assetManifest={assetManifest} version={offlinePackVersion} />
      <MotionCollapse
        open={filtersOpen && category !== "Templates"}
        className="asset-filter-collapse"
      >
        <div className="asset-filter-panel" role="region" aria-label="Asset filters">
          <div className="asset-filter-heading">
            <strong>Refine assets</strong>
            {activeFilterCount > 0 ? (
              <button
                type="button"
                className="asset-filter-clear"
                aria-label="Clear asset filters"
                onClick={() => {
                  onSourceFilterChange(ALL_ASSET_FILTER_VALUE);
                  onVariantFilterChange(ALL_ASSET_FILTER_VALUE);
                }}
              >
                Clear
              </button>
            ) : (
              <span>Source or variants</span>
            )}
          </div>
          <div className="asset-filter-grid">
            <UiSelect
              value={sourceFilter}
              options={sourceOptions}
              onChange={onSourceFilterChange}
              label="Source"
              ariaLabel="Filter by source"
            />
            <UiSelect
              value={variantFilter}
              options={ASSET_VARIANT_OPTIONS}
              onChange={onVariantFilterChange}
              label="Variants"
              ariaLabel="Filter by variants"
            />
          </div>
        </div>
      </MotionCollapse>
      <div className="category-strip" role="list" aria-label="Asset categories">
        {["Favorites", "Templates", ...ASSET_CATEGORIES].map((item) => (
          <button
            key={item}
            className={category === item ? "active" : ""}
            onClick={() => onCategoryChange(item)}
          >
            {item === "Favorites" ? <Heart size={14} aria-hidden="true" /> : null}
            {item === "Templates" ? <Bookmark size={14} aria-hidden="true" /> : null}
            {item}
          </button>
        ))}
      </div>
      {assetError ? (
        <p className="panel-error" role="alert">
          {assetError}
        </p>
      ) : null}
      {!query && category !== "Favorites" && category !== "Templates" && recent.length > 0 && (
        <div className="recent-assets" aria-label="Recent assets">
          <span>Recent</span>
          {recent
            .map((id) => assetManifest.families.find((family) => family.familyId === id))
            .filter((family): family is AssetFamily => Boolean(family))
            .slice(0, 4)
            .map((family) => (
              <button key={family.familyId} onClick={() => insert(family, selectedVariant(family))}>
                {family.title}
              </button>
            ))}
        </div>
      )}
      {category === "Templates" ? (
        matchingTemplates.length > 0 ? (
          <div className="asset-list-shell template-list-shell">
            <div className="template-grid" aria-label="Saved templates">
              {matchingTemplates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  onInsert={() => insertTemplate(template)}
                  onDelete={() => {
                    void services.templates
                      .delete(template.id)
                      .catch((reason) => setAssetError(userErrorMessage(reason)));
                  }}
                  onAssetDragStart={onAssetDragStart}
                  onAssetDragEnd={onAssetDragEnd}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="empty-library">
            <Bookmark size={23} />
            <h3>{templates.length ? "No template match" : "No templates yet"}</h3>
            <p>Right-click a group on the canvas to save it here.</p>
          </div>
        )
      ) : families.length ? (
        <div
          ref={assetListRef}
          className="asset-list-shell"
          onKeyDown={navigateAssets}
          aria-label="Scientific asset families"
        >
          {assetListHeight > 0 && (
            <List
              className="asset-list"
              height={assetListHeight}
              itemCount={rows}
              itemSize={184}
              overscanCount={8}
              width="100%"
            >
              {Row}
            </List>
          )}
        </div>
      ) : assetManifest.families.length === 0 ? (
        <div className="empty-library">
          <Sparkles size={25} />
          <h3>Asset library ready to sync</h3>
          <p>No OpenSketch assets are available in this build.</p>
        </div>
      ) : (
        <div className="empty-library">
          <Search size={23} />
          <h3>No match</h3>
        </div>
      )}
    </div>
  );
}

function TemplateCard({
  template,
  onInsert,
  onDelete,
  onAssetDragStart,
  onAssetDragEnd
}: {
  template: AssetTemplate;
  onInsert: () => void;
  onDelete: () => void;
  onAssetDragStart: () => void;
  onAssetDragEnd: () => void;
}) {
  return (
    <article
      className="asset-card template-card"
      draggable
      onDragStart={(event) => {
        onAssetDragStart();
        setTemplateDragPayload(event.dataTransfer, template.id);
        setAssetDragImage(
          event.dataTransfer,
          event.currentTarget.querySelector<HTMLImageElement>(".asset-card-image img"),
          event
        );
      }}
      onDragEnd={onAssetDragEnd}
    >
      <button
        className="asset-card-image template-card-image"
        onClick={onInsert}
        aria-label={`Insert ${template.name}`}
      >
        {template.thumbnail ? (
          <img src={template.thumbnail} alt="" draggable={false} />
        ) : (
          <Bookmark size={28} aria-hidden="true" />
        )}
      </button>
      <button
        type="button"
        className="template-delete"
        onClick={(event) => {
          event.stopPropagation();
          onDelete();
        }}
        aria-label={`Delete ${template.name}`}
        title="Delete template"
      >
        <Trash2 size={14} aria-hidden="true" />
      </button>
      <div className="asset-card-copy">
        <strong title={template.name}>{template.name}</strong>
        <small>Saved group</small>
      </div>
    </article>
  );
}

function AssetCard({
  family,
  variant,
  preferredVariantId,
  savedStyle,
  favorite,
  onFavorite,
  onInsert,
  onVariant,
  onAssetDragStart,
  onAssetDragEnd
}: {
  family: AssetFamily;
  variant: AssetVariant;
  preferredVariantId?: string;
  savedStyle?: ElementStyleSnapshot;
  favorite: boolean;
  onFavorite: () => void;
  onInsert: () => void;
  onVariant: (id: string) => void;
  onAssetDragStart: () => void;
  onAssetDragEnd: () => void;
}) {
  const portalRoot = useOpenSketchPortalRoot();
  const sourceLabel = assetSourceLabel(family);
  const sourcePage = assetSourcePage(family);
  const sourceId = `asset-source-${family.familyId}`;
  const sourceTriggerRef = useRef<HTMLButtonElement>(null);
  const sourcePopoverRef = useRef<HTMLDivElement>(null);
  const sourceCloseTimer = useRef<number | null>(null);
  const [sourcePopoverOpen, setSourcePopoverOpen] = useState(false);
  const [sourcePopoverPosition, setSourcePopoverPosition] = useState({
    left: SOURCE_POPOVER_MARGIN,
    top: SOURCE_POPOVER_MARGIN,
    width: SOURCE_POPOVER_WIDTH
  });
  const openSourcePopover = () => {
    if (sourceCloseTimer.current !== null) {
      window.clearTimeout(sourceCloseTimer.current);
      sourceCloseTimer.current = null;
    }
    setSourcePopoverOpen(true);
  };
  const scheduleSourcePopoverClose = () => {
    if (sourceCloseTimer.current !== null) window.clearTimeout(sourceCloseTimer.current);
    sourceCloseTimer.current = window.setTimeout(() => {
      sourceCloseTimer.current = null;
      setSourcePopoverOpen(false);
    }, 140);
  };
  useEffect(
    () => () => {
      if (sourceCloseTimer.current !== null) window.clearTimeout(sourceCloseTimer.current);
    },
    []
  );
  useLayoutEffect(() => {
    if (!sourcePopoverOpen) return;
    const updateSourcePopoverPosition = () => {
      const trigger = sourceTriggerRef.current;
      if (!trigger) return;
      const triggerBounds = trigger.getBoundingClientRect();
      const width = Math.min(
        SOURCE_POPOVER_WIDTH,
        Math.max(0, window.innerWidth - SOURCE_POPOVER_MARGIN * 2)
      );
      const maxLeft = Math.max(
        SOURCE_POPOVER_MARGIN,
        window.innerWidth - width - SOURCE_POPOVER_MARGIN
      );
      const left = Math.min(Math.max(SOURCE_POPOVER_MARGIN, triggerBounds.right - width), maxLeft);
      const belowTop = triggerBounds.bottom + SOURCE_POPOVER_GAP;
      const popoverHeight = sourcePopoverRef.current?.getBoundingClientRect().height ?? 0;
      const top =
        popoverHeight > 0 && belowTop + popoverHeight > window.innerHeight - SOURCE_POPOVER_MARGIN
          ? Math.max(SOURCE_POPOVER_MARGIN, triggerBounds.top - popoverHeight - SOURCE_POPOVER_GAP)
          : belowTop;
      setSourcePopoverPosition((current) =>
        current.left === left && current.top === top && current.width === width
          ? current
          : { left, top, width }
      );
    };
    updateSourcePopoverPosition();
    window.addEventListener("resize", updateSourcePopoverPosition);
    window.addEventListener("scroll", updateSourcePopoverPosition, true);
    return () => {
      window.removeEventListener("resize", updateSourcePopoverPosition);
      window.removeEventListener("scroll", updateSourcePopoverPosition, true);
    };
  }, [sourcePopoverOpen]);
  const onDragStart = (event: DragEvent) => {
    const currentVariant =
      family.variants.find((candidate) => candidate.id === preferredVariantId) ?? variant;
    setAssetDragPayload(event.dataTransfer, family.familyId, currentVariant.id);
    setAssetDragImage(
      event.dataTransfer,
      event.currentTarget.querySelector<HTMLImageElement>(".asset-card-image img"),
      event
    );
  };
  return (
    <article
      className={`asset-card${family.editableStructure ? " asset-card-editable" : ""}`}
      draggable
      onDragStart={(event) => {
        onAssetDragStart();
        onDragStart(event);
      }}
      onDragEnd={onAssetDragEnd}
    >
      <button
        className="asset-card-image"
        onClick={onInsert}
        aria-label={`Insert ${family.title}`}
        aria-describedby={sourceId}
      >
        <AssetPreviewImage
          assetPath={variant.assetPath}
          fallbackPath={variant.thumbnailPath}
          savedStyle={savedStyle}
        />
      </button>
      <button className="asset-favorite" onClick={onFavorite} aria-label="Toggle favorite">
        <Heart size={14} fill={favorite ? "currentColor" : "none"} />
      </button>
      <div className="asset-source-control">
        <button
          ref={sourceTriggerRef}
          type="button"
          className="asset-source-trigger"
          aria-label={`Show source for ${family.title}`}
          aria-controls={sourceId}
          title="Show source information"
          onMouseEnter={openSourcePopover}
          onMouseLeave={scheduleSourcePopoverClose}
          onFocus={openSourcePopover}
          onBlur={scheduleSourcePopoverClose}
          onClick={(event) => event.stopPropagation()}
        >
          <Info size={14} aria-hidden="true" />
        </button>
      </div>
      {createPortal(
        <MotionPresence open={sourcePopoverOpen} exitMs={120}>
          <div
            ref={sourcePopoverRef}
            id={sourceId}
            className="asset-source-popover open"
            role="tooltip"
            style={sourcePopoverPosition}
            onMouseEnter={openSourcePopover}
            onMouseLeave={scheduleSourcePopoverClose}
            onFocus={openSourcePopover}
            onBlur={scheduleSourcePopoverClose}
          >
            <span className="asset-source-kicker">Source</span>
            <strong>{sourceLabel}</strong>
            {family.sourceName && family.author !== family.sourceName ? (
              <span>By {family.author}</span>
            ) : null}
            <span className="asset-source-license">{family.license}</span>
            {sourcePage ? (
              <a href={sourcePage} target="_blank" rel="noreferrer">
                View source <ExternalLink size={11} aria-hidden="true" />
              </a>
            ) : null}
          </div>
        </MotionPresence>,
        portalRoot ?? document.body
      )}
      <div className="asset-card-copy">
        {family.editableStructure && <span className="asset-editable-badge">Editable</span>}
        <strong title={family.title}>{family.title}</strong>
        {family.variants.length > 1 ? (
          <AssetVariantPicker family={family} value={variant.id} onChange={onVariant} />
        ) : (
          <small>{family.category}</small>
        )}
      </div>
    </article>
  );
}

function CommittedNumberInput({
  ariaLabel,
  value,
  min,
  max,
  onCommit
}: {
  ariaLabel: string;
  value: number;
  min: number;
  max: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = () => {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    const next = Math.max(min, Math.min(max, parsed));
    setDraft(String(next));
    if (next !== value) onCommit(next);
  };

  return (
    <input
      aria-label={ariaLabel}
      type="number"
      min={min}
      max={max}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          setDraft(String(value));
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function CreationDefaultsDisclosure({
  title,
  open,
  onChange,
  children
}: {
  title: string;
  open: boolean;
  onChange: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <section className={`creation-defaults ${open ? "open" : ""}`}>
      <button
        type="button"
        className="creation-defaults-summary"
        aria-expanded={open}
        onClick={() => onChange(!open)}
      >
        {title}
      </button>
      <MotionCollapse open={open}>
        <div className="creation-defaults-body">{children}</div>
      </MotionCollapse>
    </section>
  );
}

function ShapesPanel() {
  const services = useOpenSketchHostServices();
  const editor = useEditorFields(["creationDefaults", "setCreationDefaults"]);
  const [openSections, setOpenSections] = useState(() =>
    loadCreationDefaultsDisclosures((key) => services.preferences.get(key))
  );
  const setSectionOpen = (section: CreationDefaultsSection, open: boolean) => {
    setOpenSections((current) => {
      if (current[section] === open) return current;
      const next = { ...current, [section]: open };
      services.preferences.set(CREATION_DEFAULTS_DISCLOSURE_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };
  const updateTextDefaults = (properties: Partial<typeof editor.creationDefaults.text>) =>
    editor.setCreationDefaults((current) => ({
      ...current,
      text: { ...current.text, ...properties }
    }));
  const updateShapeDefaults = (properties: Partial<typeof editor.creationDefaults.shape>) =>
    editor.setCreationDefaults((current) => ({
      ...current,
      shape: { ...current.shape, ...properties }
    }));
  const updateLineDefaults = (properties: Partial<typeof editor.creationDefaults.line>) =>
    editor.setCreationDefaults((current) => ({
      ...current,
      line: { ...current.line, ...properties }
    }));
  return (
    <>
      <CreationDefaultsDisclosure
        title="New text defaults"
        open={openSections.text}
        onChange={(open) => setSectionOpen("text", open)}
      >
        <UiSelect
          className="field"
          label="Typeface"
          ariaLabel="Default text typeface"
          value={editor.creationDefaults.text.fontFamily}
          options={TEXT_FONT_FAMILIES.map((font) => ({ value: font, label: font }))}
          onChange={(fontFamily) => updateTextDefaults({ fontFamily })}
        />
        <div className="creation-default-grid">
          <div className="creation-color-field">
            Color
            <ColorPalettePicker
              ariaLabel="Default text color"
              value={editor.creationDefaults.text.color}
              onChange={(color) => updateTextDefaults({ color })}
            />
          </div>
          <label className="creation-number-field">
            Size
            <CommittedNumberInput
              ariaLabel="Default text size"
              min={6}
              max={400}
              value={editor.creationDefaults.text.fontSize}
              onCommit={(fontSize) => updateTextDefaults({ fontSize })}
            />
          </label>
        </div>
        <UiSelect
          className="field"
          label="Weight"
          ariaLabel="Default text weight"
          value={String(editor.creationDefaults.text.fontWeight)}
          options={[
            { value: "400", label: "Regular" },
            { value: "600", label: "Semibold" },
            { value: "700", label: "Bold" }
          ]}
          onChange={(fontWeight) => updateTextDefaults({ fontWeight: Number(fontWeight) })}
        />
      </CreationDefaultsDisclosure>
      <CreationDefaultsDisclosure
        title="New shape defaults"
        open={openSections.shape}
        onChange={(open) => setSectionOpen("shape", open)}
      >
        <div className="creation-default-grid">
          <div className="creation-color-field">
            Fill
            <ColorPalettePicker
              ariaLabel="Default shape fill"
              value={editor.creationDefaults.shape.fill}
              onChange={(fill) => updateShapeDefaults({ fill })}
              allowTransparent
            />
          </div>
          <div className="creation-color-field">
            Outline
            <ColorPalettePicker
              ariaLabel="Default shape outline"
              value={editor.creationDefaults.shape.stroke}
              onChange={(stroke) => updateShapeDefaults({ stroke })}
              allowTransparent
            />
          </div>
        </div>
        <label className="creation-number-field">
          Outline weight
          <CommittedNumberInput
            ariaLabel="Default shape outline weight"
            min={0}
            max={40}
            value={editor.creationDefaults.shape.strokeWidth}
            onCommit={(strokeWidth) => updateShapeDefaults({ strokeWidth })}
          />
        </label>
      </CreationDefaultsDisclosure>
      <CreationDefaultsDisclosure
        title="New line & arrow defaults"
        open={openSections.line}
        onChange={(open) => setSectionOpen("line", open)}
      >
        <div className="creation-default-grid">
          <div className="creation-color-field">
            Color
            <ColorPalettePicker
              ariaLabel="Default line color"
              value={editor.creationDefaults.line.color}
              onChange={(color) => updateLineDefaults({ color })}
            />
          </div>
          <label className="creation-number-field">
            Thickness
            <CommittedNumberInput
              ariaLabel="Default line thickness"
              min={1}
              max={40}
              value={editor.creationDefaults.line.width}
              onCommit={(width) => updateLineDefaults({ width })}
            />
          </label>
        </div>
        <UiSelect
          className="field"
          label="Line style"
          value={editor.creationDefaults.line.lineStyle}
          options={[
            { value: "solid", label: "Solid" },
            { value: "dashed", label: "Dashed" },
            { value: "dotted", label: "Dotted" }
          ]}
          onChange={(lineStyle) =>
            updateLineDefaults({ lineStyle: lineStyle as ConnectorLineStyle })
          }
        />
        <div className="creation-default-grid">
          <CreationArrowheadSelect
            label="Start head"
            value={editor.creationDefaults.line.startArrowhead}
            onChange={(startArrowhead) => updateLineDefaults({ startArrowhead })}
          />
          <CreationArrowheadSelect
            label="End head"
            value={editor.creationDefaults.line.endArrowhead}
            onChange={(endArrowhead) => updateLineDefaults({ endArrowhead })}
          />
        </div>
      </CreationDefaultsDisclosure>
    </>
  );
}

function CreationArrowheadSelect({
  label,
  value,
  onChange
}: {
  label: string;
  value: ConnectorArrowhead;
  onChange: (value: ConnectorArrowhead) => void;
}) {
  return (
    <UiSelect
      className="mini-field"
      label={label}
      value={value}
      options={[
        { value: "none", label: "None" },
        { value: "triangle", label: "Triangle" },
        { value: "open", label: "Open" },
        { value: "circle", label: "Circle" },
        { value: "open-circle", label: "Open dot" },
        { value: "bar", label: "Inhibitor bar" },
        { value: "neuron", label: "Neuron terminal" }
      ]}
      onChange={(next) => onChange(next as ConnectorArrowhead)}
    />
  );
}

function ImportsPanel() {
  const services = useOpenSketchHostServices();
  const editor = useEditorFields(["addImportedMedia", "importMedia"]);
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [imports, setImports] = useState<ImportedMediaLibraryRecord[]>([]);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void services.importedMedia.list().then((records) => {
        if (active) setImports(records);
      });
    };
    refresh();
    window.addEventListener(IMPORT_LIBRARY_CHANGED_EVENT, refresh);
    return () => {
      active = false;
      window.removeEventListener(IMPORT_LIBRARY_CHANGED_EVENT, refresh);
    };
  }, [services]);
  return (
    <div className="imports-panel">
      <button className="import-dropzone" onClick={() => input.current?.click()}>
        <span>
          <ImagePlus size={24} />
        </span>
        <strong>Import an image</strong>
        <small>SVG, PNG, JPEG, or WebP</small>
      </button>
      <input
        ref={input}
        hidden
        type="file"
        accept=".svg,.png,.jpg,.jpeg,.webp,image/svg+xml,image/png,image/jpeg,image/webp"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            setError("");
            void editor.importMedia(file).catch((reason) => setError(userErrorMessage(reason)));
          }
          event.currentTarget.value = "";
        }}
      />
      {error ? (
        <p className="panel-error" role="alert">
          {error}
        </p>
      ) : null}
      {imports.length > 0 ? (
        <div className="import-library-grid" aria-label="Imported media library">
          {imports.map((media) => (
            <article
              className="import-library-card"
              key={media.id}
              draggable
              onDragStart={(event) => setImportedMediaDragPayload(event.dataTransfer, media.id)}
            >
              <button
                className="import-library-preview"
                onClick={() => {
                  setError("");
                  void editor
                    .addImportedMedia(media)
                    .catch((reason) => setError(String(reason).replace(/^Error:\s*/, "")));
                }}
                aria-label={`Insert ${media.name}`}
              >
                <img src={media.dataUrl} alt="" draggable={false} />
              </button>
              <div>
                <strong title={media.name}>{media.name}</strong>
                <small>
                  {media.mimeType === "image/svg+xml"
                    ? "SVG"
                    : media.mimeType === "image/jpeg"
                      ? "JPEG"
                      : media.mimeType.replace("image/", "").toUpperCase()}
                </small>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-import-library">
          <ImagePlus size={22} />
          <strong>No imports yet</strong>
        </div>
      )}
    </div>
  );
}
