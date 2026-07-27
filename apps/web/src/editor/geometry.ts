import type { ConnectorAnchor } from "@workspace/editor-core";

export interface Point {
  x: number;
  y: number;
}

export interface Bounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface SnapResult {
  dx: number;
  dy: number;
  verticalGuide?: number;
  horizontalGuide?: number;
}

export interface AxisSnapLock {
  pointer: number;
  position: number;
  guide: number;
  released?: boolean;
}

export interface ResistantSnapResult {
  position: number;
  guide?: number;
  lock?: AxisSnapLock;
  released: boolean;
}

export const SNAP_RELEASE_DISTANCE_PX = 12;

export function applySnapResistance({
  proposedPosition,
  pointer,
  snapDelta,
  snapGuide,
  lock,
  releaseDistance
}: {
  proposedPosition: number;
  pointer: number;
  snapDelta: number;
  snapGuide?: number;
  lock?: AxisSnapLock;
  releaseDistance: number;
}): ResistantSnapResult {
  if (lock) {
    if (lock.released) {
      if (snapGuide === lock.guide) {
        return {
          position: proposedPosition,
          lock,
          released: true
        };
      }
      if (snapGuide === undefined) {
        return {
          position: proposedPosition,
          released: false
        };
      }
    } else if (Math.abs(pointer - lock.pointer) <= releaseDistance) {
      return {
        position: lock.position,
        guide: lock.guide,
        lock,
        released: false
      };
    }
    return {
      position: proposedPosition,
      lock: { ...lock, released: true },
      released: true
    };
  }
  if (snapGuide === undefined) {
    return {
      position: proposedPosition,
      released: false
    };
  }
  const position = proposedPosition + snapDelta;
  const nextLock = { pointer, position, guide: snapGuide, released: false };
  return {
    position,
    guide: snapGuide,
    lock: nextLock,
    released: false
  };
}

export function anchorPoint(bounds: Bounds, anchor: ConnectorAnchor): Point {
  const centerX = bounds.left + bounds.width / 2;
  const centerY = bounds.top + bounds.height / 2;
  if (anchor === "top") return { x: centerX, y: bounds.top };
  if (anchor === "right") return { x: bounds.left + bounds.width, y: centerY };
  if (anchor === "bottom") return { x: centerX, y: bounds.top + bounds.height };
  if (anchor === "left") return { x: bounds.left, y: centerY };
  return { x: centerX, y: centerY };
}

function axes(bounds: Bounds) {
  return {
    x: [bounds.left, bounds.left + bounds.width / 2, bounds.left + bounds.width],
    y: [bounds.top, bounds.top + bounds.height / 2, bounds.top + bounds.height]
  };
}

export function snapBounds(
  moving: Bounds,
  targets: Bounds[],
  threshold: number,
  artboard?: Bounds
): SnapResult {
  const source = axes(moving);
  const candidates = artboard ? [...targets, artboard] : targets;
  let bestX: { delta: number; guide: number } | undefined;
  let bestY: { delta: number; guide: number } | undefined;

  for (const target of candidates) {
    const targetAxes = axes(target);
    for (const sourceX of source.x) {
      for (const targetX of targetAxes.x) {
        const delta = targetX - sourceX;
        if (Math.abs(delta) <= threshold && (!bestX || Math.abs(delta) < Math.abs(bestX.delta))) {
          bestX = { delta, guide: targetX };
        }
      }
    }
    for (const sourceY of source.y) {
      for (const targetY of targetAxes.y) {
        const delta = targetY - sourceY;
        if (Math.abs(delta) <= threshold && (!bestY || Math.abs(delta) < Math.abs(bestY.delta))) {
          bestY = { delta, guide: targetY };
        }
      }
    }
  }

  return {
    dx: bestX?.delta ?? 0,
    dy: bestY?.delta ?? 0,
    verticalGuide: bestX?.guide,
    horizontalGuide: bestY?.guide
  };
}
