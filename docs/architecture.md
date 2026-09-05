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
- Imported media is stored as project-owned data URLs, with raster scene nodes
  referring to the upload record rather than duplicating its payload.
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

`apps/web/src/editor/EditorContext.tsx` owns the editor implementation and its
single scene-mutation transaction boundary. React panels invoke semantic
operations such as `addAsset`, `align`, `replaceColor`, and `exportSvg`; panels
do not manipulate the Fabric canvas directly except for layer selection.

Panels read through the selector-backed `useEditorFields()` seam rather than
subscribing to the complete editor value. Each panel declares the fields it
renders or commands it invokes, so selection, viewport, save, export, creation,
and object-edit changes invalidate only the relevant readers. The provider
stages one complete snapshot and publishes it after commit; selectors compare
their selected fields shallowly. This is a subscription optimization, not a
second source of truth: Fabric, history, connector refresh, project revisions,
and autosave remain owned by `EditorProvider` and continue through the same
coherent commit path.

`useEditor()` remains as a compatibility hook for internal migration/testing,
but production panels must use `useEditorFields()` with an explicit field list.

The CSS entry point and surface ownership rules are documented in
[`docs/css-architecture.md`](css-architecture.md). `tokens.css` owns semantic
theme values, while the base, home, editor, inspector, canvas, and dialog
modules each own one set of selectors. The production bundle no longer relies
on a global stylesheet followed by a high-specificity theme adapter.

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

Vite emits `dist/` with `base: normalizePublicBase(VITE_PUBLIC_BASE)`, defaulting
to `"/OpenSketch/"`. GitHub Actions validates pull
requests without publishing. Pushes to the canonical release branch (`dev`,
declared in `.github/repository-policy.json`) build the site, run browser
tests, and deploy only that directory through the GitHub Pages artifact
mechanism.

The generated Workbox service worker precaches the app shell and compiled
chunks. Browser and PDF font binaries are fetched into runtime caches when the
corresponding families are used. The built-in SVG and WebP library is
intentionally excluded from the app-shell precache because it is large. The
Assets panel exposes an explicit versioned "Prepare offline library" action that
downloads every required source
and preview into Cache Storage, verifies the complete pack, and only then marks
it ready. A normal first visit therefore supports offline editor reopening; a
complete cold-offline asset workflow requires that explicit preparation to finish
while online. IndexedDB and Cache Storage are origin-scoped and never sent to the
deployment workflow.

## Persistence contract

Project records include the format marker and version, project timestamps,
canvas settings, serialized Fabric scene, embedded imported media, and used
built-in asset IDs. Built-in artwork uses stable manifest IDs and is bundled
with the application.

The IndexedDB library adds a monotonic local `revision`, plus local-only
`folderId`, `archivedAt`, and folder records for organization on the project
home. Project writes compare the caller's revision inside one IndexedDB
transaction and reject stale writers; successful writes publish a small
cross-tab change notice. The revision is never imported from or exported to a
portable file. Folders and archive state are deliberately removed from
`.OpenSketch` exports: they organize the local library without changing the
portable scientific document.
The IndexedDB library adds local-only `folderId`, `archivedAt`, folder records,
and durable saved-template records. Those fields are deliberately
removed from `.OpenSketch` exports: folders and archive state organize the local
library without changing the portable scientific document.

The version-1 JSON key for imported media remains `uploads` solely for backward
compatibility with existing `.OpenSketch` files; the interface and current code
refer to the feature as importing media. Portable JSON is subject to the
shared 100 MiB serialized-project budget and 25 MiB source-media limit. Before
local persistence, unreferenced uploads are removed and raster image sources
are compacted into the upload table. Version-1 portable exports rehydrate those
sources for older loaders, and the current loader also rehydrates them before
Fabric loads a scene. Imports that would exceed the budget fail without
replacing the prior project state.

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
source/author/license records, and global NIH BioArt credit. The per-asset
records come from a versioned, recursively collected provenance manifest, so
manual grouping cannot hide an asset from attribution. The manifest is
deterministically ordered and includes asset/family identity, name, source
URLs/references, author, license, license URL, SPDX identifiers, and
attribution where available.

PNG is rendered from a neutral logical viewport so editor zoom never changes
output dimensions. Exports default to 1200 DPI; the selected 150–1500 DPI
value determines raster scaling and is embedded as a valid PNG
physical-resolution (`pHYs`) chunk. The same manifest is written as an
uncompressed UTF-8 `iTXt` chunk with the `OpenSketch:provenance` keyword. Before
Fabric allocates a raster canvas, the export path rejects requests above the
conservative single-canvas budget of 8,192 pixels per side or 64 million total
pixels. The export dialog marks those DPI choices unavailable and explains
that a lower DPI or SVG/PDF export is required; this does not change the
persisted project format or vector export behavior.

PDF consumes the same generated SVG through `svg2pdf.js` and jsPDF, preserving
supported vector paths and text. A canonical editor/PDF font registry maps each
selectable family, weight, and style to merged bundled TrueType faces; the
system-only Georgia choice maps explicitly to bundled Noto Serif. PDF properties
carry the title, description, optional document author, OpenSketch creator, and
artwork credit. The document author is absent unless explicitly supplied, while
asset authors remain in the provenance manifest. Atkinson Hyperlegible and Lato
have no native 600 face in the bundled distribution, so that editor choice maps
to their 700 face, matching browser font selection. Imported CSS font shorthand,
relative weights, and inherited styles are resolved before PDF rendering. Each
text run is checked against its embedded font; export fails clearly rather than
silently dropping missing glyphs or emitting scripts that require OpenType
shaping. Only the faces used by text runs are registered and passed to each
jsPDF conversion. Browser and PDF font binaries are runtime-cached after use
rather than included in the app-shell precache, keeping normal installation
small; while online, the editor warms each PDF face used by the current project
so later offline export does not require a prior export. A
standards-compatible XMP packet carries the canonical manifest. Georgia remains
a system-only editor choice, so its Noto Serif mapping is deterministic but may
not be pixel-identical to every installed Georgia; mixed or wrapped Georgia
layouts should receive the same visual review as any substituted face. Journal and
image-processing workflows may
discard format metadata, so the Export dialog also provides a human-readable
`.txt` credits sidecar containing the same source, author, license, and
attribution records.
