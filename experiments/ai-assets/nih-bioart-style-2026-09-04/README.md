# Experimental biomedical AI assets

Three isolated illustrations are available as transparent PNG masters and editable SVG traces: macrophage, mitochondrion, and CD8 receptor. The user's higher-resolution NIH BioArt sheets supplied the visual style only. These are new AI-generated illustrations, not NIH BioArt originals.

This experiment starts at frozen `dev` commit `2aea75a8ccd7956d7addbc60547bf5d884ccf590` on `experimental/ai-bioart-assets-20260904`. It adds files only under this directory. There is no asset-library integration or UI change.

| Asset | PNG master | Editable SVG derived from PNG |
| --- | --- | --- |
| Macrophage | [PNG](macrophage-bioart-transparent.png) | [SVG](macrophage-bioart-traced.svg) |
| Mitochondrion | [PNG](mitochondrion-bioart-transparent.png) | [SVG](mitochondrion-bioart-traced.svg) |
| CD8 receptor | [PNG](cd8-receptor-bioart-transparent.png) | [SVG](cd8-receptor-bioart-traced.svg) |

The PNGs have real alpha transparency and generous empty margins. Canvas expansion preserves the source dimensions without resizing the illustration. Unmodified selected image-generation outputs are in `originals/`; earlier outputs are in `originals/history/`. Historical files marked `opaque` have baked-in white or checkerboard backgrounds and are not deliverables.

## SVG comparison

Editable SVGs were attempted first and rendered for inspection. Those files remain in `svg-attempts/` because the user asked to retain both approaches. Their simple shading and forms are useful for comparison, but the PNGs provide more organic detail.

Following the user's PNG-first direction, each selected PNG was converted into true vector paths with [VTracer](https://github.com/visioncortex/vtracer). The resulting SVGs contain no embedded images. Each color region has an ID and can be edited independently; regions are not grouped into semantic organelles or protein domains. Tracing approximates shading with flat color regions, so the PNG remains the visual master.

The trace input uses an alpha threshold of 128 to avoid converting nearly transparent fringe pixels into opaque specks. Original PNG alpha is preserved. VTracer 0.6.15 settings: color mode, stacked hierarchy, spline curves, speckle filter 10, color precision 6, layer difference 24, corner threshold 60, length threshold 4, maximum iterations 10, splice threshold 45, and path precision 2. PNG canvases and SVG view boxes add 20% of the source's longest edge on each side of a centered square.

## Provenance and inspection

[Prompts](prompts.json) record the built-in image-generation prompts and refinements. The reference sheets were not copied into the repository. CD8 is an illustrative alpha/beta heterodimer, using one Ig-like head per chain; it is not an atomistic structure. Structural context: [RCSB PDB 2ATP](https://www.rcsb.org/structure/2ATP).

[Comparison](qa/png-vs-editable-svg.png) shows PNG and traced SVG versions against white and dark backgrounds. [Local comparison page](qa/comparison.html), [inspection recording](qa/transparency-inspection.webm), and [validation results](qa/validation.json) include alpha ranges, padding measurements, path counts, SHA-256 hashes, and public R2 evidence links.

Visual inspection used isolated headless Chromium through Playwright because the in-app Browser tool was unavailable in this session. Checks covered complete silhouettes, intrinsic components, empty backgrounds, actual PNG alpha, and absence of raster embedding in SVGs. GitHub Actions remained disabled. No PR was opened.
