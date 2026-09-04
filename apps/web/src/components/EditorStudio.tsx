import { lazy, Suspense, useState } from "react";
import type { ProjectRecord } from "@workspace/editor-core";
import { EditorProvider } from "@/editor/EditorContext";
import { CanvasWorkspace } from "@/components/CanvasWorkspace";

const TopToolbar = lazy(() =>
  import("@/components/TopToolbar").then((module) => ({ default: module.TopToolbar }))
);
const LeftSidebar = lazy(() =>
  import("@/components/LeftSidebar").then((module) => ({ default: module.LeftSidebar }))
);
const WebMcpPromptReplay = lazy(() =>
  import("@/components/WebMcpPromptReplay").then((module) => ({
    default: module.WebMcpPromptReplay
  }))
);

export function EditorStudio({
  project,
  onProjectChange,
  onHome,
  onNavigationGuardChange,
  theme,
  onToggleTheme,
  showWebMcpPromptReplay = false
}: {
  project: ProjectRecord;
  onProjectChange: (project: ProjectRecord) => Promise<void>;
  onHome: () => void;
  onNavigationGuardChange: (guard: (() => boolean) | null) => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  showWebMcpPromptReplay?: boolean;
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () =>
      new URLSearchParams(window.location.search).get("focusCanvas") === "1" ||
      localStorage.getItem("OpenSketch:left-sidebar-collapsed") === "true"
  );
  const toggleSidebar = () => {
    setSidebarCollapsed((current) => {
      const next = !current;
      localStorage.setItem("OpenSketch:left-sidebar-collapsed", String(next));
      return next;
    });
  };
  return (
    <EditorProvider
      key={project.id}
      project={project}
      onProjectChange={onProjectChange}
      onRequestExit={onHome}
      onNavigationGuardChange={onNavigationGuardChange}
    >
      <main className="editor-shell">
        <Suspense fallback={<header className="top-toolbar" aria-hidden="true" />}>
          <TopToolbar
            project={project}
            onHome={onHome}
            theme={theme}
            onToggleTheme={onToggleTheme}
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
      {showWebMcpPromptReplay ? (
        <Suspense fallback={null}>
          <WebMcpPromptReplay />
        </Suspense>
      ) : null}
    </EditorProvider>
  );
}
