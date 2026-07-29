import { useEffect, useState } from "react";
import { Group, StaticCanvas, util, type FabricObject } from "fabric";
import { applyElementStyle, type ElementStyleSnapshot } from "@/editor/elementStyles";
import { loadEditableSvg } from "@/editor/svg";

const PREVIEW_SIZE = 448;
const PREVIEW_PADDING = 36;
const PREVIEW_CACHE_LIMIT = 96;
const TRANSPARENT_PREVIEW =
  "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";
const previewPromises = new Map<string, Promise<string>>();
const previewSources = new Map<string, string>();

function previewKey(assetPath: string, snapshot?: ElementStyleSnapshot): string {
  return `${assetPath}:${snapshot ? JSON.stringify(snapshot) : "original"}`;
}

function rememberPreview(key: string, source: string): void {
  previewSources.delete(key);
  previewSources.set(key, source);
  if (previewSources.size > PREVIEW_CACHE_LIMIT) {
    const oldest = previewSources.keys().next().value as string | undefined;
    if (oldest) previewSources.delete(oldest);
  }
}

async function renderAssetPreview(
  assetPath: string,
  snapshot?: ElementStyleSnapshot
): Promise<string> {
  const key = previewKey(assetPath, snapshot);
  const resolved = previewSources.get(key);
  if (resolved) {
    rememberPreview(key, resolved);
    return resolved;
  }
  const cached = previewPromises.get(key);
  if (cached) return cached;

  const preview = (async () => {
    const response = await fetch(assetPath);
    if (!response.ok) throw new Error(`Could not preview ${assetPath}.`);
    const parsed = await loadEditableSvg(await response.text());
    const objects = parsed.objects.filter((object): object is FabricObject => Boolean(object));
    const grouped = util.groupSVGElements(objects, parsed.options);
    const group = grouped instanceof Group ? grouped : new Group([grouped]);
    applyElementStyle(group, snapshot);

    // Fabric groups by the artwork bounds rather than the source SVG viewBox.
    // Rendering that group into a fixed square keeps every family variant at
    // the same apparent size even when its source file has different whitespace.
    const width = Math.max(1, group.width || 1);
    const height = Math.max(1, group.height || 1);
    const scale = Math.min(
      (PREVIEW_SIZE - PREVIEW_PADDING * 2) / width,
      (PREVIEW_SIZE - PREVIEW_PADDING * 2) / height
    );
    group.set({
      left: PREVIEW_SIZE / 2,
      top: PREVIEW_SIZE / 2,
      originX: "center",
      originY: "center",
      scaleX: scale,
      scaleY: scale
    });
    group.setCoords();

    const canvas = new StaticCanvas(undefined, {
      width: PREVIEW_SIZE,
      height: PREVIEW_SIZE,
      enableRetinaScaling: false,
      renderOnAddRemove: false
    });
    canvas.add(group);
    canvas.renderAll();
    const source = canvas.toDataURL({ format: "png", multiplier: 1 });
    canvas.dispose();
    rememberPreview(key, source);
    return source;
  })();

  previewPromises.set(key, preview);
  void preview.then(
    () => previewPromises.delete(key),
    () => previewPromises.delete(key)
  );
  return preview;
}

export function AssetPreviewImage({
  assetPath,
  fallbackPath,
  savedStyle,
  className
}: {
  assetPath: string;
  fallbackPath?: string;
  savedStyle?: ElementStyleSnapshot;
  className?: string;
}) {
  const key = previewKey(assetPath, savedStyle);
  const cachedSource = previewSources.get(key);
  const [preview, setPreview] = useState(() => ({
    key,
    source: cachedSource ?? TRANSPARENT_PREVIEW,
    ready: Boolean(cachedSource)
  }));

  useEffect(() => {
    let active = true;
    const cached = previewSources.get(key);
    setPreview({
      key,
      source: cached ?? TRANSPARENT_PREVIEW,
      ready: Boolean(cached)
    });
    void renderAssetPreview(assetPath, savedStyle)
      .then((nextSource) => {
        if (active) setPreview({ key, source: nextSource, ready: true });
      })
      .catch(() => {
        if (active) {
          setPreview({ key, source: fallbackPath ?? assetPath, ready: true });
        }
      });
    return () => {
      active = false;
    };
  }, [assetPath, fallbackPath, key, savedStyle]);

  const current = preview.key === key ? preview : null;
  return (
    <img
      className={className}
      src={current?.source ?? TRANSPARENT_PREVIEW}
      alt=""
      loading="lazy"
      draggable={false}
      data-preview-ready={current?.ready ? "true" : "false"}
    />
  );
}
