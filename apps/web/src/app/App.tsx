import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import type { ProjectFolderRecord, ProjectRecord } from "@workspace/editor-core";
import {
  createProjectFolder,
  createProject,
  db,
  deleteProjectFolder,
  duplicateProject,
  listProjectFolders,
  listProjects,
  moveProjectToFolder,
  saveProjectFolder,
  saveProject,
  saveProjectThumbnail
} from "@/persistence/database";
import {
  downloadProject,
  normalizeProjectForLoad,
  readProjectFileWithWarnings
} from "@/persistence/portable";
import { isProjectThumbnailCurrent } from "@/persistence/thumbnailFormat";
import { HomeScreen } from "@/components/HomeScreen";

const EditorStudio = lazy(() =>
  import("@/components/EditorStudio").then((module) => ({ default: module.EditorStudio }))
);

const PROJECT_HISTORY_KEY = "OpenSketchProjectId";
const THEME_STORAGE_KEY = "OpenSketch-theme";

type Theme = "light" | "dark";

function readTheme(): Theme {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function historyProjectId() {
  const state = window.history.state as Record<string, unknown> | null;
  return typeof state?.[PROJECT_HISTORY_KEY] === "string" ? state[PROJECT_HISTORY_KEY] : null;
}

function identityRepairNotice(project: ProjectRecord, warnings: string[]): string {
  const duplicateCount = warnings.filter((warning) =>
    warning.startsWith("Repaired duplicate")
  ).length;
  return `Repaired scene identity in “${project.name}” (${duplicateCount} duplicate ID${duplicateCount === 1 ? "" : "s"}).`;
}

function projectLoadError(project: ProjectRecord, reason: unknown): string {
  const detail = reason instanceof Error ? reason.message : String(reason);
  return `Could not load “${project.name}”: ${detail.replace(/^Error:\s*/, "")}`;
}

export function App() {
  const [theme, setTheme] = useState<Theme>(readTheme);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [folders, setFolders] = useState<ProjectFolderRecord[]>([]);
  const [current, setCurrent] = useState<ProjectRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updateReady, setUpdateReady] = useState(
    () => document.documentElement.dataset.updateReady === "true"
  );
  const refreshRevision = useRef(0);
  const historySyncRevision = useRef(0);
  const historyNavigationGuard = useRef<(() => boolean) | null>(null);

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next = current === "light" ? "dark" : "light";
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        // Keep theme switching available for this session if storage is blocked.
      }
      return next;
    });
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  const refresh = useCallback(async () => {
    const revision = ++refreshRevision.current;
    const [stored, storedFolders] = await Promise.all([listProjects(), listProjectFolders()]);
    const repairNotices: string[] = [];
    const invalidNotices: string[] = [];
    const normalized = stored.map((project) => {
      try {
        const loaded = normalizeProjectForLoad(project);
        if (loaded.identityRepaired) {
          repairNotices.push(identityRepairNotice(project, loaded.identityWarnings));
          void saveProject(loaded.project).catch((reason) => setError(String(reason)));
        }
        return loaded.project;
      } catch (reason) {
        invalidNotices.push(projectLoadError(project, reason));
        return project;
      }
    });
    if (revision !== refreshRevision.current) return normalized;
    setProjects(normalized);
    setFolders(storedFolders);
    if (repairNotices.length > 0 || invalidNotices.length > 0) {
      setError([...repairNotices, ...invalidNotices].join(" "));
    }

    const activeProjectId = historyProjectId();
    const stale = normalized.filter(
      (project) =>
        project.id !== activeProjectId &&
        !isProjectThumbnailCurrent(project.thumbnail, project.updatedAt)
    );
    if (stale.length > 0) {
      void import("@/persistence/projectThumbnail")
        .then(async ({ upgradeProjectThumbnails }) => {
          const upgraded = await upgradeProjectThumbnails(stale);
          const applied = await Promise.all(
            upgraded.map((project, index) => {
              if (project.thumbnail === stale[index]?.thumbnail || !project.thumbnail) {
                return undefined;
              }
              return saveProjectThumbnail(project.id, project.updatedAt, project.thumbnail);
            })
          );
          if (revision !== refreshRevision.current) return;
          const byId = new Map(
            applied
              .filter((project): project is ProjectRecord => Boolean(project))
              .map((project) => [project.id, project])
          );
          setProjects((existing) =>
            existing.map((project) => {
              const latest = byId.get(project.id);
              return latest?.updatedAt === project.updatedAt ? latest : project;
            })
          );
        })
        .catch((reason) => setError(String(reason)));
    }
    return normalized;
  }, []);

  useEffect(() => {
    refresh()
      .then((stored) => {
        const projectId = historyProjectId();
        if (!projectId) return;
        const project = stored.find((candidate) => candidate.id === projectId);
        if (project) {
          try {
            setCurrent(normalizeProjectForLoad(project).project);
          } catch (reason) {
            setError(projectLoadError(project, reason));
          }
        }
      })
      .catch((reason) => setError(String(reason)))
      .finally(() => setLoading(false));
  }, [refresh]);

  useEffect(() => {
    const markUpdateReady = () => setUpdateReady(true);
    window.addEventListener("opensketch:update-ready", markUpdateReady);
    return () => window.removeEventListener("opensketch:update-ready", markUpdateReady);
  }, []);

  useEffect(() => {
    if (loading || current || !updateReady) return;
    window.dispatchEvent(new Event("opensketch:apply-update"));
  }, [current, loading, updateReady]);

  useEffect(() => {
    const syncViewToHistory = () => {
      const revision = ++historySyncRevision.current;
      const projectId = historyProjectId();
      if (projectId !== current?.id && historyNavigationGuard.current?.()) {
        window.history.forward();
        return;
      }
      if (!projectId) {
        setCurrent(null);
        void refresh();
        return;
      }

      db.projects
        .get(projectId)
        .then((project) => {
          if (revision !== historySyncRevision.current) return;
          if (!project) {
            setCurrent(null);
            void refresh();
            return;
          }
          try {
            const loaded = normalizeProjectForLoad(project);
            if (loaded.identityRepaired) {
              void saveProject(loaded.project).catch((reason) => setError(String(reason)));
              setError(identityRepairNotice(project, loaded.identityWarnings));
            }
            setCurrent(loaded.project);
          } catch (reason) {
            setCurrent(null);
            setError(projectLoadError(project, reason));
          }
        })
        .catch((reason) => setError(String(reason)));
    };

    window.addEventListener("popstate", syncViewToHistory);
    return () => window.removeEventListener("popstate", syncViewToHistory);
  }, [current?.id, refresh]);

  const openProject = useCallback((project: ProjectRecord) => {
    let loaded: ProjectRecord;
    try {
      const result = normalizeProjectForLoad(project);
      loaded = result.project;
      if (result.identityRepaired) {
        void saveProject(loaded).catch((reason) => setError(String(reason)));
        setError(identityRepairNotice(project, result.identityWarnings));
      }
    } catch (reason) {
      setError(projectLoadError(project, reason));
      return;
    }
    historySyncRevision.current += 1;
    setCurrent(loaded);
    if (historyProjectId() === loaded.id) return;

    const currentState =
      window.history.state && typeof window.history.state === "object" ? window.history.state : {};
    window.history.pushState(
      { ...currentState, [PROJECT_HISTORY_KEY]: loaded.id },
      "",
      window.location.href
    );
  }, []);

  const returnToProjects = useCallback(() => {
    if (historyProjectId()) {
      window.history.back();
      return;
    }
    setCurrent(null);
    void refresh();
  }, [refresh]);

  const newProject = async () => {
    try {
      const project = createProject();
      await saveProject(project);
      openProject(project);
      await refresh();
    } catch (reason) {
      setError(String(reason));
    }
  };

  const updateProject = useCallback(async (project: ProjectRecord) => {
    await saveProject(project);
  }, []);

  const setHistoryNavigationGuard = useCallback((guard: (() => boolean) | null) => {
    historyNavigationGuard.current = guard;
  }, []);

  if (loading) {
    return (
      <div className={`opensketch-app theme-${theme}`}>
        <div className="loading-screen">
          <div className="loading-mark" />
          <span>Preparing local studio…</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`opensketch-app theme-${theme}`}>
      {current ? (
        <Suspense
          fallback={
            <div className="loading-screen">
              <div className="loading-mark" />
              <span>Opening vector workspace…</span>
            </div>
          }
        >
          <EditorStudio
            project={current}
            onProjectChange={updateProject}
            onHome={returnToProjects}
            onNavigationGuardChange={setHistoryNavigationGuard}
            theme={theme}
            onToggleTheme={toggleTheme}
          />
        </Suspense>
      ) : (
        <HomeScreen
          projects={projects}
          folders={folders}
          theme={theme}
          onToggleTheme={toggleTheme}
          onNew={() => void newProject()}
          onNewFolder={(name) => {
            createProjectFolder(name)
              .then(refresh)
              .catch((reason) => setError(String(reason)));
          }}
          onOpen={openProject}
          onDuplicate={(project) => {
            duplicateProject(project)
              .then(refresh)
              .catch((reason) => setError(String(reason)));
          }}
          onDelete={(project) => {
            if (!window.confirm(`Delete “${project.name}”? This cannot be undone.`)) return;
            db.projects
              .delete(project.id)
              .then(refresh)
              .catch((reason) => setError(String(reason)));
          }}
          onExport={downloadProject}
          onArchive={(project) => {
            saveProject({ ...project, archivedAt: new Date().toISOString() })
              .then(refresh)
              .catch((reason) => setError(String(reason)));
          }}
          onRestore={(project) => {
            const restored = { ...project };
            delete restored.archivedAt;
            saveProject(restored)
              .then(refresh)
              .catch((reason) => setError(String(reason)));
          }}
          onMoveProject={(project, folderId) => {
            moveProjectToFolder(project, folderId)
              .then(refresh)
              .catch((reason) => setError(String(reason)));
          }}
          onRenameFolder={(folder) => {
            const name = window.prompt("Rename folder", folder.name)?.trim();
            if (!name || name === folder.name) return;
            saveProjectFolder({ ...folder, name, updatedAt: new Date().toISOString() })
              .then(refresh)
              .catch((reason) => setError(String(reason)));
          }}
          onDeleteFolder={(folder) => {
            if (!window.confirm(`Delete folder “${folder.name}”? Its projects will be kept.`)) {
              return;
            }
            deleteProjectFolder(folder.id)
              .then(refresh)
              .catch((reason) => setError(String(reason)));
          }}
          onRename={(project) => {
            const name = window.prompt("Rename project", project.name)?.trim();
            if (!name || name === project.name) return;
            saveProject({ ...project, name, updatedAt: new Date().toISOString() })
              .then(refresh)
              .catch((reason) => setError(String(reason)));
          }}
          onImport={(file) => {
            readProjectFileWithWarnings(file)
              .then(async ({ project, identityRepaired, identityWarnings }) => {
                await saveProject(project);
                if (identityRepaired) setError(identityRepairNotice(project, identityWarnings));
                await refresh();
                openProject(project);
              })
              .catch((reason) => setError(String(reason)));
          }}
        />
      )}
      {error && (
        <div className="error-toast" role="alert">
          <AlertTriangle size={17} />
          <span>{error.replace(/^Error:\s*/, "")}</span>
          <button onClick={() => setError("")} aria-label="Dismiss error">
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
