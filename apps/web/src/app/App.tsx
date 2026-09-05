import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, X } from "lucide-react";
import type { ProjectFolderRecord, ProjectRecord } from "@workspace/editor-core";
import { normalizeProjectForLoad } from "@/persistence/portable";
import { isProjectThumbnailCurrent } from "@/persistence/thumbnailFormat";
import { HomeScreen } from "@/components/HomeScreen";
import { OpenSketchPortalRoot } from "@/application/hostServices";
import type {
  OpenSketchApplicationContext,
  OpenSketchHostServices,
  OpenSketchLifecycleState
} from "@/application/hostServices";
import { resolveOpenSketchApplicationPresentation } from "@/application/uiContract";
import { createProjectLifecycleRuntime } from "@/semantic/projectLifecycle";
import { SemanticExecutionAborted, type SemanticExecutionOptions } from "@/semantic/semanticTypes";
import { createWebMcpRegistry, type WebMcpRegistry, type WebMcpRuntime } from "@/semantic/webmcp";

const EditorStudio = lazy(() =>
  import("@/components/EditorStudio").then((module) => ({ default: module.EditorStudio }))
);

type Theme = "light" | "dark";

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

export function App({
  services,
  initialContext,
  onLifecycleStateChange
}: {
  services: OpenSketchHostServices;
  initialContext?: OpenSketchApplicationContext;
  onLifecycleStateChange?: (state: Partial<OpenSketchLifecycleState>) => void;
}) {
  const [standaloneTheme, setStandaloneTheme] = useState<Theme>(() =>
    services.preferences.theme.get()
  );
  const presentation = resolveOpenSketchApplicationPresentation(initialContext, standaloneTheme);
  const { theme } = presentation;
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [folders, setFolders] = useState<ProjectFolderRecord[]>([]);
  const [current, setCurrent] = useState<ProjectRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updateReady, setUpdateReady] = useState(() => services.pwa.isUpdateReady());
  const refreshRevision = useRef(0);
  const projectsRef = useRef<readonly ProjectRecord[]>([]);
  const foldersRef = useRef<readonly ProjectFolderRecord[]>([]);
  const historySyncRevision = useRef(0);
  const historyIndex = useRef<number | null>(null);
  const historyNavigationGuard = useRef<(() => boolean) | null>(null);
  const webMcpRegistryRef = useRef<WebMcpRegistry | null>(null);
  const lifecycleRuntimeRef = useRef<WebMcpRuntime | null>(null);
  if (!webMcpRegistryRef.current) webMcpRegistryRef.current = createWebMcpRegistry();
  projectsRef.current = projects;
  foldersRef.current = folders;

  const toggleTheme = useCallback(() => {
    if (!presentation.ownsTheme) return;
    setStandaloneTheme((current) => {
      const next = current === "light" ? "dark" : "light";
      services.preferences.theme.set(next);
      return next;
    });
  }, [presentation.ownsTheme, services]);

  useEffect(() => {
    if (presentation.mode !== "standalone") return;
    services.preferences.theme.apply(theme);
  }, [presentation.mode, services, theme]);

  useEffect(() => {
    services.navigation.ensureEntryIndex();
    historyIndex.current = services.navigation.entryIndex();
  }, [services]);

  const refresh = useCallback(async () => {
    const revision = ++refreshRevision.current;
    const [stored, storedFolders] = await Promise.all([
      services.projects.list(),
      services.projects.listFolders()
    ]);
    const repairNotices: string[] = [];
    const invalidNotices: string[] = [];
    const normalized = stored.map((project) => {
      try {
        const loaded = normalizeProjectForLoad(project);
        if (loaded.identityRepaired) {
          repairNotices.push(identityRepairNotice(project, loaded.identityWarnings));
          void services.projects.save(loaded.project).catch((reason) => setError(String(reason)));
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

    const activeProjectId = services.navigation.currentProjectId();
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
              return services.projects.saveThumbnail(
                project.id,
                String(project.revision ?? project.updatedAt),
                project.thumbnail
              );
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
  }, [services]);

  useEffect(() => {
    refresh()
      .then((stored) => {
        const projectId = services.navigation.currentProjectId();
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
  }, [refresh, services]);

  useEffect(() => {
    if (!presentation.ownsUpdating) return undefined;
    if (services.pwa.isUpdateReady()) setUpdateReady(true);
    return services.pwa.onUpdateReady(() => setUpdateReady(true));
  }, [presentation.ownsUpdating, services]);

  useEffect(() => {
    if (!presentation.ownsUpdating || loading || current || !updateReady) return;
    void services.pwa.applyUpdate();
  }, [current, loading, presentation.ownsUpdating, services, updateReady]);

  useEffect(() => {
    const syncViewToHistory = () => {
      const revision = ++historySyncRevision.current;
      const projectId = services.navigation.currentProjectId();
      if (projectId !== current?.id && historyNavigationGuard.current?.()) {
        services.navigation.notifyNavigationBlocked?.();
        const destinationIndex = services.navigation.entryIndex();
        const currentIndex = historyIndex.current;
        if (destinationIndex !== null && currentIndex !== null) {
          const correction = currentIndex - destinationIndex;
          if (correction !== 0) services.navigation.go(correction);
        } else {
          services.navigation.forward();
        }
        return;
      }
      const destinationIndex = services.navigation.entryIndex();
      if (destinationIndex !== null) historyIndex.current = destinationIndex;
      if (!projectId) {
        setCurrent(null);
        void refresh();
        return;
      }

      services.projects
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
              void services.projects
                .save(loaded.project)
                .catch((reason) => setError(String(reason)));
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

    return services.navigation.subscribe(syncViewToHistory);
  }, [current?.id, refresh, services]);

  const openProject = useCallback(
    (project: ProjectRecord): boolean => {
      let loaded: ProjectRecord;
      try {
        const result = normalizeProjectForLoad(project);
        loaded = result.project;
        if (result.identityRepaired) {
          void services.projects.save(loaded).catch((reason) => setError(String(reason)));
          setError(identityRepairNotice(project, result.identityWarnings));
        }
      } catch (reason) {
        setError(projectLoadError(project, reason));
        return false;
      }
      historySyncRevision.current += 1;
      setCurrent(loaded);
      if (services.navigation.currentProjectId() === loaded.id) return true;

      services.navigation.pushProject(loaded.id);
      historyIndex.current = services.navigation.entryIndex() ?? historyIndex.current;
      return true;
    },
    [services]
  );

  const returnToProjects = useCallback((): boolean => {
    if (services.navigation.currentProjectId() && historyNavigationGuard.current?.()) {
      services.navigation.notifyNavigationBlocked?.();
      return false;
    }
    if (services.navigation.currentProjectId()) {
      services.navigation.back();
      return true;
    }
    setCurrent(null);
    void refresh();
    return true;
  }, [refresh, services]);

  const newProject = useCallback(
    async (
      name?: string,
      options: SemanticExecutionOptions = {}
    ): Promise<ProjectRecord | null> => {
      let project: ProjectRecord | undefined;
      try {
        if (options.signal?.aborted) return null;
        project = services.projects.create(name);
        await services.projects.save(project);
        if (options.signal?.aborted) {
          await services.projects.delete(project.id);
          return null;
        }
        if (!openProject(project)) {
          await services.projects.delete(project.id);
          return null;
        }
        await refresh();
        return project;
      } catch (reason) {
        if (reason instanceof SemanticExecutionAborted || options.signal?.aborted) {
          if (project) await services.projects.delete(project.id).catch(() => undefined);
          return null;
        }
        setError(String(reason));
        return null;
      }
    },
    [openProject, refresh, services]
  );

  if (!lifecycleRuntimeRef.current) {
    lifecycleRuntimeRef.current = createProjectLifecycleRuntime({
      getProjects: () => projectsRef.current,
      getFolders: () => foldersRef.current,
      createProject: (name, options) => newProject(name, options),
      openProject
    });
  }

  useEffect(() => {
    const runtime = lifecycleRuntimeRef.current;
    const registry = webMcpRegistryRef.current;
    if (!runtime || !registry || loading || current) return undefined;
    void registry.activate(runtime);
    return () => registry.deactivate(runtime);
  }, [current, loading]);

  useEffect(() => {
    const registry = webMcpRegistryRef.current;
    return () => registry?.dispose();
  }, []);

  const onNewProject = () => {
    void newProject();
  };

  const updateProject = useCallback(
    async (project: ProjectRecord) => {
      await services.projects.save(project);
    },
    [services]
  );

  const setHistoryNavigationGuard = useCallback(
    (guard: (() => boolean) | null) => {
      historyNavigationGuard.current = guard;
      onLifecycleStateChange?.({ closeBlocked: Boolean(guard) });
    },
    [onLifecycleStateChange]
  );

  useEffect(() => {
    onLifecycleStateChange?.({
      activeProjectId: current?.id ?? initialContext?.activeProjectId ?? null,
      busy: loading,
      dirty: false
    });
  }, [current?.id, initialContext?.activeProjectId, loading, onLifecycleStateChange]);

  const renderShell = (content: ReactNode) => (
    <div
      className={`opensketch-app theme-${theme}`}
      data-opensketch-mode={presentation.mode}
      data-opensketch-theme={theme}
      data-opensketch-density={presentation.density}
      data-opensketch-reduced-motion={presentation.reducedMotion}
      data-opensketch-ui-contract={presentation.uiContractVersion}
      data-opensketch-theme-root-id={initialContext?.themeRootId}
      data-opensketch-owns-global-chrome={presentation.ownsGlobalChrome}
      data-opensketch-owns-theme={presentation.ownsTheme}
      data-opensketch-owns-updating={presentation.ownsUpdating}
    >
      <OpenSketchPortalRoot portalRootId={initialContext?.portalRootId}>
        {content}
      </OpenSketchPortalRoot>
    </div>
  );

  if (loading) {
    return renderShell(
      <div className="loading-screen">
        <div className="loading-mark" />
        <span>Preparing local studio…</span>
      </div>
    );
  }

  return renderShell(
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
            onProjectSwitch={(project) => {
              setCurrent(project);
            }}
            onHome={returnToProjects}
            onNavigationGuardChange={setHistoryNavigationGuard}
            onLifecycleStateChange={(state) => onLifecycleStateChange?.(state)}
            services={services}
            webMcpRegistry={webMcpRegistryRef.current!}
            theme={theme}
            onToggleTheme={toggleTheme}
            showThemeControl={presentation.ownsTheme}
          />
        </Suspense>
      ) : (
        <HomeScreen
          projects={projects}
          folders={folders}
          theme={theme}
          onToggleTheme={toggleTheme}
          showThemeControl={presentation.ownsTheme}
          showBrand={presentation.ownsGlobalChrome}
          onNew={onNewProject}
          onNewFolder={(name) => {
            services.projects
              .createFolder(name)
              .then(refresh)
              .catch((reason) => setError(String(reason)));
          }}
          onOpen={openProject}
          onDuplicate={(project) => {
            services.projects
              .duplicate(project)
              .then(refresh)
              .catch((reason) => setError(String(reason)));
          }}
          onDelete={(project) => {
            void Promise.resolve(
              services.dialogs.confirm(`Delete “${project.name}”? This cannot be undone.`)
            )
              .then((confirmed) => {
                if (!confirmed) return;
                return services.projects.delete(project.id, project.revision).then(refresh);
              })
              .catch((reason) => setError(String(reason)));
          }}
          onExport={(project) => void services.files.downloadProject(project)}
          onArchive={(project) => {
            services.projects
              .save({ ...project, archivedAt: services.clock.now() })
              .then(refresh)
              .catch((reason) => setError(String(reason)));
          }}
          onRestore={(project) => {
            const restored = { ...project };
            delete restored.archivedAt;
            services.projects
              .save(restored)
              .then(refresh)
              .catch((reason) => setError(String(reason)));
          }}
          onMoveProject={(project, folderId) => {
            services.projects
              .moveToFolder(project, folderId)
              .then(refresh)
              .catch((reason) => setError(String(reason)));
          }}
          onRenameFolder={(folder) => {
            const name = services.dialogs.prompt("Rename folder", folder.name);
            if (name instanceof Promise) {
              void name.then((value) => {
                if (!value || value.trim() === folder.name) return;
                return services.projects
                  .saveFolder({ ...folder, name: value.trim(), updatedAt: services.clock.now() })
                  .then(refresh)
                  .catch((reason) => setError(String(reason)));
              });
              return;
            }
            const trimmedName = name?.trim();
            if (!trimmedName || trimmedName === folder.name) return;
            services.projects
              .saveFolder({ ...folder, name: trimmedName, updatedAt: services.clock.now() })
              .then(refresh)
              .catch((reason) => setError(String(reason)));
          }}
          onDeleteFolder={(folder) => {
            void Promise.resolve(
              services.dialogs.confirm(`Delete folder “${folder.name}”? Its projects will be kept.`)
            )
              .then((confirmed) => {
                if (!confirmed) return;
                return services.projects.deleteFolder(folder.id).then(refresh);
              })
              .catch((reason) => setError(String(reason)));
          }}
          onRename={(project) => {
            const name = services.dialogs.prompt("Rename project", project.name);
            if (name instanceof Promise) {
              void name.then((value) => {
                const trimmedName = value?.trim();
                if (!trimmedName || trimmedName === project.name) return;
                return services.projects
                  .save({ ...project, name: trimmedName, updatedAt: services.clock.now() })
                  .then(refresh)
                  .catch((reason) => setError(String(reason)));
              });
              return;
            }
            const trimmedName = name?.trim();
            if (!trimmedName || trimmedName === project.name) return;
            services.projects
              .save({ ...project, name: trimmedName, updatedAt: services.clock.now() })
              .then(refresh)
              .catch((reason) => setError(String(reason)));
          }}
          onImport={(file) => {
            services.files
              .readProject(file)
              .then(async ({ project, identityRepaired, identityWarnings }) => {
                await services.projects.save(project);
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
    </>
  );
}
