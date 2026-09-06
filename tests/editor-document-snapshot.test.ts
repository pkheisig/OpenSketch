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
