import { useState } from "react";
import {
  ChevronDown,
  Download,
  HelpCircle,
  Home,
  Redo2,
  Undo2,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import type { ProjectRecord } from "@opensketch/editor-core";
import { GLOBAL_CREDIT } from "@/assets/manifest";
import { useEditor } from "@/editor/EditorContext";
import { Logo } from "./Logo";
import { ExportDialog } from "./dialogs";

export function TopToolbar({ project, onHome }: { project: ProjectRecord; onHome: () => void }) {
  const editor = useEditor();
  const [exportOpen, setExportOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  return (
    <>
      <header className="top-toolbar">
        <button className="icon-button home-button" onClick={onHome} aria-label="Project home">
          <Home size={17} />
        </button>
        <Logo compact />
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
          <span className="toolbar-rule" />
          <button className="compact-control" onClick={editor.fitCanvas}>
            {editor.canvasSettings.width} × {editor.canvasSettings.height}
            <ChevronDown size={13} />
          </button>
          <span className="zoom-group">
            <button
              className="icon-button"
              onClick={() => editor.setZoom(editor.zoom - 0.1)}
              aria-label="Zoom out"
            >
              <ZoomOut size={16} />
            </button>
            <button className="zoom-value" onClick={editor.fitCanvas} aria-label="Fit canvas">
              {Math.round(editor.zoom * 100)}%
            </button>
            <button
              className="icon-button"
              onClick={() => editor.setZoom(editor.zoom + 0.1)}
              aria-label="Zoom in"
            >
              <ZoomIn size={16} />
            </button>
          </span>
        </div>
        <div className="toolbar-actions">
          <span className={`save-state ${editor.saveStatus}`}>
            {editor.saveStatus === "saved" ? "Saved locally" : "Saving…"}
          </span>
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
            className="dialog shortcut-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="shortcut-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <p className="eyebrow">FIELD GUIDE</p>
            <h2 id="shortcut-title">Keyboard shortcuts</h2>
            <div className="shortcut-grid">
              <span>Undo / redo</span>
              <kbd>⌘ Z / ⇧⌘ Z</kbd>
              <span>Duplicate</span>
              <kbd>⌘ D</kbd>
              <span>Cut / copy / paste</span>
              <kbd>⌘ X / C / V</kbd>
              <span>Select all</span>
              <kbd>⌘ A</kbd>
              <span>Group / ungroup</span>
              <kbd>⌘ G / ⇧⌘ G</kbd>
              <span>Nudge / large nudge</span>
              <kbd>↑ / ⇧ ↑</kbd>
              <span>Delete</span>
              <kbd>⌫</kbd>
            </div>
            <p className="dialog-note">
              Pan with the workspace scrollbars. Use Fit canvas to return to the full artboard.
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
