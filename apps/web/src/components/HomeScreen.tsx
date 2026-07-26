import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
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
  onRename,
  onImport
}: {
  projects: ProjectRecord[];
  onNew: (templateId?: ScientificTemplateId) => void;
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
    document.title = "OpenSketch — scientific figure studio";
  }, []);

  return (
    <main className="home-shell">
      <header className="home-header">
        <Logo />
        <div className="home-header-actions">
          <button className="text-button" onClick={() => setAbout(true)}>
            About
          </button>
          <button className="button secondary" onClick={() => input.current?.click()}>
            <Upload size={16} /> Import project
          </button>
          <button className="button primary" onClick={() => onNew()}>
            <FilePlus2 size={17} /> New figure
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

      <section className="home-hero">
        <div className="hero-copy">
          <p className="eyebrow">OPEN · LOCAL · VECTOR</p>
          <h1>Build the figure your data deserves.</h1>
          <p>
            Assemble biological illustrations, labels, and pathways in a precise canvas that keeps
            every project on your device.
          </p>
          <button className="hero-cta" onClick={() => onNew()}>
            Start a blank figure <ArrowRight size={18} />
          </button>
        </div>
        <div className="hero-figure" aria-hidden="true">
          <div className="hero-grid" />
          <div className="cell cell-a">
            <span />
          </div>
          <div className="cell cell-b">
            <span />
          </div>
          <svg viewBox="0 0 480 280">
            <path d="M122 144 C190 82 266 84 350 142" />
            <path d="m335 128 17 14-22 8" />
            <text x="202" y="78">
              SIGNAL
            </text>
            <line x1="240" y1="173" x2="240" y2="230" />
            <circle cx="240" cy="246" r="12" />
          </svg>
          <div className="hero-caption">
            <span>FIG. 01</span>
            Receptor trafficking
          </div>
        </div>
      </section>

      <section className="templates-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">START WITH STRUCTURE</p>
            <h2>Scientific layouts</h2>
          </div>
          <span className="local-pill">Fully editable</span>
        </div>
        <div className="template-grid">
          {SCIENTIFIC_TEMPLATES.map((template) => (
            <button
              className="template-card"
              key={template.id}
              onClick={() => onNew(template.id)}
              aria-label={`Create ${template.name} figure`}
            >
              <TemplatePreview kind={template.preview} />
              <span className="template-copy">
                <small>{template.eyebrow}</small>
                <strong>{template.name}</strong>
                <span>{template.description}</span>
              </span>
              <ArrowRight size={17} />
            </button>
          ))}
        </div>
      </section>

      <section className="projects-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">YOUR WORKBENCH</p>
            <h2>Recent projects</h2>
          </div>
          <span className="local-pill">Stored locally</span>
        </div>
        <div className="project-grid">
          <button className="new-project-card" onClick={() => onNew()}>
            <span>
              <FilePlus2 size={25} />
            </span>
            <strong>New figure</strong>
            <small>Presentation 16:9 · 300 DPI</small>
          </button>
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
      </section>

      <footer className="home-footer">
        <span>OpenSketch 0.1 · AGPL-3.0-or-later</span>
        <span>Projects never leave this browser.</span>
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
      <Icon size={18} />
      <span className="template-preview-nodes">
        <i />
        <i />
        <i />
        <i />
      </span>
    </span>
  );
}
