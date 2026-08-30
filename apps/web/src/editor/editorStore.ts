export type SnapshotListener = () => void;

export interface SnapshotStore<T> {
  getSnapshot: () => T;
  subscribe: (listener: SnapshotListener) => () => void;
  setSnapshot: (snapshot: T) => void;
  publish: () => void;
}

/**
 * A small external-store seam for state that has one owner but many selective
 * readers. The owner stages a snapshot during render and publishes it after
 * the render commits, which keeps subscribers from observing a half-rendered
 * editor value.
 */
export function createSnapshotStore<T>(initialSnapshot?: T): SnapshotStore<T> {
  let snapshot = initialSnapshot;
  let publishedSnapshot = initialSnapshot;
  const listeners = new Set<SnapshotListener>();

  return {
    getSnapshot: () => {
      if (snapshot === undefined) {
        throw new Error("The editor snapshot is not available yet.");
      }
      return snapshot;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setSnapshot: (nextSnapshot) => {
      snapshot = nextSnapshot;
    },
    publish: () => {
      if (snapshot === undefined || Object.is(snapshot, publishedSnapshot)) return;
      publishedSnapshot = snapshot;
      listeners.forEach((listener) => listener());
    }
  };
}

export function shallowEqual<T extends Record<string, unknown>>(left: T, right: T): boolean {
  if (Object.is(left, right)) return true;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => Object.is(left[key], right[key]));
}
