const ASSET_DRAG_TYPE = "application/x-scientific-asset";

export function setAssetDragPayload(
  dataTransfer: DataTransfer,
  familyId: string,
  variantId: string
): void {
  dataTransfer.effectAllowed = "copy";
  dataTransfer.setData(ASSET_DRAG_TYPE, JSON.stringify({ familyId, variantId }));
}
