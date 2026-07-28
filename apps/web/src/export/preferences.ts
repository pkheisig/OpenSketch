export const EXPORT_DPI_STORAGE_KEY = "OpenSketch:export-dpi";
export const EXPORT_DPI_MIN = 150;
export const EXPORT_DPI_MAX = 1200;
export const EXPORT_DPI_OPTIONS = [150, 300, 600, 1200] as const;

export function normalizeExportDpi(value: unknown, fallback = 300): number {
  if (value === null || value === undefined || value === "") {
    return normalizeExportDpi(fallback, 300);
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return normalizeExportDpi(fallback, 300);
  return Math.min(EXPORT_DPI_MAX, Math.max(EXPORT_DPI_MIN, Math.round(numeric)));
}

export function loadExportDpi(fallback = 300): number {
  try {
    return normalizeExportDpi(localStorage.getItem(EXPORT_DPI_STORAGE_KEY), fallback);
  } catch {
    return normalizeExportDpi(fallback);
  }
}

export function saveExportDpi(value: number): number {
  const normalized = normalizeExportDpi(value);
  try {
    localStorage.setItem(EXPORT_DPI_STORAGE_KEY, String(normalized));
  } catch {
    // Export still works when browser storage is unavailable.
  }
  return normalized;
}
