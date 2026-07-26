import { useState } from "react";
import { Download, FileImage, FileType2, X } from "lucide-react";
import { useEditor } from "@/editor/EditorContext";
import { useModalDialog } from "./useModalDialog";

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const editor = useEditor();
  const dialogRef = useModalDialog(true, onClose);
  const [format, setFormat] = useState<"svg" | "png">("svg");
  const [scale, setScale] = useState(2);
  const [dpi, setDpi] = useState(editor.canvasSettings.dpi);
  const [customMultiplier, setCustomMultiplier] = useState<number | null>(null);
  const [transparent, setTransparent] = useState(false);
  const [background, setBackground] = useState(editor.canvasSettings.background);
  const [description, setDescription] = useState(editor.projectDescription);
  const [exportError, setExportError] = useState("");
  const [exporting, setExporting] = useState(false);
  const pngMultiplier = customMultiplier ?? scale * (dpi / editor.canvasSettings.dpi);
  const pixelWidth = Math.round(editor.canvasSettings.width * pngMultiplier);
  const pixelHeight = Math.round(editor.canvasSettings.height * pngMultiplier);
  return (
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
            <p className="eyebrow">PUBLICATION OUTPUT</p>
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
        </div>
        {format === "svg" ? (
          <label className="field">
            Accessible description
            <textarea
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
                editor.setProjectDescription(event.target.value);
              }}
              placeholder="Describe the scientific content of this figure…"
            />
            <small>Embedded as SVG title, description, and OpenSketch provenance metadata.</small>
          </label>
        ) : (
          <>
            <label className="field">
              Pixel scaling
              <select
                value={scale}
                onChange={(event) => {
                  setScale(Number(event.target.value));
                  setCustomMultiplier(null);
                }}
              >
                <option value={1}>1× · screen</option>
                <option value={2}>2× · high resolution</option>
                <option value={4}>4× · publication</option>
              </select>
            </label>
            <label className="field">
              Output DPI
              <select
                value={dpi}
                onChange={(event) => {
                  setDpi(Number(event.target.value));
                  setCustomMultiplier(null);
                }}
              >
                {[72, 150, 300, 600].map((value) => (
                  <option key={value} value={value}>
                    {value} DPI
                  </option>
                ))}
              </select>
            </label>
            <div className="field-row two">
              <label className="field">
                Pixel width
                <input
                  type="number"
                  min={1}
                  max={32000}
                  value={pixelWidth}
                  onChange={(event) => {
                    const width = Number(event.target.value);
                    if (Number.isFinite(width) && width > 0) {
                      setCustomMultiplier(width / editor.canvasSettings.width);
                    }
                  }}
                />
              </label>
              <label className="field">
                Pixel height
                <input
                  type="number"
                  min={1}
                  max={32000}
                  value={pixelHeight}
                  onChange={(event) => {
                    const height = Number(event.target.value);
                    if (Number.isFinite(height) && height > 0) {
                      setCustomMultiplier(height / editor.canvasSettings.height);
                    }
                  }}
                />
              </label>
            </div>
            <label className="check-field">
              <input
                type="checkbox"
                checked={transparent}
                onChange={(event) => setTransparent(event.target.checked)}
              />
              Transparent background
            </label>
            {!transparent && (
              <label className="color-field">
                Export background
                <span>
                  <input
                    type="color"
                    value={background}
                    onChange={(event) => setBackground(event.target.value)}
                  />
                  {background}
                </span>
              </label>
            )}
          </>
        )}
        <div className="export-summary">
          <span>
            {format === "png" ? pixelWidth : editor.canvasSettings.width} ×{" "}
            {format === "png" ? pixelHeight : editor.canvasSettings.height} px
          </span>
          <span>{format === "png" ? dpi : editor.canvasSettings.dpi} DPI</span>
        </div>
        {exportError ? (
          <p className="panel-error" role="alert">
            {exportError}
          </p>
        ) : null}
        <button
          className="button primary wide"
          disabled={exporting}
          onClick={async () => {
            setExporting(true);
            setExportError("");
            try {
              if (format === "svg") editor.exportSvg(undefined, description);
              else await editor.exportPng(pngMultiplier, transparent, dpi, background);
              onClose();
            } catch (reason) {
              setExportError(String(reason).replace(/^Error:\s*/, ""));
              setExporting(false);
            }
          }}
        >
          <Download size={17} /> {exporting ? "Preparing…" : `Export ${format.toUpperCase()}`}
        </button>
      </section>
    </div>
  );
}
