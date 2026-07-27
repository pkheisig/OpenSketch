import { useState } from "react";
import type { ProjectRecord } from "@workspace/editor-core";
import { EditorProvider } from "@/editor/EditorContext";
import { TopToolbar } from "@/components/TopToolbar";
import { LeftSidebar } from "@/components/LeftSidebar";
import { CanvasWorkspace } from "@/components/CanvasWorkspace";
import { Inspector } from "@/components/Inspector";

export function EditorStudio({
  project,
  onProjectChange,
  onHome
}: {
  project: ProjectRecord;
  onProjectChange: (project: ProjectRecord) => Promise<void>;
  onHome: () => void;
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("OpenSketch:left-sidebar-collapsed") === "true"
  );
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(
    () => localStorage.getItem("OpenSketch:right-sidebar-collapsed") === "true"
  );
  const toggleSidebar = () => {
    setSidebarCollapsed((current) => {
      const next = !current;
      localStorage.setItem("OpenSketch:left-sidebar-collapsed", String(next));
      return next;
    });
  };
  const toggleRightSidebar = () => {
    setRightSidebarCollapsed((current) => {
      const next = !current;
      localStorage.setItem("OpenSketch:right-sidebar-collapsed", String(next));
      return next;
    });
  };
  return (
    <EditorProvider key={project.id} project={project} onProjectChange={onProjectChange}>
      <main className="editor-shell">
        <TopToolbar project={project} onHome={onHome} />
        <div
          className={`editor-grid ${sidebarCollapsed ? "sidebar-collapsed" : ""} ${
            rightSidebarCollapsed ? "right-sidebar-collapsed" : ""
          }`}
        >
          <LeftSidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
          <CanvasWorkspace />
          <Inspector collapsed={rightSidebarCollapsed} onToggle={toggleRightSidebar} />
        </div>
      </main>
    </EditorProvider>
  );
}
