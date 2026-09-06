import { describe, expect, it } from "vitest";

import {
  cloneCanvasSettings,
  createDocumentSnapshot,
  documentSnapshotsEqual,
  estimateDocumentSnapshotBytes,
  type EditorDocumentSnapshot
} from "../apps/web/src/editor/documentSnapshot";

const canvasSettings = () => ({
  width: 800,
  height: 600,
  unit: "px" as const,
  dpi: 96,
  background: "#ffffff",
  transparent: false,
  grid: false,
  doubleClickCreatesText: true
});

describe("editor document snapshots", () => {
  it("clones settings so later mutations cannot change a captured checkpoint", () => {
    const settings = canvasSettings();
    const clone = cloneCanvasSettings(settings);

    settings.width = 1024;

    expect(clone.width).toBe(800);
  });

  it("freezes the scene/settings envelope at its capture boundary", () => {
    const snapshot = createDocumentSnapshot("scene", canvasSettings());

    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.canvasSettings)).toBe(true);
  });

  it("preserves persistent layout state when cloning a checkpoint", () => {
    const layout = {
      version: 1 as const,
      frames: [
        {
          id: "frame",
          bounds: { left: 0, top: 0, width: 100, height: 100 },
          flow: "free" as const,
          padding: { top: 0, right: 0, bottom: 0, left: 0 },
          gap: { horizontal: 0, vertical: 0 },
          overflow: "visible" as const,
          children: [{ objectId: "object", sizing: "content-sized" as const }]
        }
      ]
    };
    const snapshot = createDocumentSnapshot("scene", canvasSettings(), layout);
    const clone = structuredClone(snapshot);

    expect(clone.layout).toEqual(snapshot.layout);
    expect(clone.layout).not.toBe(snapshot.layout);
  });

  it("distinguishes scene, settings, and true no-op snapshots", () => {
    const first: EditorDocumentSnapshot = {
      scene: '{"objects":[]}',
      canvasSettings: canvasSettings()
    };
    const same = {
      scene: first.scene,
      canvasSettings: cloneCanvasSettings(first.canvasSettings)
    };
    const changedSettings = {
      scene: first.scene,
      canvasSettings: { ...first.canvasSettings, width: 1024 }
    };
    const changedScene = { ...first, scene: '{"objects":[{}]}' };

    expect(documentSnapshotsEqual(first, same)).toBe(true);
    expect(documentSnapshotsEqual(first, changedSettings)).toBe(false);
    expect(documentSnapshotsEqual(first, changedScene)).toBe(false);
  });

  it("includes persistent layout state in history equality and byte accounting", () => {
    const layout = {
      version: 1 as const,
      frames: [
        {
          id: "frame",
          bounds: { left: 0, top: 0, width: 100, height: 100 },
          flow: "free" as const,
          padding: { top: 0, right: 0, bottom: 0, left: 0 },
          gap: { horizontal: 0, vertical: 0 },
          overflow: "visible" as const,
          children: [{ objectId: "object", sizing: "content-sized" as const }]
        }
      ]
    };
    const first = createDocumentSnapshot("scene", canvasSettings(), layout);
    const same = createDocumentSnapshot("scene", canvasSettings(), structuredClone(layout));
    const changed = createDocumentSnapshot("scene", canvasSettings(), {
      ...layout,
      frames: [{ ...layout.frames[0], id: "changed" }]
    });

    expect(documentSnapshotsEqual(first, same)).toBe(true);
    expect(documentSnapshotsEqual(first, changed)).toBe(false);
    expect(estimateDocumentSnapshotBytes(first)).toBe(
      256 +
        (first.scene.length +
          JSON.stringify(first.canvasSettings).length +
          JSON.stringify(first.layout).length) *
          2
    );
  });

  it("accounts for both scene and settings bytes", () => {
    const snapshot: EditorDocumentSnapshot = {
      scene: "scene",
      canvasSettings: canvasSettings()
    };

    expect(estimateDocumentSnapshotBytes(snapshot)).toBe(
      256 + (snapshot.scene.length + JSON.stringify(snapshot.canvasSettings).length) * 2
    );
  });
});
