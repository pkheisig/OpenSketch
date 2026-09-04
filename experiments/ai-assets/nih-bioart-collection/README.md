# Experimental BioArt collection

The first ten approved scientific assets are preserved here. Production now continues through the complete [asset inventory](../../../docs/ai-bioart-asset-inventory.md) and its [supplement](../../../docs/ai-bioart-asset-inventory-additions.md). See [current progress and completed files](PROGRESS.md) for the growing collection.

| Category | New assets |
| --- | --- |
| Immune cells | Dendritic cell, neutrophil |
| Proteins | Generic IgG antibody, ATP synthase |
| Lab equipment | Micropipette, microcentrifuge tube |
| Animal | Laboratory mouse |

- `png/`: transparent PNG masters with generous padding.
- `svg/`: editable vector traces, containing paths rather than embedded bitmap images.
- `originals/batch-02/`: unmodified generated outputs, including earlier candidates for provenance. Use the selected files in `png/` and `svg/`, not rejected candidates.
- [batch-02.json](batch-02.json): exact generation/refinement prompts, source filenames, inventory selection and selected originals.
- [qa/gallery.html](qa/gallery.html): standalone comparison with PNG/SVG and light/dark controls.
- [qa/validation.json](qa/validation.json): dimensions, alpha ranges, vector path counts and SHA-256 hashes.
- `tools/`: reproducible packaging, tracing and browser capture scripts.
- `originals/inventory/`: selected originals and exact prompts for continuing inventory production.
- `qa/inventory/`: individual PNG/SVG comparisons and recordings on light and dark backgrounds.
- `inventory-progress.json`: all concrete inventory entries, original source locations, file hashes and review status. Awaiting-review assets are not counted as complete.

The earlier macrophage, mitochondrion and CD8 receptor files are copied byte-for-byte from [the first experiment](../nih-bioart-style-2026-09-04/). That experiment remains intact.

## Style and conversion

The supplied NIH BioArt images serve only as visual style references: isolated complete forms, crisp outlines, a restrained purple/teal/peach palette, smooth contours, soft depth and no labels or surroundings. Equipment uses cool neutral plastic and blue accents; the mouse uses white fur and salmon skin.

Each new asset was generated as a PNG, visually refined, then traced with VTracer 0.6.15. Browser canvas adds transparent padding without scaling the original. SVG tracing alone uses an alpha threshold of 128, preventing faint transparent fringe pixels becoming opaque paths. PNG alpha is preserved. Two generated cutouts have a maximum alpha of 254 rather than 255.

The SVGs are editable color regions with stable path IDs, not semantic organelle or protein-subunit groups. Tracing approximates gradients and fine fur. The mouse and tube use finer color settings to retain their detail. These illustrations communicate recognizable structures; the IgG drawing is not a disulfide-bond map and ATP synthase is not an atomic model. ATP synthase structure context: [RCSB PDB-101](https://pdb101.rcsb.org/motm/72).

## Verification and preservation

All seven selected PNGs were checked for real alpha, transparent padding and complete visible objects. All SVGs were parsed and checked for paths, valid view boxes and absence of embedded raster images. PNG/SVG comparisons were inspected on light and dark backgrounds beside the three approved references.

The requested in-app Browser capability was unavailable. Captures use isolated Playwright Chromium against this standalone QA gallery; the OpenSketch application was not changed.

Work is confined to `experimental/ai-bioart-assets-20260904`, based on frozen dev `2aea75a8ccd7956d7addbc60547bf5d884ccf590`. No library integration, app UI changes or pull request. GitHub Actions remain disabled.

- [SVG collection preview](https://pub-2522e09cc0ae4b1ba2ff37cbba779674.r2.dev/opensketch/experimental-ai-assets-20260904/batch-02/collection-svg.png)
- [PNG preview on dark background](https://pub-2522e09cc0ae4b1ba2ff37cbba779674.r2.dev/opensketch/experimental-ai-assets-20260904/batch-02/collection-png-dark.png)
- [Transparency inspection recording](https://pub-2522e09cc0ae4b1ba2ff37cbba779674.r2.dev/opensketch/experimental-ai-assets-20260904/batch-02/transparency-inspection.webm)
