import type { ImportedMediaRecord } from "./types";

/** Shared limits for media imports, local persistence, and portable exports. */
export const PROJECT_STORAGE_LIMITS = {
  maxPortableProjectBytes: 100 * 1024 * 1024,
  maxImportedMediaBytes: 25 * 1024 * 1024
} as const;

const IMAGE_SCENE_TYPES = new Set(["Image", "image"]);

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function uploadIndexes(uploads: readonly ImportedMediaRecord[]) {
  return {
    byId: new Map(uploads.map((upload) => [upload.id, upload] as const)),
    byDataUrl: new Map(uploads.map((upload) => [upload.dataUrl, upload] as const))
  };
}

/** Return the imported-media IDs referenced by a serialized Fabric scene. */
export function referencedUploadIds(
  objects: Record<string, unknown>,
  uploads: readonly ImportedMediaRecord[]
): Set<string> {
  const { byId, byDataUrl } = uploadIndexes(uploads);
  const referenced = new Set<string>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isRecord(value)) return;
    if (typeof value.assetId === "string" && byId.has(value.assetId)) {
      referenced.add(value.assetId);
    }
    if (typeof value.src === "string") {
      const upload = byDataUrl.get(value.src);
      if (upload) referenced.add(upload.id);
    }
    Object.values(value).forEach(visit);
  };
  visit(objects);
  return referenced;
}

/** Drop project uploads that are no longer represented in the scene. */
export function retainReferencedUploads(
  objects: Record<string, unknown>,
  uploads: readonly ImportedMediaRecord[]
): ImportedMediaRecord[] {
  const referenced = referencedUploadIds(objects, uploads);
  return uploads.filter((upload) => referenced.has(upload.id));
}

function transformScene(
  value: unknown,
  indexes: ReturnType<typeof uploadIndexes>,
  mode: "compact" | "rehydrate"
): unknown {
  if (Array.isArray(value)) {
    return value.map((child) => transformScene(child, indexes, mode));
  }
  if (!isRecord(value)) return value;

  const next = Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, transformScene(child, indexes, mode)])
  ) as JsonRecord;
  if (!IMAGE_SCENE_TYPES.has(String(next.type))) return next;

  const assetId = typeof next.assetId === "string" ? next.assetId : undefined;
  const upload =
    (assetId ? indexes.byId.get(assetId) : undefined) ??
    (typeof next.src === "string" ? indexes.byDataUrl.get(next.src) : undefined);
  if (!upload) return next;

  next.assetId = upload.id;
  if (mode === "compact") {
    if (next.src === upload.dataUrl) delete next.src;
  } else {
    next.src = upload.dataUrl;
  }
  return next;
}

/** Store a raster payload once in `uploads` and reference it by `assetId`. */
export function compactProjectScene(
  objects: Record<string, unknown>,
  uploads: readonly ImportedMediaRecord[]
): Record<string, unknown> {
  return transformScene(objects, uploadIndexes(uploads), "compact") as Record<string, unknown>;
}

/** Restore Fabric image sources from the project-owned upload table before loading. */
export function rehydrateProjectScene(
  objects: Record<string, unknown>,
  uploads: readonly ImportedMediaRecord[]
): Record<string, unknown> {
  return normalizeLibraryAssetTypes(
    transformScene(objects, uploadIndexes(uploads), "rehydrate") as Record<string, unknown>
  );
}

/** Normalize scene/media storage while retaining the original project object. */
export function normalizeProjectMedia(
  objects: Record<string, unknown>,
  uploads: readonly ImportedMediaRecord[]
): { objects: Record<string, unknown>; uploads: ImportedMediaRecord[] } {
  const retainedUploads = retainReferencedUploads(objects, uploads);
  return {
    objects: compactProjectScene(objects, retainedUploads),
    uploads: retainedUploads
  };
}

/** Migrate vendor-prefixed group types without changing stored artwork or IDs. */
export function normalizeLibraryAssetTypes(
  scene: Record<string, unknown>
): Record<string, unknown> {
  const walk = (value: unknown): void => {
    if (!isRecord(value)) return;
    if (
      value.type === "Group" &&
      typeof value.assetId === "string" &&
      typeof value.familyId === "string" &&
      typeof value.OpenSketchType === "string" &&
      /^[a-z]+-asset$/.test(value.OpenSketchType)
    )
      value.OpenSketchType = "library-asset";
    if (Array.isArray(value.objects)) value.objects.forEach(walk);
    for (const key of ["clipPath", "backgroundImage", "overlayImage"]) walk(value[key]);
  };
  walk(scene);
  return scene;
}
