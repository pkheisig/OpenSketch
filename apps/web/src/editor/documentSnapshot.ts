import type { CanvasSettings } from "@workspace/editor-core";

export interface EditorDocumentSnapshot {
  readonly scene: string;
  readonly canvasSettings: Readonly<CanvasSettings>;
}

export const cloneCanvasSettings = (settings: Readonly<CanvasSettings>): CanvasSettings => ({
  width: settings.width,
  height: settings.height,
  unit: settings.unit,
  dpi: settings.dpi,
  background: settings.background,
  transparent: settings.transparent,
  grid: settings.grid,
  doubleClickCreatesText: settings.doubleClickCreatesText
});

export const createDocumentSnapshot = (
  scene: string,
  settings: Readonly<CanvasSettings>
): EditorDocumentSnapshot =>
  Object.freeze({
    scene,
    canvasSettings: Object.freeze(cloneCanvasSettings(settings))
  });

export const cloneDocumentSnapshot = (snapshot: EditorDocumentSnapshot): EditorDocumentSnapshot =>
  createDocumentSnapshot(snapshot.scene, snapshot.canvasSettings);

export const documentSnapshotsEqual = (
  left: EditorDocumentSnapshot | undefined,
  right: EditorDocumentSnapshot | undefined
): boolean => {
  if (!left || !right || left.scene !== right.scene) return false;
  const leftSettings = left.canvasSettings;
  const rightSettings = right.canvasSettings;
  return (
    leftSettings.width === rightSettings.width &&
    leftSettings.height === rightSettings.height &&
    leftSettings.unit === rightSettings.unit &&
    leftSettings.dpi === rightSettings.dpi &&
    leftSettings.background === rightSettings.background &&
    leftSettings.transparent === rightSettings.transparent &&
    leftSettings.grid === rightSettings.grid &&
    leftSettings.doubleClickCreatesText === rightSettings.doubleClickCreatesText
  );
};

const HISTORY_ENTRY_OVERHEAD_BYTES = 256;

export const estimateDocumentSnapshotBytes = (snapshot: EditorDocumentSnapshot): number =>
  HISTORY_ENTRY_OVERHEAD_BYTES +
  (snapshot.scene.length + JSON.stringify(snapshot.canvasSettings).length) * 2;
