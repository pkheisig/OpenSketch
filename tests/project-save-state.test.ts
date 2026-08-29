import { describe, expect, it } from "vitest";
import {
  hasUnsavedProjectRevision,
  normalizeProjectSaveError
} from "../apps/web/src/editor/projectSaveState";

describe("project save state", () => {
  it("classifies quota failures and keeps the original diagnostic", () => {
    const error = normalizeProjectSaveError(
      new DOMException("The object store is full", "QuotaExceededError")
    );

    expect(error.kind).toBe("quota");
    expect(error.message).toMatch(/storage is full/i);
    expect(error.detail).toMatch(/QuotaExceededError/);
    expect(error.detail).toMatch(/object store is full/);
  });

  it("classifies blocked database failures separately from unknown failures", () => {
    const error = normalizeProjectSaveError(
      new DOMException("The database is blocked", "InvalidStateError")
    );

    expect(error.kind).toBe("unavailable");
    expect(error.message).toMatch(/unavailable or blocked/i);
    expect(error.detail).toMatch(/InvalidStateError/);
  });

  it("preserves unknown failure diagnostics without making a storage claim", () => {
    const error = normalizeProjectSaveError(new Error("transaction failed"));

    expect(error.kind).toBe("unknown");
    expect(error.message).toBe(
      "Your latest edits could not be saved. Export a recovery copy, then retry."
    );
    expect(error.detail).toBe("transaction failed");
  });

  it("treats pending or newer revisions as unsafe to leave", () => {
    expect(hasUnsavedProjectRevision(0, 0, false)).toBe(false);
    expect(hasUnsavedProjectRevision(1, 0, false)).toBe(true);
    expect(hasUnsavedProjectRevision(1, 1, true)).toBe(true);
    expect(hasUnsavedProjectRevision(2, 1, false)).toBe(true);
    expect(hasUnsavedProjectRevision(2, 2, false)).toBe(false);
  });
});
