/** Authoring roles inherited from SVG groups; preserved in native projects. */
export const ASSET_COLOR_ROLES = [
  "primary",
  "secondary",
  "outline",
  "highlight",
  "detail"
] as const;
export type AssetColorRole = (typeof ASSET_COLOR_ROLES)[number];
export function isAssetColorRole(value: unknown): value is AssetColorRole {
  return typeof value === "string" && (ASSET_COLOR_ROLES as readonly string[]).includes(value);
}
