export * from "./migrations";
export * from "./layout";
export * from "./interchange";
export * from "./projectMedia";
export * from "./presets";
export * from "./rasterResources";
export * from "./resourceLimits";
export * from "./search";
export * from "./svgSelectors";
export * from "./types";

/** The independently versioned editor-core contract consumed by released modules. */
export const EDITOR_CORE_VERSION = "0.1.0" as const;
export * from "./scientificBrush";
export * from "./scientificBrushGeometry";

export * from "./assetColorRoles";

export * from "./assetCatalog";

export { ASSET_CATEGORY_DEFINITIONS } from "./assetTaxonomy";
