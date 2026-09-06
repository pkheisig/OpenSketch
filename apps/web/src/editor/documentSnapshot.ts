import type { CanvasSettings, LayoutDocument } from "@workspace/editor-core";

export interface EditorDocumentSnapshot {
  readonly scene: string;
  readonly canvasSettings: Readonly<CanvasSettings>;
  readonly layout?: Readonly<LayoutDocument>;
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
  settings: Readonly<CanvasSettings>,
  layout?: Readonly<LayoutDocument>
): EditorDocumentSnapshot =>
  Object.freeze({
    scene,
    canvasSettings: Object.freeze(cloneCanvasSettings(settings)),
    ...(layout === undefined ? {} : { layout: structuredClone(layout) })
  });

export const cloneDocumentSnapshot = (snapshot: EditorDocumentSnapshot): EditorDocumentSnapshot =>
  createDocumentSnapshot(snapshot.scene, snapshot.canvasSettings, snapshot.layout);

export const documentSnapshotsEqual = (
  left: EditorDocumentSnapshot | undefined,
  right: EditorDocumentSnapshot | undefined
): boolean => {
  if (!left || !right || left.scene !== right.scene) return false;
  if (JSON.stringify(left.layout) !== JSON.stringify(right.layout)) return false;
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
  (snapshot.scene.length +
    JSON.stringify(snapshot.canvasSettings).length +
    (snapshot.layout === undefined ? 0 : JSON.stringify(snapshot.layout).length)) *
    2;
