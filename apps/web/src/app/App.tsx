import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import type { ProjectRecord } from "@opensketch/editor-core";
import {
  createProject,
  db,
  duplicateProject,
  listProjects,
  saveProject
} from "@/persistence/database";
import { downloadProject, readProjectFile } from "@/persistence/portable";
import { EditorProvider } from "@/editor/EditorContext";
import { HomeScreen } from "@/components/HomeScreen";
import { TopToolbar } from "@/components/TopToolbar";
import { LeftSidebar } from "@/components/LeftSidebar";
import { CanvasWorkspace } from "@/components/CanvasWorkspace";
import { Inspector } from "@/components/Inspector";

export function App() {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [current, setCurrent] = useState<ProjectRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setProjects(await listProjects());
  }, []);

  useEffect(() => {
    refresh()
      .catch((reason) => setError(String(reason)))
      .finally(() => setLoading(false));
  }, [refresh]);

  const newProject = async () => {
    try {
      const project = createProject();
      await saveProject(project);
      setCurrent(project);
      await refresh();
    } catch (reason) {
      setError(String(reason));
    }
  };

  const updateProject = useCallback(async (project: ProjectRecord) => {
    await saveProject(project);
    setCurrent(project);
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
        <EditorProvider key={current.id} project={current} onProjectChange={updateProject}>
          <main className="editor-shell">
            <TopToolbar
              project={current}
              onHome={() => {
                setCurrent(null);
                void refresh();
              }}
            />
            <div className="editor-grid">
              <LeftSidebar />
              <CanvasWorkspace />
              <Inspector />
            </div>
          </main>
        </EditorProvider>
      ) : (
        <HomeScreen
          projects={projects}
          onNew={() => void newProject()}
          onOpen={setCurrent}
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
                setCurrent(project);
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
