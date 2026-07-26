import { lazy, Suspense, useCallback, useEffect, useState } from "react";
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
import { HomeScreen } from "@/components/HomeScreen";
import {
  instantiateScientificTemplate,
  type ScientificTemplateId
} from "@/templates/scientificTemplates";

const EditorStudio = lazy(() =>
  import("@/components/EditorStudio").then((module) => ({ default: module.EditorStudio }))
);

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

  const newProject = async (templateId?: ScientificTemplateId) => {
    try {
      const project = templateId
        ? await instantiateScientificTemplate(templateId)
        : createProject();
      await saveProject(project);
      setCurrent(project);
      await refresh();
    } catch (reason) {
      setError(String(reason));
    }
  };

  const updateProject = useCallback(async (project: ProjectRecord) => {
    await saveProject(project);
    setCurrent((active) => (active?.id === project.id ? project : active));
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
            onHome={() => {
              setCurrent(null);
              void refresh();
            }}
          />
        </Suspense>
      ) : (
        <HomeScreen
          projects={projects}
          onNew={(templateId) => void newProject(templateId)}
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
