import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useState,
  type CSSProperties,
  type RefObject
} from "react";
import type { CanvasUnit } from "@workspace/editor-core";
import { rulerScale, visibleRulerTicks } from "@/editor/ruler";

interface RulerMetrics {
  originX: number;
  originY: number;
  stageWidth: number;
  stageHeight: number;
  viewportWidth: number;
  viewportHeight: number;
}

const EMPTY_METRICS: RulerMetrics = {
  originX: 0,
  originY: 0,
  stageWidth: 0,
  stageHeight: 0,
  viewportWidth: 0,
  viewportHeight: 0
};

function metricsMatch(left: RulerMetrics, right: RulerMetrics): boolean {
  return (Object.keys(left) as Array<keyof RulerMetrics>).every(
    (key) => Math.abs(left[key] - right[key]) < 0.1
  );
}

type RulerTrackStyle = CSSProperties & { "--ruler-minor-step": string };

export function CanvasRulers({
  canvasWidth,
  canvasHeight,
  dpi,
  scrollRef,
  stageRef,
  unit,
  workspaceRef,
  zoom
}: {
  canvasWidth: number;
  canvasHeight: number;
  dpi: number;
  scrollRef: RefObject<HTMLDivElement | null>;
  stageRef: RefObject<HTMLDivElement | null>;
  unit: CanvasUnit;
  workspaceRef: RefObject<HTMLElement | null>;
  zoom: number;
}) {
  const [metrics, setMetrics] = useState(EMPTY_METRICS);
  const updateMetrics = useCallback(() => {
    const stage = stageRef.current;
    const workspace = workspaceRef.current;
    if (!stage || !workspace) return;
    const stageBounds = stage.getBoundingClientRect();
    const workspaceBounds = workspace.getBoundingClientRect();
    const next = {
      originX: stageBounds.left - workspaceBounds.left,
      originY: stageBounds.top - workspaceBounds.top,
      stageWidth: stageBounds.width,
      stageHeight: stageBounds.height,
      viewportWidth: workspaceBounds.width,
      viewportHeight: workspaceBounds.height
    };
    setMetrics((current) => (metricsMatch(current, next) ? current : next));
  }, [stageRef, workspaceRef]);

  useLayoutEffect(() => {
    const scrollHost = scrollRef.current;
    const stage = stageRef.current;
    const workspace = workspaceRef.current;
    if (!scrollHost || !stage || !workspace) return;

    let frame = 0;
    const scheduleUpdate = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(updateMetrics);
    };
    const observer = new ResizeObserver(scheduleUpdate);
    observer.observe(scrollHost);
    observer.observe(stage);
    observer.observe(workspace);
    scrollHost.addEventListener("scroll", scheduleUpdate, { passive: true });
    updateMetrics();
    return () => {
      observer.disconnect();
      scrollHost.removeEventListener("scroll", scheduleUpdate);
      window.cancelAnimationFrame(frame);
    };
  }, [scrollRef, stageRef, updateMetrics, workspaceRef]);

  const scale = useMemo(() => rulerScale(zoom, unit, dpi), [dpi, unit, zoom]);
  const horizontalTicks = useMemo(
    () =>
      visibleRulerTicks({
        canvasLength: canvasWidth,
        origin: metrics.originX,
        viewportLength: metrics.viewportWidth,
        scale,
        unit
      }),
    [canvasWidth, metrics.originX, metrics.viewportWidth, scale, unit]
  );
  const verticalTicks = useMemo(
    () =>
      visibleRulerTicks({
        canvasLength: canvasHeight,
        origin: metrics.originY,
        viewportLength: metrics.viewportHeight,
        scale,
        unit
      }),
    [canvasHeight, metrics.originY, metrics.viewportHeight, scale, unit]
  );
  const tickPattern = `${scale.minorScreenStep}px`;

  return (
    <>
      <div className="canvas-ruler ruler-horizontal" aria-hidden="true">
        <div
          className="ruler-track"
          style={
            {
              left: metrics.originX,
              width: metrics.stageWidth,
              "--ruler-minor-step": tickPattern
            } as RulerTrackStyle
          }
        >
          {horizontalTicks.map((tick) => (
            <span
              key={tick.value}
              className="ruler-major-tick"
              data-value={tick.label}
              style={{ left: tick.position }}
            >
              <span className="ruler-label">{tick.label}</span>
            </span>
          ))}
        </div>
      </div>
      <div className="canvas-ruler ruler-vertical" aria-hidden="true">
        <div
          className="ruler-track"
          style={
            {
              top: metrics.originY,
              height: metrics.stageHeight,
              "--ruler-minor-step": tickPattern
            } as RulerTrackStyle
          }
        >
          {verticalTicks.map((tick) => (
            <span
              key={tick.value}
              className="ruler-major-tick"
              data-value={tick.label}
              style={{ top: tick.position }}
            >
              <span className="ruler-label">{tick.label}</span>
            </span>
          ))}
        </div>
      </div>
      <div className="ruler-corner" aria-hidden="true">
        {unit}
      </div>
    </>
  );
}
