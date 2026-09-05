/* global process */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const output = process.argv[2];
if (!output) throw new Error("Usage: write-module-types.mjs <output-path>");

const declaration = `import type { ComponentType, ReactNode } from "react";

export interface RenderHandle {
  unmount(): void | Promise<void>;
  setSuspended?(suspended: boolean): void;
}

export interface OpenSketchHostServices {
  render(container: HTMLElement, node: ReactNode): RenderHandle;
  [service: string]: unknown;
}

export interface OpenSketchApplicationContext {
  routePrefix?: string;
  activeProjectId?: string | null;
}

export interface OpenSketchLifecycleState extends OpenSketchApplicationContext {
  phase: "unmounted" | "mounted" | "suspended";
  busy: boolean;
  dirty: boolean;
  closeBlocked: boolean;
}

export interface OpenSketchApplicationModule {
  readonly manifest: OpenSketchModuleManifest;
  mount(container: HTMLElement, initialContext?: OpenSketchApplicationContext): void;
  updateContext(contextPatch: OpenSketchApplicationContext): void;
  getLifecycleState(): OpenSketchLifecycleState;
  suspend(): void;
  resume(): void;
  requestClose(): Promise<{ allowed: boolean; reason?: string }>;
  unmount(): Promise<void>;
}

export interface OpenSketchModuleManifest {
  schemaVersion: 1;
  id: "opensketch";
  displayName: "OpenSketch";
  version: string;
  contractVersion: "1.0.0";
  entry: "OpenSketchApplication";
  stylesheetEntry: string;
  assetManifestEntry: string;
  editorCore: {
    packageName: "@workspace/editor-core";
    version: string;
    projectFormatVersion: number;
  };
  compatibility: {
    openSuiteContractVersion: string;
    react: string;
    "react-dom": string;
  };
  peerDependencies: { react: string; "react-dom": string };
  capabilities: readonly string[];
}

export declare const OPENSKETCH_MODULE_MANIFEST: OpenSketchModuleManifest;
export declare const OpenSketchApplication: ComponentType<unknown>;
export declare function createOpenSketchModule(
  services: OpenSketchHostServices
): OpenSketchApplicationModule;
`;

const outputPath = resolve(output);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, declaration, "utf8");
