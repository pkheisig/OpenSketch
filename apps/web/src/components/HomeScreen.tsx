import { useEffect, useRef, useState } from "react";
import {
  Copy,
  FilePlus2,
  FolderOpen,
  MoreHorizontal,
  Network,
  Pencil,
  Save,
  Trash2,
  Upload,
  Workflow,
  Columns3
} from "lucide-react";
import type { ProjectRecord } from "@workspace/editor-core";
import { GLOBAL_CREDIT } from "@/assets/credit";
import { Logo } from "./Logo";
import { useModalDialog } from "./useModalDialog";
import { SCIENTIFIC_TEMPLATES, type ScientificTemplateId } from "@/templates/scientificTemplates";

export function HomeScreen({
  projects,
  onNew,
  onOpen,
  onDuplicate,
  onDelete,
  onExport,
  canSaveToFolder,
  onSaveToFolder,
  onRename,
  onImport
}: {
  projects: ProjectRecord[];
  onNew: (templateId?: ScientificTemplateId) => void;
  onOpen: (project: ProjectRecord) => void;
  onDuplicate: (project: ProjectRecord) => void;
  onDelete: (project: ProjectRecord) => void;
  onExport: (project: ProjectRecord) => void;
  canSaveToFolder: boolean;
  onSaveToFolder: (project: ProjectRecord) => void;
  onRename: (project: ProjectRecord) => void;
  onImport: (file: File) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [about, setAbout] = useState(false);
  const [offlineReady, setOfflineReady] = useState(
    document.documentElement.dataset.offlineReady === "true" ||
      Boolean(navigator.serviceWorker?.controller)
  );
  const aboutRef = useModalDialog(about, () => setAbout(false));

  useEffect(() => {
    document.title = "OpenSketch — scientific figure studio";
    const markOfflineReady = () => setOfflineReady(true);
    window.addEventListener("opensketch:offline-ready", markOfflineReady);
    return () => window.removeEventListener("opensketch:offline-ready", markOfflineReady);
  }, []);

  return (
    <main className="home-shell">
      <header className="home-header">
        <Logo />
        <div className="home-header-actions">
          <button className="button secondary" onClick={() => input.current?.click()}>
            <Upload size={16} /> Import project
          </button>
          <input
            ref={input}
            hidden
            type="file"
            accept=".OpenSketch,application/json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onImport(file);
              event.currentTarget.value = "";
            }}
          />
        </div>
      </header>

      <div className="home-content">
        <section className="templates-section">
          <div className="section-heading">
            <h1>New figure</h1>
          </div>
          <div className="start-grid">
            <button
              className="template-card blank-template-card"
              onClick={() => onNew()}
              aria-label="Create blank figure"
            >
              <span className="template-preview" aria-hidden="true">
                <FilePlus2 size={20} />
              </span>
              <strong>Blank</strong>
            </button>
            {SCIENTIFIC_TEMPLATES.map((template) => (
              <button
                className="template-card"
                key={template.id}
                onClick={() => onNew(template.id)}
                aria-label={`Create ${template.name} figure`}
              >
                <TemplatePreview kind={template.preview} />
                <strong>{template.name}</strong>
              </button>
            ))}
          </div>
        </section>

        <section className="projects-section">
          <div className="section-heading">
            <h2>Projects</h2>
            <span className="project-count">{projects.length}</span>
          </div>
          {projects.length ? (
            <div className="project-grid">
              {projects.map((project) => (
                <article className="project-card" key={project.id}>
                  <button className="project-preview" onClick={() => onOpen(project)}>
                    {project.thumbnail ? (
                      <img src={project.thumbnail} alt="" />
                    ) : (
                      <div className="empty-preview">
                        <FolderOpen size={27} />
                        <span>
                          {project.canvas.width} × {project.canvas.height}
                        </span>
                      </div>
                    )}
                  </button>
                  <div className="project-card-meta">
                    <button className="project-title" onClick={() => onOpen(project)}>
                      {project.name}
                      <small>{new Date(project.updatedAt).toLocaleString()}</small>
                    </button>
                    <details>
                      <summary aria-label={`Project actions for ${project.name}`}>
                        <MoreHorizontal size={18} />
                      </summary>
                      <div className="menu">
                        <button onClick={() => onRename(project)}>
                          <Pencil size={14} /> Rename
                        </button>
                        <button onClick={() => onExport(project)}>
                          <Save size={14} /> Export project
                        </button>
                        {canSaveToFolder ? (
                          <button onClick={() => onSaveToFolder(project)}>
                            <FolderOpen size={14} /> Save to folder
                          </button>
                        ) : null}
                        <button onClick={() => onDuplicate(project)}>
                          <Copy size={14} /> Duplicate
                        </button>
                        <button className="danger" onClick={() => onDelete(project)}>
                          <Trash2 size={14} /> Delete
                        </button>
                      </div>
                    </details>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-projects">No projects yet.</p>
          )}
        </section>
      </div>

      <footer className="home-footer">
        <button className="text-button" onClick={() => setAbout(true)}>
          About
        </button>
        <span>Local only · {offlineReady ? "Ready offline" : "Preparing offline copy…"}</span>
      </footer>

      {about && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={() => setAbout(false)}>
          <section
            ref={aboutRef}
            className="dialog about-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="about-title"
            tabIndex={-1}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <p className="eyebrow">ABOUT THE STUDIO</p>
            <h2 id="about-title">Biology, drawn openly.</h2>
            <p>{GLOBAL_CREDIT}</p>
            <p>
              The editor runs locally, uses no account or application backend, and keeps project
              files in your browser&apos;s IndexedDB.
            </p>
            <button
              className="button secondary"
              onClick={() => void navigator.clipboard?.writeText(GLOBAL_CREDIT)}
            >
              <Copy size={15} /> Copy artwork credit
            </button>
            <a
              className="button secondary"
              href="https://github.com/pkheisig/OpenSketch"
              target="_blank"
              rel="noreferrer"
            >
              View source code
            </a>
            <button className="button primary" onClick={() => setAbout(false)}>
              Continue
            </button>
          </section>
        </div>
      )}
    </main>
  );
}

function TemplatePreview({ kind }: { kind: (typeof SCIENTIFIC_TEMPLATES)[number]["preview"] }) {
  const Icon = kind === "cascade" ? Network : kind === "workflow" ? Workflow : Columns3;
  return (
    <span className={`template-preview ${kind}`} aria-hidden="true">
      <Icon size={20} />
    </span>
  );
}
