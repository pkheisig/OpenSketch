# OpenSketch application module

OpenSketch exposes the complete product as `createOpenSketchModule(services)`. The
module owns the Home screen, editor, semantic editor adapters, and application
lifecycle. The standalone PWA owns the page root, ReactDOM root, global styles,
font declarations, service-worker registration, browser persistence, and browser
delivery adapters.

## Contract

`OpenSketchModuleManifest.contractVersion` is `1.0.0`. The manifest identifies the
entry point as `OpenSketchApplication` and declares React and ReactDOM as peer
dependencies for hosts that provide the runtime. The public lifecycle is:

- `mount(container, initialContext?)`
- `updateContext(contextPatch)`
- `suspend()` / `resume()`
- `requestClose()`
- `unmount()`

The module does not create a ReactDOM root, import the PWA service-worker module,
register page-global listeners at import time, construct IndexedDB at import time,
or mutate `window.localStorage` at import time. Browser-backed behavior is
provided by `OpenSketchHostServices`.

## Host services

Hosts provide project and imported-media repositories, templates, portable project
file access, export delivery, asset manifest/resource loading, preferences,
navigation, dialogs, clipboard, PWA update handling, fonts, time/UUID generation,
and the render seam. The standalone adapter in `standaloneHost.ts` preserves the
current browser behavior and persistence formats.

Unsupported host capabilities fail through the service promise or explicit error;
the application does not silently substitute a different persistence or export
path.

## Standalone parity inventory

The extraction is intended to preserve these observable contracts:

| Area         | Standalone owner                                                                    | Module behavior                                                                           |
| ------------ | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Home/library | `projects`, `files`, `dialogs`, `navigation` services                               | Same project, folder, archive, rename, duplicate, delete, import, and export flows        |
| Editor       | Existing `EditorProvider`, `HomeScreen`, `EditorStudio`, and `CanvasWorkspace`      | Same controls, defaults, keyboard commands, semantic commands, and canvas data            |
| Persistence  | `projectRepository`, `importedMediaRepository`, `templateRepository`, `preferences` | Same IndexedDB/local-storage keys and records in the standalone host                      |
| Assets       | `offlineAssetService`                                                               | Same manifest, variant selection, lazy SVG loading, provenance, and offline-pack behavior |
| Exports      | `files` and `exports` services                                                      | Same project/SVG/PDF/PNG/credits bytes; standalone delivery still downloads files         |
| PWA          | `pwa` service and `main.tsx`                                                        | Same update-ready and apply-update behavior, owned by the standalone host                 |
| Fonts        | `fonts` service and `main.tsx`                                                      | Same global font declarations and editor/PDF font warming                                 |

No visual redesign, format migration, data repair policy change, or scientific
behavior change is part of this extraction. Visual verification and parity
evidence remain validation work for the exact implementation head.
