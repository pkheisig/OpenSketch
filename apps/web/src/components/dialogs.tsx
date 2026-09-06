import { useState } from "react";
import { Download, Save, X } from "lucide-react";
import { ColorPalettePicker } from "@/components/ColorPalettePicker";
import { MotionCollapse } from "@/components/MotionCollapse";
import { MotionPresence } from "@/components/MotionPresence";
import { useEditorFields } from "@/editor/editorHooks";
import type { ExportDocumentFormat } from "@/editor/EditorContext";
import { useOpenSketchHostServices } from "@/application/hostServices";
import { UiSelect } from "@/components/UiSelect";
import { EXPORT_DPI_OPTIONS, loadExportDpi, saveExportDpi } from "@/export/preferences";
import { inspectPngExportResource } from "@/export/png";
import { INTERCHANGE_EXPORT_REGISTRY } from "@/interchange/registry";
import { useModalDialog } from "./useModalDialog";

export function ExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const services = useOpenSketchHostServices();
  const editor = useEditorFields(["canvasSettings", "exportDocument", "saveProjectAsTemplate"]);
  const dialogRef = useModalDialog(open, onClose);
  const [format, setFormat] = useState<ExportDocumentFormat>("svg");
  const [dpi, setDpi] = useState(() => loadExportDpi(1200, services.preferences.storage));
  const [transparent, setTransparent] = useState(false);
  const [background, setBackground] = useState(editor.canvasSettings.background);
  const [quality, setQuality] = useState(0.92);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [exportError, setExportError] = useState("");
  const [exporting, setExporting] = useState(false);
  const showDpi = format !== "svg" && format !== "pdf";
  const showQuality = format === "jpeg" || format === "webp";
  const showBackground =
    format !== "svg" && format !== "pdf" && (format === "jpeg" || !transparent);
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
  const displayedError = exportError || (showDpi ? pngResource.error : "");
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
          <UiSelect
            className="field"
            label="Format"
            value={format}
            options={INTERCHANGE_EXPORT_REGISTRY.map((definition) => ({
              value: definition.format,
              label: definition.label
            }))}
            onChange={(value) => {
              setFormat(value as ExportDocumentFormat);
              setExportError("");
            }}
          />
          <MotionCollapse
            open={advancedOpen && (showDpi || showQuality || showBackground)}
            className="export-format-options"
          >
            <div className="export-format-options-content">
              {showDpi ? (
                <UiSelect
                  className="field"
                  label="Output DPI"
                  value={dpi}
                  options={pngDpiOptions}
                  onChange={(dpi) => {
                    setDpi(saveExportDpi(dpi, services.preferences.storage));
                  }}
                />
              ) : null}
              {showQuality ? (
                <label className="field compact-number-field">
                  {format === "jpeg" ? "JPEG quality" : "WebP quality"}
                  <input
                    type="number"
                    min="0.1"
                    max="1"
                    step="0.01"
                    value={quality}
                    onChange={(event) =>
                      setQuality(Math.min(1, Math.max(0.1, Number(event.target.value) || 0.92)))
                    }
                  />
                </label>
              ) : null}
              {format !== "jpeg" && format !== "pdf" && format !== "svg" ? (
                <label className="check-field">
                  <input
                    type="checkbox"
                    checked={transparent}
                    onChange={(event) => setTransparent(event.target.checked)}
                  />
                  Transparent background
                </label>
              ) : null}
              {showBackground ? (
                <div className="color-field">
                  Export background
                  <ColorPalettePicker
                    ariaLabel="Export background"
                    value={background}
                    onChange={setBackground}
                    showValue
                  />
                </div>
              ) : null}
            </div>
          </MotionCollapse>
          {showDpi || showQuality || showBackground ? (
            <button
              className="button secondary export-advanced-toggle"
              type="button"
              aria-expanded={advancedOpen}
              onClick={() => setAdvancedOpen((value) => !value)}
            >
              {advancedOpen ? "Hide advanced options" : "Advanced options"}
            </button>
          ) : null}
          {displayedError ? (
            <p className="panel-error" role="alert">
              {displayedError}
            </p>
          ) : null}
          <button
            className="button primary wide"
            disabled={exporting || (showDpi && Boolean(pngResource.error))}
            onClick={async () => {
              setExporting(true);
              setExportError("");
              try {
                await editor.exportDocument(format, {
                  transparent,
                  dpi,
                  background,
                  quality
                });
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
          <details className="export-template-disclosure">
            <summary>
              <Save size={15} aria-hidden="true" /> Save project as template
            </summary>
            <button
              className="button secondary wide"
              onClick={async () => {
                setExportError("");
                try {
                  await editor.saveProjectAsTemplate();
                  onClose();
                } catch (reason) {
                  setExportError(String(reason).replace(/^Error:\s*/, ""));
                }
              }}
            >
              Save as template
            </button>
          </details>
        </section>
      </div>
    </MotionPresence>
  );
}
