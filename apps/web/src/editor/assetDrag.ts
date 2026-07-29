const ASSET_DRAG_TYPE = "application/x-scientific-asset";
export const IMPORTED_MEDIA_DRAG_TYPE = "application/x-opensketch-import";

export function setAssetDragPayload(
  dataTransfer: DataTransfer,
  familyId: string,
  variantId: string
): void {
  dataTransfer.effectAllowed = "copy";
  dataTransfer.setData(ASSET_DRAG_TYPE, JSON.stringify({ familyId, variantId }));
}

export function setImportedMediaDragPayload(dataTransfer: DataTransfer, importId: string): void {
  dataTransfer.effectAllowed = "copy";
  dataTransfer.setData(IMPORTED_MEDIA_DRAG_TYPE, importId);
}
