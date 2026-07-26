# Asset pipeline

The importer targets the Wikimedia Commons category
`Biology SVG illustrations by NIH BioArt`. It follows every API continuation token
and processes downloads with bounded concurrency plus a global request cadence.

## Trust gates

An asset enters the bundle only when:

1. Commons reports `image/svg+xml`.
2. Extended metadata explicitly says public domain.
3. Exactly one NIH BioArt entry ID can be established.
4. Sanitized XML has a root SVG and `viewBox`.
5. Security validation finds no executable or network content.
6. A transparent 256 × 256 WebP thumbnail can be rendered.

If identity evidence conflicts, maintainers must resolve it in
`data/asset-overrides.json`; the importer never silently chooses one value.

## Determinism

`data/source-lock.json` records Commons SHA-1, local SHA-256, and the sanitizer
pipeline version. Unchanged downloads are skipped only when all three still
match. Families and variants are sorted. `updatedAt` and manifest `generatedAt`
are retained when semantic content is unchanged, so an unchanged upstream
collection produces an empty repository diff.

Removed upstream files are removed locally only after the complete category query
and successful lock construction.

## Manual review

After synchronization:

```sh
corepack pnpm assets:validate
git diff --stat
git diff -- data/source-lock.json \
  apps/web/src/generated/nih-bioart-manifest.json
```

Review `data/import-errors.json`. A non-empty failure list prevents a successful
sync. Verify identity or taxonomy corrections against the linked Commons and NIH
source pages before adding overrides.
