import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { FixedSizeList as List, type ListChildComponentProps } from "react-window";
import {
  ArrowRight,
  Box,
  Brackets,
  Circle,
  FileText,
  Heart,
  ImagePlus,
  Info,
  Minus,
  MessageSquare,
  MousePointer2,
  Search,
  Shapes,
  Sparkles,
  Square,
  Type,
  Upload,
  Waves,
  X
} from "lucide-react";
import { filterAssetFamilies, type AssetFamily, type AssetVariant } from "@workspace/editor-core";
import { ASSET_CATEGORIES, assetManifest } from "@/assets/manifest";
import { useEditor } from "@/editor/EditorContext";
import { useModalDialog } from "./useModalDialog";

type Tab = "assets" | "text" | "shapes" | "uploads";

export function LeftSidebar() {
  const [tab, setTab] = useState<Tab>("assets");
  return (
    <aside className="left-sidebar">
      <nav className="sidebar-tabs" aria-label="Insert tools" role="tablist">
        {(
          [
            ["assets", Sparkles, "Assets"],
            ["text", Type, "Text"],
            ["shapes", Shapes, "Shapes"],
            ["uploads", Upload, "Uploads"]
          ] as const
        ).map(([value, Icon, label]) => (
          <button
            key={value}
            className={tab === value ? "active" : ""}
            onClick={() => setTab(value)}
            role="tab"
            aria-selected={tab === value}
            aria-controls={`insert-panel-${value}`}
          >
            <Icon size={17} />
            {label}
          </button>
        ))}
      </nav>
      <div
        className="sidebar-content"
        id={`insert-panel-${tab}`}
        role="tabpanel"
        aria-label={`${tab} tools`}
      >
        {tab === "assets" && <AssetsPanel />}
        {tab === "text" && <TextPanel />}
        {tab === "shapes" && <ShapesPanel />}
        {tab === "uploads" && <UploadsPanel />}
      </div>
    </aside>
  );
}

function AssetsPanel() {
  const editor = useEditor();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [showFavorites, setShowFavorites] = useState(false);
  const [variants, setVariants] = useState<Record<string, string>>({});
  const [favorites, setFavorites] = useState<Set<string>>(
    () => new Set(JSON.parse(localStorage.getItem("OpenSketch:favorites") ?? "[]") as string[])
  );
  const [recent, setRecent] = useState<string[]>(
    () => JSON.parse(localStorage.getItem("OpenSketch:recent-assets") ?? "[]") as string[]
  );
  const [info, setInfo] = useState<AssetFamily | null>(null);
  const [assetError, setAssetError] = useState("");
  const assetListRef = useRef<HTMLDivElement>(null);
  const infoRef = useModalDialog(Boolean(info), () => setInfo(null));
  const families = useMemo(() => {
    const matches = filterAssetFamilies(assetManifest.families, debouncedQuery, category);
    return showFavorites ? matches.filter((family) => favorites.has(family.familyId)) : matches;
  }, [category, debouncedQuery, favorites, showFavorites]);
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(query), 160);
    return () => window.clearTimeout(timeout);
  }, [query]);
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
    <>
      <div className="panel-heading">
        <div>
          <p className="eyebrow">NIH BIOART SOURCE</p>
          <h2>Illustration library</h2>
        </div>
        <span className="count-badge">{assetManifest.families.length}</span>
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
            onClick={() => {
              setCategory(item);
              setShowFavorites(false);
            }}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="asset-results-meta">
        <span>{families.length} families</span>
        {favorites.size > 0 && (
          <button
            className={showFavorites ? "active" : ""}
            aria-pressed={showFavorites}
            onClick={() => setShowFavorites((current) => !current)}
          >
            <Heart size={12} fill="currentColor" /> {favorites.size} favorites
          </button>
        )}
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
          onKeyDown={navigateAssets}
          aria-label="NIH BioArt illustration families"
        >
          <List className="asset-list" height={560} itemCount={rows} itemSize={184} width="100%">
            {Row}
          </List>
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
    </>
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
          <select value={variant.id} onChange={(event) => onVariant(event.target.value)}>
            {family.variants.map((item, index) => (
              <option key={item.id} value={item.id}>
                Variant {index + 1}
              </option>
            ))}
          </select>
        ) : (
          <small>{family.category}</small>
        )}
      </div>
    </article>
  );
}

function TextPanel() {
  const editor = useEditor();
  return (
    <>
      <div className="panel-heading">
        <div>
          <p className="eyebrow">ANNOTATE</p>
          <h2>Text</h2>
        </div>
      </div>
      <div className="insert-list">
        <button onClick={() => editor.addText("point")}>
          <Type size={22} />
          <span>
            <strong>Point text</strong>
            <small>Short labels and headings</small>
          </span>
        </button>
        <button onClick={() => editor.addText("box")}>
          <FileText size={22} />
          <span>
            <strong>Text box</strong>
            <small>Multiline notes and captions</small>
          </span>
        </button>
      </div>
      <p className="panel-kicker">TYPOGRAPHIC SCALE</p>
      <div className="type-specimens">
        <button onClick={() => editor.addText("point")}>
          <span className="type-display">Figure title</span>
          <small>54 px · Semibold</small>
        </button>
        <button onClick={() => editor.addText("point")}>
          <span className="type-section">Section label</span>
          <small>32 px · Semibold</small>
        </button>
        <button onClick={() => editor.addText("box")}>
          <span className="type-body">Body annotation for explanatory detail.</span>
          <small>20 px · Regular</small>
        </button>
      </div>
    </>
  );
}

function ShapesPanel() {
  const editor = useEditor();
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
          <p className="eyebrow">DIAGRAM TOOLS</p>
          <h2>Shapes & connectors</h2>
        </div>
      </div>
      <div className="shape-grid">
        {shapes.map(([kind, Icon, label]) => (
          <button key={kind} onClick={() => editor.addShape(kind)}>
            <Icon size={25} />
            <span>{label}</span>
          </button>
        ))}
      </div>
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

function UploadsPanel() {
  const editor = useEditor();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  return (
    <>
      <div className="panel-heading">
        <div>
          <p className="eyebrow">LOCAL MEDIA</p>
          <h2>Uploads</h2>
        </div>
      </div>
      <button className="upload-dropzone" onClick={() => input.current?.click()}>
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
              .addUpload(file)
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
          Uploaded SVGs are sanitized before insertion. External images, fonts, scripts, and network
          references are removed.
        </p>
      </div>
    </>
  );
}
