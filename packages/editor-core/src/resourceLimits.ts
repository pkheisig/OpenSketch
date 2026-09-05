import { PORTABLE_SCENE_LIMITS } from "./sceneLimits";

/** Resource bounds applied before a portable project reaches Fabric or persistence. */
export const PORTABLE_PROJECT_LIMITS = {
  maxProjectIdLength: 128,
  maxProjectNameLength: 256,
  maxTimestampLength: 64,
  maxDescriptionLength: 16_384,
  maxCanvasDimension: 32_768,
  maxCanvasArea: 100_000_000,
  maxDpi: 2_400,
  maxStringLength: 100_000,
  maxObjectIdLength: 128,
  maxObjectNameLength: 512,
  maxSceneObjects: PORTABLE_SCENE_LIMITS.maxSceneObjects,
  maxSceneDepth: PORTABLE_SCENE_LIMITS.maxSceneDepth,
  maxArrayLength: 50_000,
  maxObjectProperties: 96,
  maxMetadataEntries: 256,
  maxMetadataDepth: 8,
  maxPathCommands: 50_000,
  maxPoints: 50_000,
  maxTextStyles: 10_000,
  maxUploads: 256,
  maxUsedAssetIds: 10_000,
  maxDataUrlBytes: 25 * 1024 * 1024,
  maxTotalDataUrlBytes: 75 * 1024 * 1024,
  maxRasterDimension: 32_768,
  maxRasterArea: 100_000_000,
  // Keep decoded RGBA memory near one gigabyte before browser/Fabric overhead.
  maxTotalRasterArea: 250_000_000,
  maxCoordinate: 1_000_000,
  maxScale: 1_000,
  maxCurvature: 100
} as const;
