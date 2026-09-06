import { describe, expect, it, vi } from "vitest";
import {
  createOpenSketchModule,
  OPENSKETCH_MODULE_MANIFEST,
  type OpenSketchHostServices
} from "../apps/web/src/application";

function hostFixture() {
  const unmount = vi.fn();
  const render = vi.fn(() => ({ unmount }));
  const host = {
    render,
    projects: {},
    importedMedia: {},
    templates: {},
    files: {},
    exports: {},
    assets: {},
    preferences: {},
    navigation: {},
    dialogs: {},
    clipboard: {},
    pwa: {},
    clock: {}
  } as unknown as OpenSketchHostServices;
  return { host, render, unmount };
}

describe("OpenSketch application module", () => {
  it("publishes a versioned identity without owning a page root", () => {
    expect(OPENSKETCH_MODULE_MANIFEST).toMatchObject({
      schemaVersion: 1,
      id: "opensketch",
      displayName: "OpenSketch",
      contractVersion: "1.0.0",
      uiContractVersion: "0.1.0-bootstrap",
      entry: "OpenSketchApplication",
      stylesheetEntry: "./module/opensketch-module.css",
      assetManifestEntry: "./assets/manifest.json",
      editorCore: {
        packageName: "@workspace/editor-core",
        version: "0.1.0",
        projectFormatVersion: 2
      },
      compatibility: {
        openSuiteContractVersion: "0.1.0-bootstrap",
        react: "^19.0.0",
        "react-dom": "^19.0.0"
      }
    });
    expect(OPENSKETCH_MODULE_MANIFEST).not.toHaveProperty("rootId");
  });

  it("mounts, updates, suspends, resumes, and unmounts through the host seam", async () => {
    const { host, render, unmount } = hostFixture();
    const container = document.createElement("div");
    const module = createOpenSketchModule(host);

    module.mount(container, { routePrefix: "/OpenSketch/" });
    expect(render).toHaveBeenCalledWith(container, expect.anything());
    expect(module.getLifecycleState()).toMatchObject({
      phase: "mounted",
      routePrefix: "/OpenSketch/"
    });

    module.updateContext({ activeProjectId: "project-1" });
    expect(module.getLifecycleState()).toMatchObject({ activeProjectId: "project-1" });

    module.suspend();
    expect(module.getLifecycleState().phase).toBe("suspended");
    module.resume();
    expect(module.getLifecycleState().phase).toBe("mounted");

    await module.unmount();
    expect(unmount).toHaveBeenCalledOnce();
    expect(module.getLifecycleState().phase).toBe("unmounted");
  });
});
