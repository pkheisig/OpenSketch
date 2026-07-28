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
  ArrowLeftRight,
  ArrowRight,
  Circle,
  FileInput,
  Heart,
  Hexagon,
  ImagePlus,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  Pentagon,
  Redo2,
  Search,
  Shapes,
  Sparkles,
  Square,
  Triangle,
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
import { UiSelect } from "@/components/UiSelect";
import { useSidebarHover } from "./useSidebarHover";

type Tab = "assets" | "shapes" | "imports";

function RoundedRectangleIcon({ size = 24 }: { size?: number }) {
  return (
    <svg
      className="tool-rounded-rectangle-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="14" rx="4" />
    </svg>
  );
}

function EllipseIcon({ size = 24 }: { size?: number }) {
  return (
    <svg
      className="tool-ellipse-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <ellipse cx="12" cy="12" rx="9.5" ry="6.5" />
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
  const { hoverExpanded, show, scheduleHide, hideNow } = useSidebarHover(collapsed);
  const editor = useEditor();
  const expanded = !collapsed || hoverExpanded;
  return (
    <aside
      className={`left-sidebar ${collapsed ? "collapsed" : ""} ${
        collapsed && hoverExpanded ? "hover-expanded" : ""
      }`}
      onPointerLeave={scheduleHide}
    >
      <div
        className="sidebar-hover-trigger"
        aria-hidden="true"
        onPointerEnter={(event) => {
          if (event.pointerType !== "touch") show();
        }}
      />
      <div className="sidebar-rail" inert={expanded} aria-hidden={expanded}>
        <button
          className="sidebar-expand"
          onClick={onToggle}
          aria-label="Expand left sidebar"
          title="Expand sidebar"
        >
          <PanelLeftOpen size={18} />
        </button>
      </div>
      <div className="sidebar-expanded" inert={!expanded} aria-hidden={!expanded}>
        <div className="sidebar-tabs-shell">
          <nav className="sidebar-tabs" aria-label="Insert tools" role="tablist">
            {(
              [
                ["assets", Sparkles, "Assets"],
                ["shapes", Shapes, "Shapes"],
                ["imports", FileInput, "Imports"]
              ] as const
            ).map(([value, Icon, label]) => (
              <button
                key={value}
                className={tab === value ? "active" : ""}
                onClick={() => {
                  setTab(value);
                  editor.setCreationTool(null);
                }}
                role="tab"
                aria-label={label}
                aria-selected={tab === value}
                aria-controls={`insert-panel-${value}`}
                title={label}
              >
                <Icon size={19} aria-hidden="true" />
              </button>
            ))}
          </nav>
          <button
            className="sidebar-collapse"
            onClick={() => {
              hideNow();
              onToggle();
            }}
            aria-label={collapsed ? "Keep left sidebar open" : "Minimize left sidebar"}
            title={collapsed ? "Keep sidebar open" : "Minimize sidebar"}
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>
        <div
          key={tab}
          className={`sidebar-content sidebar-content-${tab}`}
          id={`insert-panel-${tab}`}
          role="tabpanel"
          aria-label={`${tab} tools`}
        >
          {tab === "assets" && <AssetsPanel />}
          {tab === "shapes" && <ShapesPanel />}
          {tab === "imports" && <ImportsPanel />}
        </div>
      </div>
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
  const active = (kind: (typeof shapes)[number][0]) =>
    editor.creationTool?.type === "shape" && editor.creationTool.kind === kind;
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
  const shapes = [
    ["line", Minus, "Line"],
    ["arrow", ArrowRight, "Arrow"],
    ["double-arrow", ArrowLeftRight, "Double arrow"],
    ["curved-arrow", Redo2, "Curved arrow"],
    ["rectangle", Square, "Rectangle"],
    ["rounded-rectangle", RoundedRectangleIcon, "Rounded"],
    ["circle", Circle, "Circle"],
    ["ellipse", EllipseIcon, "Ellipse"],
    ["triangle", Triangle, "Triangle"],
    ["pentagon", Pentagon, "Pentagon"],
    ["polygon", Hexagon, "Hexagon"]
  ] as const;
  return (
    <>
      <div className="shape-grid">
        <button
          className={
            editor.creationTool?.type === "text" && editor.creationTool.kind === "point"
              ? "active"
              : ""
          }
          aria-label="Text"
          title="Text"
          aria-pressed={
            editor.creationTool?.type === "text" && editor.creationTool.kind === "point"
          }
          onClick={() => editor.setCreationTool({ type: "text", kind: "point" })}
        >
          <Type size={25} aria-hidden="true" />
          <span>Text</span>
        </button>
        {shapes.map(([kind, Icon, label]) => (
          <button
            key={kind}
            className={active(kind) ? "active" : ""}
            aria-pressed={active(kind)}
            onClick={() => editor.setCreationTool({ type: "shape", kind })}
          >
            <Icon size={25} />
            <span>{label}</span>
          </button>
        ))}
      </div>
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
