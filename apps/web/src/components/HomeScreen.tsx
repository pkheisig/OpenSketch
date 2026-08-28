import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  Check,
  ChevronDown,
  Copy,
  FilePlus2,
  Folder,
  FolderOpen,
  FolderOutput,
  FolderPlus,
  Github,
  MoreHorizontal,
  Moon,
  Pencil,
  Save,
  Sun,
  Trash2,
  Upload,
  X
} from "lucide-react";
import {
  rehydrateProjectScene,
  type ProjectFolderRecord,
  type ProjectRecord
} from "@workspace/editor-core";
import { GLOBAL_CREDIT } from "@/assets/credit";
import { MotionPresence } from "@/components/MotionPresence";
import { Logo } from "./Logo";
import { useModalDialog } from "./useModalDialog";

const OPEN_FOLDER_STORAGE_KEY = "opensketch.openFolderId";

export function HomeScreen({
  projects,
  folders,
  theme,
  onToggleTheme,
  onNew,
  onNewFolder,
  onOpen,
  onDuplicate,
  onDelete,
  onExport,
  onArchive,
  onRestore,
  onMoveProject,
  onRenameFolder,
  onDeleteFolder,
  onRename,
  onImport
}: {
  projects: ProjectRecord[];
  folders: ProjectFolderRecord[];
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onNew: () => void;
  onNewFolder: (name: string) => void;
  onOpen: (project: ProjectRecord) => void;
  onDuplicate: (project: ProjectRecord) => void;
  onDelete: (project: ProjectRecord) => void;
  onExport: (project: ProjectRecord) => void;
  onArchive: (project: ProjectRecord) => void;
  onRestore: (project: ProjectRecord) => void;
  onMoveProject: (project: ProjectRecord, folderId?: string) => void;
  onRenameFolder: (folder: ProjectFolderRecord) => void;
  onDeleteFolder: (folder: ProjectFolderRecord) => void;
  onRename: (project: ProjectRecord) => void;
  onImport: (file: File) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [about, setAbout] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [openFolderId, setOpenFolderId] = useState<string | undefined>(() => {
    try {
      return localStorage.getItem(OPEN_FOLDER_STORAGE_KEY) || undefined;
    } catch {
      return undefined;
    }
  });
  const [draggedProjectId, setDraggedProjectId] = useState<string>();
  const [dropTarget, setDropTarget] = useState<string>();
  const aboutRef = useModalDialog(about, () => setAbout(false));
  const activeProjects = useMemo(
    () =>
      projects
        .filter((project) => !project.archivedAt)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    [projects]
  );
  const archivedProjects = useMemo(
    () =>
      projects
        .filter((project) => project.archivedAt)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    [projects]
  );
  const folderIds = useMemo(() => new Set(folders.map((folder) => folder.id)), [folders]);
  const unfiledProjects = useMemo(
    () => activeProjects.filter((project) => !project.folderId || !folderIds.has(project.folderId)),
    [activeProjects, folderIds]
  );
  const orderedFolders = useMemo(
    () => [...folders].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    [folders]
  );
  const openFolder = orderedFolders.find((folder) => folder.id === openFolderId);
  const openFolderProjects = openFolder
    ? activeProjects.filter((project) => project.folderId === openFolder.id)
    : [];
  const setOpenFolder = (folderId?: string) => {
    setOpenFolderId(folderId);
    try {
      if (folderId) localStorage.setItem(OPEN_FOLDER_STORAGE_KEY, folderId);
      else localStorage.removeItem(OPEN_FOLDER_STORAGE_KEY);
    } catch {
      // Keep the drawer functional for this session if browser storage is unavailable.
    }
  };

  useEffect(() => {
    document.title = "OpenSketch";
  }, []);

  useEffect(() => {
    const closeOtherProjectMenus = (event: PointerEvent) => {
      const clickedMenu =
        event.target instanceof Element
          ? event.target.closest<HTMLDetailsElement>(".library-menu")
          : null;
      document.querySelectorAll<HTMLDetailsElement>(".library-menu[open]").forEach((menu) => {
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
          <button
            className="icon-button theme-toggle"
            onClick={onToggleTheme}
            aria-label={`Use ${theme === "light" ? "dark" : "light"} theme`}
            title={`Use ${theme === "light" ? "dark" : "light"} theme`}
          >
            {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
          </button>
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
          <div className="creation-actions">
            <button className="new-figure-button" onClick={onNew}>
              <span className="new-figure-icon" aria-hidden="true">
                <FilePlus2 size={20} />
              </span>
              New figure
            </button>
            <button
              className={`new-folder-button ${creatingFolder ? "active" : ""}`}
              onClick={() => setCreatingFolder(true)}
            >
              <FolderPlus size={19} />
              New folder
            </button>
            <MotionPresence open={creatingFolder} exitMs={180}>
              {creatingFolder ? (
                <form
                  className="new-folder-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const name = folderName.trim();
                    if (!name) return;
                    onNewFolder(name);
                    setFolderName("");
                    setCreatingFolder(false);
                  }}
                >
                  <Folder size={17} aria-hidden="true" />
                  <input
                    autoFocus
                    aria-label="Folder name"
                    value={folderName}
                    placeholder="Folder name"
                    onChange={(event) => setFolderName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        setFolderName("");
                        setCreatingFolder(false);
                      }
                    }}
                  />
                  <button type="submit" aria-label="Create folder" disabled={!folderName.trim()}>
                    <Check size={16} />
                  </button>
                  <button
                    type="button"
                    aria-label="Cancel folder"
                    onClick={() => {
                      setFolderName("");
                      setCreatingFolder(false);
                    }}
                  >
                    <X size={16} />
                  </button>
                </form>
              ) : null}
            </MotionPresence>
          </div>
        </section>

        <section className="projects-section">
          <div className="section-heading">
            <h2>Projects</h2>
            <span className="project-count">{activeProjects.length}</span>
          </div>
          {orderedFolders.length ? (
            <div className="folder-row" aria-label="Project folders">
              {orderedFolders.map((folder) => (
                <FolderCard
                  key={folder.id}
                  folder={folder}
                  count={activeProjects.filter((project) => project.folderId === folder.id).length}
                  open={openFolderId === folder.id}
                  dropTarget={dropTarget === folder.id}
                  onOpen={() => setOpenFolder(openFolderId === folder.id ? undefined : folder.id)}
                  onDrop={(projectId) => {
                    const project = projects.find((item) => item.id === projectId);
                    if (project) onMoveProject(project, folder.id);
                    setDraggedProjectId(undefined);
                    setDropTarget(undefined);
                  }}
                  onDragOver={() => setDropTarget(folder.id)}
                  onRename={() => onRenameFolder(folder)}
                  onDelete={() => {
                    if (openFolderId === folder.id) setOpenFolder();
                    onDeleteFolder(folder);
                  }}
                />
              ))}
            </div>
          ) : null}
          {unfiledProjects.length ? (
            <div
              className={`project-row ${dropTarget === "unfiled" ? "drop-target" : ""}`}
              aria-label="Projects, newest edited first"
              onDragOver={(event) => {
                if (!draggedProjectId || (event.target as Element).closest(".folder-card")) return;
                event.preventDefault();
                setDropTarget("unfiled");
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                  setDropTarget(undefined);
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                const project = projects.find(
                  (item) =>
                    item.id ===
                    (draggedProjectId || event.dataTransfer.getData("application/x-opensketch"))
                );
                if (project) onMoveProject(project);
                setDraggedProjectId(undefined);
                setDropTarget(undefined);
              }}
            >
              {unfiledProjects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onOpen={onOpen}
                  onRename={onRename}
                  onExport={onExport}
                  onDuplicate={onDuplicate}
                  onDelete={onDelete}
                  onArchive={onArchive}
                  onRestore={onRestore}
                  onMoveProject={onMoveProject}
                  onDragStart={setDraggedProjectId}
                  onDragEnd={() => {
                    setDraggedProjectId(undefined);
                    setDropTarget(undefined);
                  }}
                />
              ))}
            </div>
          ) : !folders.length ? (
            <p className="empty-projects">No projects yet.</p>
          ) : null}

          <MotionPresence open={Boolean(openFolder)} exitMs={220}>
            {openFolder ? (
              <section className="folder-drawer" aria-label={`${openFolder.name} folder`}>
                <div className="folder-drawer-heading">
                  <FolderOpen size={17} />
                  <strong>{openFolder.name}</strong>
                  <span>{openFolderProjects.length}</span>
                  <button
                    aria-label={`Close ${openFolder.name} folder`}
                    onClick={() => setOpenFolder()}
                  >
                    <X size={15} />
                  </button>
                </div>
                {openFolderProjects.length ? (
                  <div
                    className="project-row folder-project-row"
                    aria-label={`${openFolder.name} projects, newest edited first`}
                  >
                    {openFolderProjects.map((project) => (
                      <ProjectCard
                        key={project.id}
                        project={project}
                        onOpen={onOpen}
                        onRename={onRename}
                        onExport={onExport}
                        onDuplicate={onDuplicate}
                        onDelete={onDelete}
                        onArchive={onArchive}
                        onRestore={onRestore}
                        onMoveProject={onMoveProject}
                        onDragStart={setDraggedProjectId}
                        onDragEnd={() => {
                          setDraggedProjectId(undefined);
                          setDropTarget(undefined);
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="empty-folder">Drag projects onto this folder.</p>
                )}
              </section>
            ) : null}
          </MotionPresence>
        </section>

        <section className="archived-section">
          <button
            className="archive-disclosure"
            aria-expanded={archiveOpen}
            aria-controls="archived-projects"
            onClick={() => setArchiveOpen((open) => !open)}
          >
            <ChevronDown size={17} />
            <span>Archived</span>
            <small>{archivedProjects.length}</small>
          </button>
          <div id="archived-projects" className={`archive-panel ${archiveOpen ? "open" : ""}`}>
            <div className="archive-panel-inner">
              {archivedProjects.length ? (
                <div
                  className="project-row archived-project-row"
                  aria-label="Archived projects, newest edited first"
                >
                  {archivedProjects.map((project) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      archived
                      onOpen={onOpen}
                      onRename={onRename}
                      onExport={onExport}
                      onDuplicate={onDuplicate}
                      onDelete={onDelete}
                      onArchive={onArchive}
                      onRestore={onRestore}
                      onMoveProject={onMoveProject}
                    />
                  ))}
                </div>
              ) : (
                <p className="empty-projects">No archived projects.</p>
              )}
            </div>
          </div>
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
            <div className="about-sources">
              <strong>Bundled artwork sources</strong>
              <ul>
                <li>
                  <a href="https://bioart.niaid.nih.gov/" target="_blank" rel="noreferrer">
                    NIH BioArt Source
                  </a>{" "}
                  — public-domain illustrations
                </li>
                <li>
                  <a href="https://scidraw.io/" target="_blank" rel="noreferrer">
                    SciDraw
                  </a>{" "}
                  — CC0 and CC BY 4.0 illustrations
                </li>
                <li>
                  <a href="https://zenodo.org/records/17203578" target="_blank" rel="noreferrer">
                    Arcadia Science Free organism illustration library
                  </a>{" "}
                  — CC0 organism illustrations
                </li>
                <li>
                  <a href="https://bioicons.com/" target="_blank" rel="noreferrer">
                    BioIcons
                  </a>{" "}
                  — editable scientific SVGs under each icon&apos;s stated CC0, CC BY, CC BY-SA,
                  MIT, or BSD license
                </li>
                <li>
                  <a href="https://smart.servier.com/" target="_blank" rel="noreferrer">
                    Servier Medical Art
                  </a>{" "}
                  — medical illustrations distributed through BioIcons with per-asset attribution
                  and license metadata
                </li>
              </ul>
            </div>
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

function FolderCard({
  folder,
  count,
  open,
  dropTarget,
  onOpen,
  onDrop,
  onDragOver,
  onRename,
  onDelete
}: {
  folder: ProjectFolderRecord;
  count: number;
  open: boolean;
  dropTarget: boolean;
  onOpen: () => void;
  onDrop: (projectId: string) => void;
  onDragOver: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <article
      className={`folder-card ${open ? "open" : ""} ${dropTarget ? "drop-target" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onDragOver();
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onDrop(event.dataTransfer.getData("application/x-opensketch"));
      }}
    >
      <button className="folder-card-main" onClick={onOpen}>
        <span className="folder-card-icon">
          {open ? <FolderOpen size={36} /> : <Folder size={36} />}
        </span>
        <span>
          <strong>{folder.name}</strong>
          <small>{count === 1 ? "1 project" : `${count} projects`}</small>
        </span>
      </button>
      <div className="folder-card-actions">
        <button aria-label={`Rename folder ${folder.name}`} onClick={onRename}>
          <Pencil size={14} />
        </button>
        <button className="danger" aria-label={`Delete folder ${folder.name}`} onClick={onDelete}>
          <Trash2 size={14} />
        </button>
      </div>
    </article>
  );
}

function ProjectCard({
  project,
  archived = false,
  onOpen,
  onRename,
  onExport,
  onDuplicate,
  onDelete,
  onArchive,
  onRestore,
  onMoveProject,
  onDragStart,
  onDragEnd
}: {
  project: ProjectRecord;
  archived?: boolean;
  onOpen: (project: ProjectRecord) => void;
  onRename: (project: ProjectRecord) => void;
  onExport: (project: ProjectRecord) => void;
  onDuplicate: (project: ProjectRecord) => void;
  onDelete: (project: ProjectRecord) => void;
  onArchive: (project: ProjectRecord) => void;
  onRestore: (project: ProjectRecord) => void;
  onMoveProject: (project: ProjectRecord, folderId?: string) => void;
  onDragStart?: (projectId: string) => void;
  onDragEnd?: () => void;
}) {
  return (
    <article
      className={`project-card ${archived ? "archived" : ""}`}
      data-project-id={project.id}
      draggable={!archived}
      onDragStart={(event) => {
        if (archived) return;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("application/x-opensketch", project.id);
        onDragStart?.(project.id);
      }}
      onDragEnd={onDragEnd}
    >
      <button className="project-preview" onClick={() => onOpen(project)}>
        <ProjectPreview project={project} />
      </button>
      <div className="project-card-meta">
        <button className="project-title" onClick={() => onOpen(project)}>
          {project.name}
          <small>{new Date(project.updatedAt).toLocaleString()}</small>
        </button>
        <details className="library-menu project-menu">
          <summary aria-label={`Project actions for ${project.name}`}>
            <MoreHorizontal size={18} />
          </summary>
          <div
            className="menu"
            onClick={(event) => {
              if ((event.target as Element).closest("button")) {
                event.currentTarget.closest("details")?.removeAttribute("open");
              }
            }}
          >
            <button onClick={() => onRename(project)}>
              <Pencil size={14} /> Rename
            </button>
            <button onClick={() => onExport(project)}>
              <Save size={14} /> Export project
            </button>
            <button onClick={() => onDuplicate(project)}>
              <Copy size={14} /> Duplicate
            </button>
            {!archived && project.folderId ? (
              <button onClick={() => onMoveProject(project)}>
                <FolderOutput size={14} /> Move out of folder
              </button>
            ) : null}
            {archived ? (
              <button onClick={() => onRestore(project)}>
                <ArchiveRestore size={14} /> Restore
              </button>
            ) : (
              <button onClick={() => onArchive(project)}>
                <Archive size={14} /> Archive
              </button>
            )}
            <button className="danger" onClick={() => onDelete(project)}>
              <Trash2 size={14} /> Delete
            </button>
          </div>
        </details>
      </div>
    </article>
  );
}

function ProjectPreview({ project }: { project: ProjectRecord }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const className = `project-preview-vector ${project.canvas.transparent ? "transparent" : ""}`;
  const style = project.canvas.transparent
    ? undefined
    : { backgroundColor: project.canvas.background };

  useEffect(() => {
    const element = canvasRef.current;
    if (!element) return;
    let disposed = false;
    let preview: import("fabric").StaticCanvas | undefined;
    const frame = requestAnimationFrame(() => {
      void import("fabric")
        .then(async ({ StaticCanvas }) => {
          if (disposed) return;
          const width = Math.max(1, element.parentElement?.clientWidth ?? 1);
          const height = Math.max(1, element.parentElement?.clientHeight ?? 1);
          preview = new StaticCanvas(element, {
            width,
            height,
            backgroundColor: project.canvas.transparent ? "" : project.canvas.background,
            enableRetinaScaling: true,
            renderOnAddRemove: false
          });
          await preview.loadFromJSON(rehydrateProjectScene(project.objects, project.uploads));
          if (disposed) return;
          const scale = Math.min(width / project.canvas.width, height / project.canvas.height);
          preview.setViewportTransform([
            scale,
            0,
            0,
            scale,
            (width - project.canvas.width * scale) / 2,
            (height - project.canvas.height * scale) / 2
          ]);
          preview.renderAll();
        })
        .catch((reason) => {
          if (!disposed) console.warn("Project preview could not be rendered.", reason);
        });
    });
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      void preview?.dispose();
    };
  }, [project.canvas, project.objects, project.uploads, project.updatedAt]);

  return (
    <span className={className} aria-hidden="true" style={style}>
      <canvas ref={canvasRef} data-opensketch-project-preview="" />
    </span>
  );
}
