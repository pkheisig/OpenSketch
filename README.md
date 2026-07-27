# OpenSketch

OpenSketch is an open-source, browser-native scientific figure editor. Use the
hosted application at **[pkheisig.github.io/OpenSketch](https://pkheisig.github.io/OpenSketch/)**.

The editor is a static React 19, TypeScript, Vite, and Fabric.js application with
an offline bundle of public-domain illustrations imported from the NIAID NIH
BioArt Source. It has no application server, account system, analytics, or
telemetry.

> Biological artwork sourced from the NIAID NIH BioArt Source and obtained via
> Wikimedia Commons. OpenSketch is an independent project and is not affiliated
> with or endorsed by NIH or NIAID.

The source code is AGPL-3.0-or-later. Imported artwork retains its original
public-domain status and is not licensed under the OpenSketch software license.

## Privacy and local data

Everything after the static site download happens on the device:

- Projects and canvas settings are stored in browser IndexedDB.
- Favorite and recently used assets are stored in `localStorage`.
- Uploaded images are sanitized or decoded locally and embedded in the project.
- SVG, PNG, PDF, and `.OpenSketch` files are generated in the browser.
- No project, image, filename, or project metadata is uploaded to OpenSketch or
  any other application server.
- The production content security policy blocks runtime network connections
  outside the OpenSketch origin.

Browser storage belongs to the exact site origin. Clearing site data, using
private browsing, or a browser storage eviction can remove local projects.
Export important work as `.OpenSketch` files for durable backups.

## Offline use

OpenSketch is an installable progressive web app. On the first complete visit,
its application shell, fonts, and bundled BioArt library are copied to browser
Cache Storage. The home screen reports **Ready offline** when that copy is
available. Afterward the application, saved projects, built-in artwork, and
exports can be reopened without internet access.

The service worker only reads static files from the same GitHub Pages origin.
It never uploads user data.

## Browser and file support

The regression suite covers current Chromium, Firefox, and WebKit desktop
engines. Current Chrome, Edge, Firefox, and Safari are supported.

Project import uses the browser file picker and accepts existing version-1
`.OpenSketch` files. Project and figure exports use browser-generated downloads,
which work even when direct folder access is unavailable. Browsers implementing
the File System Access API also show **Save to folder** for direct project-file
writes; the portable download remains available as the cross-browser fallback.
Mobile browsers can run the editor, but desktop browsers are recommended for
large canvases and high-resolution exports because mobile memory and download
handling vary by platform.

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
corepack pnpm test:pwa
```

The tests cover project migration and round-trips, embedded uploads, color and
geometry calculations, connector routing, SVG sanitization, PNG DPI metadata,
IndexedDB persistence, built-in and uploaded assets, SVG/PNG/PDF exports,
cross-browser editor workflows, the `/OpenSketch/` deployment path, and an
offline production reload.

## Deployment architecture

Vite is configured with `base: "/OpenSketch/"`. A GitHub Actions workflow runs
linting, type checks, unit tests, asset validation, the production build,
Chromium/Firefox/WebKit workflows, and the offline PWA test for every change to
`main`. Only the generated `dist/` directory is uploaded as a GitHub Pages
artifact and deployed to the `github-pages` environment.

GitHub Pages serves immutable application files. There is no server-side
application runtime in production. The service worker precaches the same static
files for offline use; IndexedDB and `localStorage` remain local to the browser.

## NIH BioArt asset pipeline

Asset import is an explicit maintainer operation:

```sh
corepack pnpm assets:sync
```

The command paginates the Commons category, requires explicit public-domain
metadata, derives and validates NIH entry identities, downloads at a courteous
rate, sanitizes SVG, prefixes all internal IDs, generates transparent WebP
thumbnails, groups variants into families, and writes a deterministic manifest
and source lock.

Individual stages are available as:

```sh
corepack pnpm assets:validate
corepack pnpm assets:thumbnails
corepack pnpm assets:manifest
```

Normal development, test, production build, and browser runtime paths never
contact Wikimedia or NIH.

### Sanitization policy

Built-in and user-uploaded SVGs reject or remove scripts, event handlers,
`foreignObject`, JavaScript URLs, external CSS, external images and fonts, and
network references in SVG paint/filter attributes. Internal references are
retained and namespaced with the asset ID before conservative SVGO processing.
Files without an unambiguous NIH BioArt identity or explicit public-domain
status are recorded as import errors and fail synchronization.

## Repository map

```text
apps/web/                  React/Vite browser application and static assets
packages/editor-core/      project, search, migration, and canvas domain types
scripts/assets/            maintainer-only Commons import and SVG security pipeline
data/                      taxonomy, overrides, source lock, import report
tests/                     unit, cross-browser, export, and offline PWA tests
docs/                      architecture and asset pipeline notes
examples/                  compatible portable projects and SVG exports
dist/                      generated production site; never committed
```

## Current feature set

- Local project home, autosave, duplicate/delete, and `.OpenSketch` portability
- Searchable asset-family browser with variants and source provenance
- Fabric canvas selection, resize, rotation, group, align, distribution, smart
  guides, pan/zoom, flip, lock/hide, layers, keyboard nudging, undo, and redo
- Editable text, text boxes, scientific sub/superscripts, shapes, callouts,
  brackets, membrane primitives, and vector arrows
- Object-attached connectors with anchors, arrowheads, styles, curvature,
  automatic updates, and collision-aware orthogonal routing
- Palette recoloring, gradient-aware tint, saturation, brightness, opacity, and
  reset
- Sanitized SVG plus PNG/JPEG/WebP uploads embedded in project data
- Vector SVG/PDF and high-resolution, physical-DPI PNG export
- A4, Letter, presentation, square, and custom artboard dimensions
- Editable scientific starter layouts

## Example figures

The [antibody-mediated immune response project](examples/antibody-mediated-immune-response.OpenSketch)
is a portable, editable example made from two bundled NIH BioArt families. Its
[SVG export](examples/antibody-mediated-immune-response.svg) demonstrates vector
preservation, accessible metadata, and artwork provenance.

Additional editable examples:

- [signaling cascade](examples/signaling-cascade.OpenSketch)
- [experimental workflow](examples/experimental-workflow.OpenSketch)
- [comparative panels](examples/comparative-panels.OpenSketch)

## Contributing and citation

See [docs/architecture.md](docs/architecture.md),
[docs/asset-pipeline.md](docs/asset-pipeline.md),
[CONTRIBUTING.md](CONTRIBUTING.md), and [SECURITY.md](SECURITY.md).

OpenSketch is authored and maintained by Paul Heisig
([ORCID 0000-0002-8529-7944](https://orcid.org/0000-0002-8529-7944)).
Machine-readable citation metadata is in [CITATION.cff](CITATION.cff).
