/* global process */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const output = process.argv[2];
if (!output) throw new Error("Usage: write-module-types.mjs <output-path>");

const declaration = `import type { ComponentType, ReactNode } from "react";

export interface RenderHandle {
  unmount(): void | Promise<void>;
  setSuspended?(suspended: boolean): void;
}

export type Theme = "light" | "dark";

export type ThemeAppearance = "system" | "light" | "dark";

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

export type ProjectKind = "diagram" | "figure" | "poster";

export interface ProjectRecord {
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
  uploads: ImportedMediaRecord[];
  usedAssetIds: string[];
  description?: string;
  thumbnail?: string;
  folderId?: string;
  archivedAt?: string;
}

export interface ProjectTemplateRecord {
  id: string;
  name: string;
  kind: ProjectKind;
  project: ProjectRecord;
  thumbnail?: string;
  createdAt: string;
  updatedAt: string;
  schemaVersion: 1;
}

export interface ProjectCreationOptions {
  kind?: ProjectKind;
  template?: ProjectTemplateRecord;
}

export interface ProjectFolderRecord {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface ImportedMediaRecord {
  id: string;
  name: string;
  mimeType: string;
  dataUrl: string;
}

export interface ImportedMediaLibraryRecord extends ImportedMediaRecord {
  createdAt: string;
  updatedAt: string;
  contentHash: string;
}

export interface AssetVariant {
  id: string;
  /** Legacy manifests omit this field; the canonical resolver treats them as Detailed. */
  style?: "detailed" | "simplified";
  label?: string;
  assetPath: string;
  thumbnailPath: string;
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

export interface AssetTemplate {
  id: string;
  name: string;
  object: Record<string, unknown>;
  thumbnail: string;
  createdAt: string;
  updatedAt: string;
  schemaVersion: 1;
}

export interface ProjectLoadResult {
  project: ProjectRecord;
  identityRepaired: boolean;
  identityWarnings: string[];
}

export type OfflineAssetPackState = "unavailable" | "not-ready" | "preparing" | "ready" | "error";

export interface OfflineAssetPackStatus {
  state: OfflineAssetPackState;
  version: string;
  total: number;
  completed: number;
  sourceCount: number;
  previewCount: number;
  message?: string;
}

export interface ProjectRepository {
  list(): Promise<ProjectRecord[]>;
  get(id: string): Promise<ProjectRecord | undefined>;
  save(project: ProjectRecord): Promise<void>;
  saveThumbnail(projectId: string, projectRevision: string, thumbnail: string): Promise<ProjectRecord | undefined>;
  create(name?: string, options?: ProjectCreationOptions): ProjectRecord;
  delete(id: string): Promise<void>;
  duplicate(project: ProjectRecord): Promise<ProjectRecord>;
  moveToFolder(project: ProjectRecord, folderId?: string): Promise<void>;
  listFolders(): Promise<ProjectFolderRecord[]>;
  createFolder(name: string): Promise<ProjectFolderRecord>;
  saveFolder(folder: ProjectFolderRecord): Promise<void>;
  deleteFolder(folderId: string): Promise<void>;
}

export interface ImportedMediaRepository {
  list(): Promise<ImportedMediaLibraryRecord[]>;
  get(id: string): Promise<ImportedMediaLibraryRecord | undefined>;
  save(media: ImportedMediaRecord, timestamp?: string): Promise<ImportedMediaLibraryRecord>;
  remember(imports: ImportedMediaRecord[], timestamp: string): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface AssetTemplateRepository {
  list(): Promise<AssetTemplate[]>;
  get(id: string): Promise<AssetTemplate | undefined>;
  save(template: AssetTemplate): Promise<AssetTemplate>;
  delete(id: string): Promise<void>;
}

export interface ProjectTemplateRepository {
  list(): Promise<ProjectTemplateRecord[]>;
  get(id: string): Promise<ProjectTemplateRecord | undefined>;
  save(template: ProjectTemplateRecord): Promise<ProjectTemplateRecord>;
  delete(id: string): Promise<void>;
}

export interface ProjectFileService {
  readProject(file: File): Promise<ProjectLoadResult>;
  downloadProject(project: ProjectRecord): void | Promise<void>;
  saveProject?(project: ProjectRecord): Promise<boolean>;
}

export interface ExportArtifact {
  blob: Blob;
  filename: string;
  kind: "svg" | "pdf" | "png" | "credits" | "project";
}

export interface ExportDeliveryService {
  deliver(artifact: ExportArtifact): void | Promise<void>;
}

export interface AssetService {
  getManifest(): Promise<AssetManifest>;
  getVersion(): Promise<string>;
  loadText(path: string): Promise<string>;
  loadBlob(path: string): Promise<Blob>;
  resolveVariant(family: AssetFamily, variant: AssetVariant): AssetVariant;
  getOfflineStatus?(): Promise<OfflineAssetPackStatus>;
  prepareOffline?(): Promise<OfflineAssetPackStatus>;
  onOfflineStatusChange?(listener: (status: OfflineAssetPackStatus) => void): () => void;
  cancelOfflinePreparation?(): void;
}

export interface PreferenceService {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
  storage: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
  };
  theme: {
    get(): Theme;
    set(theme: Theme): void;
    apply(theme: Theme): void;
  };
}

export interface NavigationService {
  currentProjectId(): string | null;
  entryIndex(): number | null;
  ensureEntryIndex(): void;
  pushProject(projectId: string): void;
  back(): void;
  forward(): void;
  go(delta: number): void;
  notifyNavigationBlocked?(): void;
  subscribe(listener: () => void): () => void;
}

export interface DialogService {
  confirm(message: string): boolean | Promise<boolean>;
  prompt(message: string, defaultValue?: string): string | null | Promise<string | null>;
  alert?(message: string): void | Promise<void>;
}

export interface ClipboardService {
  write(items: ClipboardItems): Promise<void>;
  read?(): Promise<ClipboardItems>;
}

export interface PwaService {
  isUpdateReady(): boolean;
  onUpdateReady(listener: () => void): () => void;
  applyUpdate(): void | Promise<void>;
}

export interface FontService {
  available(): boolean;
  ready(): Promise<void>;
  load(descriptor: string, text?: string): Promise<void>;
}

export interface ClockService {
  now(): string;
  randomUUID(): string;
}

export interface OpenSketchHostServices {
  render(container: HTMLElement, node: ReactNode): RenderHandle;
  projects: ProjectRepository;
  importedMedia: ImportedMediaRepository;
  templates: AssetTemplateRepository;
  projectTemplates: ProjectTemplateRepository;
  files: ProjectFileService;
  exports: ExportDeliveryService;
  assets: AssetService;
  preferences: PreferenceService;
  navigation: NavigationService;
  dialogs: DialogService;
  clipboard: ClipboardService;
  pwa: PwaService;
  fonts: FontService;
  clock: ClockService;
}

export interface OpenSketchApplicationContext {
  routePrefix?: string;
  activeProjectId?: string | null;
  mode?: "standalone" | "opensuite";
  theme?: Theme;
  appearance?: ThemeAppearance;
  systemTheme?: Theme;
  style?: string;
  palette?: string;
  themeContractVersion?: string;
  density?: "comfortable" | "compact" | "standard";
  reducedMotion?: boolean;
  uiContractVersion?: string;
  ownership?: {
    globalChrome?: "module" | "host";
    theme?: "module" | "host";
    updating?: "module" | "host";
    shutdown?: "module" | "host";
  };
  ownsGlobalChrome?: boolean;
  ownsThemeControl?: boolean;
  ownsUpdater?: boolean;
  ownsShutdown?: boolean;
  themeRootId?: string;
  portalRootId?: string;
}

export interface OpenSketchLifecycleState extends OpenSketchApplicationContext {
  phase: "unmounted" | "mounted" | "suspended";
  busy: boolean;
  dirty: boolean;
  closeBlocked: boolean;
}

export interface OpenSketchApplicationModule {
  readonly manifest: OpenSketchModuleManifest;
  mount(container: HTMLElement, initialContext?: OpenSketchApplicationContext): void;
  updateContext(contextPatch: OpenSketchApplicationContext): void;
  getLifecycleState(): OpenSketchLifecycleState;
  suspend(): void;
  resume(): void;
  requestClose(): Promise<{ allowed: boolean; reason?: string }>;
  unmount(): Promise<void>;
}

export interface OpenSketchModuleManifest {
  schemaVersion: 1;
  id: "opensketch";
  displayName: "OpenSketch";
  version: string;
  contractVersion: "1.1.0";
  entry: "OpenSketchApplication";
  stylesheetEntry: string;
  assetManifestEntry: string;
  editorCore: {
    packageName: "@workspace/editor-core";
    version: string;
    projectFormatVersion: number;
  };
  compatibility: {
    openSuiteContractVersion: string;
    react: string;
    "react-dom": string;
  };
  uiContractVersion: "0.1.0-bootstrap";
  peerDependencies: { react: string; "react-dom": string };
  capabilities: readonly string[];
}

export declare const OPENSKETCH_MODULE_MANIFEST: OpenSketchModuleManifest;
export declare const OpenSketchApplication: ComponentType<unknown>;
export declare function createOpenSketchModule(
  services: OpenSketchHostServices
): OpenSketchApplicationModule;
`;

const outputPath = resolve(output);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, declaration, "utf8");
