import { act, cleanup, render, waitFor } from "@testing-library/react";
import { ActiveSelection, Rect, type FabricObject } from "../apps/web/node_modules/fabric/index.js";
import { createElement } from "../apps/web/node_modules/react/index.js";
import type { ProjectRecord } from "@workspace/editor-core";
import {
  OpenSketchHostProvider,
  type OpenSketchHostServices
} from "../apps/web/src/application/hostServices";
import {
  EditorProvider,
  type EditorContextValue,
  useEditor
} from "../apps/web/src/editor/EditorContext";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const writeSystemClipboard = vi.hoisted(() => vi.fn());

vi.mock("@/editor/selectionClipboard", () => ({
  SELECTION_CLIPBOARD_MARKER_PREFIX: "OpenSketch selection:",
  writeSelectionToSystemClipboard: writeSystemClipboard
}));

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function project(): ProjectRecord {
  return {
    format: "OpenSketch",
    formatVersion: 1,
    version: 1,
    id: "document-1",
    name: "Cut transaction test",
    createdAt: "2026-09-06T00:00:00.000Z",
    updatedAt: "2026-09-06T00:00:00.000Z",
    canvas: {
      width: 240,
      height: 180,
      unit: "px",
      dpi: 96,
      background: "#ffffff",
      transparent: false,
      grid: false,
      doubleClickCreatesText: false
    },
    objects: { version: "7.0.0", objects: [] },
    uploads: [],
    usedAssetIds: []
  };
}

function services(): OpenSketchHostServices {
  let uuid = 0;
  const storageValues = new Map<string, string>();
  const noOp = async () => undefined;
  return {
    render: vi.fn(() => ({ unmount: vi.fn() })),
    projects: {
      subscribeChanges: () => () => undefined,
      list: async () => [],
      get: async () => undefined,
      save: noOp,
      saveThumbnail: async () => undefined,
      create: () => project(),
      delete: noOp,
      duplicate: async (value) => ({ ...value }),
      moveToFolder: noOp,
      listFolders: async () => [],
      createFolder: async (name) => ({
        id: "folder-1",
        name,
        createdAt: "2026-09-06T00:00:00.000Z",
        updatedAt: "2026-09-06T00:00:00.000Z"
      }),
      saveFolder: noOp,
      deleteFolder: noOp
    },
    importedMedia: {
      list: async () => [],
      get: async () => undefined,
      save: async (media) => ({
        ...media,
        createdAt: "2026-09-06T00:00:00.000Z",
        updatedAt: "2026-09-06T00:00:00.000Z",
        contentHash: "test"
      }),
      remember: noOp,
      delete: noOp
    },
    templates: {
      list: async () => [],
      get: async () => undefined,
      save: async (template) => template,
      delete: noOp
    },
    files: {
      readProject: async () => ({ project: project(), warnings: [] }),
      downloadProject: vi.fn(),
      saveProject: async () => true
    },
    exports: { deliver: noOp },
    assets: {
      getManifest: async () => ({
        version: 1,
        generatedAt: "2026-09-06T00:00:00.000Z",
        source: "test",
        families: []
      }),
      getVersion: async () => "test",
      loadText: async () => "",
      loadBlob: async () => new Blob(),
      resolveVariant: (_family, variant) => variant
    },
    preferences: {
      get: (key) => storageValues.get(key) ?? null,
      set: (key, value) => storageValues.set(key, value),
      remove: (key) => storageValues.delete(key),
      storage: {
        getItem: (key) => storageValues.get(key) ?? null,
        setItem: (key, value) => storageValues.set(key, value)
      },
      theme: {
        get: () => "light",
        set: vi.fn(),
        apply: vi.fn()
      }
    },
    navigation: {
      currentProjectId: () => null,
      entryIndex: () => 0,
      ensureEntryIndex: vi.fn(),
      pushProject: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      go: vi.fn(),
      subscribe: () => () => undefined
    },
    dialogs: { confirm: () => true, prompt: () => null },
    clipboard: { write: vi.fn(async () => undefined) },
    pwa: {
      isUpdateReady: () => false,
      onUpdateReady: () => () => undefined,
      applyUpdate: vi.fn()
    },
    fonts: {
      available: () => false,
      ready: async () => undefined,
      load: async () => undefined
    },
    clock: {
      now: () => "2026-09-06T00:00:00.000Z",
      randomUUID: () => `uuid-${++uuid}`
    }
  } as unknown as OpenSketchHostServices;
}

function EditorProbe({ onEditor }: { onEditor: (editor: EditorContextValue) => void }) {
  onEditor(useEditor());
  return null;
}

async function renderEditor() {
  const host = services();
  const onProjectChange = vi.fn(async () => undefined);
  let navigationGuard: (() => boolean) | null = null;
  const onNavigationGuardChange = vi.fn((guard: (() => boolean) | null) => {
    navigationGuard = guard;
  });
  let editor: EditorContextValue | undefined;
  const view = render(
    createElement(
      OpenSketchHostProvider,
      { services: host },
      createElement(
        EditorProvider,
        {
          project: project(),
          onProjectChange,
          onRequestExit: () => true,
          onNavigationGuardChange
        },
        createElement(EditorProbe, { onEditor: (value) => (editor = value) })
      )
    )
  );
  await waitFor(() => expect(editor).toBeDefined());
  const canvasElement = document.createElement("canvas");
  await act(async () => {
    editor!.setCanvasElement(canvasElement);
  });
  await waitFor(() => expect(editor?.canvasReady).toBe(true));
  return {
    editor: editor!,
    getEditor: () => editor!,
    navigationGuard: () => navigationGuard,
    view,
    onProjectChange
  };
}

function object(id: string, left: number): Rect {
  const value = new Rect({ left, top: 40, width: 30, height: 20 });
  value.objectId = id;
  value.name = id;
  value.OpenSketchType = "shape";
  return value;
}

function addObjects(editor: EditorContextValue, ...objects: FabricObject[]) {
  const canvas = editor.canvas!;
  act(() => {
    canvas.add(...objects);
    canvas.requestRenderAll();
  });
}

function selectObjects(editor: EditorContextValue, ...objects: FabricObject[]) {
  const canvas = editor.canvas!;
  act(() => {
    const active = objects.length === 1 ? objects[0] : new ActiveSelection(objects, { canvas });
    canvas.setActiveObject(active);
    canvas.requestRenderAll();
  });
}

beforeEach(() => {
  window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  }) as typeof window.requestAnimationFrame;
  window.cancelAnimationFrame = (() => undefined) as typeof window.cancelAnimationFrame;
  writeSystemClipboard.mockReset();
  writeSystemClipboard.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("EditorProvider asynchronous cut transactions", () => {
  it("removes the captured object when selection changes during deferred clipboard work", async () => {
    const { editor, getEditor } = await renderEditor();
    const canvas = editor.canvas!;
    const original = object("original", 30);
    const newerSelection = object("newer-selection", 120);
    addObjects(editor, original, newerSelection);
    selectObjects(editor, original);

    const systemClone = deferred<FabricObject>();
    const internalClone = deferred<FabricObject>();
    const systemWrite = deferred<void>();
    vi.spyOn(original, "clone")
      .mockImplementationOnce(() => systemClone.promise)
      .mockImplementationOnce(() => internalClone.promise);
    writeSystemClipboard.mockImplementationOnce(() => systemWrite.promise);

    let cut!: Promise<void>;
    act(() => {
      cut = editor.copySelectionToClipboard("png", true);
    });
    selectObjects(editor, newerSelection);

    await act(async () => {
      systemClone.resolve(object("system-copy", 30));
      internalClone.resolve(object("internal-copy", 30));
      await Promise.resolve();
    });
    await waitFor(() => expect(writeSystemClipboard).toHaveBeenCalledOnce());
    systemWrite.resolve();
    await act(async () => {
      await cut;
    });

    expect(canvas.getObjects()).toEqual([newerSelection]);
    expect(canvas.getActiveObject()).toBe(newerSelection);
    await waitFor(() => expect(getEditor().selection).toEqual([newerSelection]));
  });

  it("cancels rather than deleting a target changed during deferred clipboard work", async () => {
    const { editor } = await renderEditor();
    const canvas = editor.canvas!;
    const original = object("original", 30);
    const newerSelection = object("newer-selection", 120);
    addObjects(editor, original, newerSelection);
    selectObjects(editor, original);

    const systemClone = deferred<FabricObject>();
    const internalClone = deferred<FabricObject>();
    vi.spyOn(original, "clone")
      .mockImplementationOnce(() => systemClone.promise)
      .mockImplementationOnce(() => internalClone.promise);

    let cut!: Promise<void>;
    act(() => {
      cut = editor.copySelectionToClipboard("png", true);
    });
    original.set({ left: 75 });
    selectObjects(editor, newerSelection);

    await act(async () => {
      systemClone.resolve(object("system-copy", 30));
      internalClone.resolve(object("internal-copy", 30));
      await cut;
    });

    expect(canvas.getObjects()).toEqual([original, newerSelection]);
    expect(writeSystemClipboard).not.toHaveBeenCalled();
  });

  it("does not delete the old cut target when a newer copy takes ownership", async () => {
    const { editor } = await renderEditor();
    const canvas = editor.canvas!;
    const original = object("original", 30);
    const newerSelection = object("newer-selection", 120);
    addObjects(editor, original, newerSelection);
    selectObjects(editor, original);

    const originalSystemClone = deferred<FabricObject>();
    const originalInternalClone = deferred<FabricObject>();
    vi.spyOn(original, "clone")
      .mockImplementationOnce(() => originalSystemClone.promise)
      .mockImplementationOnce(() => originalInternalClone.promise);
    let cut!: Promise<void>;
    act(() => {
      cut = editor.copySelectionToClipboard("png", true);
    });

    selectObjects(editor, newerSelection);
    const newerSystemClone = deferred<FabricObject>();
    const newerInternalClone = deferred<FabricObject>();
    vi.spyOn(newerSelection, "clone")
      .mockImplementationOnce(() => newerSystemClone.promise)
      .mockImplementationOnce(() => newerInternalClone.promise);
    let copy!: Promise<void>;
    act(() => {
      copy = editor.copySelectionToClipboard("png");
    });

    await act(async () => {
      originalSystemClone.resolve(object("old-system-copy", 30));
      originalInternalClone.resolve(object("old-internal-copy", 30));
      await cut;
    });
    newerSystemClone.resolve(object("new-system-copy", 120));
    newerInternalClone.resolve(object("new-internal-copy", 120));
    await act(async () => {
      await copy;
    });

    expect(canvas.getObjects()).toEqual([original, newerSelection]);
    expect(writeSystemClipboard).toHaveBeenCalledOnce();
    expect(writeSystemClipboard.mock.calls[0][0]).toBeInstanceOf(Rect);
  });

  it("does not delete anything when the internal clipboard clone rejects", async () => {
    const { editor, navigationGuard } = await renderEditor();
    const canvas = editor.canvas!;
    const original = object("original", 30);
    addObjects(editor, original);
    selectObjects(editor, original);

    const systemClone = deferred<FabricObject>();
    const internalClone = deferred<FabricObject>();
    vi.spyOn(original, "clone")
      .mockImplementationOnce(() => systemClone.promise)
      .mockImplementationOnce(() => internalClone.promise);
    let cut!: Promise<void>;
    act(() => {
      cut = editor.copySelectionToClipboard("png", true);
    });
    systemClone.resolve(object("system-copy", 30));
    internalClone.reject(new Error("internal clone failed"));

    await expect(cut).rejects.toThrow("internal clone failed");
    expect(canvas.getObjects()).toEqual([original]);
    expect(navigationGuard()?.()).toBe(false);
  });

  it("keeps the internal cut fallback when the system clipboard rejects", async () => {
    const { editor } = await renderEditor();
    const canvas = editor.canvas!;
    const original = object("original", 30);
    addObjects(editor, original);
    selectObjects(editor, original);

    vi.spyOn(original, "clone")
      .mockResolvedValueOnce(object("system-copy", 30))
      .mockResolvedValueOnce(object("internal-copy", 30));
    writeSystemClipboard.mockRejectedValueOnce(new Error("system clipboard denied"));

    await editor.copySelectionToClipboard("png", true);

    expect(canvas.getObjects()).toEqual([]);
  });
});
