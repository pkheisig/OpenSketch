# Architecture

OpenSketch is a static, browser-native web application deployed below the
`/OpenSketch/` GitHub Pages repository path. Production has no application
server or server-side API.

## Runtime boundary

The browser owns all application behavior and state:

- Fabric.js owns the live scene.
- A bounded 120-snapshot history provides undo and redo.
- Meaningful scene changes debounce into Dexie/IndexedDB after 500 ms.
- Canvas settings live in the project record.
- Asset favorites, recent selections, and project-scoped viewport focal points
  live in `localStorage`.
- Imported media is stored as data URLs inside the project.
- `.OpenSketch` is versioned JSON and passes through an explicit migration gate.
- SVG, PNG, and PDF exports are calculated and generated locally.
- Project and figure exports use browser-generated downloads, while project and
  media imports use browser file pickers.

The production content security policy limits fetches to the same site origin.
The browser receives only static HTML, JavaScript, CSS, fonts, and bundled
artwork. There are no project routes, accounts, telemetry endpoints, or media-transfer
services.

## Source layout

`packages/editor-core` contains data contracts, canvas presets, search
normalization, and project migrations. It has no browser or Fabric dependency.

`apps/web/src/editor/EditorContext.tsx` is the editor service boundary. React
panels invoke semantic operations such as `addAsset`, `align`, `replaceColor`,
and `exportSvg`; panels do not manipulate the Fabric canvas directly except for
layer selection.

Pure geometry and color transforms live in
`apps/web/src/editor/geometry.ts` and `colors.ts`, while `connectors.ts` owns
connector construction and Manhattan route search. Attached connectors are
serialized Fabric groups carrying versioned bindings to stable object IDs.

## SVG scene model

Multi-element built-in and imported SVGs are serialized as Fabric groups.
Their child primitives receive stable IDs and retain their source fills,
strokes, gradients, blend modes, and transforms. A normal selection operates on
the complete group. Per-pixel double-click hit testing selects the innermost
painted child under the pointer so the inspector can edit that part without
ungrouping the asset. Child edits remain nested in the parent group and
therefore survive history, IndexedDB saves, `.OpenSketch` round-trips, and
vector export.

The editable boundary follows the source SVG structure. A compound `<path>` is
one source element even if it draws several disconnected regions; OpenSketch
does not split its geometry heuristically because doing so would alter the
source artwork.

`scripts/assets` is maintainer-only Node code. It is deliberately excluded from
the browser bundle and normal production build.

## Hosting and offline model

Vite emits `dist/` with `base: "/OpenSketch/"`. GitHub Actions validates the
source, builds the site, runs browser tests, and deploys only that directory
through the GitHub Pages artifact mechanism.

The generated Workbox service worker precaches the app shell, compiled chunks,
fonts, thumbnails, and full built-in SVG library. A completed first visit
therefore supports offline reopening without substituting or omitting editor
features. IndexedDB and Cache Storage are origin-scoped and never sent to the
deployment workflow.

## Persistence contract

Project records include the format marker and version, project timestamps,
canvas settings, serialized Fabric scene, embedded imported media, and used
built-in asset IDs. Built-in artwork uses stable manifest IDs and is bundled
with the application.

The IndexedDB library adds local-only `folderId`, `archivedAt`, and folder
records for organization on the project home. Those fields are deliberately
removed from `.OpenSketch` exports: folders and archive state organize the local
library without changing the portable scientific document.

The version-1 JSON key for imported media remains `uploads` solely for backward
compatibility with existing `.OpenSketch` files; the interface and current code
refer to the feature as importing media.

Portable files pass through a strict, version-aware validation gate before they
are saved or handed to Fabric. The gate bounds canvas dimensions and area,
scene depth and object count, serialized arrays and strings, connector and
custom metadata, path geometry, supported Fabric object types, and embedded
image data URLs. It also rejects external or executable scene references and
returns an isolated candidate containing only portable fields. A rejected file
therefore cannot change the project library or allocate a renderer for an
untrusted scene.

Future format changes must add a migration in
`packages/editor-core/src/migrations.ts` before increasing the format version.
The `.OpenSketch` extension and current version-1 project schema remain
compatible with files produced by earlier releases.

## Export

SVG is the canonical vector export. Fabric emits the scene SVG; OpenSketch adds
an accessible title, description, generator, used asset IDs, per-asset
source/author/license records, and global NIH BioArt credit.

PNG is rendered from a neutral logical viewport so editor zoom never changes
output dimensions. Exports default to 1200 DPI; the selected 150–1500 DPI
value determines raster scaling and is embedded as a valid PNG
physical-resolution (`pHYs`) chunk.

PDF consumes the same generated SVG through `svg2pdf.js` and jsPDF, preserving
supported vector paths and text. Bundled Source Sans 3 fonts keep default text
searchable and visually faithful. PDF properties carry the title, description,
author, generator, and artwork credit.
