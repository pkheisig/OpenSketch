import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import type { ProjectFolderRecord, ProjectRecord } from "@workspace/editor-core";
import {
  createProjectFolder,
  createProject,
  deleteProject,
  deleteProjectFolder,
  duplicateProject,
  getProject,
  listProjectFolders,
  listProjects,
  moveProjectToFolder,
  saveProjectFolder,
  saveProject,
  saveProjectThumbnail,
  subscribeProjectChanges,
  type ProjectSaveResult
} from "@/persistence/database";
import { downloadProject, readProjectFile } from "@/persistence/portable";
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

function projectSaveConflict(result: { status: "conflict"; current?: ProjectRecord }): Error {
  return new Error(
    result.current
      ? "This project changed in another tab. Refresh it before applying this library action."
      : "This project is no longer available in another tab. Refresh the project library."
  );
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
    if (revision !== refreshRevision.current) return stored;
    setProjects(stored);
    setFolders(storedFolders);

    const activeProjectId = historyProjectId();
    const stale = stored.filter(
      (project) =>
        project.id !== activeProjectId &&
        !isProjectThumbnailCurrent(project.thumbnail, project.revision)
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
              return saveProjectThumbnail(project.id, project.revision, project.thumbnail);
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
              return latest?.revision === project.revision ? latest : project;
            })
          );
        })
        .catch((reason) => setError(String(reason)));
    }
    return stored;
  }, []);

  useEffect(() => {
    refresh()
      .then((stored) => {
        const projectId = historyProjectId();
        if (!projectId) return;
        const project = stored.find((candidate) => candidate.id === projectId);
        if (project) setCurrent(project);
      })
      .catch((reason) => setError(String(reason)))
      .finally(() => setLoading(false));
  }, [refresh]);

  useEffect(() => {
    const markUpdateReady = () => setUpdateReady(true);
    window.addEventListener("opensketch:update-ready", markUpdateReady);
    return () => window.removeEventListener("opensketch:update-ready", markUpdateReady);
  }, []);

  useEffect(() => subscribeProjectChanges(() => void refresh()), [refresh]);

  useEffect(() => {
    if (loading || current || !updateReady) return;
    window.dispatchEvent(new Event("opensketch:apply-update"));
  }, [current, loading, updateReady]);

  useEffect(() => {
    const syncViewToHistory = () => {
      const revision = ++historySyncRevision.current;
      const projectId = historyProjectId();
      if (!projectId) {
        setCurrent(null);
        void refresh();
        return;
      }

      getProject(projectId)
        .then((project) => {
          if (revision !== historySyncRevision.current) return;
          setCurrent(project ?? null);
          if (!project) void refresh();
        })
        .catch((reason) => setError(String(reason)));
    };

    window.addEventListener("popstate", syncViewToHistory);
    return () => window.removeEventListener("popstate", syncViewToHistory);
  }, [refresh]);

  const openProject = useCallback((project: ProjectRecord) => {
    historySyncRevision.current += 1;
    setCurrent(project);
    if (historyProjectId() === project.id) return;

    const currentState =
      window.history.state && typeof window.history.state === "object" ? window.history.state : {};
    window.history.pushState(
      { ...currentState, [PROJECT_HISTORY_KEY]: project.id },
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
      const result = await saveProject(project);
      if (result.status === "conflict") throw projectSaveConflict(result);
      openProject(result.project);
      await refresh();
    } catch (reason) {
      setError(String(reason));
    }
  };

  const updateProject = useCallback(
    (project: ProjectRecord): Promise<ProjectSaveResult> => saveProject(project),
    []
  );

  const saveLibraryProject = useCallback(
    async (project: ProjectRecord) => {
      const result = await saveProject(project);
      if (result.status === "conflict") throw projectSaveConflict(result);
      await refresh();
    },
    [refresh]
  );

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
            onProjectSwitch={openProject}
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
            deleteProject(project)
              .then((result) => {
                if (result.status === "conflict") throw projectSaveConflict(result);
                return refresh();
              })
              .catch((reason) => setError(String(reason)));
          }}
          onExport={(project) => {
            try {
              downloadProject(project);
            } catch (reason) {
              setError(String(reason));
            }
          }}
          onArchive={(project) => {
            saveLibraryProject({ ...project, archivedAt: new Date().toISOString() }).catch(
              (reason) => setError(String(reason))
            );
          }}
          onRestore={(project) => {
            const restored = { ...project };
            delete restored.archivedAt;
            saveLibraryProject(restored).catch((reason) => setError(String(reason)));
          }}
          onMoveProject={(project, folderId) => {
            moveProjectToFolder(project, folderId)
              .then((result) => {
                if (result.status === "conflict") throw projectSaveConflict(result);
                return refresh();
              })
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
            saveLibraryProject({ ...project, name, updatedAt: new Date().toISOString() }).catch(
              (reason) => setError(String(reason))
            );
          }}
          onImport={(file) => {
            readProjectFile(file)
              .then(async (project) => {
                const result = await saveProject(project);
                if (result.status === "conflict") throw projectSaveConflict(result);
                await refresh();
                openProject(result.project);
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
