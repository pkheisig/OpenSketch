export const DEFAULT_HISTORY_MAX_ENTRIES = 120;
export const DEFAULT_HISTORY_MAX_BYTES = 64 * 1024 * 1024;

export interface HistoryBufferOptions<T> {
  maxBytes?: number;
  maxEntries?: number;
  measure: (value: T) => number;
  onDiscard?: (value: T) => void;
}

export interface HistoryBuffer<T> {
  readonly length: number;
  readonly cursor: number;
  readonly retainedBytes: number;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  current(): T | undefined;
  peek(offset: number): T | undefined;
  move(offset: number): T | undefined;
  push(value: T): void;
  replaceCurrent(value: T): void;
  reset(value: T): void;
  dispose(): void;
}

interface HistoryEntry<T> {
  readonly value: T;
  readonly cost: number;
}

const normalizePositiveLimit = (value: number | undefined, fallback: number): number => {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("History limits must be finite positive numbers");
  }
  return Math.max(1, Math.floor(value));
};

const normalizeCost = (value: number): number => {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("History entry cost must be a finite non-negative number");
  }
  return value;
};

export const createHistoryBuffer = <T>({
  maxBytes = DEFAULT_HISTORY_MAX_BYTES,
  maxEntries = DEFAULT_HISTORY_MAX_ENTRIES,
  measure,
  onDiscard
}: HistoryBufferOptions<T>): HistoryBuffer<T> => {
  const byteLimit = normalizePositiveLimit(maxBytes, DEFAULT_HISTORY_MAX_BYTES);
  const entryLimit = normalizePositiveLimit(maxEntries, DEFAULT_HISTORY_MAX_ENTRIES);
  const entries: HistoryEntry<T>[] = [];
  let cursor = -1;
  let retainedBytes = 0;

  const discard = (entry: HistoryEntry<T>): void => {
    onDiscard?.(entry.value);
  };

  const removeAt = (index: number): void => {
    const [removed] = entries.splice(index, 1);
    if (!removed) return;

    retainedBytes -= removed.cost;
    discard(removed);
    if (index < cursor) {
      cursor -= 1;
    } else if (index === cursor) {
      cursor = Math.min(cursor, entries.length - 1);
    }
  };

  const removeAllExceptCurrent = (): void => {
    if (cursor < 0) return;

    const current = entries[cursor];
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      if (index === cursor) continue;
      const [removed] = entries.splice(index, 1);
      if (!removed) continue;
      retainedBytes -= removed.cost;
      discard(removed);
    }
    entries[0] = current;
    cursor = 0;
    retainedBytes = current.cost;
  };

  const evictOneRetainedEntry = (): boolean => {
    if (entries.length <= 1 || cursor < 0) return false;

    // Prefer the oldest undo entry. Once there is no undo history, remove the
    // oldest redo entry while retaining the current checkpoint.
    if (cursor > 0) {
      removeAt(0);
      return true;
    }
    if (cursor < entries.length - 1) {
      removeAt(1);
      return true;
    }
    return false;
  };

  const enforceLimits = (): void => {
    if (cursor < 0) return;

    if (entries[cursor].cost > byteLimit) {
      removeAllExceptCurrent();
    }

    while (entries.length > entryLimit || retainedBytes > byteLimit) {
      if (!evictOneRetainedEntry()) break;
    }
  };

  const makeEntry = (value: T): HistoryEntry<T> => ({
    value,
    cost: normalizeCost(measure(value))
  });

  return {
    get length() {
      return entries.length;
    },
    get cursor() {
      return cursor;
    },
    get retainedBytes() {
      return retainedBytes;
    },
    get canUndo() {
      return cursor > 0;
    },
    get canRedo() {
      return cursor >= 0 && cursor < entries.length - 1;
    },
    current() {
      return cursor >= 0 ? entries[cursor]?.value : undefined;
    },
    peek(offset) {
      if (!Number.isInteger(offset)) return undefined;
      const index = cursor + offset;
      return index >= 0 && index < entries.length ? entries[index]?.value : undefined;
    },
    move(offset) {
      if (!Number.isInteger(offset)) return undefined;
      const index = cursor + offset;
      if (index < 0 || index >= entries.length) return undefined;
      cursor = index;
      return entries[cursor]?.value;
    },
    push(value) {
      const entry = makeEntry(value);
      const firstRedoIndex = cursor + 1;
      while (entries.length > firstRedoIndex) {
        removeAt(entries.length - 1);
      }
      entries.push(entry);
      cursor = entries.length - 1;
      retainedBytes += entry.cost;
      enforceLimits();
    },
    replaceCurrent(value) {
      if (cursor < 0) {
        const entry = makeEntry(value);
        entries.push(entry);
        cursor = 0;
        retainedBytes = entry.cost;
        enforceLimits();
        return;
      }

      const entry = makeEntry(value);
      const previous = entries[cursor];
      retainedBytes -= previous.cost;
      discard(previous);
      entries[cursor] = entry;
      retainedBytes += entry.cost;
      enforceLimits();
    },
    reset(value) {
      for (const entry of entries) discard(entry);
      entries.length = 0;
      retainedBytes = 0;
      cursor = -1;

      const entry = makeEntry(value);
      entries.push(entry);
      cursor = 0;
      retainedBytes = entry.cost;
      enforceLimits();
    },
    dispose() {
      for (const entry of entries) discard(entry);
      entries.length = 0;
      retainedBytes = 0;
      cursor = -1;
    }
  };
};
