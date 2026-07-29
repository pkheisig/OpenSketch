import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent
} from "react";
import { FixedSizeList as List, type ListChildComponentProps } from "react-window";
import {
  ArrowRight,
  Edit3,
  FileInput,
  Heart,
  ImagePlus,
  Search,
  Shapes,
  SlidersHorizontal,
  Sparkles,
  Type,
  X
} from "lucide-react";
import {
  filterAssetFamilies,
  type AssetFamily,
  type AssetVariant,
  type ConnectorArrowhead,
  type ConnectorLineStyle
} from "@workspace/editor-core";
import { ASSET_CATEGORIES, assetManifest } from "@/assets/manifest";
import { AssetPreviewImage } from "@/components/AssetPreviewImage";
import { useEditor } from "@/editor/EditorContext";
import {
  buildConnectorGeometry,
  connectorArrowheadPoint,
  connectorStrokeLineCap
} from "@/editor/connectorGeometry";
import {
  CONNECTOR_FAMILIES,
  CONNECTOR_PRESETS,
  connectorPreviewEndpoints,
  type ConnectorFamily,
  type ConnectorPreset
} from "@/editor/connectorPresets";
import {
  loadSavedElementStyles,
  SAVED_ELEMENT_STYLES_CHANGED_EVENT,
  type ElementStyleSnapshot,
  type SavedElementStyles
} from "@/editor/elementStyles";
import { TEXT_FONT_FAMILIES } from "@/editor/fonts";
import { setAssetDragPayload, setImportedMediaDragPayload } from "@/editor/assetDrag";
import {
  ASSET_VARIANT_DEFAULTS_CHANGED_EVENT,
  loadAssetVariantDefaults,
  saveAssetVariantDefault
} from "@/editor/assetVariantDefaults";
import { AssetVariantPicker } from "@/components/AssetVariantPicker";
import { ColorPalettePicker } from "@/components/ColorPalettePicker";
import { InspectorContent, LayersPanel } from "@/components/Inspector";
import { UiSelect } from "@/components/UiSelect";
import {
  IMPORT_LIBRARY_CHANGED_EVENT,
  listImportedMedia,
  type ImportedMediaLibraryRecord
} from "@/persistence/database";

type Tab = "assets" | "imports" | "edit";
type Flyout = "lines" | "shapes" | "defaults" | null;
type CreationDefaultsSection = "text" | "shape" | "line";

const CREATION_DEFAULTS_DISCLOSURE_STORAGE_KEY = "OpenSketch:creation-defaults-disclosures";
const DEFAULT_CREATION_DEFAULTS_DISCLOSURES: Record<CreationDefaultsSection, boolean> = {
  text: true,
  shape: true,
  line: true
};

function loadCreationDefaultsDisclosures(): Record<CreationDefaultsSection, boolean> {
  try {
    const stored = JSON.parse(
      localStorage.getItem(CREATION_DEFAULTS_DISCLOSURE_STORAGE_KEY) ?? "null"
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

const SHAPE_GROUPS = {
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
    const aspectRatio = 43 / 31;
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
      width="43"
      height="31"
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
  const [tab, setTab] = useState<Tab>("assets");
  const [flyout, setFlyout] = useState<Flyout>(null);
  const [lineFamily, setLineFamily] = useState<ConnectorFamily | null>(null);
  const [shapeFamily, setShapeFamily] = useState<keyof typeof SHAPE_GROUPS | null>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const handledSelection = useRef("");
  const editor = useEditor();
  const setCreationTool = editor.setCreationTool;
  const canEdit = editor.selection.length > 0;
  const selectionKey = editor.selection
    .map((object, index) => object.objectId ?? `${object.type}:${object.name ?? index}`)
    .join("|");
  const openPanel = (next: Tab) => {
    const shouldClose = !collapsed && tab === next;
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
    const arrow =
      value.endArrowhead !== "none" ||
      value.startArrowhead !== "none" ||
      family !== "lines" ||
      value.pathShape === "circular";
    editor.setCreationTool({
      type: "shape",
      kind: arrow ? "arrow" : value.pathShape === "straight" ? "line" : "curved-line",
      connectorPreset: value
    });
    setFlyout(null);
    setLineFamily(null);
  };
  useEffect(() => {
    if (!selectionKey) {
      handledSelection.current = "";
      if (tab === "edit" && !collapsed) onToggle();
      return;
    }
    if (!editor.autoEditEnabled) return;
    if (editor.creationTool || handledSelection.current === selectionKey) return;
    handledSelection.current = selectionKey;
    setTab("edit");
    if (collapsed) onToggle();
  }, [collapsed, editor.autoEditEnabled, editor.creationTool, onToggle, selectionKey, tab]);
  useEffect(() => {
    if (!editor.creationTool || collapsed) return;
    onToggle();
  }, [collapsed, editor.creationTool, onToggle]);
  useEffect(() => {
    const closeOutsideSidebar = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (sidebarRef.current?.contains(target)) return;
      if (
        target.closest(
          ".ui-select-menu, .color-palette-popover, .asset-variant-menu, " +
            ".selection-quick-toolbar, .selection-toolbar-menu"
        )
      ) {
        return;
      }
      setFlyout(null);
      setLineFamily(null);
      setShapeFamily(null);
      if (!collapsed) onToggle();
    };
    document.addEventListener("pointerdown", closeOutsideSidebar, true);
    return () => document.removeEventListener("pointerdown", closeOutsideSidebar, true);
  }, [collapsed, onToggle]);
  useEffect(() => {
    const clearCreationToolOutsideSidebar = (event: MouseEvent) => {
      const target = event.target;
      const sidebar = sidebarRef.current;
      if (
        !(target instanceof Element) ||
        (sidebar && event.composedPath().includes(sidebar))
      ) {
        return;
      }
      if (
        target.closest(
          ".ui-select-menu, .color-palette-popover, .asset-variant-menu, " +
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
      {flyout === "lines" ? (
        <div
          className="tool-flyout line-tool-flyout"
          role="menu"
          aria-label="Line and arrow tools"
          onPointerLeave={() => setLineFamily(null)}
        >
          <div className="tool-flyout-primary">
            {CONNECTOR_FAMILIES.map(({ id: family, label }) => {
              const sample = CONNECTOR_PRESETS[family][0];
              return (
                <button
                  key={family}
                  className={lineFamily === family ? "active" : ""}
                  onPointerEnter={() => setLineFamily(family)}
                  onClick={() => setLineFamily(family)}
                  role="menuitem"
                >
                  <ConnectorPresetIcon value={sample} />
                  {label}
                  <ArrowRight size={14} />
                </button>
              );
            })}
          </div>
          {lineFamily ? (
            <div className={`tool-flyout-secondary connector-family-${lineFamily}`}>
              {CONNECTOR_PRESETS[lineFamily].map((value) => {
                return (
                  <button
                    key={value.label}
                    onClick={() => chooseLinePreset(value, lineFamily)}
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
        </div>
      ) : null}
      {flyout === "shapes" ? (
        <div
          className="tool-flyout shape-tool-flyout"
          role="menu"
          aria-label="Shape tools"
          onPointerLeave={() => setShapeFamily(null)}
        >
          <div className="tool-flyout-primary">
            <button
              className={shapeFamily === "basic" ? "active" : ""}
              onPointerEnter={() => setShapeFamily("basic")}
              onClick={() => setShapeFamily("basic")}
              role="menuitem"
            >
              <ShapePresetIcon glyph="rectangle" /> Shapes <ArrowRight size={14} />
            </button>
            <button
              className={shapeFamily === "polygons" ? "active" : ""}
              onPointerEnter={() => setShapeFamily("polygons")}
              onClick={() => setShapeFamily("polygons")}
              role="menuitem"
            >
              <ShapePresetIcon glyph="hexagon" /> Polygons <ArrowRight size={14} />
            </button>
          </div>
          {shapeFamily ? (
            <div className="tool-flyout-secondary shape-flyout-grid">
              {SHAPE_GROUPS[shapeFamily].map(([kind, glyph, label]) => (
                <button
                  key={kind}
                  onClick={() => {
                    editor.setCreationTool({ type: "shape", kind });
                    setFlyout(null);
                    setShapeFamily(null);
                  }}
                  role="menuitem"
                  aria-label={label}
                  title={label}
                >
                  <ShapePresetIcon glyph={glyph} />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {flyout === "defaults" ? (
        <div
          className="tool-flyout tool-defaults-flyout"
          role="dialog"
          aria-label="New object defaults"
        >
          <ShapesPanel />
        </div>
      ) : null}
      {!collapsed && (tab !== "edit" || canEdit) ? (
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
            {tab === "assets" && <AssetsPanel />}
            {tab === "imports" && <ImportsPanel />}
            {tab === "edit" && <InspectorContent onClose={onToggle} />}
          </div>
          <LayersPanel />
        </div>
      ) : null}
    </aside>
  );
}

function AssetsPanel() {
  const editor = useEditor();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [variants, setVariants] = useState(loadAssetVariantDefaults);
  const [favorites, setFavorites] = useState<Set<string>>(
    () => new Set(JSON.parse(localStorage.getItem("OpenSketch:favorites") ?? "[]") as string[])
  );
  const [recent, setRecent] = useState<string[]>(
    () => JSON.parse(localStorage.getItem("OpenSketch:recent-assets") ?? "[]") as string[]
  );
  const [assetError, setAssetError] = useState("");
  const [assetListHeight, setAssetListHeight] = useState(0);
  const [savedStyles, setSavedStyles] = useState<SavedElementStyles>(loadSavedElementStyles);
  const assetListRef = useRef<HTMLDivElement>(null);
  const families = useMemo(() => {
    const matches = filterAssetFamilies(
      assetManifest.families,
      debouncedQuery,
      category === "Favorites" ? "All" : category
    );
    return category === "Favorites"
      ? matches.filter((family) => favorites.has(family.familyId))
      : matches;
  }, [category, debouncedQuery, favorites]);
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(query), 160);
    return () => window.clearTimeout(timeout);
  }, [query]);
  useEffect(() => {
    const updateSavedStyles = () => setSavedStyles(loadSavedElementStyles());
    window.addEventListener(SAVED_ELEMENT_STYLES_CHANGED_EVENT, updateSavedStyles);
    return () => window.removeEventListener(SAVED_ELEMENT_STYLES_CHANGED_EVENT, updateSavedStyles);
  }, []);
  useEffect(() => {
    const updateVariants = () => setVariants(loadAssetVariantDefaults());
    window.addEventListener(ASSET_VARIANT_DEFAULTS_CHANGED_EVENT, updateVariants);
    return () => window.removeEventListener(ASSET_VARIANT_DEFAULTS_CHANGED_EVENT, updateVariants);
  }, []);
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
    localStorage.setItem("OpenSketch:favorites", JSON.stringify([...next]));
  };

  const insert = (family: AssetFamily, variant: AssetVariant) => {
    const next = [family.familyId, ...recent.filter((id) => id !== family.familyId)].slice(0, 8);
    setRecent(next);
    localStorage.setItem("OpenSketch:recent-assets", JSON.stringify(next));
    setAssetError("");
    void editor
      .addAsset(family, variant)
      .catch((reason) => setAssetError(String(reason).replace(/^Error:\s*/, "")));
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
            savedStyle={savedStyles[`asset:${variant.id}`]}
            favorite={favorites.has(family.familyId)}
            onFavorite={() => toggleFavorite(family.familyId)}
            onInsert={() => insert(family, variant)}
            onVariant={(variantId) => saveAssetVariantDefault(family.familyId, variantId)}
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
      <label className="search-box">
        <Search size={16} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search cells, proteins, equipment…"
        />
        {query && (
          <button onClick={() => setQuery("")} aria-label="Clear search">
            <X size={14} />
          </button>
        )}
      </label>
      <div className="category-strip" role="list" aria-label="Asset categories">
        {["Favorites", ...ASSET_CATEGORIES].map((item) => (
          <button
            key={item}
            className={category === item ? "active" : ""}
            onClick={() => setCategory(item)}
          >
            {item === "Favorites" ? <Heart size={14} aria-hidden="true" /> : null}
            {item}
          </button>
        ))}
      </div>
      {assetError ? (
        <p className="panel-error" role="alert">
          {assetError}
        </p>
      ) : null}
      {!query && category !== "Favorites" && recent.length > 0 && (
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
      {families.length ? (
        <div
          ref={assetListRef}
          className="asset-list-shell"
          onKeyDown={navigateAssets}
          aria-label="NIH BioArt illustration families"
        >
          {assetListHeight > 0 && (
            <List
              className="asset-list"
              height={assetListHeight}
              itemCount={rows}
              itemSize={184}
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
          <p>
            Run <code>pnpm assets:sync</code> during development to import the complete
            public-domain NIH BioArt collection. The app never fetches it at runtime.
          </p>
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

function AssetCard({
  family,
  variant,
  savedStyle,
  favorite,
  onFavorite,
  onInsert,
  onVariant
}: {
  family: AssetFamily;
  variant: AssetVariant;
  savedStyle?: ElementStyleSnapshot;
  favorite: boolean;
  onFavorite: () => void;
  onInsert: () => void;
  onVariant: (id: string) => void;
}) {
  const onDragStart = (event: DragEvent) => {
    const storedVariantId = loadAssetVariantDefaults()[family.familyId];
    const currentVariant =
      family.variants.find((candidate) => candidate.id === storedVariantId) ?? variant;
    setAssetDragPayload(event.dataTransfer, family.familyId, currentVariant.id);
  };
  return (
    <article className="asset-card" draggable onDragStart={onDragStart}>
      <button className="asset-card-image" onClick={onInsert} aria-label={`Insert ${family.title}`}>
        <AssetPreviewImage
          assetPath={variant.assetPath}
          fallbackPath={variant.thumbnailPath}
          savedStyle={savedStyle}
        />
      </button>
      <button className="asset-favorite" onClick={onFavorite} aria-label="Toggle favorite">
        <Heart size={14} fill={favorite ? "currentColor" : "none"} />
      </button>
      <div className="asset-card-copy">
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

function ShapesPanel() {
  const editor = useEditor();
  const [openSections, setOpenSections] = useState(loadCreationDefaultsDisclosures);
  const setSectionOpen = (section: CreationDefaultsSection, open: boolean) => {
    setOpenSections((current) => {
      if (current[section] === open) return current;
      const next = { ...current, [section]: open };
      try {
        localStorage.setItem(CREATION_DEFAULTS_DISCLOSURE_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Keep the disclosure state for this session when storage is unavailable.
      }
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
      <details
        className="creation-defaults"
        open={openSections.text}
        onToggle={(event) => setSectionOpen("text", event.currentTarget.open)}
      >
        <summary>New text defaults</summary>
        <div className="creation-defaults-body">
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
                showValue
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
        </div>
      </details>
      <details
        className="creation-defaults"
        open={openSections.shape}
        onToggle={(event) => setSectionOpen("shape", event.currentTarget.open)}
      >
        <summary>New shape defaults</summary>
        <div className="creation-defaults-body">
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
        </div>
      </details>
      <details
        className="creation-defaults"
        open={openSections.line}
        onToggle={(event) => setSectionOpen("line", event.currentTarget.open)}
      >
        <summary>New line & arrow defaults</summary>
        <div className="creation-defaults-body">
          <div className="creation-default-grid">
            <div className="creation-color-field">
              Color
              <ColorPalettePicker
                ariaLabel="Default line color"
                value={editor.creationDefaults.line.color}
                onChange={(color) => updateLineDefaults({ color })}
                showValue
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
        </div>
      </details>
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
  const editor = useEditor();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [imports, setImports] = useState<ImportedMediaLibraryRecord[]>([]);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void listImportedMedia().then((records) => {
        if (active) setImports(records);
      });
    };
    refresh();
    window.addEventListener(IMPORT_LIBRARY_CHANGED_EVENT, refresh);
    return () => {
      active = false;
      window.removeEventListener(IMPORT_LIBRARY_CHANGED_EVENT, refresh);
    };
  }, []);
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
            void editor
              .importMedia(file)
              .catch((reason) => setError(String(reason).replace(/^Error:\s*/, "")));
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
                onClick={() => void editor.addImportedMedia(media)}
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
