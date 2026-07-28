import { useState } from "react";
import { ArrowLeft, ChevronDown, Download, HelpCircle, Redo2, Undo2 } from "lucide-react";
import type { ProjectRecord } from "@workspace/editor-core";
import { GLOBAL_CREDIT } from "@/assets/credit";
import { useEditor } from "@/editor/EditorContext";
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

export function TopToolbar({ project, onHome }: { project: ProjectRecord; onHome: () => void }) {
  const editor = useEditor();
  const [leaving, setLeaving] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const helpRef = useModalDialog(helpOpen, () => setHelpOpen(false));
  return (
    <>
      <header className="top-toolbar">
        <button
          className="back-to-projects-button"
          disabled={leaving}
          onClick={() => {
            setLeaving(true);
            void editor.flushSave().then(onHome, () => setLeaving(false));
          }}
          aria-label="Back to projects"
        >
          <ArrowLeft size={16} />
          <span>Projects</span>
        </button>
        <span className="toolbar-rule" />
        <input
          className="document-title"
          defaultValue={project.name}
          aria-label="Document title"
          onBlur={(event) => editor.setProjectName(event.target.value.trim() || "Untitled figure")}
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
        <div className="toolbar-actions">
          <button className="icon-button" onClick={() => setHelpOpen(true)} aria-label="Help">
            <HelpCircle size={17} />
          </button>
          <button className="button export-button" onClick={() => setExportOpen(true)}>
            <Download size={16} /> Export <ChevronDown size={13} />
          </button>
        </div>
      </header>
      {exportOpen && <ExportDialog onClose={() => setExportOpen(false)} />}
      {helpOpen && (
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
      )}
    </>
  );
}
