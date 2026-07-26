import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type PointerEvent,
  type WheelEvent
} from "react";
import { ChevronDown, Grid3X3, Maximize2, Minus, Plus } from "lucide-react";
import { assetManifest } from "@/assets/manifest";
import { useEditor } from "@/editor/EditorContext";

export function CanvasWorkspace() {
  const editor = useEditor();
  const { setCanvasElement, canvas, fitCanvas } = editor;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const spacePressed = useRef(false);
  const panOrigin = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [panning, setPanning] = useState(false);

  useEffect(() => {
    setCanvasElement(canvasRef.current);
  }, [setCanvasElement]);

  useEffect(() => {
    if (!canvas) return;
    const timeout = window.setTimeout(() => {
      fitCanvas();
      window.requestAnimationFrame(() => {
        const host = scrollRef.current;
        if (!host) return;
        host.scrollLeft = Math.max(0, (host.scrollWidth - host.clientWidth) / 2);
        host.scrollTop = Math.max(0, (host.scrollHeight - host.clientHeight) / 2);
      });
    }, 30);
    return () => window.clearTimeout(timeout);
  }, [canvas, fitCanvas]);

  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      if (
        event.code === "Space" &&
        !(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLTextAreaElement)
      ) {
        spacePressed.current = true;
      }
    };
    const keyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") spacePressed.current = false;
    };
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    return () => {
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
    };
  }, []);

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const encoded = event.dataTransfer.getData("application/x-scientific-asset");
    if (!encoded) return;
    const data = JSON.parse(encoded) as { familyId: string; variantId: string };
    const family = assetManifest.families.find((item) => item.familyId === data.familyId);
    const variant = family?.variants.find((item) => item.id === data.variantId);
    const bounds = stageRef.current?.getBoundingClientRect();
    const point = bounds
      ? {
          x: Math.max(
            0,
            Math.min(editor.canvasSettings.width, (event.clientX - bounds.left) / editor.zoom)
          ),
          y: Math.max(
            0,
            Math.min(editor.canvasSettings.height, (event.clientY - bounds.top) / editor.zoom)
          )
        }
      : undefined;
    if (family && variant) void editor.addAsset(family, variant, point);
  };

  const beginPan = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 1 && !(event.button === 0 && spacePressed.current)) return;
    const host = scrollRef.current;
    if (!host) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    panOrigin.current = {
      x: event.clientX,
      y: event.clientY,
      left: host.scrollLeft,
      top: host.scrollTop
    };
    setPanning(true);
  };

  const movePan = (event: PointerEvent<HTMLDivElement>) => {
    const host = scrollRef.current;
    const origin = panOrigin.current;
    if (!host || !origin) return;
    host.scrollLeft = origin.left - (event.clientX - origin.x);
    host.scrollTop = origin.top - (event.clientY - origin.y);
  };

  const endPan = (event: PointerEvent<HTMLDivElement>) => {
    if (!panOrigin.current) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    panOrigin.current = null;
    setPanning(false);
  };

  const zoomWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    editor.setZoom(editor.zoom + (event.deltaY < 0 ? 0.1 : -0.1));
  };

  return (
    <section
      className={`canvas-workspace ${dragging ? "drop-active" : ""}`}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("application/x-scientific-asset")) {
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
      <div
        ref={scrollRef}
        className={`workspace-scroll ${panning ? "is-panning" : ""}`}
        tabIndex={0}
        aria-label="Scrollable canvas workspace. Hold Space and drag, or use the middle mouse button, to pan."
        onPointerDownCapture={beginPan}
        onPointerMove={movePan}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        onWheel={zoomWheel}
      >
        <div
          className="workspace-plane"
          style={{
            width: Math.max(2400, editor.canvasSettings.width * editor.zoom + 1600),
            height: Math.max(1800, editor.canvasSettings.height * editor.zoom + 1200)
          }}
        >
          <div
            ref={stageRef}
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
