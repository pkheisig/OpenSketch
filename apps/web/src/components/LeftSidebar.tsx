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
  Minus,
  Search,
  Shapes,
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
import { Group, StaticCanvas, util, type FabricObject } from "fabric";
import { ASSET_CATEGORIES, assetManifest } from "@/assets/manifest";
import { useEditor } from "@/editor/EditorContext";
import {
  applyElementStyle,
  loadSavedElementStyles,
  SAVED_ELEMENT_STYLES_CHANGED_EVENT,
  type ElementStyleSnapshot,
  type SavedElementStyles
} from "@/editor/elementStyles";
import { TEXT_FONT_FAMILIES } from "@/editor/fonts";
import { loadEditableSvg } from "@/editor/svg";
import {
  ASSET_VARIANT_DEFAULTS_CHANGED_EVENT,
  loadAssetVariantDefaults,
  saveAssetVariantDefault
} from "@/editor/assetVariantDefaults";
import { AssetVariantPicker } from "@/components/AssetVariantPicker";
import { InspectorContent, LayersPanel } from "@/components/Inspector";
import { UiSelect } from "@/components/UiSelect";

type Tab = "assets" | "imports" | "edit";
type Flyout = "lines" | "shapes" | "defaults" | null;

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
    ["parallelogram", "parallelogram", "Parallelogram"],
    ["star", "star", "Star"]
  ]
} as const;

const LINE_PRESETS = [
  {
    label: "Line",
    kind: "line",
    glyph: "solid",
    defaults: { lineStyle: "solid", startArrowhead: "none", endArrowhead: "none" }
  },
  {
    label: "Dashed line",
    kind: "line",
    glyph: "dashed",
    defaults: { lineStyle: "dashed", startArrowhead: "none", endArrowhead: "none" }
  },
  {
    label: "Dotted line",
    kind: "line",
    glyph: "dotted",
    defaults: { lineStyle: "dotted", startArrowhead: "none", endArrowhead: "none" }
  },
  {
    label: "Curved line",
    kind: "curved-line",
    glyph: "curved-line",
    defaults: { lineStyle: "solid", startArrowhead: "none", endArrowhead: "none" }
  },
  {
    label: "Dashed curved line",
    kind: "curved-line",
    glyph: "dashed-curved-line",
    defaults: { lineStyle: "dashed", startArrowhead: "none", endArrowhead: "none" }
  },
  {
    label: "Dotted curved line",
    kind: "curved-line",
    glyph: "dotted-curved-line",
    defaults: { lineStyle: "dotted", startArrowhead: "none", endArrowhead: "none" }
  }
] as const;

const ARROW_PRESETS = [
  {
    label: "Arrow",
    kind: "arrow",
    glyph: "arrow",
    defaults: { lineStyle: "solid", startArrowhead: "none", endArrowhead: "triangle" }
  },
  {
    label: "Open arrow",
    kind: "arrow",
    glyph: "open-arrow",
    defaults: { lineStyle: "solid", startArrowhead: "none", endArrowhead: "open" }
  },
  {
    label: "Double arrow",
    kind: "double-arrow",
    glyph: "double-arrow",
    defaults: { lineStyle: "solid", startArrowhead: "triangle", endArrowhead: "triangle" }
  },
  {
    label: "Curved arrow",
    kind: "curved-arrow",
    glyph: "curved-arrow",
    defaults: { lineStyle: "solid", startArrowhead: "none", endArrowhead: "triangle" }
  },
  {
    label: "Dashed arrow",
    kind: "arrow",
    glyph: "dashed-arrow",
    defaults: { lineStyle: "dashed", startArrowhead: "none", endArrowhead: "triangle" }
  },
  {
    label: "Circle-ended line",
    kind: "line",
    glyph: "circle-ended",
    defaults: { lineStyle: "solid", startArrowhead: "circle", endArrowhead: "circle" }
  },
  {
    label: "Circle-start arrow",
    kind: "arrow",
    glyph: "circle-start-arrow",
    defaults: { lineStyle: "solid", startArrowhead: "circle", endArrowhead: "triangle" }
  },
  {
    label: "Dotted arrow",
    kind: "arrow",
    glyph: "dotted-arrow",
    defaults: { lineStyle: "dotted", startArrowhead: "none", endArrowhead: "triangle" }
  }
] as const;

function LinePresetIcon({ glyph }: { glyph: string }) {
  const line = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const
  };
  return (
    <svg width="31" height="24" viewBox="0 0 32 24" aria-hidden="true">
      {glyph === "solid" && <path {...line} d="M3 12h26" />}
      {glyph === "dashed" && <path {...line} strokeDasharray="6 4" d="M3 12h26" />}
      {glyph === "dotted" && <path {...line} strokeDasharray="1 4" d="M3 12h26" />}
      {glyph === "curved-line" && <path {...line} d="M3 18C8 4 22 4 29 16" />}
      {glyph === "dashed-curved-line" && (
        <path {...line} strokeDasharray="5 3" d="M3 18C8 4 22 4 29 16" />
      )}
      {glyph === "dotted-curved-line" && (
        <path {...line} strokeDasharray="1 4" d="M3 18C8 4 22 4 29 16" />
      )}
      {glyph === "arrow" && <path {...line} d="M3 12h24m-6-6 6 6-6 6" />}
      {glyph === "open-arrow" && <path {...line} d="M3 12h23m-5-5 5 5-5 5" />}
      {glyph === "double-arrow" && (
        <path {...line} d="M6 6 1 12l5 6M1 12h30M26 6l5 6-5 6" />
      )}
      {glyph === "curved-arrow" && <path {...line} d="M3 17C5 4 21 4 27 12m-5-1 5 1-2 5" />}
      {glyph === "dashed-arrow" && (
        <path {...line} strokeDasharray="5 3" d="M3 12h24m-6-6 6 6-6 6" />
      )}
      {glyph === "circle-ended" && (
        <>
          <circle {...line} cx="4" cy="12" r="2.5" />
          <path {...line} d="M7 12h18" />
          <circle {...line} cx="28" cy="12" r="2.5" />
        </>
      )}
      {glyph === "circle-start-arrow" && (
        <>
          <circle {...line} cx="4" cy="12" r="2.5" />
          <path {...line} d="M7 12h20m-6-6 6 6-6 6" />
        </>
      )}
      {glyph === "dotted-arrow" && (
        <path {...line} strokeDasharray="1 4" d="M3 12h24m-6-6 6 6-6 6" />
      )}
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
      {glyph === "star" && (
        <path {...outline} d="m16 2 3.5 7.6 8.5.9-6.3 5.7 1.8 8.3-7.5-4.2-7.5 4.2 1.8-8.3L4 10.5l8.5-.9Z" />
      )}
    </svg>
  );
}

const styledAssetPreviewCache = new Map<string, Promise<string>>();
const styledAssetPreviewSources = new Map<string, string>();

function styledAssetPreviewKey(assetPath: string, snapshot: ElementStyleSnapshot): string {
  return `${assetPath}:${JSON.stringify(snapshot)}`;
}

async function styledAssetPreview(
  assetPath: string,
  snapshot: ElementStyleSnapshot
): Promise<string> {
  const cacheKey = styledAssetPreviewKey(assetPath, snapshot);
  const resolved = styledAssetPreviewSources.get(cacheKey);
  if (resolved) return resolved;
  const cached = styledAssetPreviewCache.get(cacheKey);
  if (cached) return cached;
  const preview = (async () => {
    const response = await fetch(assetPath);
    if (!response.ok) throw new Error(`Could not preview ${assetPath}.`);
    const parsed = await loadEditableSvg(await response.text());
    const objects = parsed.objects.filter((object): object is FabricObject => Boolean(object));
    const grouped = util.groupSVGElements(objects, parsed.options);
    const group = grouped instanceof Group ? grouped : new Group([grouped]);
    applyElementStyle(group, snapshot);
    // Render through Fabric's normal canvas renderer so nested groups,
    // gradients, masks, and stacking match the inserted object. Serializing a
    // detached group with toSVG can omit group-level paint definitions.
    const previewSize = 448;
    const padding = 18;
    const width = Math.max(1, group.width || 1);
    const height = Math.max(1, group.height || 1);
    const scale = Math.min(
      (previewSize - padding * 2) / width,
      (previewSize - padding * 2) / height
    );
    group.set({
      left: previewSize / 2,
      top: previewSize / 2,
      originX: "center",
      originY: "center",
      scaleX: scale,
      scaleY: scale
    });
    group.setCoords();
    const previewCanvas = new StaticCanvas(undefined, {
      width: previewSize,
      height: previewSize,
      enableRetinaScaling: false,
      renderOnAddRemove: false
    });
    previewCanvas.add(group);
    previewCanvas.renderAll();
    const source = previewCanvas.toDataURL({ format: "png", multiplier: 1 });
    previewCanvas.dispose();
    styledAssetPreviewSources.set(cacheKey, source);
    return source;
  })();
  styledAssetPreviewCache.set(cacheKey, preview);
  void preview.catch(() => {
    styledAssetPreviewCache.delete(cacheKey);
  });
  return preview;
}

export function LeftSidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const [tab, setTab] = useState<Tab>("assets");
  const [flyout, setFlyout] = useState<Flyout>(null);
  const [lineFamily, setLineFamily] = useState<"lines" | "arrows">("lines");
  const [shapeFamily, setShapeFamily] = useState<keyof typeof SHAPE_GROUPS>("basic");
  const closeTimer = useRef<number | undefined>(undefined);
  const editor = useEditor();
  const openPanel = (next: Tab) => {
    setTab(next);
    setFlyout(null);
    editor.setCreationTool(null);
    if (collapsed) onToggle();
  };
  const openFlyout = (next: Exclude<Flyout, null>) => {
    window.clearTimeout(closeTimer.current);
    setFlyout(next);
  };
  const scheduleFlyoutClose = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setFlyout(null), 180);
  };
  const chooseLinePreset = (preset: (typeof LINE_PRESETS)[number] | (typeof ARROW_PRESETS)[number]) => {
    editor.setCreationDefaults({
      ...editor.creationDefaults,
      line: { ...editor.creationDefaults.line, ...preset.defaults }
    });
    editor.setCreationTool({ type: "shape", kind: preset.kind });
    setFlyout(null);
  };
  useEffect(() => {
    if (editor.selection.length === 0 || editor.creationTool) return;
    setTab("edit");
    if (collapsed) onToggle();
  }, [collapsed, editor.creationTool, editor.selection.length, onToggle]);
  useEffect(() => {
    if (!editor.creationTool || collapsed) return;
    onToggle();
  }, [collapsed, editor.creationTool, onToggle]);
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);
  return (
    <aside className={`left-sidebar floating-sidebar ${collapsed ? "panel-closed" : ""}`}>
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
          onPointerEnter={() => openFlyout("lines")}
          onPointerLeave={scheduleFlyoutClose}
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
          onPointerEnter={() => openFlyout("shapes")}
          onPointerLeave={scheduleFlyoutClose}
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
        <button
          className={tab === "edit" && !collapsed ? "active" : ""}
          onClick={() => openPanel("edit")}
          aria-label="Edit"
          title="Edit"
          data-label="Edit"
        >
          <Edit3 size={20} />
        </button>
      </nav>
      {flyout === "lines" ? (
        <div
          className="tool-flyout line-tool-flyout"
          role="menu"
          aria-label="Line and arrow tools"
          onPointerEnter={() => window.clearTimeout(closeTimer.current)}
          onPointerLeave={scheduleFlyoutClose}
        >
          <div className="tool-flyout-primary">
            <button
              className={lineFamily === "lines" ? "active" : ""}
              onPointerEnter={() => setLineFamily("lines")}
              onClick={() => setLineFamily("lines")}
              role="menuitem"
            >
              <Minus size={18} /> Lines <ArrowRight size={14} />
            </button>
            <button
              className={lineFamily === "arrows" ? "active" : ""}
              onPointerEnter={() => setLineFamily("arrows")}
              onClick={() => setLineFamily("arrows")}
              role="menuitem"
            >
              <ArrowRight size={18} /> Arrows <ArrowRight size={14} />
            </button>
            <button onClick={() => setFlyout("defaults")} role="menuitem">
              <Sparkles size={18} /> Defaults <ArrowRight size={14} />
            </button>
          </div>
          <div className="tool-flyout-secondary">
            {(lineFamily === "lines" ? LINE_PRESETS : ARROW_PRESETS).map((preset) => {
              return (
                <button
                  key={preset.label}
                  onClick={() => chooseLinePreset(preset)}
                  role="menuitem"
                  aria-label={preset.label}
                  title={preset.label}
                >
                  <LinePresetIcon glyph={preset.glyph} />
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      {flyout === "shapes" ? (
        <div
          className="tool-flyout shape-tool-flyout"
          role="menu"
          aria-label="Shape tools"
          onPointerEnter={() => window.clearTimeout(closeTimer.current)}
          onPointerLeave={scheduleFlyoutClose}
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
            <button onClick={() => setFlyout("defaults")} role="menuitem">
              <Sparkles size={18} /> Defaults <ArrowRight size={14} />
            </button>
          </div>
          <div className="tool-flyout-secondary shape-flyout-grid">
            {SHAPE_GROUPS[shapeFamily].map(([kind, glyph, label]) => (
              <button
                key={kind}
                onClick={() => {
                  editor.setCreationTool({ type: "shape", kind });
                  setFlyout(null);
                }}
                role="menuitem"
                aria-label={label}
                title={label}
              >
                <ShapePresetIcon glyph={glyph} />
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {flyout === "defaults" ? (
        <div
          className="tool-flyout tool-defaults-flyout"
          role="dialog"
          aria-label="New object defaults"
          onPointerEnter={() => window.clearTimeout(closeTimer.current)}
          onPointerLeave={scheduleFlyoutClose}
        >
          <ShapesPanel />
        </div>
      ) : null}
      {!collapsed ? (
        <div className="sidebar-expanded floating-panel">
          {tab !== "edit" ? (
            <div className="floating-panel-header">
              <strong>
                {tab === "assets" ? "Assets" : "Imports"}
              </strong>
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
    const matches = filterAssetFamilies(assetManifest.families, debouncedQuery, category);
    return matches
      .map((family, index) => ({ family, index }))
      .sort(
        (left, right) =>
          Number(favorites.has(right.family.familyId)) -
            Number(favorites.has(left.family.familyId)) || left.index - right.index
      )
      .map(({ family }) => family);
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
        {ASSET_CATEGORIES.map((item) => (
          <button
            key={item}
            className={category === item ? "active" : ""}
            onClick={() => setCategory(item)}
          >
            {item}
          </button>
        ))}
      </div>
      {assetError ? (
        <p className="panel-error" role="alert">
          {assetError}
        </p>
      ) : null}
      {!query && recent.length > 0 && (
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
  const [previewSrc, setPreviewSrc] = useState(() => {
    if (!savedStyle) return variant.thumbnailPath;
    return (
      styledAssetPreviewSources.get(styledAssetPreviewKey(variant.assetPath, savedStyle)) ??
      variant.thumbnailPath
    );
  });
  useEffect(() => {
    let active = true;
    if (!savedStyle) {
      setPreviewSrc(variant.thumbnailPath);
      return () => {
        active = false;
      };
    }
    const cacheKey = styledAssetPreviewKey(variant.assetPath, savedStyle);
    const resolved = styledAssetPreviewSources.get(cacheKey);
    if (resolved) {
      setPreviewSrc(resolved);
      return () => {
        active = false;
      };
    }
    void styledAssetPreview(variant.assetPath, savedStyle)
      .then((source) => {
        if (active) setPreviewSrc(source);
      })
      .catch(() => {
        if (active) setPreviewSrc(variant.thumbnailPath);
      });
    return () => {
      active = false;
    };
  }, [savedStyle, variant.assetPath, variant.thumbnailPath]);
  const onDragStart = (event: DragEvent) => {
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(
      "application/x-scientific-asset",
      JSON.stringify({ familyId: family.familyId, variantId: variant.id })
    );
  };
  return (
    <article className="asset-card" draggable onDragStart={onDragStart}>
      <button className="asset-card-image" onClick={onInsert} aria-label={`Insert ${family.title}`}>
        <img src={previewSrc} alt="" loading="lazy" />
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

function ShapesPanel() {
  const editor = useEditor();
  const updateTextDefaults = (properties: Partial<typeof editor.creationDefaults.text>) =>
    editor.setCreationDefaults({
      ...editor.creationDefaults,
      text: { ...editor.creationDefaults.text, ...properties }
    });
  const updateShapeDefaults = (properties: Partial<typeof editor.creationDefaults.shape>) =>
    editor.setCreationDefaults({
      ...editor.creationDefaults,
      shape: { ...editor.creationDefaults.shape, ...properties }
    });
  const updateLineDefaults = (properties: Partial<typeof editor.creationDefaults.line>) =>
    editor.setCreationDefaults({
      ...editor.creationDefaults,
      line: { ...editor.creationDefaults.line, ...properties }
    });
  return (
    <>
      <details className="creation-defaults" open>
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
            <label className="creation-color-field">
              Color
              <span>
                <input
                  aria-label="Default text color"
                  type="color"
                  value={editor.creationDefaults.text.color}
                  onChange={(event) => updateTextDefaults({ color: event.target.value })}
                />
                {editor.creationDefaults.text.color}
              </span>
            </label>
            <label className="creation-number-field">
              Size
              <input
                aria-label="Default text size"
                type="number"
                min="6"
                max="400"
                value={editor.creationDefaults.text.fontSize}
                onChange={(event) => updateTextDefaults({ fontSize: Number(event.target.value) })}
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
      <details className="creation-defaults">
        <summary>New shape defaults</summary>
        <div className="creation-defaults-body">
          <div className="creation-default-grid">
            <label className="creation-color-field">
              Fill
              <span>
                <input
                  aria-label="Default shape fill"
                  type="color"
                  value={editor.creationDefaults.shape.fill}
                  onChange={(event) => updateShapeDefaults({ fill: event.target.value })}
                />
              </span>
            </label>
            <label className="creation-color-field">
              Outline
              <span>
                <input
                  aria-label="Default shape outline"
                  type="color"
                  value={editor.creationDefaults.shape.stroke}
                  onChange={(event) => updateShapeDefaults({ stroke: event.target.value })}
                />
              </span>
            </label>
          </div>
          <label className="creation-number-field">
            Outline weight
            <input
              aria-label="Default shape outline weight"
              type="number"
              min="0"
              max="40"
              value={editor.creationDefaults.shape.strokeWidth}
              onChange={(event) => updateShapeDefaults({ strokeWidth: Number(event.target.value) })}
            />
          </label>
        </div>
      </details>
      <details className="creation-defaults" open>
        <summary>New line & arrow defaults</summary>
        <div className="creation-defaults-body">
          <div className="creation-default-grid">
            <label className="creation-color-field">
              Color
              <span>
                <input
                  aria-label="Default line color"
                  type="color"
                  value={editor.creationDefaults.line.color}
                  onChange={(event) => updateLineDefaults({ color: event.target.value })}
                />
                {editor.creationDefaults.line.color}
              </span>
            </label>
            <label className="creation-number-field">
              Thickness
              <input
                aria-label="Default line thickness"
                type="number"
                min="1"
                max="40"
                value={editor.creationDefaults.line.width}
                onChange={(event) => updateLineDefaults({ width: Number(event.target.value) })}
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
        { value: "circle", label: "Circle" }
      ]}
      onChange={(next) => onChange(next as ConnectorArrowhead)}
    />
  );
}

function ImportsPanel() {
  const editor = useEditor();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  return (
    <>
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
    </>
  );
}
