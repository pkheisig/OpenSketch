export const GESTURE_ZOOM_SENSITIVITY = 0.015;
export const WHEEL_ZOOM_STEP = 0.06;

const MOUSE_WHEEL_DELTA_THRESHOLD = 40;

export function wheelZoomDelta(deltaY: number, deltaMode: number = WheelEvent.DOM_DELTA_PIXEL) {
  if (deltaY === 0) return 0;
  const isGesture =
    deltaMode === WheelEvent.DOM_DELTA_PIXEL && Math.abs(deltaY) < MOUSE_WHEEL_DELTA_THRESHOLD;
  return isGesture ? -deltaY * GESTURE_ZOOM_SENSITIVITY : Math.sign(-deltaY) * WHEEL_ZOOM_STEP;
}
