# Asset pipeline

The primary importer discovers the first-party NIAID NIH BioArt catalog at
`bioart.niaid.nih.gov`, parses each record's declared license and SVG file IDs,
and processes direct NIH downloads with bounded concurrency, retries, and a
global request cadence. `pnpm assets:sync:commons` retains the older Wikimedia
Commons mirror importer for maintenance and project compatibility, but the
direct NIH catalog is authoritative.

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

Public-domain records without an SVG and records under another license are
listed as skips in `data/import-errors.json`. Download, sanitization, rendering,
or security failures are recorded separately and fail the synchronization.
Legacy Commons identity conflicts can still be resolved explicitly in
`data/asset-overrides.json`.

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
