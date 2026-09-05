import type { ReactNode } from "react";
import type { AssetFamily, AssetVariant } from "@workspace/editor-core";
import {
  createProject,
  createProjectFolder,
  db,
  deleteImportedMedia,
  deleteProjectFolder,
  duplicateProject,
  getImportedMedia,
  listImportedMedia,
  listProjectFolders,
  listProjects,
  moveProjectToFolder,
  rememberProjectImports,
  saveImportedMedia,
  saveProject,
  saveProjectFolder,
  saveProjectThumbnail
} from "@/persistence/database";
import {
  downloadBlob,
  downloadProject,
  readProjectFileWithWarnings,
  saveProjectToDirectory
} from "@/persistence/portable";
import {
  deleteAssetTemplate,
  getAssetTemplate,
  loadAssetTemplates,
  saveAssetTemplate
} from "@/editor/assetTemplates";
import {
  buildOfflineAssetPack,
  getOfflineAssetPackStatus,
  OFFLINE_ASSET_PACK_CHANGED_EVENT,
  prepareOfflineAssetPack
} from "@/assets/offlineAssetPack";
import type { OfflineAssetPackStatus } from "@/assets/offlineAssetPack";
import type {
  DialogService,
  ExportArtifact,
  FontService,
  ImportedMediaRepository,
  OpenSketchHostServices,
  PreferenceService,
  ProjectRepository,
  RenderHandle
} from "@/application/hostServices";
import type { AssetTemplateRepository } from "@/application/hostServices";

const PROJECT_HISTORY_KEY = "OpenSketchProjectId";
const PROJECT_HISTORY_INDEX_KEY = "OpenSketchHistoryIndex";
const THEME_STORAGE_KEY = "OpenSketch-theme";

function projectRepository(): ProjectRepository {
  return {
    list: listProjects,
    get: (id) => db.projects.get(id),
    save: saveProject,
    saveThumbnail: saveProjectThumbnail,
    create: createProject,
    delete: (id) => db.projects.delete(id),
    duplicate: duplicateProject,
    moveToFolder: moveProjectToFolder,
    listFolders: listProjectFolders,
    createFolder: createProjectFolder,
    saveFolder: saveProjectFolder,
    deleteFolder: deleteProjectFolder
  };
}

function importedMediaRepository(): ImportedMediaRepository {
  return {
    list: listImportedMedia,
    get: getImportedMedia,
    save: saveImportedMedia,
    remember: rememberProjectImports,
    delete: deleteImportedMedia
  };
}

function templateRepository(): AssetTemplateRepository {
  return {
    list: loadAssetTemplates,
    get: getAssetTemplate,
    save: saveAssetTemplate,
    delete: deleteAssetTemplate
  };
}

function preferenceService(): PreferenceService {
  const read = (key: string) => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  };
  const write = (key: string, value: string) => {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Keep the in-memory/session behavior when storage is unavailable.
    }
  };
  const remove = (key: string) => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Keep the in-memory/session behavior when storage is unavailable.
    }
  };
  return {
    get: read,
    set: write,
    remove,
    storage: { getItem: read, setItem: write },
    theme: {
      get: () => (read(THEME_STORAGE_KEY) === "dark" ? "dark" : "light"),
      set: (theme) => write(THEME_STORAGE_KEY, theme),
      apply: (theme) => {
        document.documentElement.dataset.theme = theme;
        document.documentElement.style.colorScheme = theme;
      }
    }
  };
}

function navigationService(): OpenSketchHostServices["navigation"] {
  const currentProjectId = () => {
    const state = window.history.state as Record<string, unknown> | null;
    return typeof state?.[PROJECT_HISTORY_KEY] === "string" ? state[PROJECT_HISTORY_KEY] : null;
  };
  const entryIndex = () => {
    const navigation = (
      window as Window & {
        navigation?: { currentEntry?: { index?: unknown } | null };
      }
    ).navigation;
    const browserIndex = navigation?.currentEntry?.index;
    if (typeof browserIndex === "number" && Number.isInteger(browserIndex)) return browserIndex;
    const state = window.history.state as Record<string, unknown> | null;
    const index = state?.[PROJECT_HISTORY_INDEX_KEY];
    return typeof index === "number" && Number.isInteger(index) ? index : null;
  };
  return {
    currentProjectId,
    entryIndex,
    ensureEntryIndex: () => {
      const state =
        window.history.state && typeof window.history.state === "object"
          ? window.history.state
          : {};
      const index = entryIndex() ?? 0;
      if (entryIndex() !== index) {
        window.history.replaceState(
          { ...state, [PROJECT_HISTORY_INDEX_KEY]: index },
          "",
          window.location.href
        );
      }
    },
    pushProject: (projectId) => {
      const currentState =
        window.history.state && typeof window.history.state === "object"
          ? window.history.state
          : {};
      const nextIndex = (entryIndex() ?? 0) + 1;
      window.history.pushState(
        {
          ...currentState,
          [PROJECT_HISTORY_KEY]: projectId,
          [PROJECT_HISTORY_INDEX_KEY]: nextIndex
        },
        "",
        window.location.href
      );
    },
    back: () => window.history.back(),
    forward: () => window.history.forward(),
    go: (delta) => window.history.go(delta),
    notifyNavigationBlocked: () => window.dispatchEvent(new Event("opensketch:navigation-blocked")),
    subscribe: (listener) => {
      window.addEventListener("popstate", listener);
      return () => window.removeEventListener("popstate", listener);
    }
  };
}

function dialogService(): DialogService {
  return {
    confirm: (message) => window.confirm(message),
    prompt: (message, defaultValue) => window.prompt(message, defaultValue),
    alert: (message) => window.alert(message)
  };
}

function fontService(): FontService {
  return {
    available: () => typeof document !== "undefined" && "fonts" in document,
    ready: async () => {
      if (typeof document !== "undefined" && "fonts" in document) await document.fonts.ready;
    },
    load: async (descriptor, text) => {
      if (typeof document !== "undefined" && "fonts" in document) {
        await document.fonts.load(descriptor, text);
      }
    }
  };
}

function offlineAssetService(): OpenSketchHostServices["assets"] {
  let manifestPromise: Promise<typeof import("@/assets/manifest")> | undefined;
  const loadManifest = () => {
    manifestPromise ??= import("@/assets/manifest");
    return manifestPromise;
  };
  const pack = async () => {
    const { assetManifest, ASSET_OFFLINE_PACK_VERSION } = await loadManifest();
    return buildOfflineAssetPack(assetManifest, ASSET_OFFLINE_PACK_VERSION);
  };
  return {
    getManifest: async () => (await loadManifest()).assetManifest,
    getVersion: async () => (await loadManifest()).ASSET_OFFLINE_PACK_VERSION,
    loadBlob: async (path) => {
      const response = await fetch(path);
      if (!response.ok) throw new Error(`Could not load asset resource (${response.status}).`);
      return response.blob();
    },
    loadText: async (path) => {
      const response = await fetch(path);
      if (!response.ok) throw new Error(`Could not load asset resource (${response.status}).`);
      return response.text();
    },
    resolveVariant: (_family: AssetFamily, variant: AssetVariant) => variant,
    getOfflineStatus: async () => getOfflineAssetPackStatus(await pack()),
    prepareOffline: async () => prepareOfflineAssetPack(await pack()),
    onOfflineStatusChange: (listener) => {
      const update = (event: Event) => {
        if (!(event instanceof CustomEvent)) return;
        const status = event.detail as OfflineAssetPackStatus | undefined;
        if (status) listener(status);
      };
      window.addEventListener(OFFLINE_ASSET_PACK_CHANGED_EVENT, update);
      return () => window.removeEventListener(OFFLINE_ASSET_PACK_CHANGED_EVENT, update);
    }
  };
}

export interface StandaloneHostOptions {
  render(container: HTMLElement, node: ReactNode): RenderHandle;
  updateServiceWorker?: (reloadPage?: boolean) => void | Promise<void>;
}

export function createStandaloneOpenSketchHostServices({
  render,
  updateServiceWorker = () => undefined
}: StandaloneHostOptions): OpenSketchHostServices {
  let updateReady = document.documentElement.dataset.updateReady === "true";
  const updateListeners = new Set<() => void>();
  const markUpdateReady = () => {
    updateReady = true;
    updateListeners.forEach((listener) => listener());
  };
  window.addEventListener("opensketch:update-ready", markUpdateReady);

  const preferences = preferenceService();
  const projects = projectRepository();
  return {
    render,
    projects,
    importedMedia: importedMediaRepository(),
    templates: templateRepository(),
    files: {
      readProject: readProjectFileWithWarnings,
      downloadProject,
      saveProject: saveProjectToDirectory
    },
    exports: {
      deliver: ({ blob, filename }: ExportArtifact) => downloadBlob(blob, filename)
    },
    assets: offlineAssetService(),
    preferences,
    navigation: navigationService(),
    dialogs: dialogService(),
    clipboard: {
      write: async (items) => {
        if (!navigator.clipboard?.write) {
          throw new Error("The system clipboard is unavailable in this browser.");
        }
        await navigator.clipboard.write(items);
      },
      read: async () => {
        if (!navigator.clipboard?.read) {
          throw new Error("The system clipboard is unavailable in this browser.");
        }
        return navigator.clipboard.read();
      }
    },
    pwa: {
      isUpdateReady: () => updateReady,
      onUpdateReady: (listener) => {
        updateListeners.add(listener);
        return () => updateListeners.delete(listener);
      },
      applyUpdate: () => updateServiceWorker(true)
    },
    fonts: fontService(),
    clock: {
      now: () => new Date().toISOString(),
      randomUUID: () => crypto.randomUUID()
    }
  };
}
