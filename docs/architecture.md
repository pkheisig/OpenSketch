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

Pure geometry and color transforms live in `apps/web/src/editor/geometry.ts` and
`colors.ts`, while `connectors.ts` owns connector construction and Manhattan route
search. This keeps snapping, anchor resolution, gradient-aware effects, and
collision-aware connector rendering independently testable. Attached connectors
are ordinary serialized Fabric groups carrying a versioned binding to stable
object IDs.

`templates/scientificTemplates.ts` creates starter projects from the same Fabric
objects and connector bindings used by the live editor. Templates are not
flattened images and do not introduce a separate document format.

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
per-asset source/author/license records, and the global NIH BioArt credit into
`<metadata>`.

PNG is rendered from a neutral logical viewport so editor zoom never changes
output dimensions. Preset or custom pixel scaling is accompanied by a valid PNG
physical-resolution (`pHYs`) chunk.

PDF consumes that generated SVG through `svg2pdf.js` and jsPDF, retaining
supported vector paths and text instead of rasterizing the page. A local Latin,
Greek, and scientific-script subset of Source Sans 3 is embedded so the default
canvas typography remains searchable and visually faithful. PDF document
properties carry the title, description, author, generator, and global NIH
BioArt credit.
