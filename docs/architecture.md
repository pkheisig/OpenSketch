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
- Asset favorites and recent selections live in `localStorage`.
- User uploads are stored as data URLs inside the project.
- `.OpenSketch` is versioned JSON and passes through an explicit migration gate.
- SVG, PNG, and PDF exports are calculated and generated locally.
- Direct project-folder writes use the File System Access API when available;
  upload/download paths remain the cross-browser fallback.

The production content security policy limits fetches to the same site origin.
The browser receives only static HTML, JavaScript, CSS, fonts, and bundled
artwork. There are no project routes, accounts, telemetry endpoints, or upload
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

`templates/scientificTemplates.ts` creates starter projects from the same Fabric
objects and connector bindings used by the live editor. Templates are not
flattened images and do not introduce another document format.

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
canvas settings, serialized Fabric scene, embedded user uploads, and used
built-in asset IDs. Built-in artwork uses stable manifest IDs and is bundled
with the application.

Future format changes must add a migration in
`packages/editor-core/src/migrations.ts` before increasing the format version.
The `.OpenSketch` extension and current version-1 project schema remain
compatible with files produced by earlier releases.

## Export

SVG is the canonical vector export. Fabric emits the scene SVG; OpenSketch adds
an accessible title, description, generator, used asset IDs, per-asset
source/author/license records, and global NIH BioArt credit.

PNG is rendered from a neutral logical viewport so editor zoom never changes
output dimensions. Preset or custom pixel scaling receives a valid PNG
physical-resolution (`pHYs`) chunk.

PDF consumes the same generated SVG through `svg2pdf.js` and jsPDF, preserving
supported vector paths and text. Bundled Source Sans 3 fonts keep default text
searchable and visually faithful. PDF properties carry the title, description,
author, generator, and artwork credit.
