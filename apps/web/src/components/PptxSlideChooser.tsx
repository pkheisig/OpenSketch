import { useEffect, useMemo, useState } from "react";
import type { PptxRenderedSlide } from "@/interchange/pptx";
import { svgDataUrlForPptx, svgForPptxCanvas } from "@/interchange/pptxShared";
import { useModalDialog } from "./useModalDialog";

function thumbnailSource(source: string): string {
  const root = /<svg\b[^>]*>/i.exec(source)?.[0];
  const width = Number(root?.match(/\bwidth\s*=\s*["']([0-9.]+)/i)?.[1]);
  const height = Number(root?.match(/\bheight\s*=\s*["']([0-9.]+)/i)?.[1]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return svgForPptxCanvas(source, 320, 180);
  }
  const scale = Math.min(320 / width, 180 / height);
  return svgForPptxCanvas(
    source,
    Math.max(1, Math.round(width * scale)),
    Math.max(1, Math.round(height * scale))
  );
}

export function PptxSlideChooser({
  fileName,
  slides,
  onCancel,
  onConfirm
}: {
  fileName: string;
  slides: readonly PptxRenderedSlide[];
  onCancel: () => void;
  onConfirm: (slideIndices: readonly number[]) => void;
}) {
  const [selected, setSelected] = useState<Set<number>>(() => new Set([slides[0]?.index ?? 0]));
  const dialogRef = useModalDialog(true, onCancel);
  useEffect(() => {
    setSelected(new Set([slides[0]?.index ?? 0]));
  }, [slides]);
  const selectedIndices = useMemo(
    () => slides.map((slide) => slide.index).filter((index) => selected.has(index)),
    [selected, slides]
  );
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <section
        ref={dialogRef}
        className="dialog pptx-slide-chooser"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pptx-slide-chooser-title"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialog-titlebar">
          <div>
            <h2 id="pptx-slide-chooser-title">Choose slides</h2>
          </div>
          <button className="icon-button" onClick={onCancel} aria-label="Close slide chooser">
            ×
          </button>
        </div>
        <div
          className="pptx-slide-grid"
          aria-label={`PowerPoint slide choices from ${fileName}; ${slides.length} slides`}
        >
          {slides.map((slide) => {
            const checked = selected.has(slide.index);
            return (
              <label
                className={`pptx-slide-option${checked ? " selected" : ""}`}
                key={slide.stableId}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    setSelected((current) => {
                      const next = new Set(current);
                      if (next.has(slide.index)) next.delete(slide.index);
                      else next.add(slide.index);
                      return next;
                    });
                  }}
                />
                <span className="pptx-slide-thumbnail">
                  <img
                    src={svgDataUrlForPptx(thumbnailSource(slide.svg))}
                    alt=""
                    loading="lazy"
                    decoding="async"
                  />
                </span>
                <span className="pptx-slide-label">
                  <strong>Slide {slide.index + 1}</strong>
                  <small>{slide.title || "Untitled slide"}</small>
                </span>
              </label>
            );
          })}
        </div>
        <div className="pptx-slide-actions">
          <button className="button secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="button primary"
            disabled={selectedIndices.length === 0}
            onClick={() => onConfirm(selectedIndices)}
          >
            Import {selectedIndices.length || "selected"}
          </button>
        </div>
      </section>
    </div>
  );
}
