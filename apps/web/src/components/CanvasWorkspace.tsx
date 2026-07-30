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
  AlignCenter,
  AlignHorizontalDistributeCenter,
  AlignLeft,
  AlignRight,
  AlignVerticalDistributeCenter,
  ChevronDown,
  Clipboard,
  Copy,
  Crop,
  EllipsisVertical,
  Edit3,
  FileImage,
  FileType2,
  FlipHorizontal2,
  FlipVertical2,
  Grid3X3,
  Group as GroupIcon,
  Layers3,
  Lock,
  Maximize2,
  Minus,
  MoveDown,
  MoveUp,
  MousePointer2,
  Plus,
  RotateCcw,
  RotateCw,
  Ruler,
  Save,
  Scaling,
  Scissors,
  Trash2,
  Ungroup,
  Unlock
} from "lucide-react";
import { ActiveSelection, type FabricObject } from "fabric";
import {
  CANVAS_PRESETS,
  pixelsToUnit,
  unitToPixels,
  type CanvasUnit
} from "@workspace/editor-core";
import { assetManifest } from "@/assets/manifest";
import { ColorPalettePicker } from "@/components/ColorPalettePicker";
import { UiSelect } from "@/components/UiSelect";
import { useEditor } from "@/editor/EditorContext";
import { isManualGroup } from "@/editor/grouping";
import {
  captureZoomAnchor,
  type ZoomAnchor,
  wheelZoomDelta,
  zoomAnchorScrollDelta
} from "@/editor/zoom";
import { isLinearCreationTool } from "@/editor/creation";
import {
  CONNECTOR_PRESET_DRAG_TYPE,
  connectorDropEndpoints,
  readConnectorPresetDragPayload
} from "@/editor/creationDrag";
import { elementStyleKey } from "@/editor/elementStyles";
import { CURSOR_GRABBING } from "@/editor/cursors";
import { importedMediaFilesFromDataTransfer } from "@/editor/clipboardImport";
import type { Point } from "@/editor/geometry";
import { IMPORTED_MEDIA_DRAG_TYPE } from "@/editor/assetDrag";
import { getImportedMedia } from "@/persistence/database";

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
  shortcut?: string;
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
          {item.shortcut ? <kbd>{item.shortcut}</kbd> : null}
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
    canvasReady,
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
  const footerRef = useRef<HTMLDivElement>(null);
  const spacePressed = useRef(false);
  const panOrigin = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const marqueeOrigin = useRef<{ x: number; y: number } | null>(null);
  const marqueeSelection = useRef<FabricObject[]>([]);
  const marqueeCanvasSelection = useRef<boolean | null>(null);
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
  const [viewportReady, setViewportReady] = useState(false);
  const [rulerVisible, setRulerVisible] = useState(() => {
    try {
      return localStorage.getItem(RULER_VISIBILITY_KEY) !== "false";
    } catch {
      return true;
    }
  });
  const [footerPanel, setFooterPanel] = useState<"size" | null>(null);
  const [selectionMenu, setSelectionMenu] = useState<
    "align" | "arrange" | "flip" | "transform" | "more" | null
  >(null);
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
  const canvasUnit = editor.canvasSettings.unit;
  const canvasWidth = pixelsToUnit(
    editor.canvasSettings.width,
    canvasUnit,
    editor.canvasSettings.dpi
  );
  const canvasHeight = pixelsToUnit(
    editor.canvasSettings.height,
    canvasUnit,
    editor.canvasSettings.dpi
  );
  const activeCanvasPreset =
    Object.entries(CANVAS_PRESETS).find(
      ([, preset]) =>
        preset.width === editor.canvasSettings.width &&
        preset.height === editor.canvasSettings.height
    )?.[0] ?? "";

  useEffect(() => {
    setCanvasElement(canvasRef.current);
  }, [setCanvasElement]);

  useEffect(() => {
    if (editor.selection.length === 0) setSelectionMenu(null);
  }, [editor.selection.length]);

  useEffect(() => {
    if (!footerPanel) return;
    const closeFooterPanel = (event: globalThis.PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        (target.closest(".canvas-controls") ||
          target.closest(".ui-select-menu") ||
          target.closest(".color-palette-popover"))
      ) {
        return;
      }
      setFooterPanel(null);
    };
    document.addEventListener("pointerdown", closeFooterPanel);
    return () => document.removeEventListener("pointerdown", closeFooterPanel);
  }, [footerPanel]);

  const viewportCenterOffset = useCallback(() => {
    const host = scrollRef.current;
    if (!host) return { x: 0, y: 0 };
    const hostRect = host.getBoundingClientRect();
    const footerRect = footerRef.current?.getBoundingClientRect();
    const visibleHeight = footerRect
      ? Math.max(0, Math.min(host.clientHeight, footerRect.top - hostRect.top))
      : host.clientHeight;
    return {
      x: host.clientWidth / 2,
      y: visibleHeight / 2
    };
  }, []);

  const applyViewportFocus = useCallback(
    (focus: { x: number; y: number }) => {
      const host = scrollRef.current;
      const stage = stageRef.current;
      if (!host || !stage) return;
      const center = viewportCenterOffset();
      suppressViewportCaptureUntil.current = performance.now() + 80;
      host.scrollLeft = stage.offsetLeft + focus.x * zoom - center.x;
      host.scrollTop = stage.offsetTop + focus.y * zoom - center.y;
    },
    [viewportCenterOffset, zoom]
  );

  const currentViewportFocus = useCallback(() => {
    const host = scrollRef.current;
    const stage = stageRef.current;
    if (!host || !stage) return viewportFocus.current;
    const center = viewportCenterOffset();
    return {
      x: (host.scrollLeft + center.x - stage.offsetLeft) / zoom,
      y: (host.scrollTop + center.y - stage.offsetTop) / zoom
    };
  }, [viewportCenterOffset, zoom]);

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
      const center = viewportCenterOffset();
      const fittedZoom = Math.max(
        0.1,
        Math.min(
          (host.clientWidth - 120) / canvasSettings.width,
          (center.y * 2 - 120) / canvasSettings.height,
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
      setViewportReady(true);
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
    viewportCenterOffset,
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
      const center = viewportCenterOffset();
      viewportFocus.current = {
        x: (host.scrollLeft + center.x - stage.offsetLeft) / nextZoom,
        y: (host.scrollTop + center.y - stage.offsetTop) / nextZoom
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
      zoomSettleTimer.current = window.setTimeout(commitPendingZoom, 160);
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
  }, [previewZoom, setZoom, viewportCenterOffset]);

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
    if (encoded) {
      const data = JSON.parse(encoded) as { familyId: string; variantId: string };
      const family = assetManifest.families.find((item) => item.familyId === data.familyId);
      const variant = family?.variants.find((item) => item.id === data.variantId);
      if (family && variant) void editor.addAsset(family, variant, point);
      return;
    }
    const draggedConnector = readConnectorPresetDragPayload(event.dataTransfer);
    if (draggedConnector && point) {
      const { from, to } = connectorDropEndpoints(draggedConnector.tool, point, canvasSettings);
      editor.setCreationDefaults((current) => ({
        ...current,
        line: {
          ...current.line,
          lineStyle: draggedConnector.preset.lineStyle,
          startArrowhead: draggedConnector.preset.startArrowhead,
          endArrowhead: draggedConnector.preset.endArrowhead
        }
      }));
      editor.placeCreationTool(draggedConnector.tool, from, to);
      return;
    }
    const importId = event.dataTransfer.getData(IMPORTED_MEDIA_DRAG_TYPE);
    if (importId) {
      void getImportedMedia(importId).then((media) => {
        if (media) void editor.addImportedMedia(media, point);
      });
      return;
    }
    const files = importedMediaFilesFromDataTransfer(event.dataTransfer);
    if (files.length > 0) {
      void Promise.allSettled(
        files.map((file, index) => {
          const offset = Math.min(index, 8) * 24;
          return editor.importMedia(
            file,
            point
              ? {
                  x: Math.max(0, Math.min(canvasSettings.width, point.x + offset)),
                  y: Math.max(0, Math.min(canvasSettings.height, point.y + offset))
                }
              : undefined
          );
        })
      );
    }
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

  const updateMarqueeSelection = (
    selectionOrigin: { x: number; y: number },
    clientX: number,
    clientY: number
  ) => {
    if (!canvas) return;
    const stage = stageRef.current?.getBoundingClientRect();
    const left = Math.min(selectionOrigin.x, clientX);
    const top = Math.min(selectionOrigin.y, clientY);
    const right = Math.max(selectionOrigin.x, clientX);
    const bottom = Math.max(selectionOrigin.y, clientY);
    const selectionBounds = stage
      ? {
          left: (left - stage.left) / zoom,
          top: (top - stage.top) / zoom,
          right: (right - stage.left) / zoom,
          bottom: (bottom - stage.top) / zoom
        }
      : null;
    const selected =
      selectionBounds && right - left >= 3 && bottom - top >= 3
        ? canvas.getObjects().filter((object) => {
            if (object.selectable === false || object.visible === false) return false;
            const bounds = object.getBoundingRect();
            return (
              bounds.left < selectionBounds.right &&
              bounds.left + bounds.width > selectionBounds.left &&
              bounds.top < selectionBounds.bottom &&
              bounds.top + bounds.height > selectionBounds.top
            );
          })
        : [];
    const previous = marqueeSelection.current;
    if (
      previous.length === selected.length &&
      previous.every((object, index) => object === selected[index])
    ) {
      return;
    }
    canvas.discardActiveObject();
    if (selected.length === 1) canvas.setActiveObject(selected[0]);
    else if (selected.length > 1) {
      canvas.setActiveObject(new ActiveSelection(selected, { canvas }));
    }
    marqueeSelection.current = selected;
    canvas.requestRenderAll();
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
    if (event.button !== 0 || !canvas) return;
    const insideStage = stageRef.current?.contains(event.target as Node);
    // `searchPossibleTargets` only checks object geometry. Rotation and other
    // transform controls can sit outside those bounds, so treating that area as
    // empty starts our marquee gesture and steals the pointer from Fabric.
    // `findTarget` also resolves controls on the active object.
    if (insideStage && canvas.findTarget(event.nativeEvent as never).target) {
      return;
    }
    if (insideStage) {
      marqueeCanvasSelection.current = canvas.selection;
      canvas.selection = false;
    } else {
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    marqueeOrigin.current = { x: event.clientX, y: event.clientY };
    marqueeSelection.current = [];
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
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    const first = workspacePoint(selectionOrigin.x, selectionOrigin.y);
    const current = workspacePoint(event.clientX, event.clientY);
    setMarquee({
      left: Math.min(first.x, current.x),
      top: Math.min(first.y, current.y),
      width: Math.abs(current.x - first.x),
      height: Math.abs(current.y - first.y)
    });
    updateMarqueeSelection(selectionOrigin, event.clientX, event.clientY);
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
      updateMarqueeSelection(selectionOrigin, event.clientX, event.clientY);
      marqueeOrigin.current = null;
      marqueeSelection.current = [];
      setMarquee(null);
    }
    if (marqueeCanvasSelection.current !== null && canvas) {
      canvas.selection = marqueeCanvasSelection.current;
      marqueeCanvasSelection.current = null;
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
    if (editor.editingGroup && (event.metaKey || event.ctrlKey || event.altKey)) return;
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
          label: editor.canvasSettings.grid ? "Hide grid" : "Show grid",
          icon: <Grid3X3 size={15} />,
          action: () => editor.setCanvasSettings({ grid: !editor.canvasSettings.grid })
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
    const actions: ContextMenuAction[] = [
      {
        label: "Cut",
        icon: <Scissors size={15} />,
        action: () => void editor.copySelectionToClipboard("png", true),
        shortcut: "Cmd/Ctrl X"
      },
      {
        label: "Copy",
        icon: <Copy size={15} />,
        action: () => void editor.copySelectionToClipboard("png"),
        shortcut: "Cmd/Ctrl C"
      },
      {
        label: "Duplicate",
        icon: <Copy size={15} />,
        action: () => void editor.duplicateSelection(),
        shortcut: "Cmd/Ctrl D"
      },
      {
        label: "Paste",
        icon: <Clipboard size={15} />,
        action: () => void editor.pasteSelection(),
        shortcut: "Cmd/Ctrl V"
      }
    ];
    if (objects.length > 1) {
      actions.push({
        label: "Group",
        icon: <GroupIcon size={15} />,
        action: editor.groupSelection,
        separatorBefore: true
      });
    } else if (isManualGroup(objects[0])) {
      actions.push({
        label: "Ungroup",
        icon: <Ungroup size={15} />,
        action: editor.ungroupSelection,
        separatorBefore: true
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
        label: "Copy as SVG",
        icon: <FileType2 size={15} />,
        action: () => void editor.copySelectionToClipboard("svg"),
        separatorBefore: actions.length > 0
      },
      {
        label: "Copy as PNG",
        icon: <FileImage size={15} />,
        action: () => void editor.copySelectionToClipboard("png")
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
      } ${rulerVisible ? "" : "ruler-hidden"} ${
        editor.canvasSettings.grid ? "grid-visible" : ""
      } ${editor.editingGroup ? "group-editing" : ""}`}
      onDragOver={(event) => {
        if (
          event.dataTransfer.types.includes("application/x-scientific-asset") ||
          event.dataTransfer.types.includes(CONNECTOR_PRESET_DRAG_TYPE) ||
          event.dataTransfer.types.includes(IMPORTED_MEDIA_DRAG_TYPE) ||
          event.dataTransfer.types.includes("Files")
        ) {
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
      {editor.editingGroup ? (
        <div className="group-edit-banner" role="status">
          <strong>Editing a group</strong>
          <button type="button" onClick={editor.closeGroupEdit}>
            Exit group
          </button>
        </div>
      ) : null}
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
        style={{ cursor: panning ? CURSOR_GRABBING : undefined }}
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
          data-canvas-ready={canvasReady && viewportReady ? "true" : "false"}
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
      {editor.selection.length > 0 ? (
        <div className="selection-toolbar-shell">
          <div className="selection-quick-toolbar" role="toolbar" aria-label="Selection actions">
            <button
              className={selectionMenu === "align" ? "active" : ""}
              onClick={() => setSelectionMenu((current) => (current === "align" ? null : "align"))}
              aria-expanded={selectionMenu === "align"}
              disabled={editor.selection.length < 2}
              title={
                editor.selection.length < 2 ? "Select at least two objects to align" : undefined
              }
            >
              <AlignLeft size={18} />
              <span>Align</span>
            </button>
            <button
              onClick={
                editor.selection.length > 1
                  ? editor.groupSelection
                  : isManualGroup(editor.selection[0])
                    ? editor.ungroupSelection
                    : undefined
              }
              disabled={editor.selection.length === 1 && !isManualGroup(editor.selection[0])}
            >
              {editor.selection.length === 1 && isManualGroup(editor.selection[0]) ? (
                <Ungroup size={18} />
              ) : (
                <GroupIcon size={18} />
              )}
              <span>
                {editor.selection.length === 1 && isManualGroup(editor.selection[0])
                  ? "Ungroup"
                  : "Group"}
              </span>
            </button>
            <button
              className={selectionMenu === "arrange" ? "active" : ""}
              onClick={() =>
                setSelectionMenu((current) => (current === "arrange" ? null : "arrange"))
              }
              aria-expanded={selectionMenu === "arrange"}
            >
              <Layers3 size={18} />
              <span>Arrange</span>
            </button>
            <button
              className={selectionMenu === "flip" ? "active" : ""}
              onClick={() => setSelectionMenu((current) => (current === "flip" ? null : "flip"))}
              aria-expanded={selectionMenu === "flip"}
            >
              <FlipHorizontal2 size={18} />
              <span>Flip</span>
            </button>
            <button disabled title="Crop is available for imported raster images">
              <Crop size={18} />
              <span>Crop</span>
            </button>
            <button
              className={selectionMenu === "transform" ? "active" : ""}
              onClick={() =>
                setSelectionMenu((current) => (current === "transform" ? null : "transform"))
              }
              aria-expanded={selectionMenu === "transform"}
            >
              <Scaling size={18} />
              <span>Transform</span>
            </button>
            <button
              onClick={() => {
                const locked = editor.selection.every((object) => object.lockMovementX);
                editor.setObject({
                  lockMovementX: !locked,
                  lockMovementY: !locked,
                  lockScalingX: !locked,
                  lockScalingY: !locked,
                  lockRotation: !locked
                });
              }}
            >
              {editor.selection.every((object) => object.lockMovementX) ? (
                <Unlock size={18} />
              ) : (
                <Lock size={18} />
              )}
              <span>
                {editor.selection.every((object) => object.lockMovementX) ? "Unlock" : "Lock"}
              </span>
            </button>
            <button
              className={selectionMenu === "more" ? "active icon-only" : "icon-only"}
              onClick={() => setSelectionMenu((current) => (current === "more" ? null : "more"))}
              aria-label="More selection actions"
              aria-expanded={selectionMenu === "more"}
            >
              <EllipsisVertical size={19} />
            </button>
          </div>
          {selectionMenu ? (
            <div className={`selection-toolbar-menu ${selectionMenu}`} role="menu">
              {selectionMenu === "align" ? (
                <>
                  <button onClick={() => editor.align("left")}>
                    <AlignLeft size={16} />
                    Left
                  </button>
                  <button onClick={() => editor.align("center")}>
                    <AlignCenter size={16} />
                    Center
                  </button>
                  <button onClick={() => editor.align("right")}>
                    <AlignRight size={16} />
                    Right
                  </button>
                  <button onClick={() => editor.align("top")}>
                    <ArrowUpToLine size={16} />
                    Top
                  </button>
                  <button onClick={() => editor.align("middle")}>
                    <AlignVerticalDistributeCenter size={16} />
                    Middle
                  </button>
                  <button onClick={() => editor.align("bottom")}>
                    <ArrowDownToLine size={16} />
                    Bottom
                  </button>
                  <button
                    onClick={() => editor.distribute("horizontal")}
                    disabled={editor.selection.length < 3}
                    title={
                      editor.selection.length < 3
                        ? "Select at least three objects to distribute"
                        : undefined
                    }
                  >
                    <AlignHorizontalDistributeCenter size={16} />
                    Distribute H
                  </button>
                  <button
                    onClick={() => editor.distribute("vertical")}
                    disabled={editor.selection.length < 3}
                    title={
                      editor.selection.length < 3
                        ? "Select at least three objects to distribute"
                        : undefined
                    }
                  >
                    <AlignVerticalDistributeCenter size={16} />
                    Distribute V
                  </button>
                </>
              ) : null}
              {selectionMenu === "arrange" ? (
                <>
                  <button onClick={() => editor.arrange("front")}>
                    <ArrowUpToLine size={16} />
                    Bring to front
                  </button>
                  <button onClick={() => editor.arrange("forward")}>
                    <MoveUp size={16} />
                    Bring one up
                  </button>
                  <button onClick={() => editor.arrange("backward")}>
                    <MoveDown size={16} />
                    Send one down
                  </button>
                  <button onClick={() => editor.arrange("back")}>
                    <ArrowDownToLine size={16} />
                    Send to back
                  </button>
                </>
              ) : null}
              {selectionMenu === "flip" ? (
                <>
                  <button onClick={() => editor.flip("x")}>
                    <FlipHorizontal2 size={16} />
                    Horizontal
                  </button>
                  <button onClick={() => editor.flip("y")}>
                    <FlipVertical2 size={16} />
                    Vertical
                  </button>
                </>
              ) : null}
              {selectionMenu === "transform" ? (
                <>
                  <button onClick={() => editor.setObject({ angle: 0 })}>
                    <RotateCcw size={16} />
                    Reset rotation
                  </button>
                  <button
                    onClick={() =>
                      editor.setObject({ angle: (editor.selection[0]?.angle ?? 0) - 90 })
                    }
                  >
                    <RotateCcw size={16} />
                    Rotate left 90°
                  </button>
                  <button
                    onClick={() =>
                      editor.setObject({ angle: (editor.selection[0]?.angle ?? 0) + 90 })
                    }
                  >
                    <RotateCw size={16} />
                    Rotate right 90°
                  </button>
                  <button onClick={() => editor.setObject({ scaleX: 1, scaleY: 1 })}>
                    <Scaling size={16} />
                    Reset scale
                  </button>
                </>
              ) : null}
              {selectionMenu === "more" ? (
                <>
                  <button onClick={() => void editor.copySelectionToClipboard("png", true)}>
                    <Scissors size={16} />
                    <span>Cut</span>
                    <kbd>Cmd/Ctrl X</kbd>
                  </button>
                  <button onClick={() => void editor.copySelectionToClipboard("png")}>
                    <Copy size={16} />
                    <span>Copy</span>
                    <kbd>Cmd/Ctrl C</kbd>
                  </button>
                  <button onClick={() => void editor.duplicateSelection()}>
                    <Copy size={16} />
                    <span>Duplicate</span>
                    <kbd>Cmd/Ctrl D</kbd>
                  </button>
                  <button onClick={() => void editor.pasteSelection()}>
                    <Clipboard size={16} />
                    <span>Paste</span>
                    <kbd>Cmd/Ctrl V</kbd>
                  </button>
                  <button className="danger separator-before" onClick={editor.deleteSelection}>
                    <Trash2 size={16} />
                    <span>Delete</span>
                    <kbd>Delete</kbd>
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      <div ref={footerRef} className={`workspace-footer ${footerPanel ? "footer-panel-open" : ""}`}>
        <div className="workspace-footer-section canvas-controls">
          <button
            className={footerPanel === "size" ? "active labeled" : "labeled"}
            onClick={() => setFooterPanel((current) => (current === "size" ? null : "size"))}
            aria-expanded={footerPanel === "size"}
          >
            <Scaling size={15} />
            Canvas size
          </button>
          {footerPanel === "size" ? (
            <div
              className="workspace-footer-popover canvas-size-popover"
              role="dialog"
              aria-label="Canvas settings"
            >
              <strong>Canvas settings</strong>
              <UiSelect
                className="footer-select"
                label="Preset"
                value={activeCanvasPreset}
                options={[
                  { value: "", label: "Custom dimensions" },
                  ...Object.keys(CANVAS_PRESETS).map((name) => ({ value: name, label: name }))
                ]}
                onChange={(name) => {
                  const preset = CANVAS_PRESETS[name];
                  if (preset) editor.setCanvasSettings(preset);
                }}
              />
              <div className="canvas-settings-dimensions">
                <label>
                  Width
                  <input
                    type="number"
                    min="0.1"
                    step={canvasUnit === "px" ? 1 : 0.1}
                    value={Number(canvasWidth.toFixed(canvasUnit === "px" ? 0 : 2))}
                    onChange={(event) =>
                      editor.setCanvasSettings({
                        width: Math.max(
                          1,
                          Math.round(
                            unitToPixels(
                              Number(event.target.value) || 0.1,
                              canvasUnit,
                              editor.canvasSettings.dpi
                            )
                          )
                        )
                      })
                    }
                  />
                </label>
                <label>
                  Height
                  <input
                    type="number"
                    min="0.1"
                    step={canvasUnit === "px" ? 1 : 0.1}
                    value={Number(canvasHeight.toFixed(canvasUnit === "px" ? 0 : 2))}
                    onChange={(event) =>
                      editor.setCanvasSettings({
                        height: Math.max(
                          1,
                          Math.round(
                            unitToPixels(
                              Number(event.target.value) || 0.1,
                              canvasUnit,
                              editor.canvasSettings.dpi
                            )
                          )
                        )
                      })
                    }
                  />
                </label>
                <UiSelect
                  className="footer-select compact"
                  label="Unit"
                  value={canvasUnit}
                  options={[
                    { value: "px", label: "px" },
                    { value: "mm", label: "mm" },
                    { value: "in", label: "in" }
                  ]}
                  onChange={(unit) => editor.setCanvasSettings({ unit: unit as CanvasUnit })}
                />
              </div>
              <div className="canvas-color-control">
                Background
                <ColorPalettePicker
                  ariaLabel="Canvas background"
                  value={editor.canvasSettings.background}
                  disabled={editor.canvasSettings.transparent}
                  onChange={(background) => editor.setCanvasSettings({ background })}
                  showValue
                />
              </div>
              <label className="footer-check">
                <input
                  type="checkbox"
                  checked={editor.canvasSettings.transparent}
                  onChange={(event) =>
                    editor.setCanvasSettings({ transparent: event.target.checked })
                  }
                />
                Transparent background
              </label>
              <label className="footer-check">
                <input
                  type="checkbox"
                  checked={Boolean(editor.canvasSettings.doubleClickCreatesText)}
                  onChange={(event) =>
                    editor.setCanvasSettings({ doubleClickCreatesText: event.target.checked })
                  }
                />
                Double-click to add text
              </label>
              <button onClick={editor.fitCanvas}>Fit canvas</button>
            </div>
          ) : null}
        </div>
        <div className="workspace-controls" aria-label="Zoom controls">
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
        <div className="workspace-footer-section view-controls">
          <button
            className={editor.autoEditEnabled ? "active" : ""}
            onClick={() => editor.setAutoEditEnabled(!editor.autoEditEnabled)}
            aria-label={
              editor.autoEditEnabled
                ? "Disable automatic edit panel"
                : "Enable automatic edit panel"
            }
            aria-pressed={editor.autoEditEnabled}
            title="Auto-open edit panel"
          >
            <Edit3 size={15} />
          </button>
          <button
            className={editor.canvasSettings.grid ? "active" : ""}
            onClick={() => editor.setCanvasSettings({ grid: !editor.canvasSettings.grid })}
            aria-label={editor.canvasSettings.grid ? "Hide grid" : "Show grid"}
            title="Grid"
          >
            <Grid3X3 size={15} />
          </button>
          <button
            className={rulerVisible ? "active" : ""}
            onClick={toggleRuler}
            aria-label={rulerVisible ? "Hide ruler" : "Show ruler"}
          >
            <Ruler size={14} />
          </button>
        </div>
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
