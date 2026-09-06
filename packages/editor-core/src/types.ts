import type { LayoutDocument } from "./layout";

export const OpenSketch_FORMAT_VERSION = 3;

export const PROJECT_KINDS = ["diagram", "figure", "poster"] as const;
export type ProjectKind = (typeof PROJECT_KINDS)[number];

export function isProjectKind(value: unknown): value is ProjectKind {
  return typeof value === "string" && (PROJECT_KINDS as readonly string[]).includes(value);
}

export type CanvasUnit = "px" | "mm" | "in";

export const ASSET_STYLES = ["detailed", "simplified"] as const;
export type AssetStyle = (typeof ASSET_STYLES)[number];

export function isAssetStyle(value: unknown): value is AssetStyle {
  return typeof value === "string" && (ASSET_STYLES as readonly string[]).includes(value);
}

export type AssetQualificationState = "approved" | "rejected" | "pending";

export interface AssetVariantLineage {
  sourceVariantId: string;
  relationship: "simplified-counterpart";
}

export interface AssetVariantQualification {
  state: AssetQualificationState;
  reviewedAt: string;
  reviewer: string;
  notes: string;
}

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
  /** Legacy manifests omit this field; the canonical resolver treats them as Detailed. */
  style?: AssetStyle;
  label?: string;
  assetPath: string;
  thumbnailPath: string;
  sourceFileId?: number;
  localSha256?: string;
  width?: number;
  height?: number;
  lineage?: AssetVariantLineage;
  qualification?: AssetVariantQualification;
}

export type AssetLicense =
  | "Public Domain"
  | "CC0-1.0"
  | "CC-BY-3.0"
  | "CC-BY-4.0"
  | "CC-BY-SA-3.0"
  | "CC-BY-SA-4.0"
  | "MIT"
  | "BSD-3-Clause"
  | "AGPL-3.0-only";

export interface AssetFamily {
  familyId: string;
  /** Explicit structure controls or movable semantic components, rather than traced color regions. */
  editableStructure?: boolean;
  title: string;
  description: string;
  category: string;
  keywords: string[];
  topics?: string[];
  author: string;
  credit: string;
  license: AssetLicense;
  licenseUrl?: string;
  sourceName?: string;
  sourcePage?: string;
  defaultVariantId: string;
  variants: AssetVariant[];
}

export interface AssetManifest {
  version: 1;
  generatedAt: string;
  source: string;
  families: AssetFamily[];
}

export interface ImportedMediaSourceResource {
  format: string;
  name: string;
  mimeType: string;
  byteLength: number;
  sha256: string;
}

export interface ImportedMediaRecord {
  id: string;
  name: string;
  mimeType: string;
  dataUrl: string;
  /** Source identity retained without embedding a second copy of the source bytes. */
  sourceResource?: ImportedMediaSourceResource;
}

export interface PortableProject {
  format: "OpenSketch";
  formatVersion: number;
  version: 1;
  kind: ProjectKind;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  canvas: CanvasSettings;
  objects: Record<string, unknown>;
  /** Legacy serialized key retained for .OpenSketch project compatibility. */
  uploads: ImportedMediaRecord[];
  usedAssetIds: string[];
  /** Optional persistent layout-frame document. Omitted by legacy projects. */
  layout?: LayoutDocument;
  description?: string;
}

export interface ProjectTemplateRecord {
  id: string;
  name: string;
  kind: ProjectKind;
  project: PortableProject;
  thumbnail?: string;
  createdAt: string;
  updatedAt: string;
  schemaVersion: 1;
}

export interface ProjectCreationOptions {
  kind?: ProjectKind;
  template?: ProjectTemplateRecord;
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
