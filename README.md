# OpenSketch

OpenSketch is an open-source, browser-native scientific figure editor. Use the
hosted application at **[pkheisig.github.io/OpenSketch](https://pkheisig.github.io/OpenSketch/)**.

The editor is a static React 19, TypeScript, Vite, and Fabric.js application with
an offline bundle of public-domain and openly licensed scientific illustrations
from NIAID NIH BioArt, SciDraw, Arcadia Science, and BioIcons (including Servier
Medical Art), plus locally authored
editable top-view plates and culture dishes for experiment layouts. It has no
application server, account system, analytics, or telemetry.

Built-in and imported multi-element SVGs remain grouped as one movable layer.
Double-clicking drills through overlapping and nested groups one hierarchy
level at a time. A visible SVG part can then be edited independently, including
its fill, stroke, opacity, position, scale, and rotation. Press Escape or choose
**Done** to return to the complete asset.

The source code is AGPL-3.0-or-later. Imported artwork retains its original
Public Domain, CC0, CC BY, CC BY-SA, MIT, or BSD status and is not relicensed
under the OpenSketch software license. Per-asset authorship, source, DOI where
available, and license are retained in the manifest and embedded in exported
SVG provenance.

## Privacy and local data

Everything after the static site download happens on the device:

- Projects and canvas settings are stored in browser IndexedDB.
- Editor preferences and project-scoped view state are stored in
  `localStorage`. This includes favorites, recently used assets, preferred
  variants, creation defaults, disclosure states, export DPI, ruler and
  alignment preferences, and each project's last zoom and pan position.
- Imported images are sanitized or decoded locally and embedded in the project.
- SVG, PNG, PDF, and `.OpenSketch` files are generated in the browser.
- No project, image, filename, or project metadata is sent to OpenSketch or any
  other application server.
- The production content security policy blocks runtime network connections
  outside the OpenSketch origin.

Browser storage belongs to the exact site origin. Clearing site data, using
private browsing, or a browser storage eviction can remove local projects.
Export important work as `.OpenSketch` files for durable backups.

## Offline use

OpenSketch is an installable progressive web app. On the first complete visit,
its application shell, fonts, and viewed portions of the bundled art library are
copied to browser
Cache Storage. The home screen reports **Ready offline** when that copy is
available. Afterward the application, saved projects, built-in artwork, and
exports can be reopened without internet access.

The service worker only reads static files from the same GitHub Pages origin.
It never sends user data.

## Browser and file support

The regression suite covers current Chromium, Firefox, and WebKit desktop
engines. Current Chrome, Edge, Firefox, and Safari are supported.

Project import uses the browser file picker and accepts existing version-1
`.OpenSketch` files. Project and figure exports use browser-generated downloads
without requiring direct folder access. Selected canvas elements can also be
copied to another application as PNG or SVG through the browser clipboard;
Cmd/Ctrl+C defaults to PNG. Mobile browsers can run the editor, but desktop
browsers are recommended for large canvases and high-resolution exports because
mobile memory and download handling vary by platform.

## Local Node development

Node.js 24 and Corepack are recommended:

```sh
corepack pnpm install
corepack pnpm dev
```

Open `http://localhost:5173/OpenSketch/`.

Build and preview the exact GitHub Pages production layout:

```sh
corepack pnpm build
corepack pnpm preview
```

The production site is written to the repository-level `dist/` directory and is
available at `http://localhost:4173/OpenSketch/` while previewing.

### Validation

```sh
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm assets:validate
corepack pnpm build
corepack pnpm test:e2e
corepack pnpm test:e2e:cross-browser
corepack pnpm test:pwa
```

The tests cover project migration and round-trips, embedded imported media,
color and geometry calculations, connector routing, SVG sanitization,
independent SVG-part editing, PNG DPI metadata, IndexedDB persistence, built-in
and imported assets, SVG/PNG/PDF exports, cross-browser editor workflows, the
`/OpenSketch/` deployment path, and an offline production reload.

## Deployment architecture

Vite is configured with `base: "/OpenSketch/"`. A GitHub Actions workflow runs
linting, type checks, unit tests, the production build, and representative
Chromium workflows for every change to `main`. New pushes cancel obsolete runs,
so only the latest commit occupies the Pages deployment queue. Asset validation
and the offline PWA workflow run only when their source paths change.

The five representative Chromium workflows run on every push and pull request.
A focused Firefox and WebKit compatibility suite runs weekly and can also be
started manually. It reuses a version-matched Playwright runtime instead of
reinstalling browser binaries and Linux dependencies in separate jobs. The
complete end-to-end suite remains available locally through `pnpm test:e2e`.
Only the generated `dist/` directory is uploaded as a GitHub Pages artifact and
deployed to the `github-pages` environment.

GitHub Pages serves immutable application files. There is no server-side
application runtime in production. The service worker precaches the same static
files for offline use; IndexedDB and `localStorage` remain local to the browser.

## Scientific asset pipeline

Asset import is an explicit maintainer operation:

```sh
corepack pnpm assets:sync
corepack pnpm assets:sync:open
corepack pnpm assets:sync:bioicons
```

The first command discovers the current first-party NIH BioArt catalog, reads each
record's declared license and SVG file list, and imports every SVG from records
marked exactly **Public Domain**. It downloads at a courteous rate, sanitizes
SVG, prefixes all internal IDs, generates transparent WebP thumbnails, groups
variants into families, assigns new entries from NIH's own categories, and
writes a deterministic manifest and source lock. Public-domain records without
an SVG, non-public-domain records such as CC BY 4.0 artwork, and unusable file
endpoints are documented in `data/import-errors.json` and excluded.

The current bundled collection contains **637 families and 2,432 SVG
variants**. A small set of earlier public-domain Commons mirrors is retained
when no matching first-party NIH SVG is available, preserving existing project
compatibility. The older mirror-only importer remains available to maintainers
as `corepack pnpm assets:sync:commons`; it is not used by the application.

The second command imports every technically usable vector SVG currently
exposed by SciDraw under CC0 1.0 or CC BY 4.0, both editable SVG styles for
every organism in the Arcadia Science Free organism illustration library, and
the pinned BioIcons catalog. The BioIcons import preserves the author, upstream
category, source path, and exact per-file CC0, CC BY, CC BY-SA, MIT, or BSD
license. Servier Medical Art is identified both as its original author and as a
BioIcons-distributed source. The third command refreshes only BioIcons while
retaining the already generated SciDraw and Arcadia entries.

The bundled result contains **609 SciDraw families** (538 CC BY 4.0 and 71 CC0),
**71 Arcadia organism families with 142 SVG variants**, and **2,827 BioIcons
SVG families**. That is every renderable SVG in the pinned BioIcons catalog;
the three excluded upstream `.svg` files are zero bytes. One icon with a legacy
three-segment source path uses the contributor identity recorded by the
upstream submission and author registry. CC BY assets retain the author, source
page, DOI where available, and license URL required for attribution. CC0 assets
retain source and license metadata for traceability. Each downloaded file
passes the same sanitization and local-thumbnail pipeline; the browser never
fetches these third-party sources at runtime. Upstream files that are malformed,
lack attribution metadata, or are too complex to sanitize safely are named in
`data/open-assets-import-report.json` rather than being silently approximated.

Individual stages are available as:

```sh
corepack pnpm assets:validate
corepack pnpm assets:thumbnails
corepack pnpm assets:manifest
```

Normal development, test, production build, and browser runtime paths never
contact Wikimedia, NIH, SciDraw, Zenodo, Arcadia Science, BioIcons, or Servier
Medical Art. The downloaded, sanitized artwork is committed to this repository
and served from the same static GitHub Pages origin.

### Sanitization policy

Built-in and user-imported SVGs reject or remove scripts, event handlers,
`foreignObject`, JavaScript URLs, external CSS, external images and fonts, and
network references in SVG paint/filter attributes. Internal references are
retained and namespaced with the asset ID before conservative SVGO processing.
Files without a verifiable source and redistribution/modification license are
excluded and recorded in the import report. Processing or security failures are
reported explicitly.

## Repository map

```text
apps/web/                  React/Vite browser application and static assets
packages/editor-core/      project, search, migration, and canvas domain types
scripts/assets/            maintainer-only open-art import and SVG security pipeline
data/                      taxonomy, overrides, source lock, import report
tests/                     unit, cross-browser, export, and offline PWA tests
docs/                      architecture and asset pipeline notes
examples/                  compatible portable projects and SVG exports
dist/                      generated production site; never committed
```

## Current feature set

- Local project home with newest-first rails, folders, drag-and-drop filing,
  archive/restore, autosave, duplicate/delete, and `.OpenSketch` portability
- Floating left tool rail with searchable assets, a dedicated Favorites view,
  persisted asset variants, pop-out line/shape galleries, imports, and an
  object-specific editor
- Footer controls for artboard size and color, fit/zoom, alignment guides, grid,
  and rulers
- Fabric canvas selection, live marquee selection, resize, rotation, nested
  grouping, align, distribution, smart guides, pan/zoom, flip, lock/hide,
  layers, keyboard nudging, undo, and redo
- Editable point text with a broad offline font catalog and scientific
  sub/superscripts, plus geometric shapes and independently editable SVG parts
- Editable top-view 6-, 12-, 24-, 48-, 96-, and 384-well plates plus a Petri
  dish, with every well retained as an individual SVG part
- Straight, stepped, curved, wave, circular, inhibitor, dot, neuron, bracket,
  and arrow connectors with anchors, endpoint styles, automatic updates, and
  collision-aware orthogonal routing
- Theme and standard color palettes for text, shapes, lines, and SVG parts,
  alongside preview grids for multi-variant biological assets
- System-clipboard copy as PNG or SVG, including cross-application paste
- Sanitized SVG plus PNG/JPEG/WebP imports embedded in project data
- Vector SVG/PDF and 150–1200 DPI PNG export with a remembered DPI preference
- A4, Letter, presentation, square, and custom artboard dimensions

## Example figures

The [antibody-mediated immune response project](examples/antibody-mediated-immune-response.OpenSketch)
is a portable, editable example made from two bundled NIH BioArt families. Its
[SVG export](examples/antibody-mediated-immune-response.svg) demonstrates vector
preservation, accessible metadata, and artwork provenance.

## Contributing and citation

See [docs/architecture.md](docs/architecture.md),
[docs/asset-pipeline.md](docs/asset-pipeline.md),
[CONTRIBUTING.md](CONTRIBUTING.md), and [SECURITY.md](SECURITY.md).

OpenSketch is authored and maintained by Paul Heisig
([ORCID 0000-0002-8529-7944](https://orcid.org/0000-0002-8529-7944)).
Machine-readable citation metadata is in [CITATION.cff](CITATION.cff).
