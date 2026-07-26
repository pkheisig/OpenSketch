export const OPENSKETCH_FORMAT_VERSION = 1;

export type CanvasUnit = "px" | "mm" | "in";

export interface CanvasSettings {
  width: number;
  height: number;
  unit: CanvasUnit;
  dpi: number;
  background: string;
  transparent: boolean;
  grid: boolean;
}

export interface AssetVariant {
  id: string;
  assetPath: string;
  thumbnailPath: string;
  commonsSha1?: string;
  localSha256?: string;
  width?: number;
  height?: number;
}

export interface AssetFamily {
  familyId: string;
  bioartEntryId: number;
  title: string;
  description: string;
  category: string;
  keywords: string[];
  author: string;
  credit: string;
  license: "Public Domain";
  nihSourcePage: string;
  commonsPage: string;
  defaultVariantId: string;
  variants: AssetVariant[];
}

export interface AssetManifest {
  version: 1;
  generatedAt: string;
  source: "Wikimedia Commons";
  families: AssetFamily[];
}

export interface UploadRecord {
  id: string;
  name: string;
  mimeType: string;
  dataUrl: string;
}

export interface PortableProject {
  format: "opensketch";
  formatVersion: number;
  version: 1;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  canvas: CanvasSettings;
  objects: Record<string, unknown>;
  uploads: UploadRecord[];
  usedAssetIds: string[];
  description?: string;
}

export interface ProjectRecord extends PortableProject {
  thumbnail?: string;
}

export interface ConnectorBinding {
  fromObjectId?: string;
  fromAnchor?: "top" | "right" | "bottom" | "left" | "center";
  toObjectId?: string;
  toAnchor?: "top" | "right" | "bottom" | "left" | "center";
}
