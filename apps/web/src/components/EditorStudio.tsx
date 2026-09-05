import { ProjectConflictNotice } from "./ProjectConflictNotice";
import { lazy, Suspense, useEffect, useState } from "react";
import type { ProjectRecord } from "@workspace/editor-core";
import type { ProjectSaveState } from "@/editor/projectSaveState";
import { EditorProvider } from "@/editor/EditorContext";
import { CanvasWorkspace } from "@/components/CanvasWorkspace";
import { OpenSketchHostProvider, type OpenSketchHostServices } from "@/application/hostServices";
import type { WebMcpRegistry } from "@/semantic/webmcp";
import { loadDocumentFontStyles } from "@/editor/documentFonts";

const TopToolbar = lazy(() =>
  import("@/components/TopToolbar").then((module) => ({ default: module.TopToolbar }))
);
const LeftSidebar = lazy(() =>
  import("@/components/LeftSidebar").then((module) => ({ default: module.LeftSidebar }))
);

export function EditorStudio({
  project,
  onProjectChange,
  onProjectSwitch,
  onHome,
  onNavigationGuardChange,
  onLifecycleStateChange,
  services,
  webMcpRegistry,
  theme,
  onToggleTheme,
  showThemeControl
}: {
  project: ProjectRecord;
  onProjectChange: (project: ProjectRecord) => Promise<void>;
  onProjectSwitch: (project: ProjectRecord) => void;
  onHome: () => boolean | void;
  onNavigationGuardChange: (guard: (() => boolean) | null) => void;
  onLifecycleStateChange: (state: { dirty?: boolean; busy?: boolean }) => void;
  services: OpenSketchHostServices;
  webMcpRegistry: WebMcpRegistry;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  showThemeControl: boolean;
}) {
  const [documentFontsReady, setDocumentFontsReady] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => services.preferences.get("OpenSketch:left-sidebar-collapsed") === "true"
  );
  useEffect(() => {
    let active = true;
    void loadDocumentFontStyles()
      .catch(() => undefined)
      .finally(() => {
        if (active) setDocumentFontsReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  if (!documentFontsReady) {
    return (
      <div className="opensketch-app-font-loading loading-screen" aria-live="polite">
        <div className="loading-mark" />
        <span>Preparing document fonts…</span>
      </div>
    );
  }

  const toggleSidebar = () => {
    setSidebarCollapsed((current) => {
      const next = !current;
      services.preferences.set("OpenSketch:left-sidebar-collapsed", String(next));
      return next;
    });
  };
  return (
    <OpenSketchHostProvider services={services}>
      <EditorProvider
        key={`${project.id}:${project.revision ?? 0}`}
        project={project}
        onProjectChange={onProjectChange}
        onRequestProjectSwitch={onProjectSwitch}
        onRequestExit={onHome}
        onNavigationGuardChange={onNavigationGuardChange}
        webMcpRegistry={webMcpRegistry}
        onSaveStateChange={(state: ProjectSaveState) =>
          onLifecycleStateChange({ dirty: state.phase !== "saved", busy: state.phase === "saving" })
        }
      >
        <ProjectConflictNotice />
        <main className="editor-shell">
          <Suspense fallback={<header className="top-toolbar" aria-hidden="true" />}>
            <TopToolbar
              project={project}
              onHome={onHome}
              theme={theme}
              onToggleTheme={onToggleTheme}
              showThemeControl={showThemeControl}
            />
          </Suspense>
          <div className={`editor-grid ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
            <Suspense
              fallback={<aside className="left-sidebar floating-sidebar" aria-hidden="true" />}
            >
              <LeftSidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
            </Suspense>
            <CanvasWorkspace />
          </div>
        </main>
      </EditorProvider>
    </OpenSketchHostProvider>
  );
}
