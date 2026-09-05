import { createElement, useState, type Dispatch, type SetStateAction } from "react";
import { App } from "@/app/App";
import type {
  OpenSketchApplicationContext,
  OpenSketchApplicationModule,
  OpenSketchHostServices,
  OpenSketchLifecycleState,
  OpenSketchModuleManifest,
  RenderHandle
} from "@/application/hostServices";
import { OpenSketchHostProvider } from "@/application/hostServices";

export const OPENSKETCH_MODULE_MANIFEST: OpenSketchModuleManifest = {
  id: "opensketch",
  displayName: "OpenSketch",
  version: "0.1.0",
  contractVersion: "1.0.0",
  entry: "OpenSketchApplication",
  stylesheetEntry: "./styles/app.css",
  assetManifestEntry: "./assets/manifest.json",
  peerDependencies: {
    react: "^19.0.0",
    "react-dom": "^19.0.0"
  },
  capabilities: [
    "project-library",
    "scientific-editor",
    "portable-projects",
    "asset-provenance",
    "offline-assets",
    "semantic-commands"
  ]
};

interface MountedApplicationProps {
  services: OpenSketchHostServices;
  initialContext: OpenSketchApplicationContext;
  registerContextSetter: (setter: Dispatch<SetStateAction<OpenSketchApplicationContext>>) => void;
  onLifecycleStateChange: (state: Partial<OpenSketchLifecycleState>) => void;
}

function MountedApplication({
  services,
  initialContext,
  registerContextSetter,
  onLifecycleStateChange
}: MountedApplicationProps) {
  const [context, setContext] = useState(initialContext);
  registerContextSetter(setContext);
  return createElement(
    OpenSketchHostProvider,
    { services },
    createElement(App, {
      services,
      initialContext: context,
      onLifecycleStateChange
    })
  );
}

export { App as OpenSketchApplication };

export function createOpenSketchModule(
  services: OpenSketchHostServices
): OpenSketchApplicationModule {
  let renderHandle: RenderHandle | undefined;
  let contextSetter: Dispatch<SetStateAction<OpenSketchApplicationContext>> | undefined;
  let state: OpenSketchLifecycleState = {
    phase: "unmounted",
    busy: false,
    dirty: false,
    closeBlocked: false
  };

  const updateLifecycleState = (patch: Partial<OpenSketchLifecycleState>) => {
    state = { ...state, ...patch };
  };

  return {
    manifest: OPENSKETCH_MODULE_MANIFEST,
    mount(container, initialContext = {}) {
      if (state.phase !== "unmounted") {
        throw new Error("The OpenSketch application module is already mounted.");
      }
      if (!(container instanceof HTMLElement)) {
        throw new Error("OpenSketch requires an HTMLElement mount container.");
      }
      state = {
        ...state,
        ...initialContext,
        phase: "mounted",
        busy: true
      };
      try {
        renderHandle = services.render(
          container,
          createElement(MountedApplication, {
            services,
            initialContext,
            registerContextSetter: (setter) => {
              contextSetter = setter;
            },
            onLifecycleStateChange: updateLifecycleState
          })
        );
      } catch (reason) {
        state = { ...state, phase: "unmounted", busy: false };
        throw reason;
      }
    },
    updateContext(contextPatch) {
      if (state.phase === "unmounted") {
        throw new Error("The OpenSketch application module is not mounted.");
      }
      state = { ...state, ...contextPatch };
      contextSetter?.((current) => ({ ...current, ...contextPatch }));
    },
    getLifecycleState() {
      return { ...state };
    },
    suspend() {
      if (state.phase !== "mounted") return;
      state = { ...state, phase: "suspended" };
      renderHandle?.setSuspended?.(true);
    },
    resume() {
      if (state.phase !== "suspended") return;
      state = { ...state, phase: "mounted" };
      renderHandle?.setSuspended?.(false);
    },
    async requestClose() {
      if (state.phase === "unmounted") return { allowed: false, reason: "unmounted" };
      if (!state.dirty && !state.closeBlocked) return { allowed: true };
      const confirmed = await Promise.resolve(
        services.dialogs.confirm("There are unsaved OpenSketch changes. Close anyway?")
      );
      return confirmed ? { allowed: true } : { allowed: false, reason: "cancelled" };
    },
    async unmount() {
      if (state.phase === "unmounted") return;
      const handle = renderHandle;
      renderHandle = undefined;
      contextSetter = undefined;
      if (handle) await handle.unmount();
      state = {
        phase: "unmounted",
        busy: false,
        dirty: false,
        closeBlocked: false
      };
    }
  };
}
