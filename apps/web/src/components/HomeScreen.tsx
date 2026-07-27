import { useEffect, useMemo, useRef, useState } from "react";
import DOMPurify from "dompurify";
import {
  Copy,
  FilePlus2,
  FolderOpen,
  Github,
  MoreHorizontal,
  Pencil,
  Save,
  Trash2,
  Upload
} from "lucide-react";
import type { ProjectRecord } from "@workspace/editor-core";
import { GLOBAL_CREDIT } from "@/assets/credit";
import { vectorThumbnailMarkup } from "@/persistence/thumbnailFormat";
import { Logo } from "./Logo";
import { useModalDialog } from "./useModalDialog";

export function HomeScreen({
  projects,
  onNew,
  onOpen,
  onDuplicate,
  onDelete,
  onExport,
  onRename,
  onImport
}: {
  projects: ProjectRecord[];
  onNew: () => void;
  onOpen: (project: ProjectRecord) => void;
  onDuplicate: (project: ProjectRecord) => void;
  onDelete: (project: ProjectRecord) => void;
  onExport: (project: ProjectRecord) => void;
  onRename: (project: ProjectRecord) => void;
  onImport: (file: File) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [about, setAbout] = useState(false);
  const aboutRef = useModalDialog(about, () => setAbout(false));

  useEffect(() => {
    document.title = "OpenSketch";
  }, []);

  useEffect(() => {
    const closeOtherProjectMenus = (event: PointerEvent) => {
      const clickedMenu =
        event.target instanceof Element
          ? event.target.closest<HTMLDetailsElement>(".project-card details")
          : null;
      document
        .querySelectorAll<HTMLDetailsElement>(".project-card details[open]")
        .forEach((menu) => {
          if (menu !== clickedMenu) menu.open = false;
        });
    };
    document.addEventListener("pointerdown", closeOtherProjectMenus);
    return () => document.removeEventListener("pointerdown", closeOtherProjectMenus);
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
        <section className="new-figure-section">
          <button className="new-figure-button" onClick={onNew}>
            <span className="new-figure-icon" aria-hidden="true">
              <FilePlus2 size={20} />
            </span>
            New figure
          </button>
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
                      <ProjectPreview thumbnail={project.thumbnail} />
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
      </footer>

      {about && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={() => setAbout(false)}>
          <section
            ref={aboutRef}
            className="dialog about-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="About OpenSketch"
            tabIndex={-1}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <p>{GLOBAL_CREDIT}</p>
            <p>
              The editor runs locally, uses no account or application backend, and keeps project
              files in your browser&apos;s IndexedDB.
            </p>
            <a
              className="button secondary"
              href="https://github.com/pkheisig/OpenSketch"
              target="_blank"
              rel="noreferrer"
            >
              <Github size={16} aria-hidden="true" />
              GitHub
            </a>
          </section>
        </div>
      )}
    </main>
  );
}

function ProjectPreview({ thumbnail }: { thumbnail: string }) {
  const vectorMarkup = useMemo(() => {
    const markup = vectorThumbnailMarkup(thumbnail);
    return markup
      ? DOMPurify.sanitize(markup, {
          USE_PROFILES: { svg: true, svgFilters: true }
        })
      : null;
  }, [thumbnail]);

  return vectorMarkup ? (
    <span
      className="project-preview-vector"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: vectorMarkup }}
    />
  ) : (
    <img src={thumbnail} alt="" />
  );
}
