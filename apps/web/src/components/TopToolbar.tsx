import { useState } from "react";
import {
  ChevronDown,
  Download,
  HelpCircle,
  Home,
  Info,
  Redo2,
  Undo2,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import type { ProjectRecord } from "@opensketch/editor-core";
import { GLOBAL_CREDIT } from "@/assets/credit";
import { useEditor } from "@/editor/EditorContext";
import { Logo } from "./Logo";
import { ExportDialog } from "./dialogs";
import { useModalDialog } from "./useModalDialog";

export function TopToolbar({ project, onHome }: { project: ProjectRecord; onHome: () => void }) {
  const editor = useEditor();
  const [exportOpen, setExportOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const helpRef = useModalDialog(helpOpen, () => setHelpOpen(false));
  const infoRef = useModalDialog(infoOpen, () => setInfoOpen(false));
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
            {editor.saveStatus === "saved"
              ? "Saved locally"
              : editor.saveStatus === "saving"
                ? "Saving…"
                : "Save failed"}
          </span>
          <button className="icon-button" onClick={() => setHelpOpen(true)} aria-label="Help">
            <HelpCircle size={17} />
          </button>
          <button
            className="icon-button"
            onClick={() => setInfoOpen(true)}
            aria-label="Project information"
          >
            <Info size={17} />
          </button>
          <button className="button export-button" onClick={() => setExportOpen(true)}>
            <Download size={16} /> Export <ChevronDown size={13} />
          </button>
        </div>
      </header>
      {exportOpen && <ExportDialog onClose={() => setExportOpen(false)} />}
      {infoOpen && (
        <div className="dialog-backdrop" onMouseDown={() => setInfoOpen(false)}>
          <section
            ref={infoRef}
            className="dialog project-info-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="project-info-title"
            tabIndex={-1}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <p className="eyebrow">PROJECT RECORD</p>
            <h2 id="project-info-title">{project.name}</h2>
            <label className="field">
              Accessible scientific description
              <textarea
                value={editor.projectDescription}
                onChange={(event) => editor.setProjectDescription(event.target.value)}
                placeholder="Describe the figure, biological process, and essential visual relationships…"
              />
            </label>
            <p className="dialog-note">{GLOBAL_CREDIT}</p>
            <button
              className="button secondary wide"
              onClick={() => void navigator.clipboard?.writeText(GLOBAL_CREDIT)}
            >
              Copy artwork credit
            </button>
            <button className="button primary wide" onClick={() => setInfoOpen(false)}>
              Done
            </button>
          </section>
        </div>
      )}
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
              <span>Zoom / fit canvas</span>
              <kbd>⌘ + / − / 0</kbd>
              <span>Delete</span>
              <kbd>⌫</kbd>
            </div>
            <p className="dialog-note">
              Hold Space and drag, use the middle mouse button, or use the workspace scrollbars to
              pan. Hold Ctrl/⌘ while scrolling to zoom.
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
