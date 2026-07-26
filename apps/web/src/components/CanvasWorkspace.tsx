import { useEffect, useRef, useState, type DragEvent } from "react";
import { ChevronDown, Grid3X3, Maximize2, Minus, Plus } from "lucide-react";
import { assetManifest } from "@/assets/manifest";
import { useEditor } from "@/editor/EditorContext";

export function CanvasWorkspace() {
  const editor = useEditor();
  const { setCanvasElement, canvas, fitCanvas } = editor;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    setCanvasElement(canvasRef.current);
  }, [setCanvasElement]);

  useEffect(() => {
    if (!canvas) return;
    const timeout = window.setTimeout(fitCanvas, 30);
    return () => window.clearTimeout(timeout);
  }, [canvas, fitCanvas]);

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const encoded = event.dataTransfer.getData("application/x-opensketch-asset");
    if (!encoded) return;
    const data = JSON.parse(encoded) as { familyId: string; variantId: string };
    const family = assetManifest.families.find((item) => item.familyId === data.familyId);
    const variant = family?.variants.find((item) => item.id === data.variantId);
    if (family && variant) void editor.addAsset(family, variant);
  };

  return (
    <section
      className={`canvas-workspace ${dragging ? "drop-active" : ""}`}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("application/x-opensketch-asset")) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          setDragging(true);
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false);
      }}
      onDrop={onDrop}
    >
      <div className="canvas-ruler ruler-horizontal">
        {Array.from({ length: 13 }, (_, index) => (
          <span key={index}>{index * 200}</span>
        ))}
      </div>
      <div className="canvas-ruler ruler-vertical">
        {Array.from({ length: 8 }, (_, index) => (
          <span key={index}>{index * 200}</span>
        ))}
      </div>
      <div className="workspace-scroll">
        <div
          className={`artboard-stage ${editor.canvasSettings.grid ? "show-grid" : ""} ${
            editor.canvasSettings.transparent ? "transparent" : ""
          }`}
          style={{
            width: editor.canvasSettings.width * editor.zoom,
            height: editor.canvasSettings.height * editor.zoom
          }}
        >
          <canvas ref={canvasRef} aria-label="OpenSketch figure artboard" />
        </div>
      </div>
      {dragging && (
        <div className="drop-indicator">
          <Plus size={24} />
          <strong>Place illustration on canvas</strong>
        </div>
      )}
      <div className="workspace-controls">
        <button
          className={editor.canvasSettings.grid ? "active" : ""}
          onClick={() => editor.setCanvasSettings({ grid: !editor.canvasSettings.grid })}
          aria-label="Toggle grid"
        >
          <Grid3X3 size={15} />
        </button>
        <span />
        <button onClick={() => editor.setZoom(editor.zoom - 0.1)} aria-label="Zoom out">
          <Minus size={14} />
        </button>
        <button className="zoom-readout" onClick={editor.fitCanvas}>
          {Math.round(editor.zoom * 100)}% <ChevronDown size={11} />
        </button>
        <button onClick={() => editor.setZoom(editor.zoom + 0.1)} aria-label="Zoom in">
          <Plus size={14} />
        </button>
        <span />
        <button onClick={editor.fitCanvas} aria-label="Fit canvas">
          <Maximize2 size={14} />
        </button>
      </div>
    </section>
  );
}
