export const ASSET_INSERT_MAX_SIDE = 180;
export const WELL_PLATE_INSERT_WIDTH = 250;

export function assetInsertionScale(title: string, width: number, height: number): number {
  const safeWidth = Math.max(width, 1);
  if (/\bwell plate\b/i.test(title)) {
    return WELL_PLATE_INSERT_WIDTH / safeWidth;
  }

  const maxSide = Math.max(safeWidth, Math.max(height, 1));
  return Math.min(1, ASSET_INSERT_MAX_SIDE / maxSide);
}
