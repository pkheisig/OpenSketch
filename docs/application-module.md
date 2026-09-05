# OpenSketch application module

OpenSketch exposes the complete product as `createOpenSketchModule(services)`. The
module owns the Home screen, editor, semantic editor adapters, and application
lifecycle. The standalone PWA owns the page root, ReactDOM root, standalone page
styles, font declarations, service-worker registration, browser persistence, and
browser delivery adapters.

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

## OpenSuite presentation contract

The manifest publishes `uiContractVersion: "0.1.0-bootstrap"`. A host may pass
`mode: "opensuite"` to `mount` and later `updateContext` with the host theme,
density, reduced-motion preference, and explicit ownership. Hosted OpenSketch
maps the public `--suite-*` semantic tokens to its existing module tokens and
renders menus and dialogs below the themed application or host-provided
`portalRootId`.

In hosted mode the default owner of global chrome, theme controls, updating, and
shutdown is the host. The module retains project navigation, document editing,
save/recovery, export, asset provenance, and scientific workspace controls. A
host can opt a surface back into module ownership through `ownership` with the
value `"module"`. Standalone mode keeps the existing local theme preference,
service-worker update flow, page metadata, and browser root behavior.

General controls use the module's approved native/CSS primitive surface
(`.button`, `.icon-button`, `.text-button`, `.ui-select-trigger`, menus, and
dialogs). Canvas-specific menus may carry their own geometry, but remain inside
the themed portal root and inherit the same focus, state, and motion semantics.
`scripts/check-primitive-usage.mjs` rejects direct body portals and newly added
unclassified controls.

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
| PWA          | `pwa` service and `main.tsx`                                                        | Same update-ready and apply-update behavior; hosted updates stay host-owned               |
| Fonts        | `fonts` service and `main.tsx`                                                      | Same global font declarations and editor/PDF font warming                                 |

No visual redesign, format migration, data repair policy change, or scientific
behavior change is part of this extraction. Visual verification and parity
evidence remain validation work for the exact implementation head.
