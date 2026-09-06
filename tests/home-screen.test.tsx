import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "../apps/web/node_modules/react/index.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectTemplateRecord } from "../packages/editor-core/src";
import {
  OpenSketchHostProvider,
  type OpenSketchHostServices
} from "../apps/web/src/application/hostServices";
import { HomeScreen } from "../apps/web/src/components/HomeScreen";

const services = {
  preferences: {
    get: () => null,
    set: vi.fn(),
    remove: vi.fn()
  }
} as unknown as OpenSketchHostServices;

const template: ProjectTemplateRecord = {
  id: "template-1",
  name: "Cell figure",
  kind: "figure",
  project: {
    format: "OpenSketch",
    formatVersion: 2,
    version: 1,
    kind: "figure",
    id: "snapshot-1",
    name: "Cell figure",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    canvas: {
      width: 100,
      height: 100,
      unit: "px",
      dpi: 96,
      background: "#fff",
      transparent: false,
      grid: false,
      doubleClickCreatesText: true
    },
    objects: { version: "7.0.0", objects: [] },
    uploads: [],
    usedAssetIds: []
  },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  schemaVersion: 1
};

function renderHome(
  onNew: (kind: "diagram" | "figure" | "poster", selected?: ProjectTemplateRecord) => void,
  projectTemplates: ProjectTemplateRecord[] = []
) {
  return render(
    createElement(
      OpenSketchHostProvider,
      { services },
      createElement(HomeScreen, {
        projects: [],
        folders: [],
        projectTemplates,
        theme: "light",
        onToggleTheme: vi.fn(),
        showThemeControl: false,
        showBrand: false,
        onNew,
        onNewFolder: vi.fn(),
        onOpen: vi.fn(),
        onDuplicate: vi.fn(),
        onDelete: vi.fn(),
        onExport: vi.fn(),
        onArchive: vi.fn(),
        onRestore: vi.fn(),
        onMoveProject: vi.fn(),
        onRenameFolder: vi.fn(),
        onDeleteFolder: vi.fn(),
        onRename: vi.fn(),
        onImport: vi.fn()
      })
    )
  );
}

describe("HomeScreen project modes", () => {
  afterEach(cleanup);

  it("offers exactly the three modes and opens a blank project directly", () => {
    const onNew = vi.fn();
    renderHome(onNew);

    fireEvent.click(screen.getByRole("button", { name: /new project/i }));
    expect(screen.getByRole("menuitem", { name: "Diagram" })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: "Figure" })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: "Poster" })).toBeVisible();
    expect(screen.getAllByRole("menuitem")).toHaveLength(3);

    fireEvent.click(screen.getByRole("menuitem", { name: "Poster" }));
    expect(onNew).toHaveBeenCalledWith("poster");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("shows mode-scoped templates after mode selection", () => {
    const onNew = vi.fn();
    renderHome(onNew, [template]);

    fireEvent.click(screen.getByRole("button", { name: /new project/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Figure" }));
    expect(screen.getByRole("menuitem", { name: "Blank" })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: "Cell figure" })).toBeVisible();
    expect(screen.queryByRole("menuitem", { name: "Diagram" })).toBeNull();

    fireEvent.click(screen.getByRole("menuitem", { name: "Cell figure" }));
    expect(onNew).toHaveBeenCalledWith("figure", template);
  });
});
