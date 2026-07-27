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
  Box,
  Brackets,
  Circle,
  FileInput,
  FileText,
  Heart,
  ImagePlus,
  Info,
  Minus,
  MessageSquare,
  MousePointer2,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Shapes,
  Sparkles,
  Square,
  Type,
  Waves,
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
import { useEditor } from "@/editor/EditorContext";
import { UiSelect } from "@/components/UiSelect";
import { useModalDialog } from "./useModalDialog";
import { useSidebarHover } from "./useSidebarHover";

type Tab = "assets" | "text" | "shapes" | "imports";

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
                ["text", Type, "Text"],
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
          {tab === "text" && <TextPanel />}
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
  const [variants, setVariants] = useState<Record<string, string>>({});
  const [favorites, setFavorites] = useState<Set<string>>(
    () => new Set(JSON.parse(localStorage.getItem("OpenSketch:favorites") ?? "[]") as string[])
  );
  const [recent, setRecent] = useState<string[]>(
    () => JSON.parse(localStorage.getItem("OpenSketch:recent-assets") ?? "[]") as string[]
  );
  const [info, setInfo] = useState<AssetFamily | null>(null);
  const [assetError, setAssetError] = useState("");
  const [assetListHeight, setAssetListHeight] = useState(0);
  const assetListRef = useRef<HTMLDivElement>(null);
  const infoRef = useModalDialog(Boolean(info), () => setInfo(null));
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
            favorite={favorites.has(family.familyId)}
            onFavorite={() => toggleFavorite(family.familyId)}
            onInfo={() => setInfo(family)}
            onInsert={() => insert(family, variant)}
            onVariant={(variantId) =>
              setVariants((current) => ({ ...current, [family.familyId]: variantId }))
            }
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
      <div className="panel-heading">
        <div>
          <h2>Illustration library</h2>
        </div>
      </div>
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
          <h3>No biological match</h3>
          <p>Try a synonym, abbreviation, or broader category.</p>
        </div>
      )}
      {info && (
        <div className="dialog-backdrop" onMouseDown={() => setInfo(null)}>
          <section
            ref={infoRef}
            className="dialog asset-info-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="asset-info-title"
            tabIndex={-1}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="dialog-close icon-button"
              onClick={() => setInfo(null)}
              aria-label="Close"
            >
              <X size={17} />
            </button>
            <img src={selectedVariant(info).thumbnailPath} alt="" className="asset-info-image" />
            <p className="eyebrow">{info.category}</p>
            <h2 id="asset-info-title">{info.title}</h2>
            <p>{info.description || "Public-domain biological illustration."}</p>
            <dl className="source-list">
              <div>
                <dt>Author</dt>
                <dd>{info.author}</dd>
              </div>
              <div>
                <dt>License</dt>
                <dd>{info.license}</dd>
              </div>
              <div>
                <dt>Variants</dt>
                <dd>{info.variants.length}</dd>
              </div>
            </dl>
            <div className="dialog-link-row">
              <a href={info.nihSourcePage} target="_blank" rel="noreferrer">
                NIH source <ArrowRight size={13} />
              </a>
              <a href={info.commonsPage} target="_blank" rel="noreferrer">
                Commons record <ArrowRight size={13} />
              </a>
            </div>
            <button
              className="button primary wide"
              onClick={() => {
                insert(info, selectedVariant(info));
                setInfo(null);
              }}
            >
              Insert illustration
            </button>
          </section>
        </div>
      )}
    </div>
  );
}

function AssetCard({
  family,
  variant,
  favorite,
  onFavorite,
  onInfo,
  onInsert,
  onVariant
}: {
  family: AssetFamily;
  variant: AssetVariant;
  favorite: boolean;
  onFavorite: () => void;
  onInfo: () => void;
  onInsert: () => void;
  onVariant: (id: string) => void;
}) {
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
        <img src={variant.thumbnailPath} alt="" loading="lazy" />
      </button>
      <button className="asset-favorite" onClick={onFavorite} aria-label="Toggle favorite">
        <Heart size={14} fill={favorite ? "currentColor" : "none"} />
      </button>
      <button className="asset-info" onClick={onInfo} aria-label={`About ${family.title}`}>
        <Info size={13} />
      </button>
      <div className="asset-card-copy">
        <strong title={family.title}>{family.title}</strong>
        {family.variants.length > 1 ? (
          <UiSelect
            className="asset-variant-select"
            ariaLabel={`${family.title} variant`}
            value={variant.id}
            options={family.variants.map((item, index) => ({
              value: item.id,
              label: `Variant ${index + 1}`
            }))}
            onChange={onVariant}
          />
        ) : (
          <small>{family.category}</small>
        )}
      </div>
    </article>
  );
}

function TextPanel() {
  const editor = useEditor();
  const activate = (
    kind: "point" | "box",
    overrides: { fontSize?: number; fontWeight?: number } = {}
  ) => editor.setCreationTool({ type: "text", kind, ...overrides });
  const active = (kind: "point" | "box") =>
    editor.creationTool?.type === "text" && editor.creationTool.kind === kind;
  const updateTextDefaults = (properties: Partial<typeof editor.creationDefaults.text>) =>
    editor.setCreationDefaults({
      ...editor.creationDefaults,
      text: { ...editor.creationDefaults.text, ...properties }
    });
  return (
    <>
      <div className="panel-heading">
        <div>
          <h2>Text</h2>
        </div>
      </div>
      <div className="insert-list">
        <button
          className={active("point") ? "active" : ""}
          aria-pressed={active("point")}
          onClick={() => activate("point")}
        >
          <Type size={22} />
          <span>
            <strong>Point text</strong>
            <small>Short labels and headings</small>
          </span>
        </button>
        <button
          className={active("box") ? "active" : ""}
          aria-pressed={active("box")}
          onClick={() => activate("box")}
        >
          <FileText size={22} />
          <span>
            <strong>Text box</strong>
            <small>Multiline notes and captions</small>
          </span>
        </button>
      </div>
      <p className="panel-kicker">TYPOGRAPHIC SCALE</p>
      <div className="type-specimens">
        <button onClick={() => activate("point", { fontSize: 54, fontWeight: 600 })}>
          <span className="type-display">Figure title</span>
          <small>54 px · Semibold</small>
        </button>
        <button onClick={() => activate("point", { fontSize: 32, fontWeight: 600 })}>
          <span className="type-section">Section label</span>
          <small>32 px · Semibold</small>
        </button>
        <button onClick={() => activate("box", { fontSize: 20, fontWeight: 400 })}>
          <span className="type-body">Body annotation for explanatory detail.</span>
          <small>20 px · Regular</small>
        </button>
      </div>
      <details className="creation-defaults">
        <summary>New text defaults</summary>
        <div className="creation-defaults-body">
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
          <UiSelect
            className="field"
            label="Typeface"
            value={editor.creationDefaults.text.fontFamily}
            options={["Source Sans 3", "Source Serif 4", "STIX Two Text", "Inter", "Georgia"].map(
              (font) => ({ value: font, label: font })
            )}
            onChange={(fontFamily) => updateTextDefaults({ fontFamily })}
          />
          <div className="creation-default-grid">
            <label>
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
            <UiSelect
              className="mini-field"
              label="Weight"
              value={String(editor.creationDefaults.text.fontWeight)}
              options={[
                { value: "400", label: "Regular" },
                { value: "600", label: "Semibold" },
                { value: "700", label: "Bold" }
              ]}
              onChange={(fontWeight) => updateTextDefaults({ fontWeight: Number(fontWeight) })}
            />
          </div>
        </div>
      </details>
    </>
  );
}

function ShapesPanel() {
  const editor = useEditor();
  const active = (kind: (typeof shapes)[number][0]) =>
    editor.creationTool?.type === "shape" && editor.creationTool.kind === kind;
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
    ["rectangle", Square, "Rectangle"],
    ["rounded-rectangle", Box, "Rounded"],
    ["circle", Circle, "Circle"],
    ["ellipse", Circle, "Ellipse"],
    ["triangle", Shapes, "Triangle"],
    ["polygon", Shapes, "Polygon"],
    ["line", Minus, "Line"],
    ["arrow", ArrowRight, "Arrow"],
    ["double-arrow", ArrowRight, "Double arrow"],
    ["curved-arrow", ArrowRight, "Curved arrow"],
    ["bracket", Brackets, "Bracket"],
    ["callout", MessageSquare, "Callout"],
    ["membrane", Waves, "Membrane"]
  ] as const;
  return (
    <>
      <div className="panel-heading">
        <div>
          <h2>Shapes & connectors</h2>
        </div>
      </div>
      <div className="shape-grid">
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
      <div className="panel-tip">
        <MousePointer2 size={16} />
        <p>
          <strong>Connect two objects precisely.</strong> Select two objects, then add a line or
          arrow. Choose edge anchors, arrowheads, direct or collision-aware routing, and line style
          in the inspector.
        </p>
      </div>
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
      <div className="panel-heading">
        <div>
          <h2>Imports</h2>
        </div>
      </div>
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
      <div className="security-note">
        <Info size={16} />
        <p>
          Imported SVGs are sanitized locally before insertion. External images, fonts, scripts, and
          network references are removed.
        </p>
      </div>
    </>
  );
}
