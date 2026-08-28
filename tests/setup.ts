import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";

if (typeof window !== "undefined") {
  const storage =
    window.localStorage ??
    (() => {
      const values = new Map<string, string>();
      return {
        get length() {
          return values.size;
        },
        clear: () => values.clear(),
        getItem: (key: string) => values.get(key) ?? null,
        key: (index: number) => [...values.keys()][index] ?? null,
        removeItem: (key: string) => values.delete(key),
        setItem: (key: string, value: string) => values.set(key, value)
      } as Storage;
    })();
  Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
}
