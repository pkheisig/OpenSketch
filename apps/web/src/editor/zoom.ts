export const GESTURE_ZOOM_SENSITIVITY = 0.0075;
export const WHEEL_ZOOM_STEP = 0.03;

const MOUSE_WHEEL_DELTA_THRESHOLD = 40;

export interface ZoomAnchor {
  clientX: number;
  clientY: number;
  xRatio: number;
  yRatio: number;
}

interface RectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function zoomedCanvasDimensions(width: number, height: number, zoom: number) {
  return {
    width: Math.max(1, Math.round(width * zoom)),
    height: Math.max(1, Math.round(height * zoom))
  };
}

export function wheelZoomDelta(deltaY: number, deltaMode: number = WheelEvent.DOM_DELTA_PIXEL) {
  if (deltaY === 0) return 0;
  const isGesture =
    deltaMode === WheelEvent.DOM_DELTA_PIXEL && Math.abs(deltaY) < MOUSE_WHEEL_DELTA_THRESHOLD;
  return isGesture ? -deltaY * GESTURE_ZOOM_SENSITIVITY : Math.sign(-deltaY) * WHEEL_ZOOM_STEP;
}

export function captureZoomAnchor(
  clientX: number,
  clientY: number,
  stageRect: RectLike
): ZoomAnchor {
  return {
    clientX,
    clientY,
    xRatio: stageRect.width === 0 ? 0.5 : (clientX - stageRect.left) / stageRect.width,
    yRatio: stageRect.height === 0 ? 0.5 : (clientY - stageRect.top) / stageRect.height
  };
}

export function zoomAnchorScrollDelta(anchor: ZoomAnchor, stageRect: RectLike) {
  return {
    x: stageRect.left + anchor.xRatio * stageRect.width - anchor.clientX,
    y: stageRect.top + anchor.yRatio * stageRect.height - anchor.clientY
  };
}
