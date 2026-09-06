# Scientific asset styles

OpenSketch currently exposes two representation styles for scientific assets:

- **Detailed** preserves the existing OpenSketch artwork and editable scientific
  structures. It is the backwards-compatible default for legacy manifests and
  saved scenes that do not carry style metadata.
- **Simplified** is a separately authored, lower-detail counterpart intended for
  dense diagrams and small placements. It is never synthesized by silently
  substituting the Detailed artwork.

## Contract

`familyId` remains the stable scientific concept identity. Each renderable
`variant.id` remains globally unique; `variant.style` qualifies the
representation and is limited to `detailed` or `simplified`. New generated
variants are written as `detailed` explicitly. The catalog resolver treats an
omitted style in an older manifest as `detailed` during migration.

Style-qualified search, inspection, insertion and replacement use the exact
requested representation. If a family has no requested counterpart, the
semantic API returns `ASSET_STYLE_UNAVAILABLE`, and the UI removes that family
from the selected-style list while reporting coverage. A Detailed fallback is
not allowed.

Placed groups persist `assetStyle` alongside `assetId` and `familyId`. Exported
provenance and credits preserve the style, source metadata and any local
SHA-256 recorded for the variant. This keeps a figure auditable when the same
family is used in both representations.

## Current counterpart library

The first bounded counterpart set contains 8 of the 759 bundled families:

- editable cell, protein and antibody structures;
- T lymphocyte and lysosome;
- streptavidin tetramer;
- magnetic separation column; and
- DNA fragment with sequencing adapters.

The coverage count is intentionally visible in the Simplified asset panel.
Adding a new counterpart requires a stable variant ID, a local checksum, an
authored SVG, and catalog/search/provenance tests. No Realistic tier is part of
the current contract.
