const ASSET_DRAG_TYPE = "application/x-scientific-asset";
export const IMPORTED_MEDIA_DRAG_TYPE = "application/x-opensketch-import";

type DragPointer = {
  clientX: number;
  clientY: number;
};

export function setAssetDragPayload(
  dataTransfer: DataTransfer,
  familyId: string,
  variantId: string
): void {
  dataTransfer.effectAllowed = "copy";
  dataTransfer.setData(ASSET_DRAG_TYPE, JSON.stringify({ familyId, variantId }));
}

export function setAssetDragImage(
  dataTransfer: DataTransfer,
  preview: HTMLImageElement | null,
  pointer: DragPointer
): void {
  if (!preview) return;

  const bounds = preview.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) return;

  const offsetX = Math.min(bounds.width, Math.max(0, pointer.clientX - bounds.left));
  const offsetY = Math.min(bounds.height, Math.max(0, pointer.clientY - bounds.top));
  dataTransfer.setDragImage(preview, offsetX, offsetY);
}

export function setImportedMediaDragPayload(dataTransfer: DataTransfer, importId: string): void {
  dataTransfer.effectAllowed = "copy";
  dataTransfer.setData(IMPORTED_MEDIA_DRAG_TYPE, importId);
}
