# Asset identity and search

`familyId` is the stable, unique library asset identifier. `variants[].id` uniquely
identifies a renderable variant. Scene `objectId` identifies a placed instance;
several placements of the same library asset intentionally have different object
IDs. Names and keywords are not identifiers. Never regenerate IDs for a rename,
metadata update or styling revision.

One artwork is one catalog asset. The import pipeline groups completed source
records by verified SVG SHA-256, including identical files at different paths,
and preserves previously published canonical IDs. Alternate inventory concept
names become search metadata, not additional cards, IDs or SVG copies. A shared
schematic does not imply that two biological concepts are equivalent. If a
concept later receives distinct artwork, it can become a separate asset with its
own stable ID.

The visible catalog rejects duplicate family IDs, variant IDs, artwork checksums
and, where no checksum is available, reused asset paths. Search metadata expands centrally in `assetCatalog.ts`,
so the sidebar and semantic search use the same keywords. Avoid keywords that
claim anatomy or markers the asset does not depict.

`research/canonical-asset-registry.json` records the committed artwork snapshot,
canonical IDs, source concepts, source paths, verified checksums and searchable
terms. It can include committed artwork not yet integrated into the app. Rebuild
it with `pnpm exec tsx scripts/assets/build-canonical-registry.ts <source-commit>`.
The command requires a full immutable commit SHA and does not read or modify the
artwork agent's uncommitted files. The original 768-entry inventory stays intact.
