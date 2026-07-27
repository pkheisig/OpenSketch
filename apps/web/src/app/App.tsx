import { lazy, Suspense, useCallback, useEffect, useState } from "react";
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
  saveProject
} from "@/persistence/database";
import { downloadProject, readProjectFile } from "@/persistence/portable";
import { isProjectThumbnailCurrent } from "@/persistence/thumbnailFormat";
import { HomeScreen } from "@/components/HomeScreen";

const EditorStudio = lazy(() =>
  import("@/components/EditorStudio").then((module) => ({ default: module.EditorStudio }))
);

const PROJECT_HISTORY_KEY = "OpenSketchProjectId";

function historyProjectId() {
  const state = window.history.state as Record<string, unknown> | null;
  return typeof state?.[PROJECT_HISTORY_KEY] === "string" ? state[PROJECT_HISTORY_KEY] : null;
}

export function App() {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [folders, setFolders] = useState<ProjectFolderRecord[]>([]);
  const [current, setCurrent] = useState<ProjectRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const [stored, storedFolders] = await Promise.all([listProjects(), listProjectFolders()]);
    setProjects(stored);
    setFolders(storedFolders);
    const needsVectorPreview = stored.some(
      (project) => !isProjectThumbnailCurrent(project.thumbnail, project.updatedAt)
    );
    if (!needsVectorPreview) return;

    const { upgradeProjectThumbnails } = await import("@/persistence/projectThumbnail");
    const upgraded = await upgradeProjectThumbnails(stored);
    const changed = upgraded.filter(
      (project, index) => project.thumbnail !== stored[index]?.thumbnail
    );
    await Promise.all(changed.map(saveProject));
    setProjects(upgraded);
  }, []);

  useEffect(() => {
    refresh()
      .catch((reason) => setError(String(reason)))
      .finally(() => setLoading(false));
  }, [refresh]);

  useEffect(() => {
    const syncViewToHistory = () => {
      const projectId = historyProjectId();
      if (!projectId) {
        setCurrent(null);
        void refresh();
        return;
      }

      db.projects
        .get(projectId)
        .then((project) => {
          setCurrent(project ?? null);
          if (!project) void refresh();
        })
        .catch((reason) => setError(String(reason)));
    };

    window.addEventListener("popstate", syncViewToHistory);
    return () => window.removeEventListener("popstate", syncViewToHistory);
  }, [refresh]);

  const openProject = useCallback((project: ProjectRecord) => {
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
      await saveProject(project);
      openProject(project);
      await refresh();
    } catch (reason) {
      setError(String(reason));
    }
  };

  const updateProject = useCallback(async (project: ProjectRecord) => {
    await saveProject(project);
    setCurrent((active) => (active?.id === project.id ? project : active));
    setProjects((existing) =>
      [project, ...existing.filter((item) => item.id !== project.id)].sort((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt)
      )
    );
  }, []);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-mark" />
        <span>Preparing local studio…</span>
      </div>
    );
  }

  return (
    <>
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
          />
        </Suspense>
      ) : (
        <HomeScreen
          projects={projects}
          folders={folders}
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
            readProjectFile(file)
              .then(async (project) => {
                await saveProject(project);
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
    </>
  );
}
