import type { SemanticRuntime } from "./semanticRuntime";

export interface OpenSketchSemanticIntrospection {
  readonly runtimeVersion: SemanticRuntime["version"];
  listCommands: SemanticRuntime["listCommands"];
  getCapabilities: SemanticRuntime["getCapabilities"];
  execute: SemanticRuntime["execute"];
}

declare global {
  interface Window {
    __OPENSKETCH_SEMANTIC__?: OpenSketchSemanticIntrospection;
  }
}

/** Install a narrow, development-only inspection surface for browser tests. */
export function installSemanticIntrospection(runtime: SemanticRuntime): () => void {
  if (!import.meta.env.DEV || typeof window === "undefined") return () => undefined;
  const surface: OpenSketchSemanticIntrospection = Object.freeze({
    runtimeVersion: runtime.version,
    listCommands: runtime.listCommands,
    getCapabilities: runtime.getCapabilities,
    execute: runtime.execute
  });
  window.__OPENSKETCH_SEMANTIC__ = surface;
  return () => {
    if (window.__OPENSKETCH_SEMANTIC__ === surface) delete window.__OPENSKETCH_SEMANTIC__;
  };
}
