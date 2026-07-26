# Architecture

OpenSketch is an R package containing a precompiled static web application.

## Runtime boundary

The R function `opensketch()` serves `inst/app/` on loopback using `httpuv`.
The server only maps request paths to bundled files and supplies a restrictive
content security policy. It has no project routes, authentication, telemetry, or
network proxy.

The browser owns all state:

- Fabric.js owns the live scene.
- A bounded 120-snapshot history provides undo and redo.
- Meaningful scene changes debounce into Dexie/IndexedDB after 500 ms.
- User uploads are stored as data URLs inside the project record.
- `.opensketch` is versioned JSON and passes through an explicit migration gate.

## Source layout

`packages/editor-core` contains data contracts, canvas presets, search normalization,
and project migrations. It has no browser or Fabric dependency.

`apps/web/src/editor/EditorContext.tsx` is the editor service boundary. React panels
invoke semantic operations such as `addAsset`, `align`, `replaceColor`, and
`exportSvg`; panels do not manipulate the Fabric canvas directly except for layer
selection.

`scripts/assets` is development-only Node code. It is deliberately not imported by
the browser bundle.

## Persistence contract

Project records include the format marker and version, project timestamps, canvas
settings, serialized Fabric scene, embedded user uploads, and used built-in asset
IDs. Built-in artwork is referenced by stable manifest ID and remains part of the
application bundle.

Future format changes must add a migration in
`packages/editor-core/src/migrations.ts` before increasing the format version.

## Export

SVG is the canonical vector export. Fabric emits the scene SVG; OpenSketch injects
an accessible title, optional description, generator information, used asset IDs,
and the global NIH BioArt credit into `<metadata>`.

PNG is rendered from a neutral logical viewport so editor zoom never changes
output dimensions. Preset or custom pixel scaling is accompanied by a valid PNG
physical-resolution (`pHYs`) chunk. PDF should consume SVG rather than rasterizing
the scene when it is added.
