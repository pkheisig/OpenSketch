# Asset pipeline

The primary importer discovers the first-party NIAID NIH BioArt catalog at
`bioart.niaid.nih.gov`, parses each record's declared license and SVG file IDs,
and processes direct NIH downloads with bounded concurrency, retries, and a
global request cadence. `pnpm assets:sync:commons` retains the older Wikimedia
Commons mirror importer for maintenance and project compatibility, but the
direct NIH catalog is authoritative.

`pnpm assets:sync:open` separately imports every technically usable SciDraw
vector drawing licensed CC0 1.0 or CC BY 4.0 and every tricolor/stroke and
silhouette SVG in the Arcadia Science Free organism illustration library. It
also imports the pinned BioIcons SVG catalog under each file's declared CC0,
CC BY, CC BY-SA, MIT, or BSD license. `pnpm assets:sync:bioicons` refreshes only
that third source while retaining the already generated SciDraw and Arcadia
entries. The current BioIcons bundle contains all 2,827 renderable SVGs in the
pinned catalog; its three excluded `.svg` files are empty. These files are
copied into source-specific local directories and combined with NIH BioArt only
in the browser manifest, preserving the established NIH source lock and stable
IDs. All upstream technical exclusions are recorded in
`data/open-assets-import-report.json`.

## Trust gates

An asset enters the bundle only when:

1. The first-party NIH record declares its license exactly `Public Domain`.
2. NIH advertises an SVG representation with a concrete file ID.
3. The downloaded response has an SVG root and non-empty content.
4. The family has exactly one assignment in `data/taxonomy.json`; new records
   are initially routed from NIH's own category metadata and can be reviewed
   there.
5. Sanitized XML has a root SVG and `viewBox`.
6. Security validation finds no executable or network content.
7. A transparent 256 × 256 WebP thumbnail can be rendered.

For SciDraw, Arcadia Science, and BioIcons, the same technical gates apply and
the source must additionally expose a redistribution/modification license
supported by OpenSketch. CC BY and CC BY-SA files retain author, source-page,
license, and license-URL metadata; SciDraw also retains its DOI. MIT and BSD
icons retain their author/copyright source and license. CC0 files retain source
and license metadata for traceability. A BioIcons SVG without the full
license/category/author path required for attribution is excluded rather than
being assigned guessed provenance.

Public-domain records without an SVG and records under another license are
listed as skips in `data/import-errors.json`. Download, sanitization, rendering,
or security failures are recorded separately and fail the synchronization.
Legacy Commons identity conflicts can still be resolved explicitly in
`data/asset-overrides.json`.

The open-asset importer records individual upstream failures in
`data/open-assets-import-report.json` while still publishing every other valid,
licensed file. This prevents one corrupt third-party SVG from discarding an
otherwise complete source collection.

## Determinism

`data/source-lock.json` records the direct NIH source page, source file ID,
source SHA-256, local SHA-256, and sanitizer pipeline version. Retained legacy
mirror entries keep their Commons source metadata. Unchanged downloads are
skipped only when their recorded source digest and sanitizer version still
match. Families and variants are sorted.

Removed files are removed locally only after complete catalog discovery and
successful lock construction. Existing public-domain mirror assets without a
direct NIH match are retained so previously saved OpenSketch projects continue
to resolve their stable asset IDs.

## Manual review

After synchronization:

```sh
corepack pnpm assets:validate
git diff --stat
git diff -- data/source-lock.json \
  apps/web/src/generated/nih-bioart-manifest.json
```

Review `data/import-errors.json`. A non-empty failure list prevents a successful
sync. Verify identity or taxonomy corrections against the linked NIH source
page (and Commons page for a retained mirror entry) before adding overrides.
`assets:validate` also proves that the taxonomy and generated manifest contain
the same family IDs and categories.

BioIcons is pinned by commit in `scripts/assets/bioicons.ts`; update that commit
deliberately when refreshing the catalog. Its SVGs and thumbnails, like the
other bundled libraries, are served from the OpenSketch origin and intentionally
excluded from the app-shell precache. The Assets panel's versioned offline-pack
action explicitly fetches and verifies every local SVG and WebP before declaring
the complete library ready for cold offline use. Data-URL labware entries do not
need a Cache Storage entry.
