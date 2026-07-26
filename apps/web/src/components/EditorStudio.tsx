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
  return (
    <EditorProvider key={project.id} project={project} onProjectChange={onProjectChange}>
      <main className="editor-shell">
        <TopToolbar project={project} onHome={onHome} />
        <div className="editor-grid">
          <LeftSidebar />
          <CanvasWorkspace />
          <Inspector />
        </div>
      </main>
    </EditorProvider>
  );
}
