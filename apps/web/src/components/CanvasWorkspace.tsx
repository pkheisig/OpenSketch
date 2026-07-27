import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent,
  type ReactNode
} from "react";
import { createPortal } from "react-dom";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  ChevronDown,
  Copy,
  Group as GroupIcon,
  Maximize2,
  Minus,
  MoveDown,
  MoveUp,
  MousePointer2,
  Plus,
  RotateCcw,
  Ruler,
  Save,
  Trash2,
  Ungroup
} from "lucide-react";
import { ActiveSelection, Group as FabricGroup, type FabricObject } from "fabric";
import { assetManifest } from "@/assets/manifest";
import { useEditor } from "@/editor/EditorContext";
import {
  captureZoomAnchor,
  type ZoomAnchor,
  wheelZoomDelta,
  zoomAnchorScrollDelta
} from "@/editor/zoom";
import { isLinearCreationTool } from "@/editor/creation";
import { elementStyleKey } from "@/editor/elementStyles";
import type { Point } from "@/editor/geometry";

interface StoredViewport {
  zoom: number;
  focusX: number;
  focusY: number;
}

const RULER_VISIBILITY_KEY = "OpenSketch:ruler-visible";

interface ContextMenuAction {
  label: string;
  icon: ReactNode;
  action: () => void;
  danger?: boolean;
  separatorBefore?: boolean;
}

function CanvasContextMenu({
  x,
  y,
  label,
  actions,
  onClose
}: {
  x: number;
  y: number;
  label: string;
  actions: ContextMenuAction[];
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const gap = 8;
    const bounds = menu.getBoundingClientRect();
    setPosition({
      left: Math.max(gap, Math.min(x, window.innerWidth - bounds.width - gap)),
      top: Math.max(gap, Math.min(y, window.innerHeight - bounds.height - gap))
    });
    menu.querySelector<HTMLButtonElement>("button")?.focus();
  }, [x, y]);

  useEffect(() => {
    const openedAt = performance.now();
    const closeOutside = (event: globalThis.PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    const closeForResize = () => onClose();
    const closeForScroll = () => {
      if (performance.now() - openedAt > 150) onClose();
    };
    document.addEventListener("pointerdown", closeOutside);
    window.addEventListener("resize", closeForResize);
    window.addEventListener("scroll", closeForScroll, true);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("resize", closeForResize);
      window.removeEventListener("scroll", closeForScroll, true);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={menuRef}
      className="canvas-context-menu"
      role="menu"
      aria-label={label}
      style={position}
      onKeyDown={(event) => {
        event.stopPropagation();
        const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button")];
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          const direction = event.key === "ArrowDown" ? 1 : -1;
          buttons[(current + direction + buttons.length) % buttons.length]?.focus();
        } else if (event.key === "Home" || event.key === "End") {
          event.preventDefault();
          buttons[event.key === "Home" ? 0 : buttons.length - 1]?.focus();
        } else if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <div className="canvas-context-label">{label}</div>
      {actions.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          className={`${item.danger ? "danger" : ""} ${
            item.separatorBefore ? "separator-before" : ""
          }`}
          onClick={() => {
            item.action();
            onClose();
          }}
        >
          {item.icon}
          <span>{item.label}</span>
        </button>
      ))}
    </div>,
    document.body
  );
}

function storedViewport(projectId: string): StoredViewport | null {
  try {
    const value = JSON.parse(
      localStorage.getItem(`OpenSketch:viewport:${projectId}`) ?? "null"
    ) as Partial<StoredViewport> | null;
    if (
      !value ||
      !Number.isFinite(value.zoom) ||
      !Number.isFinite(value.focusX) ||
      !Number.isFinite(value.focusY)
    ) {
      return null;
    }
    return {
      zoom: Math.max(0.1, Math.min(4, value.zoom!)),
      focusX: value.focusX!,
      focusY: value.focusY!
    };
  } catch {
    return null;
  }
}

export function CanvasWorkspace() {
  const editor = useEditor();
  const {
    setCanvasElement,
    canvas,
    canvasSettings,
    fitRequest,
    previewZoom,
    projectId,
    setZoom,
    zoom
  } = editor;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const workspaceRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const spacePressed = useRef(false);
  const panOrigin = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const marqueeOrigin = useRef<{ x: number; y: number } | null>(null);
  const creationOrigin = useRef<{
    canvas: Point;
    workspace: Point;
    pointerId: number;
  } | null>(null);
  const initializedViewport = useRef(false);
  const suppressViewportCaptureUntil = useRef(0);
  const initialViewport = useRef<StoredViewport | null>(null);
  const viewportFocus = useRef({
    x: canvasSettings.width / 2,
    y: canvasSettings.height / 2
  });
  const handledFitRequest = useRef(fitRequest);
  const pendingViewport = useRef<StoredViewport | null>(null);
  const viewportSaveTimer = useRef<number | undefined>(undefined);
  const zoomFrame = useRef<number | undefined>(undefined);
  const zoomSettleTimer = useRef<number | undefined>(undefined);
  const pendingZoom = useRef(zoom);
  const pendingZoomAnchor = useRef<ZoomAnchor | null>(null);
  const [dragging, setDragging] = useState(false);
  const [rulerVisible, setRulerVisible] = useState(() => {
    try {
      return localStorage.getItem(RULER_VISIBILITY_KEY) !== "false";
    } catch {
      return true;
    }
  });
  const [panning, setPanning] = useState(false);
  const [marquee, setMarquee] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const [creationPreview, setCreationPreview] = useState<{
    from: Point;
    to: Point;
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    objects: FabricObject[];
  } | null>(null);

  useEffect(() => {
    setCanvasElement(canvasRef.current);
  }, [setCanvasElement]);

  const applyViewportFocus = useCallback(
    (focus: { x: number; y: number }) => {
      const host = scrollRef.current;
      const stage = stageRef.current;
      if (!host || !stage) return;
      suppressViewportCaptureUntil.current = performance.now() + 80;
      host.scrollLeft = stage.offsetLeft + focus.x * zoom - host.clientWidth / 2;
      host.scrollTop = stage.offsetTop + focus.y * zoom - host.clientHeight / 2;
    },
    [zoom]
  );

  const currentViewportFocus = useCallback(() => {
    const host = scrollRef.current;
    const stage = stageRef.current;
    if (!host || !stage) return viewportFocus.current;
    return {
      x: (host.scrollLeft + host.clientWidth / 2 - stage.offsetLeft) / zoom,
      y: (host.scrollTop + host.clientHeight / 2 - stage.offsetTop) / zoom
    };
  }, [zoom]);

  const queueViewportSave = useCallback(
    (focus: { x: number; y: number }) => {
      const next = { zoom, focusX: focus.x, focusY: focus.y };
      pendingViewport.current = next;
      window.clearTimeout(viewportSaveTimer.current);
      viewportSaveTimer.current = window.setTimeout(() => {
        if (!pendingViewport.current) return;
        localStorage.setItem(
          `OpenSketch:viewport:${projectId}`,
          JSON.stringify(pendingViewport.current)
        );
        pendingViewport.current = null;
      }, 120);
    },
    [projectId, zoom]
  );

  useLayoutEffect(() => {
    if (!canvas) return;
    const host = scrollRef.current;
    if (!host) return;

    if (!initialViewport.current) {
      const saved = storedViewport(projectId);
      const fittedZoom = Math.max(
        0.1,
        Math.min(
          (host.clientWidth - 120) / canvasSettings.width,
          (host.clientHeight - 120) / canvasSettings.height,
          1
        )
      );
      initialViewport.current = saved ?? {
        zoom: fittedZoom,
        focusX: canvasSettings.width / 2,
        focusY: canvasSettings.height / 2
      };
    }

    if (!initializedViewport.current) {
      const initial = initialViewport.current;
      if (Math.abs(zoom - initial.zoom) > 0.0001) {
        setZoom(initial.zoom);
        return;
      }
      const focus = { x: initial.focusX, y: initial.focusY };
      viewportFocus.current = focus;
      applyViewportFocus(focus);
      handledFitRequest.current = fitRequest;
      initializedViewport.current = true;
      queueViewportSave(focus);
      return;
    }

    const fitRequested = handledFitRequest.current !== fitRequest;
    const focus = fitRequested
      ? { x: canvasSettings.width / 2, y: canvasSettings.height / 2 }
      : viewportFocus.current;
    handledFitRequest.current = fitRequest;
    viewportFocus.current = focus;
    applyViewportFocus(focus);
    queueViewportSave(focus);
  }, [
    applyViewportFocus,
    canvas,
    canvasSettings.height,
    canvasSettings.width,
    fitRequest,
    projectId,
    queueViewportSave,
    setZoom,
    zoom
  ]);

  useEffect(() => {
    const host = scrollRef.current;
    if (!host) return;
    const grid = host.closest(".editor-grid");
    let resizeFrame = 0;
    let motionFrame = 0;
    let motionUntil = 0;
    const recenter = () => {
      if (!initializedViewport.current) return;
      applyViewportFocus(viewportFocus.current);
    };
    const scheduleRecenter = () => {
      window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(recenter);
    };
    const followPanelMotion = () => {
      recenter();
      if (performance.now() < motionUntil) {
        motionFrame = window.requestAnimationFrame(followPanelMotion);
      }
    };
    const onTransitionRun = (event: Event) => {
      if ((event as TransitionEvent).propertyName !== "grid-template-columns") return;
      motionUntil = performance.now() + 320;
      window.cancelAnimationFrame(motionFrame);
      motionFrame = window.requestAnimationFrame(followPanelMotion);
    };
    const onTransitionEnd = (event: Event) => {
      if ((event as TransitionEvent).propertyName === "grid-template-columns") recenter();
    };
    const observer = new ResizeObserver(() => {
      scheduleRecenter();
    });
    observer.observe(host);
    grid?.addEventListener("transitionrun", onTransitionRun);
    grid?.addEventListener("transitionend", onTransitionEnd);
    return () => {
      observer.disconnect();
      grid?.removeEventListener("transitionrun", onTransitionRun);
      grid?.removeEventListener("transitionend", onTransitionEnd);
      window.cancelAnimationFrame(resizeFrame);
      window.cancelAnimationFrame(motionFrame);
    };
  }, [applyViewportFocus]);

  useEffect(
    () => () => {
      window.clearTimeout(viewportSaveTimer.current);
      if (pendingViewport.current) {
        localStorage.setItem(
          `OpenSketch:viewport:${projectId}`,
          JSON.stringify(pendingViewport.current)
        );
      }
    },
    [projectId]
  );

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

  useEffect(() => {
    pendingZoom.current = zoom;
  }, [zoom]);

  useEffect(() => {
    const host = scrollRef.current;
    if (!host) return;
    const preserveZoomAnchor = (nextZoom: number) => {
      const stage = stageRef.current;
      const anchor = pendingZoomAnchor.current;
      if (!stage || !anchor) return;
      const delta = zoomAnchorScrollDelta(anchor, stage.getBoundingClientRect());
      suppressViewportCaptureUntil.current = performance.now() + 80;
      host.scrollLeft += delta.x;
      host.scrollTop += delta.y;
      viewportFocus.current = {
        x: (host.scrollLeft + host.clientWidth / 2 - stage.offsetLeft) / nextZoom,
        y: (host.scrollTop + host.clientHeight / 2 - stage.offsetTop) / nextZoom
      };
    };
    const commitPendingZoom = () => {
      window.cancelAnimationFrame(zoomFrame.current ?? 0);
      zoomFrame.current = undefined;
      setZoom(pendingZoom.current);
      preserveZoomAnchor(pendingZoom.current);
    };
    const onWheel = (event: globalThis.WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      event.stopPropagation();
      const stage = stageRef.current;
      if (stage) {
        pendingZoomAnchor.current = captureZoomAnchor(
          event.clientX,
          event.clientY,
          stage.getBoundingClientRect()
        );
      }
      pendingZoom.current = Math.max(
        0.1,
        Math.min(4, pendingZoom.current + wheelZoomDelta(event.deltaY, event.deltaMode))
      );
      if (zoomFrame.current === undefined) {
        zoomFrame.current = window.requestAnimationFrame(() => {
          zoomFrame.current = undefined;
          previewZoom(pendingZoom.current);
          preserveZoomAnchor(pendingZoom.current);
        });
      }
      window.clearTimeout(zoomSettleTimer.current);
      zoomSettleTimer.current = window.setTimeout(commitPendingZoom, 90);
    };
    const preventGestureZoom = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    host.addEventListener("wheel", onWheel, { passive: false });
    host.addEventListener("gesturestart", preventGestureZoom, { passive: false });
    host.addEventListener("gesturechange", preventGestureZoom, { passive: false });
    return () => {
      host.removeEventListener("wheel", onWheel);
      host.removeEventListener("gesturestart", preventGestureZoom);
      host.removeEventListener("gesturechange", preventGestureZoom);
      window.cancelAnimationFrame(zoomFrame.current ?? 0);
      window.clearTimeout(zoomSettleTimer.current);
      pendingZoomAnchor.current = null;
    };
  }, [previewZoom, setZoom]);

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const bounds = stageRef.current?.getBoundingClientRect();
    const point = bounds
      ? {
          x: Math.max(0, Math.min(canvasSettings.width, (event.clientX - bounds.left) / zoom)),
          y: Math.max(0, Math.min(canvasSettings.height, (event.clientY - bounds.top) / zoom))
        }
      : undefined;
    const encoded = event.dataTransfer.getData("application/x-scientific-asset");
    if (!encoded) return;
    const data = JSON.parse(encoded) as { familyId: string; variantId: string };
    const family = assetManifest.families.find((item) => item.familyId === data.familyId);
    const variant = family?.variants.find((item) => item.id === data.variantId);
    if (family && variant) void editor.addAsset(family, variant, point);
  };

  const workspacePoint = (clientX: number, clientY: number) => {
    const bounds = workspaceRef.current?.getBoundingClientRect();
    return bounds ? { x: clientX - bounds.left, y: clientY - bounds.top } : { x: 0, y: 0 };
  };

  const canvasPoint = (clientX: number, clientY: number, clampOutside = false): Point | null => {
    const bounds = stageRef.current?.getBoundingClientRect();
    if (
      !bounds ||
      (!clampOutside &&
        (clientX < bounds.left ||
          clientX > bounds.right ||
          clientY < bounds.top ||
          clientY > bounds.bottom))
    ) {
      return null;
    }
    return {
      x: Math.max(0, Math.min(canvasSettings.width, (clientX - bounds.left) / zoom)),
      y: Math.max(0, Math.min(canvasSettings.height, (clientY - bounds.top) / zoom))
    };
  };

  const beginWorkspaceGesture = (event: PointerEvent<HTMLDivElement>) => {
    const host = scrollRef.current;
    if (!host) return;
    suppressViewportCaptureUntil.current = 0;
    if (event.button === 1 || (event.button === 0 && spacePressed.current)) {
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
      return;
    }
    const creationPoint = canvasPoint(event.clientX, event.clientY);
    if (event.button === 0 && editor.creationTool && creationPoint) {
      event.preventDefault();
      event.stopPropagation();
      if (isLinearCreationTool(editor.creationTool)) {
        event.currentTarget.setPointerCapture(event.pointerId);
        const workspace = workspacePoint(event.clientX, event.clientY);
        creationOrigin.current = {
          canvas: creationPoint,
          workspace,
          pointerId: event.pointerId
        };
        setCreationPreview({ from: workspace, to: workspace });
      } else {
        editor.placeCreation(creationPoint);
      }
      return;
    }
    if (event.button !== 0 || stageRef.current?.contains(event.target as Node) || !canvas) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    marqueeOrigin.current = { x: event.clientX, y: event.clientY };
    const point = workspacePoint(event.clientX, event.clientY);
    setMarquee({ left: point.x, top: point.y, width: 0, height: 0 });
    canvas.discardActiveObject();
    canvas.requestRenderAll();
  };

  const moveWorkspaceGesture = (event: PointerEvent<HTMLDivElement>) => {
    if (creationOrigin.current) {
      setCreationPreview({
        from: creationOrigin.current.workspace,
        to: workspacePoint(event.clientX, event.clientY)
      });
      return;
    }
    const host = scrollRef.current;
    const origin = panOrigin.current;
    if (host && origin) {
      host.scrollLeft = origin.left - (event.clientX - origin.x);
      host.scrollTop = origin.top - (event.clientY - origin.y);
      return;
    }
    const selectionOrigin = marqueeOrigin.current;
    if (!selectionOrigin) return;
    const first = workspacePoint(selectionOrigin.x, selectionOrigin.y);
    const current = workspacePoint(event.clientX, event.clientY);
    setMarquee({
      left: Math.min(first.x, current.x),
      top: Math.min(first.y, current.y),
      width: Math.abs(current.x - first.x),
      height: Math.abs(current.y - first.y)
    });
  };

  const endWorkspaceGesture = (event: PointerEvent<HTMLDivElement>) => {
    const activeCreation = creationOrigin.current;
    if (activeCreation) {
      const end = canvasPoint(event.clientX, event.clientY, true) ?? activeCreation.canvas;
      editor.placeCreation(activeCreation.canvas, end);
      creationOrigin.current = null;
      setCreationPreview(null);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      return;
    }
    const selectionOrigin = marqueeOrigin.current;
    if (selectionOrigin && canvas) {
      const stage = stageRef.current?.getBoundingClientRect();
      const left = Math.min(selectionOrigin.x, event.clientX);
      const top = Math.min(selectionOrigin.y, event.clientY);
      const right = Math.max(selectionOrigin.x, event.clientX);
      const bottom = Math.max(selectionOrigin.y, event.clientY);
      if (stage && right - left >= 3 && bottom - top >= 3) {
        const selectionBounds = {
          left: (left - stage.left) / zoom,
          top: (top - stage.top) / zoom,
          right: (right - stage.left) / zoom,
          bottom: (bottom - stage.top) / zoom
        };
        const selected = canvas.getObjects().filter((object) => {
          if (object.selectable === false || object.visible === false) return false;
          const bounds = object.getBoundingRect();
          return (
            bounds.left < selectionBounds.right &&
            bounds.left + bounds.width > selectionBounds.left &&
            bounds.top < selectionBounds.bottom &&
            bounds.top + bounds.height > selectionBounds.top
          );
        });
        if (selected.length === 1) canvas.setActiveObject(selected[0]);
        else if (selected.length > 1) {
          canvas.setActiveObject(new ActiveSelection(selected, { canvas }));
        }
      }
      canvas.requestRenderAll();
      marqueeOrigin.current = null;
      setMarquee(null);
    }
    if (!panOrigin.current && !selectionOrigin) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    panOrigin.current = null;
    setPanning(false);
  };

  const openContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!canvas) return;
    const { target } = canvas.findTarget(event.nativeEvent as never);
    const selected = canvas.getActiveObjects();
    if (target && !(target instanceof ActiveSelection) && !selected.includes(target)) {
      canvas.setActiveObject(target);
      canvas.requestRenderAll();
    } else if (!target) {
      canvas.discardActiveObject();
      canvas.requestRenderAll();
    }
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      objects: canvas.getActiveObjects()
    });
  };

  const toggleRuler = () => {
    setRulerVisible((current) => {
      const next = !current;
      try {
        localStorage.setItem(RULER_VISIBILITY_KEY, String(next));
      } catch {
        // The ruler can still be toggled for this session when storage is unavailable.
      }
      return next;
    });
  };

  const contextActions = (): ContextMenuAction[] => {
    const objects = contextMenu?.objects ?? [];
    if (objects.length === 0) {
      return [
        {
          label: "Select all",
          icon: <MousePointer2 size={15} />,
          action: () => {
            if (!canvas) return;
            const selectable = canvas
              .getObjects()
              .filter((object) => object.selectable !== false && object.visible !== false);
            if (selectable.length === 1) canvas.setActiveObject(selectable[0]);
            else if (selectable.length > 1) {
              canvas.setActiveObject(new ActiveSelection(selectable, { canvas }));
            }
            canvas.requestRenderAll();
          }
        },
        {
          label: rulerVisible ? "Hide ruler" : "Show ruler",
          icon: <Ruler size={15} />,
          action: toggleRuler
        },
        {
          label: "Fit canvas",
          icon: <Maximize2 size={15} />,
          action: editor.fitCanvas
        }
      ];
    }

    const styleable = objects.length === 1 && Boolean(elementStyleKey(objects[0]));
    const actions: ContextMenuAction[] = [];
    if (objects.length > 1) {
      actions.push({
        label: "Group",
        icon: <GroupIcon size={15} />,
        action: editor.groupSelection
      });
    } else if (objects[0] instanceof FabricGroup) {
      actions.push({
        label: "Ungroup",
        icon: <Ungroup size={15} />,
        action: editor.ungroupSelection
      });
    }
    if (styleable) {
      actions.push(
        {
          label: "Save styling",
          icon: <Save size={15} />,
          action: editor.saveSelectionStyle
        },
        {
          label: "Reset styling",
          icon: <RotateCcw size={15} />,
          action: editor.resetSelectionStyle
        }
      );
    }
    actions.push(
      {
        label: "Duplicate",
        icon: <Copy size={15} />,
        action: () => void editor.duplicateSelection(),
        separatorBefore: actions.length > 0
      },
      {
        label: "Bring one up",
        icon: <MoveUp size={15} />,
        action: () => editor.arrange("forward")
      },
      {
        label: "Bring to front",
        icon: <ArrowUpToLine size={15} />,
        action: () => editor.arrange("front")
      },
      {
        label: "Send one down",
        icon: <MoveDown size={15} />,
        action: () => editor.arrange("backward")
      },
      {
        label: "Send to back",
        icon: <ArrowDownToLine size={15} />,
        action: () => editor.arrange("back")
      },
      {
        label: objects.length > 1 ? "Delete objects" : "Delete object",
        icon: <Trash2 size={15} />,
        action: editor.deleteSelection,
        danger: true,
        separatorBefore: true
      }
    );
    return actions;
  };

  return (
    <section
      ref={workspaceRef}
      className={`canvas-workspace ${dragging ? "drop-active" : ""} ${
        editor.creationTool ? "is-creating" : ""
      } ${rulerVisible ? "" : "ruler-hidden"}`}
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
      {rulerVisible ? (
        <>
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
        </>
      ) : null}
      <div
        ref={scrollRef}
        className={`workspace-scroll ${panning ? "is-panning" : ""}`}
        tabIndex={0}
        aria-label="Scrollable canvas workspace. Hold Space and drag, or use the middle mouse button, to pan."
        onPointerDownCapture={beginWorkspaceGesture}
        onPointerMove={moveWorkspaceGesture}
        onPointerUp={endWorkspaceGesture}
        onPointerCancel={endWorkspaceGesture}
        onContextMenuCapture={openContextMenu}
        onScroll={() => {
          if (
            !initializedViewport.current ||
            performance.now() < suppressViewportCaptureUntil.current
          ) {
            return;
          }
          const focus = currentViewportFocus();
          viewportFocus.current = focus;
          queueViewportSave(focus);
        }}
      >
        <div
          className="workspace-plane"
          style={{
            width: Math.max(2400, canvasSettings.width * zoom + 1600),
            height: Math.max(1800, canvasSettings.height * zoom + 1200)
          }}
        >
          <div
            ref={stageRef}
            className={`artboard-stage ${canvasSettings.transparent ? "transparent" : ""}`}
            style={{
              width: canvasSettings.width * zoom,
              height: canvasSettings.height * zoom
            }}
          >
            <canvas ref={canvasRef} aria-label="OpenSketch figure artboard" />
          </div>
        </div>
      </div>
      {marquee && <div className="workspace-marquee" style={marquee} aria-hidden="true" />}
      {creationPreview && (
        <div
          className="creation-line-preview"
          aria-hidden="true"
          style={{
            left: creationPreview.from.x,
            top: creationPreview.from.y,
            width: Math.hypot(
              creationPreview.to.x - creationPreview.from.x,
              creationPreview.to.y - creationPreview.from.y
            ),
            transform: `rotate(${Math.atan2(
              creationPreview.to.y - creationPreview.from.y,
              creationPreview.to.x - creationPreview.from.x
            )}rad)`,
            borderColor: editor.creationDefaults.line.color,
            borderTopWidth: Math.max(1, editor.creationDefaults.line.width * zoom)
          }}
        />
      )}
      {dragging && (
        <div className="drop-indicator">
          <Plus size={24} />
          <strong>Place illustration on canvas</strong>
        </div>
      )}
      <div className="workspace-controls">
        <button onClick={() => setZoom(zoom - 0.1)} aria-label="Zoom out">
          <Minus size={14} />
        </button>
        <button className="zoom-readout" onClick={editor.fitCanvas}>
          {Math.round(zoom * 100)}% <ChevronDown size={11} />
        </button>
        <button onClick={() => setZoom(zoom + 0.1)} aria-label="Zoom in">
          <Plus size={14} />
        </button>
        <span />
        <button onClick={editor.fitCanvas} aria-label="Fit canvas">
          <Maximize2 size={14} />
        </button>
      </div>
      {contextMenu && (
        <CanvasContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          label={
            contextMenu.objects.length === 0
              ? "Canvas actions"
              : contextMenu.objects.length === 1
                ? `${contextMenu.objects[0].name ?? "Object"} actions`
                : `${contextMenu.objects.length} selected actions`
          }
          actions={contextActions()}
          onClose={() => setContextMenu(null)}
        />
      )}
    </section>
  );
}
