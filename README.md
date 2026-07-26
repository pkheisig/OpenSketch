# OpenSketch

OpenSketch is an open-source, browser-based scientific figure editor distributed
as an R package. It bundles a React 19, TypeScript, Fabric.js 7 application and
the public-domain illustrations imported from the NIAID NIH BioArt Source.

The installed app is static. It has no account system, database server, analytics,
or runtime dependency on NIH or Wikimedia. Projects stay in browser IndexedDB and
can be exported as portable `.opensketch` files.

> Biological artwork sourced from the NIAID NIH BioArt Source and obtained via
> Wikimedia Commons. OpenSketch is an independent project and is not affiliated
> with or endorsed by NIH or NIAID.

The source code is AGPL-3.0-or-later. Imported artwork retains its original
public-domain status and is not licensed under the OpenSketch software license.

OpenSketch is currently under active pre-release development. The repository does
not yet publish version tags, release artifacts, or a hosted production editor.

## Install and launch from R

Install the current development package directly from GitHub:

```r
pak::pak("pkheisig/opensketch")
```

Or build a development checkout locally:

```sh
corepack pnpm install
corepack pnpm build
R CMD INSTALL .
```

Then launch the package:

```r
library(opensketch)
server <- opensketch()

# When finished:
stop_opensketch(server)
```

`opensketch()` starts a loopback-only static file server so browsers can load the
bundled JavaScript modules. It is not an application backend: editing, persistence,
search, uploads, and export all happen in the browser.

## Development

```sh
corepack pnpm install
corepack pnpm dev
```

Production build:

```sh
corepack pnpm build
```

The Vite build is written to `inst/app/`, which is bundled into the R package.
Neither command contacts Wikimedia or NIH.

### Validation

```sh
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm test:e2e
R CMD build .
R CMD check --no-manual opensketch_0.1.0.tar.gz
```

The browser suite runs the full editor, persistence, SVG/PNG/PDF export, and
export-fidelity workflows in Chromium, Firefox, and WebKit. The 100-object
responsiveness benchmark runs once in Chromium.

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

The browser only reads:

- `apps/web/public/assets/nih-bioart/`
- `apps/web/public/assets/nih-bioart-thumbnails/`
- `apps/web/src/generated/nih-bioart-manifest.json`

The full SVG is loaded only when a user inserts an asset. The library grid uses
lazy WebP thumbnails.

### Sanitization policy

Built-in and user-uploaded SVGs reject or remove scripts, event handlers,
`foreignObject`, JavaScript URLs, external CSS, external images and fonts, and
network references in SVG paint/filter attributes. Internal references are
retained and namespaced with the asset ID before conservative SVGO processing.
`viewBox`, meaningful groups, shape elements, colors, gradients, masks, clips,
filters, and transforms are preserved.

Files without an unambiguous NIH BioArt identity or explicit public-domain status
are written to `data/import-errors.json`; unresolved failures make synchronization
exit non-zero.

## Repository map

```text
R/                         R launcher and package API
inst/app/                  compiled offline application bundled by R
apps/web/                  React/Vite application
packages/editor-core/      shared project, search, and canvas domain types
scripts/assets/            manual Commons import and SVG security pipeline
data/                      taxonomy, overrides, source lock, import report
tests/                     unit, browser, and R package tests
docs/                      architecture and contributor notes
examples/                  verified portable project and SVG examples
```

## Current feature set

- Local project home, autosave, duplicate/delete, and `.opensketch` portability
- Searchable and categorized asset-family browser with variants and provenance
- Fabric canvas selection, movement, resize, rotation, duplicate, group, align,
  equal-gap distribution, smart guides, pan/zoom, flip, lock/hide, layers,
  keyboard nudging, undo, and redo
- Editable point text, text boxes, built-in diagram shapes, callouts, brackets,
  membrane primitives, scientific sub/superscripts, and vector arrows
- Object-attached connectors with independent anchors, arrowheads, line styles,
  curvature, automatic geometry updates, and collision-aware orthogonal routing
- Palette-level asset recoloring, gradient-aware tint, saturation, brightness,
  opacity, and complete reset
- Sanitized SVG plus PNG/JPEG/WebP uploads embedded in project data
- Vector SVG and PDF export with accessible metadata and embedded default
  typography, plus high-resolution PNG export carrying explicit physical-DPI
  metadata and custom pixel dimensions
- A4, Letter, presentation, square, and custom artboard dimensions
- Editable signaling-cascade, experimental-workflow, and comparative-panel
  starter figures available directly from the project home

## Example figures

The [antibody-mediated immune response project](examples/antibody-mediated-immune-response.opensketch)
is a portable, editable example built in OpenSketch from two bundled NIH BioArt
families. Its [SVG export](examples/antibody-mediated-immune-response.svg) demonstrates
vector preservation, accessible title and description fields, and per-asset
public-domain provenance in the export metadata.

Three shape-based scientific examples mirror the built-in starter layouts and
demonstrate editable labels, panels, and attached orthogonal connectors:

- [signaling cascade project](examples/signaling-cascade.opensketch) and
  [SVG](examples/signaling-cascade.svg)
- [experimental workflow project](examples/experimental-workflow.opensketch) and
  [SVG](examples/experimental-workflow.svg)
- [comparative panels project](examples/comparative-panels.opensketch) and
  [SVG](examples/comparative-panels.svg)

## Contributing

See [docs/architecture.md](docs/architecture.md) and
[docs/asset-pipeline.md](docs/asset-pipeline.md), plus
[CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md). Do not add non-public-domain
artwork to the built-in library, and do not move asset synchronization into normal
development or production builds.

## Author and citation

OpenSketch is authored and maintained by Paul Heisig
([ORCID 0000-0002-8529-7944](https://orcid.org/0000-0002-8529-7944)).
Machine-readable citation metadata is provided in [CITATION.cff](CITATION.cff).
