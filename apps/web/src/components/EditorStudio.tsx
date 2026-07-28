import { useState } from "react";
import type { ProjectRecord } from "@workspace/editor-core";
import { EditorProvider } from "@/editor/EditorContext";
import { TopToolbar } from "@/components/TopToolbar";
import { LeftSidebar } from "@/components/LeftSidebar";
import { CanvasWorkspace } from "@/components/CanvasWorkspace";

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
  const toggleSidebar = () => {
    setSidebarCollapsed((current) => {
      const next = !current;
      localStorage.setItem("OpenSketch:left-sidebar-collapsed", String(next));
      return next;
    });
  };
  return (
    <EditorProvider key={project.id} project={project} onProjectChange={onProjectChange}>
      <main className="editor-shell">
        <TopToolbar project={project} onHome={onHome} />
        <div className={`editor-grid ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
          <LeftSidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
          <CanvasWorkspace />
        </div>
      </main>
    </EditorProvider>
  );
}
