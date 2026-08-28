import { AlertTriangle, Copy, RefreshCw } from "lucide-react";
import { useEditor } from "@/editor/EditorContext";

export function ProjectConflictNotice() {
  const editor = useEditor();
  const conflict = editor.projectConflict;
  if (!conflict) return null;

  const deleted = !conflict.current;
  return (
    <aside className="project-conflict-notice" role="alert" aria-live="assertive">
      <div className="project-conflict-copy">
        <AlertTriangle size={18} aria-hidden="true" />
        <div>
          <strong>
            {deleted ? "Project deleted in another tab" : "Project changed in another tab"}
          </strong>
          <p>
            {deleted
              ? "Your tab still has the current scene. Save it as a copy before leaving."
              : "Your tab may contain unsaved work. Choose which revision to keep; nothing will be merged automatically."}
          </p>
          {editor.projectConflictError && <small>{editor.projectConflictError}</small>}
        </div>
      </div>
      <div className="project-conflict-actions">
        <button
          className="button primary"
          disabled={editor.projectConflictSaving}
          onClick={() => void editor.saveProjectCopy().catch(() => undefined)}
        >
          <Copy size={15} aria-hidden="true" />
          {editor.projectConflictSaving ? "Saving copy…" : "Save this tab as a copy"}
        </button>
        <button
          className="button secondary"
          disabled={editor.projectConflictSaving || deleted}
          onClick={editor.reloadProject}
        >
          <RefreshCw size={15} aria-hidden="true" />
          Reload newer version
        </button>
      </div>
    </aside>
  );
}
