import { useState } from "react";
import { Download, FileImage, FileText, FileType2, X } from "lucide-react";
import { ColorPalettePicker } from "@/components/ColorPalettePicker";
import { MotionCollapse } from "@/components/MotionCollapse";
import { MotionPresence } from "@/components/MotionPresence";
import { useEditorFields } from "@/editor/editorHooks";
import { UiSelect } from "@/components/UiSelect";
import { EXPORT_DPI_OPTIONS, loadExportDpi, saveExportDpi } from "@/export/preferences";
import { inspectPngExportResource } from "@/export/png";
import { useModalDialog } from "./useModalDialog";

export function ExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const editor = useEditorFields([
    "canvasSettings",
    "exportSvg",
    "exportPdf",
    "exportPng",
    "exportCredits"
  ]);
  const dialogRef = useModalDialog(open, onClose);
  const [format, setFormat] = useState<"svg" | "png" | "pdf">("svg");
  const [dpi, setDpi] = useState(() => loadExportDpi());
  const [transparent, setTransparent] = useState(false);
  const [background, setBackground] = useState(editor.canvasSettings.background);
  const [exportError, setExportError] = useState("");
  const [exporting, setExporting] = useState(false);
  const pngResource = inspectPngExportResource(
    editor.canvasSettings.width,
    editor.canvasSettings.height,
    editor.canvasSettings.dpi,
    dpi
  );
  const pngDpiOptions = EXPORT_DPI_OPTIONS.map((value) => {
    const resource = inspectPngExportResource(
      editor.canvasSettings.width,
      editor.canvasSettings.height,
      editor.canvasSettings.dpi,
      value
    );
    return {
      value,
      label: `${value} DPI`,
      disabled: Boolean(resource.error)
    };
  });
  const displayedError = exportError || (format === "png" ? pngResource.error : "");
  return (
    <MotionPresence open={open} exitMs={180}>
      <div className="dialog-backdrop" onMouseDown={onClose}>
        <section
          ref={dialogRef}
          className="dialog export-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="export-title"
          tabIndex={-1}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="dialog-titlebar">
            <div>
              <h2 id="export-title">Export figure</h2>
            </div>
            <button className="icon-button" onClick={onClose} aria-label="Close export dialog">
              <X size={18} />
            </button>
          </div>
          <div className="format-tabs" role="tablist">
            <button
              className={format === "svg" ? "active" : ""}
              onClick={() => setFormat("svg")}
              role="tab"
              aria-selected={format === "svg"}
            >
              <FileType2 size={20} />
              <span>
                SVG<strong>Vector · recommended</strong>
              </span>
            </button>
            <button
              className={format === "png" ? "active" : ""}
              onClick={() => setFormat("png")}
              role="tab"
              aria-selected={format === "png"}
            >
              <FileImage size={20} />
              <span>
                PNG<strong>High-resolution raster</strong>
              </span>
            </button>
            <button
              className={format === "pdf" ? "active" : ""}
              onClick={() => setFormat("pdf")}
              role="tab"
              aria-selected={format === "pdf"}
            >
              <FileText size={20} />
              <span>
                PDF<strong>Vector document</strong>
              </span>
            </button>
          </div>
          <MotionCollapse open={format === "png"} className="export-format-options">
            <div className="export-format-options-content">
              <UiSelect
                className="field"
                label="Output DPI"
                value={dpi}
                options={pngDpiOptions}
                onChange={(dpi) => {
                  setDpi(saveExportDpi(dpi));
                }}
              />
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={transparent}
                  onChange={(event) => setTransparent(event.target.checked)}
                />
                Transparent background
              </label>
              <MotionCollapse open={!transparent} className="export-background-options">
                <div className="color-field">
                  Export background
                  <ColorPalettePicker
                    ariaLabel="Export background"
                    value={background}
                    onChange={setBackground}
                    showValue
                  />
                </div>
              </MotionCollapse>
            </div>
          </MotionCollapse>
          {displayedError ? (
            <p className="panel-error" role="alert">
              {displayedError}
            </p>
          ) : null}
          <button
            className="button primary wide"
            disabled={exporting || (format === "png" && Boolean(pngResource.error))}
            onClick={async () => {
              setExporting(true);
              setExportError("");
              try {
                if (format === "svg") editor.exportSvg();
                else if (format === "pdf") await editor.exportPdf();
                else await editor.exportPng(transparent, dpi, background);
                setExporting(false);
                onClose();
              } catch (reason) {
                setExportError(String(reason).replace(/^Error:\s*/, ""));
                setExporting(false);
              }
            }}
          >
            <Download size={17} /> {exporting ? "Preparing…" : `Export ${format.toUpperCase()}`}
          </button>
          <button
            className="button secondary wide"
            disabled={exporting}
            onClick={() => {
              setExportError("");
              try {
                editor.exportCredits();
                onClose();
              } catch (reason) {
                setExportError(String(reason).replace(/^Error:\s*/, ""));
              }
            }}
          >
            <FileText size={17} /> Download credits
          </button>
          <p className="dialog-note">
            A readable credits file is available if another tool strips figure metadata.
          </p>
        </section>
      </div>
    </MotionPresence>
  );
}
