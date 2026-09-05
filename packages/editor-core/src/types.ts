export const OpenSketch_FORMAT_VERSION = 1;

export type CanvasUnit = "px" | "mm" | "in";

export interface CanvasSettings {
  width: number;
  height: number;
  unit: CanvasUnit;
  dpi: number;
  background: string;
  transparent: boolean;
  grid: boolean;
  doubleClickCreatesText: boolean;
}

export interface AssetVariant {
  id: string;
  label?: string;
  assetPath: string;
  thumbnailPath: string;
  commonsSha1?: string;
  sourceFileId?: number;
  localSha256?: string;
  width?: number;
  height?: number;
}

export type AssetLicense =
  | "Public Domain"
  | "CC0-1.0"
  | "CC-BY-3.0"
  | "CC-BY-4.0"
  | "CC-BY-SA-3.0"
  | "CC-BY-SA-4.0"
  | "MIT"
  | "BSD-3-Clause";

export interface AssetFamily {
  familyId: string;
  bioartEntryId: number;
  title: string;
  description: string;
  category: string;
  keywords: string[];
  author: string;
  credit: string;
  license: AssetLicense;
  licenseUrl?: string;
  sourceName?: string;
  nihSourcePage?: string;
  sourcePage?: string;
  commonsPage?: string;
  defaultVariantId: string;
  variants: AssetVariant[];
}

export interface AssetManifest {
  version: 1;
  generatedAt: string;
  source: string;
  families: AssetFamily[];
}

export interface ImportedMediaRecord {
  id: string;
  name: string;
  mimeType: string;
  dataUrl: string;
}

export interface PortableProject {
  format: "OpenSketch";
  formatVersion: number;
  version: 1;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  canvas: CanvasSettings;
  objects: Record<string, unknown>;
  /** Legacy serialized key retained for .OpenSketch project compatibility. */
  uploads: ImportedMediaRecord[];
  usedAssetIds: string[];
  description?: string;
}

export interface ProjectRecord extends PortableProject {
  /** Monotonic local IndexedDB revision; never imported from a portable file. */
  revision?: number;
  thumbnail?: string;
  /** Local project-library placement; not included in portable project exports. */
  folderId?: string;
  /** Local archive timestamp; not included in portable project exports. */
  archivedAt?: string;
}

export interface ProjectFolderRecord {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export type ConnectorAnchor = "top" | "right" | "bottom" | "left" | "center";
export type ConnectorArrowhead =
  "none" | "triangle" | "open" | "circle" | "open-circle" | "bar" | "neuron";
export type ConnectorLineStyle = "solid" | "dashed" | "dotted";
export type ConnectorLineCap = "butt" | "round";
export type ConnectorRouting = "direct" | "orthogonal";
export type ConnectorPathShape =
  | "straight"
  | "elbow"
  | "rounded-elbow"
  | "step"
  | "rounded-step"
  | "arc"
  | "arch"
  | "wave"
  | "pulse"
  | "circular"
  | "bracket-square"
  | "bracket-square-center"
  | "bracket-round"
  | "bracket-curly";

export interface ConnectorBinding {
  fromObjectId: string;
  fromAnchor: ConnectorAnchor;
  toObjectId: string;
  toAnchor: ConnectorAnchor;
  startArrowhead: ConnectorArrowhead;
  endArrowhead: ConnectorArrowhead;
  lineStyle: ConnectorLineStyle;
  lineCap?: ConnectorLineCap;
  routing?: ConnectorRouting;
  pathShape?: ConnectorPathShape;
  curvature: number;
}
