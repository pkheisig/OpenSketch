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
  routing?: ConnectorRouting;
  pathShape?: ConnectorPathShape;
  curvature: number;
}
