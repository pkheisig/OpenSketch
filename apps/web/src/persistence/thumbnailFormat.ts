const VECTOR_THUMBNAIL_PREFIX = "data:image/svg+xml";
export const VECTOR_THUMBNAIL_VERSION = "3";
const ENCODED_VERSION_MARKER = `data-opensketch-thumbnail%3D%22${VECTOR_THUMBNAIL_VERSION}%22`;

export function isVectorThumbnail(thumbnail: string | undefined): boolean {
  return thumbnail?.startsWith(VECTOR_THUMBNAIL_PREFIX) ?? false;
}

export function isCurrentVectorThumbnail(thumbnail: string | undefined): boolean {
  return isVectorThumbnail(thumbnail) && Boolean(thumbnail?.includes(ENCODED_VERSION_MARKER));
}

export function isProjectThumbnailCurrent(
  thumbnail: string | undefined,
  projectRevision: string | number
): boolean {
  const revisionMarker = encodeURIComponent(
    `data-opensketch-project-revision="${projectRevision}"`
  );
  return isCurrentVectorThumbnail(thumbnail) && Boolean(thumbnail?.includes(revisionMarker));
}

export function vectorThumbnailMarkup(thumbnail: string | undefined): string | null {
  if (!isVectorThumbnail(thumbnail)) return null;
  const separator = thumbnail?.indexOf(",") ?? -1;
  if (separator < 0) return null;
  try {
    return decodeURIComponent(thumbnail!.slice(separator + 1));
  } catch {
    return null;
  }
}

export function svgThumbnailDataUrl(svg: string): string {
  return `${VECTOR_THUMBNAIL_PREFIX};charset=utf-8,${encodeURIComponent(svg)}`;
}
