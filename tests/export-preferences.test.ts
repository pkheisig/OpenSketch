import { beforeEach, describe, expect, it } from "vitest";
import {
  EXPORT_DPI_MAX,
  EXPORT_DPI_MIN,
  EXPORT_DPI_STORAGE_KEY,
  loadExportDpi,
  normalizeExportDpi,
  saveExportDpi
} from "../apps/web/src/export/preferences";

describe("export DPI preferences", () => {
  beforeEach(() => localStorage.clear());

  it("clamps DPI to the supported 150–1200 range", () => {
    expect(normalizeExportDpi(72)).toBe(EXPORT_DPI_MIN);
    expect(normalizeExportDpi(600)).toBe(600);
    expect(normalizeExportDpi(2400)).toBe(EXPORT_DPI_MAX);
  });

  it("persists the last selected export DPI for the next dialog", () => {
    expect(loadExportDpi()).toBe(300);
    expect(saveExportDpi(1200)).toBe(1200);
    expect(localStorage.getItem(EXPORT_DPI_STORAGE_KEY)).toBe("1200");
    expect(loadExportDpi()).toBe(1200);
  });

  it("normalizes invalid stored values to a safe fallback", () => {
    localStorage.setItem(EXPORT_DPI_STORAGE_KEY, "not-a-number");
    expect(loadExportDpi(600)).toBe(600);
  });
});
