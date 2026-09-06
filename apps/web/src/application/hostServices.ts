import {
  Fragment,
  createContext,
  createElement,
  useContext,
  useLayoutEffect,
  useState,
  type ReactNode
} from "react";
import type {
  AssetFamily,
  AssetManifest,
  AssetVariant,
  ImportedMediaRecord,
  InterchangeFidelityReport,
  ProjectFolderRecord,
  ProjectCreationOptions,
  ProjectRecord
} from "@workspace/editor-core";
import type { ProjectTemplateRecord } from "@workspace/editor-core";
import type { AssetTemplate } from "@/editor/assetTemplates";
import type { ProjectLoadResult } from "@/persistence/portable";
import type { OfflineAssetPackStatus } from "@/assets/offlineAssetPack";

export type Theme = "light" | "dark";
export type ThemeAppearance = "system" | "light" | "dark";

export const OPENSKETCH_APPLICATION_VERSION = "0.1.0" as const;
export const OPENSKETCH_APPLICATION_CONTRACT_VERSION = "1.1.0" as const;
export const OPENSKETCH_OPEN_SUITE_CONTRACT_VERSION = "0.1.0-bootstrap" as const;
export const OPENSKETCH_REACT_VERSION_RANGE = "^19.0.0" as const;
export const OPENSKETCH_REACT_DOM_VERSION_RANGE = "^19.0.0" as const;

export class ProjectConflictError extends Error {
  constructor(readonly current?: ProjectRecord) {
    super(
      current
        ? "This project changed in another tab. Save a copy or reload the newer version."
        : "This project was deleted in another tab. Save a copy before leaving."
    );
    this.name = "ProjectConflictError";
  }
}

export interface ProjectRepository {
  subscribeChanges?(
    listener: (notice: { projectId: string; deleted?: boolean }) => void
  ): () => void;
  list(): Promise<ProjectRecord[]>;
  get(id: string): Promise<ProjectRecord | undefined>;
  save(project: ProjectRecord): Promise<void>;
  saveThumbnail(
    projectId: string,
    projectRevision: string,
    thumbnail: string
  ): Promise<ProjectRecord | undefined>;
  create(name?: string, options?: ProjectCreationOptions): ProjectRecord;
  delete(id: string, expectedRevision?: number): Promise<void>;
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

export interface ImportedMediaLibraryRecord extends ImportedMediaRecord {
  createdAt: string;
  updatedAt: string;
  contentHash: string;
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
  kind: "svg" | "pdf" | "png" | "jpeg" | "webp" | "tiff" | "bmp" | "pptx" | "credits" | "project";
  fidelity?: InterchangeFidelityReport;
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

export interface RenderHandle {
  unmount(): void | Promise<void>;
  setSuspended?(suspended: boolean): void;
}

export interface OpenSketchHostServices {
  /** The host owns ReactDOM; the application module only supplies a node. */
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

export interface OpenSketchPortalScope {
  mode: "standalone" | "opensuite";
  theme: Theme;
  density: "compact" | "standard";
  reducedMotion: boolean;
  uiContractVersion: string;
  style: string;
  palette: string;
  appearance: ThemeAppearance;
  themeContractVersion: string;
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
  peerDependencies: {
    react: string;
    "react-dom": string;
  };
  capabilities: readonly string[];
}

const HostServicesContext = createContext<OpenSketchHostServices | null>(null);
const OpenSketchPortalRootContext = createContext<HTMLElement | null>(null);

export function OpenSketchHostProvider({
  services,
  children
}: {
  services: OpenSketchHostServices;
  children?: ReactNode;
}) {
  return createElement(HostServicesContext.Provider, { value: services }, children);
}

export function useOpenSketchHostServices(): OpenSketchHostServices {
  const services = useContext(HostServicesContext);
  if (!services) throw new Error("OpenSketch host services are not available.");
  return services;
}

export function OpenSketchPortalRoot({
  children,
  portalRootId,
  scope
}: {
  children?: ReactNode;
  portalRootId?: string;
  scope?: OpenSketchPortalScope;
}) {
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const [hostPortalRoot, setHostPortalRoot] = useState<HTMLDivElement | null>(null);
  const hostRoot =
    portalRootId && typeof document !== "undefined" ? document.getElementById(portalRootId) : null;

  useLayoutEffect(() => {
    if (!hostRoot) {
      setHostPortalRoot(null);
      return undefined;
    }
    const scopedRoot = document.createElement("div");
    scopedRoot.className = "opensketch-app opensketch-portal-host";
    hostRoot.append(scopedRoot);
    setHostPortalRoot(scopedRoot);
    return () => {
      setHostPortalRoot((current) => (current === scopedRoot ? null : current));
      scopedRoot.remove();
    };
  }, [hostRoot]);

  useLayoutEffect(() => {
    if (!hostPortalRoot || !scope) return undefined;
    const attributes: Record<string, string> = {
      "data-opensketch-mode": scope.mode,
      "data-opensketch-theme": scope.theme,
      "data-opensketch-density": scope.density,
      "data-opensketch-reduced-motion": String(scope.reducedMotion),
      "data-opensketch-ui-contract": scope.uiContractVersion,
      "data-suite-theme-root": "",
      "data-suite-ui": "opensketch",
      "data-suite-style": scope.style,
      "data-suite-palette": scope.palette,
      "data-suite-appearance": scope.appearance,
      "data-suite-theme-contract-version": scope.themeContractVersion,
      "data-theme": scope.theme,
      "data-density": scope.density
    };
    for (const [name, value] of Object.entries(attributes)) {
      hostPortalRoot.setAttribute(name, value);
    }
    hostPortalRoot.classList.toggle("theme-light", scope.theme === "light");
    hostPortalRoot.classList.toggle("theme-dark", scope.theme === "dark");
    return () => {
      for (const name of Object.keys(attributes)) {
        hostPortalRoot.removeAttribute(name);
      }
      hostPortalRoot.classList.remove("theme-light", "theme-dark");
    };
  }, [hostPortalRoot, scope]);

  const portalTarget = hostRoot ? hostPortalRoot : root;

  return createElement(
    OpenSketchPortalRootContext.Provider,
    { value: portalTarget },
    createElement(
      Fragment,
      null,
      createElement("div", { className: "opensketch-portal-root", ref: setRoot }),
      children
    )
  );
}

export function useOpenSketchPortalRoot(): HTMLElement | null {
  return useContext(OpenSketchPortalRootContext);
}
