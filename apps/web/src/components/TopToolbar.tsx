import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  Download,
  HelpCircle,
  LoaderCircle,
  Moon,
  Redo2,
  RotateCcw,
  Sun,
  Undo2
} from "lucide-react";
import type { ProjectRecord } from "@workspace/editor-core";
import { GLOBAL_CREDIT } from "@/assets/credit";
import { MotionPresence } from "@/components/MotionPresence";
import { useEditorFields } from "@/editor/editorHooks";
import type { ProjectSaveState } from "@/editor/projectSaveState";
import { ExportDialog } from "./dialogs";
import { useModalDialog } from "./useModalDialog";

function ShortcutKeys({ combinations }: { combinations: string[][] }) {
  const label = combinations.map((keys) => keys.join(" plus ")).join(" or ");
  return (
    <span className="shortcut-keys" aria-label={label}>
      {combinations.map((keys, combinationIndex) => (
        <span className="shortcut-choice" key={`${keys.join("-")}-${combinationIndex}`}>
          {combinationIndex > 0 && (
            <span className="shortcut-or" aria-hidden="true">
              or
            </span>
          )}
          <span className="shortcut-combo">
            {keys.map((key, keyIndex) => (
              <span className="shortcut-key-part" key={`${key}-${keyIndex}`}>
                {keyIndex > 0 && (
                  <span className="shortcut-plus" aria-hidden="true">
                    +
                  </span>
                )}
                <kbd>{key}</kbd>
              </span>
            ))}
          </span>
        </span>
      ))}
    </span>
  );
}

function ProjectSaveStatus({
  state,
  onRetry,
  onExport
}: {
  state: ProjectSaveState;
  onRetry: () => void;
  onExport: () => void;
}) {
  if (state.phase === "saved") {
    return (
      <div
        className="project-save-status project-save-status--saved"
        data-save-state="saved"
        role="status"
      >
        <Check size={14} aria-hidden="true" />
        <span>Saved</span>
      </div>
    );
  }

  if (state.phase === "saving") {
    return (
      <div
        className="project-save-status project-save-status--saving"
        data-save-state="saving"
        role="status"
      >
        <LoaderCircle className="project-save-spinner" size={14} aria-hidden="true" />
        <span>Saving…</span>
      </div>
    );
  }

  return (
    <div
      className="project-save-status project-save-status--error"
      data-save-state="error"
      role="alert"
      aria-live="assertive"
    >
      <div className="project-save-status-message">
        <AlertTriangle size={15} aria-hidden="true" />
        <span>{state.error.message}</span>
      </div>
      <div className="project-save-status-actions">
        <button className="project-save-status-action" type="button" onClick={onRetry}>
          <RotateCcw size={13} aria-hidden="true" /> Retry save
        </button>
        <button className="project-save-status-action" type="button" onClick={onExport}>
          <Download size={13} aria-hidden="true" /> Export recovery copy
        </button>
      </div>
      <details className="project-save-status-details">
        <summary>Technical details</summary>
        <span>{state.error.detail}</span>
      </details>
    </div>
  );
}

export function TopToolbar({
  project,
  onHome,
  theme,
  onToggleTheme
}: {
  project: ProjectRecord;
  onHome: () => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
}) {
  const editor = useEditorFields([
    "flushSave",
    "setProjectName",
    "historyState",
    "undo",
    "redo",
    "saveState",
    "retrySave",
    "exportProject"
  ]);
  const [leaving, setLeaving] = useState(false);
  const [title, setTitle] = useState(project.name);
  const [exportOpen, setExportOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const helpRef = useModalDialog(helpOpen, () => setHelpOpen(false));
  useEffect(() => {
    const onNavigationBlocked = () => setLeaving(false);
    window.addEventListener("opensketch:navigation-blocked", onNavigationBlocked);
    return () => window.removeEventListener("opensketch:navigation-blocked", onNavigationBlocked);
  }, []);
  return (
    <>
      <header className="top-toolbar">
        <button
          className="back-to-projects-button"
          disabled={leaving}
          onClick={() => {
            setLeaving(true);
            void editor
              .flushSave()
              .then(onHome)
              .catch(() => setLeaving(false));
          }}
          aria-label="Back to projects"
        >
          <ArrowLeft size={16} />
          <span>Projects</span>
        </button>
        <span className="toolbar-rule" />
        <input
          className="document-title"
          value={title}
          aria-label="Document title"
          onChange={(event) => {
            const next = event.target.value;
            setTitle(next);
            editor.setProjectName(next.trim() || "Untitled figure");
          }}
          onBlur={(event) => {
            const next = event.target.value.trim() || "Untitled figure";
            setTitle(next);
            if (next !== event.target.value) editor.setProjectName(next);
          }}
        />
        <div className="toolbar-center">
          <button
            className="icon-button"
            onClick={editor.undo}
            disabled={!editor.historyState.canUndo}
            aria-label="Undo"
          >
            <Undo2 size={17} />
          </button>
          <button
            className="icon-button"
            onClick={editor.redo}
            disabled={!editor.historyState.canRedo}
            aria-label="Redo"
          >
            <Redo2 size={17} />
          </button>
        </div>
        <ProjectSaveStatus
          state={editor.saveState}
          onRetry={editor.retrySave}
          onExport={editor.exportProject}
        />
        <div className="toolbar-actions">
          <button
            className="icon-button theme-toggle"
            onClick={onToggleTheme}
            aria-label={`Use ${theme === "light" ? "dark" : "light"} theme`}
            title={`Use ${theme === "light" ? "dark" : "light"} theme`}
          >
            {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
          </button>
          <button className="icon-button" onClick={() => setHelpOpen(true)} aria-label="Help">
            <HelpCircle size={17} />
          </button>
          <button className="button export-button" onClick={() => setExportOpen(true)}>
            <Download size={16} /> Export <ChevronDown size={13} />
          </button>
        </div>
      </header>
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
      <MotionPresence open={helpOpen} exitMs={180}>
        {helpOpen ? (
          <div className="dialog-backdrop" onMouseDown={() => setHelpOpen(false)}>
            <section
              ref={helpRef}
              className="dialog shortcut-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="shortcut-title"
              tabIndex={-1}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <p className="eyebrow">FIELD GUIDE</p>
              <h2 id="shortcut-title">Keyboard shortcuts</h2>
              <div className="shortcut-grid">
                <span>Undo / redo</span>
                <ShortcutKeys
                  combinations={[
                    ["Cmd/Ctrl", "Z"],
                    ["Shift", "Cmd/Ctrl", "Z"]
                  ]}
                />
                <span>Duplicate</span>
                <ShortcutKeys combinations={[["Cmd/Ctrl", "D"]]} />
                <span>Cut / copy / paste</span>
                <ShortcutKeys
                  combinations={[
                    ["Cmd/Ctrl", "X"],
                    ["Cmd/Ctrl", "C"],
                    ["Cmd/Ctrl", "V"]
                  ]}
                />
                <span>Select all</span>
                <ShortcutKeys combinations={[["Cmd/Ctrl", "A"]]} />
                <span>Group / ungroup</span>
                <ShortcutKeys
                  combinations={[
                    ["Cmd/Ctrl", "G"],
                    ["Shift", "Cmd/Ctrl", "G"]
                  ]}
                />
                <span>Nudge / large nudge</span>
                <ShortcutKeys combinations={[["Arrow key"], ["Shift", "Arrow key"]]} />
                <span>Zoom / fit canvas</span>
                <ShortcutKeys
                  combinations={[
                    ["Cmd/Ctrl", "+"],
                    ["Cmd/Ctrl", "−"],
                    ["Cmd/Ctrl", "0"]
                  ]}
                />
                <span>Delete</span>
                <ShortcutKeys combinations={[["Backspace"], ["Delete"]]} />
              </div>
              <p className="dialog-note">
                Hold Space and drag, use the middle mouse button, or use the workspace scrollbars to
                pan. Hold Cmd/Ctrl while scrolling to zoom.
              </p>
              <p className="dialog-note">{GLOBAL_CREDIT}</p>
              <button className="button primary" onClick={() => setHelpOpen(false)}>
                Got it
              </button>
            </section>
          </div>
        ) : null}
      </MotionPresence>
    </>
  );
}
