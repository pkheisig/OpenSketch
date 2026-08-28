import { AlertTriangle } from "lucide-react";
import { useEditor } from "@/editor/EditorContext";

export function ProjectSaveNotice() {
  const editor = useEditor();
  if (!editor.projectSaveError) return null;

  return (
    <div className="error-toast project-save-error" role="alert" aria-live="assertive">
      <AlertTriangle size={17} aria-hidden="true" />
      <span>
        <strong>Project changes are not saved.</strong>
        {editor.projectSaveError}
      </span>
    </div>
  );
}
