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

export function EditorStudio({
  project,
  onProjectChange,
  onHome,
  theme,
  onToggleTheme
}: {
  project: ProjectRecord;
  onProjectChange: (project: ProjectRecord) => Promise<void>;
  onHome: () => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("OpenSketch:left-sidebar-collapsed") === "true"
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
    </EditorProvider>
  );
}
