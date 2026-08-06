export interface StringListStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

export function loadStringList(key: string, storage: StringListStorage = localStorage): string[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(key) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

export function saveStringList(
  key: string,
  values: string[],
  storage: StringListStorage = localStorage
): void {
  try {
    storage.setItem(key, JSON.stringify(values));
  } catch {
    // Keep the in-memory state when browser storage is unavailable or full.
  }
}
