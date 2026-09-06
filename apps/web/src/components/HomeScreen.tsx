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
  type ProjectKind,
  type ProjectRecord
} from "@workspace/editor-core";
import type { ProjectTemplateRecord } from "@workspace/editor-core";
import { MotionPresence } from "@/components/MotionPresence";
import { PptxSlideChooser } from "@/components/PptxSlideChooser";
import type { PptxRenderedSlide } from "@/interchange/pptx";
import { PPTX_MAX_PACKAGE_BYTES } from "@/interchange/pptxShared";
import { Logo } from "./Logo";
import { useModalDialog } from "./useModalDialog";
import { useOpenSketchHostServices } from "@/application/hostServices";

const OPEN_FOLDER_STORAGE_KEY = "opensketch.openFolderId";

export function HomeScreen({
  projects,
  folders,
  theme,
  onToggleTheme,
  showThemeControl,
  showBrand,
  projectTemplates,
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
  onImport,
  onImportError
}: {
  projects: ProjectRecord[];
  folders: ProjectFolderRecord[];
  theme: "light" | "dark";
  onToggleTheme: () => void;
  showThemeControl: boolean;
  showBrand: boolean;
  projectTemplates: ProjectTemplateRecord[];
  onNew: (kind: ProjectKind, template?: ProjectTemplateRecord) => void;
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
  onImport: (file: File, pptxSlideIndices?: readonly number[]) => void;
  onImportError?: (reason: unknown) => void;
}) {
  const services = useOpenSketchHostServices();
  const input = useRef<HTMLInputElement>(null);
  const newProjectRef = useRef<HTMLDivElement>(null);
  const [about, setAbout] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [openFolderId, setOpenFolderId] = useState<string | undefined>(() => {
    return services.preferences.get(OPEN_FOLDER_STORAGE_KEY) || undefined;
  });
  const [draggedProjectId, setDraggedProjectId] = useState<string>();
  const [dropTarget, setDropTarget] = useState<string>();
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [selectedKind, setSelectedKind] = useState<ProjectKind | null>(null);
  const [pptxChooser, setPptxChooser] = useState<
    { file: File; slides: readonly PptxRenderedSlide[] } | undefined
  >();
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
    if (folderId) services.preferences.set(OPEN_FOLDER_STORAGE_KEY, folderId);
    else services.preferences.remove(OPEN_FOLDER_STORAGE_KEY);
  };

  useEffect(() => {
    const closeOtherProjectMenus = (event: PointerEvent) => {
      const clickedMenu =
        event.target instanceof Element
          ? event.target.closest<HTMLDetailsElement>(".library-menu")
          : null;
      document.querySelectorAll<HTMLDetailsElement>(".library-menu[open]").forEach((menu) => {
        if (menu !== clickedMenu) menu.open = false;
      });
      if (!newProjectRef.current?.contains(event.target as Node)) {
        setNewProjectOpen(false);
        setSelectedKind(null);
      }
    };
    const closeNewProjectMenu = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setNewProjectOpen(false);
        setSelectedKind(null);
      }
    };
    document.addEventListener("pointerdown", closeOtherProjectMenus);
    document.addEventListener("keydown", closeNewProjectMenu);
    return () => {
      document.removeEventListener("pointerdown", closeOtherProjectMenus);
      document.removeEventListener("keydown", closeNewProjectMenu);
    };
  }, []);

  const templatesForKind = selectedKind
    ? projectTemplates.filter((template) => template.kind === selectedKind)
    : [];
  const closeNewProjectMenu = () => {
    setNewProjectOpen(false);
    setSelectedKind(null);
  };
  const chooseProjectKind = (kind: ProjectKind) => {
    if (projectTemplates.some((template) => template.kind === kind)) {
      setSelectedKind(kind);
      return;
    }
    closeNewProjectMenu();
    onNew(kind);
  };

  return (
    <main className="home-shell">
      <header className="home-header">
        {showBrand ? <Logo /> : <span className="home-header-spacer" aria-hidden="true" />}
        <div className="home-header-actions">
          {showThemeControl ? (
            <button
              className="icon-button theme-toggle"
              onClick={onToggleTheme}
              aria-label={`Use ${theme === "light" ? "dark" : "light"} theme`}
              title={`Use ${theme === "light" ? "dark" : "light"} theme`}
            >
              {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
            </button>
          ) : null}
          <button className="button secondary" onClick={() => input.current?.click()}>
            <Upload size={16} /> Import project
          </button>
          <input
            ref={input}
            hidden
            type="file"
            accept=".OpenSketch,application/json,.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                const isPptx =
                  file.name.toLowerCase().endsWith(".pptx") ||
                  file.type ===
                    "application/vnd.openxmlformats-officedocument.presentationml.presentation";
                if (!isPptx) {
                  onImport(file);
                } else {
                  void (async () => {
                    if (file.size > PPTX_MAX_PACKAGE_BYTES) {
                      throw new Error("PPTX packages must be 25 MB or smaller.");
                    }
                    const { parsePptxPackage } = await import("@/interchange/pptx");
                    const parsed = parsePptxPackage(new Uint8Array(await file.arrayBuffer()));
                    if (parsed.slides.length > 1) {
                      setPptxChooser({ file, slides: parsed.slides });
                    } else {
                      onImport(file, [0]);
                    }
                  })().catch((reason) => onImportError?.(reason));
                }
              }
              event.currentTarget.value = "";
            }}
          />
        </div>
      </header>

      <div className="home-content">
        <section className="new-figure-section">
          <div className="creation-actions">
            <div className="new-project-picker" ref={newProjectRef}>
              <button
                className="new-figure-button"
                aria-haspopup="menu"
                aria-expanded={newProjectOpen}
                onClick={() => {
                  setNewProjectOpen((open) => !open);
                  setSelectedKind(null);
                }}
              >
                <span className="new-figure-icon" aria-hidden="true">
                  <FilePlus2 size={20} />
                </span>
                New project
                <ChevronDown size={15} aria-hidden="true" />
              </button>
              {newProjectOpen ? (
                <div className="new-project-menu" role="menu" aria-label="New project mode">
                  {selectedKind ? (
                    <>
                      <button
                        role="menuitem"
                        className="new-project-blank"
                        onClick={() => {
                          closeNewProjectMenu();
                          onNew(selectedKind);
                        }}
                      >
                        Blank
                      </button>
                      {templatesForKind.map((template) => (
                        <button
                          key={template.id}
                          role="menuitem"
                          className="new-project-template"
                          onClick={() => {
                            closeNewProjectMenu();
                            onNew(selectedKind, template);
                          }}
                        >
                          {template.thumbnail ? (
                            <img src={template.thumbnail} alt="" aria-hidden="true" />
                          ) : null}
                          <span>{template.name}</span>
                        </button>
                      ))}
                      <button
                        role="menuitem"
                        className="new-project-back"
                        onClick={() => setSelectedKind(null)}
                      >
                        Back
                      </button>
                    </>
                  ) : (
                    (["diagram", "figure", "poster"] as const).map((kind) => (
                      <button key={kind} role="menuitem" onClick={() => chooseProjectKind(kind)}>
                        {kind[0].toUpperCase() + kind.slice(1)}
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>
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

      {pptxChooser ? (
        <PptxSlideChooser
          fileName={pptxChooser.file.name}
          slides={pptxChooser.slides}
          onCancel={() => setPptxChooser(undefined)}
          onConfirm={(slideIndices) => {
            const choice = pptxChooser;
            setPptxChooser(undefined);
            onImport(choice.file, slideIndices);
          }}
        />
      ) : null}

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
            <p>
              OpenSketch includes original generated artwork and editable scientific structures.
              Source and license details are available on each asset.
            </p>
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
