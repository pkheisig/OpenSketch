# Editable structures and generated artwork in the app

Implemented on `planning/scientific-asset-expansion-20260905`. The protected 768-name inventories remain unchanged. These are additive app entries; the existing membrane shape and existing library artwork retain their behavior.

## Find and use the assets

- **Shapes → Scientific structures:** 17 new original flat vector presets. Drag an endpoint to extend a structure without stretching its repeated units. Add bend points, adjust unit size and spacing, close a path, change colors, or convert the structure into independently editable parts.
- **Assets → Filter → Source → OpenSketch generated:** 211 distinct app SVGs covering 217 completed inventory names at artwork commit `7082acc50c0696215aa64aaade02cb014623886f`. Six deliberate aliases share a canonical card. Both generic globular proteins and specific receptors are searchable.
- Save the figure as an OpenSketch project to retain procedural path controls. Exported SVGs retain vector geometry and color-region editability, but generic SVG reimport does not reconstruct the procedural settings.

The new structures are lipid bilayer, curved membrane, membrane ring, membrane surface, lipid monolayer, DNA helix, RNA strand, vessel segment, epithelial row, actin filament, microtubule strip, chromatin strand, protein domain chain, protein with movable domains, receptor with movable domains, cell with movable parts, and antibody with movable arms.

All new procedural artwork is flat, without perspective or shaded volume. **Membrane surface** is a plan view; bilayers show a flat cross-section so the two leaflets and paired tails are visible. Rings are diagrammatic cross-sections, not a molecularly accurate packing simulation. Repeated lipid heads are more closely spaced than in the initial preview and include a small inner head detail, neck and paired kinked tails. The cell nucleus and receptor tail positions have been corrected; antibody arms meet the stem. These are schematic shapes, not claims about sequence, stoichiometry, helix handedness or molecular dimensions.

## Build composites from reusable parts

Start with our existing cells, proteins, receptors and other primitives. Place these independently on or alongside the new path structures, then add labels and interaction connectors. Group the assembly and save it as a reusable template. An immunological reaction should reuse cell and protein objects; do not draw the entire scene as one replacement SVG.

Keep the membrane procedural while adjusting its path. Proteins placed beside it remain separate objects: this release does not automatically attach them to a membrane anchor or reposition them when the membrane bends. Once the arrangement is settled, grouping moves the assembly together. Convert a structure to editable parts only when individual lipid/domain editing is needed; undo restores its path controls. The editor supports up to 24 anchors and 300 repeat positions per structure. Excessive or zero-length geometry is rejected without altering the previous valid object.

The generated collection contains traced color regions, not semantic protein or organelle groups. Use the new procedural parts for assemblies needing semantic component movement. The generated collection retains its previously approved presentation styles; importing it does not turn its shaded or perspective artwork into the separate flat structure style.

## Artwork snapshot and app derivatives

The production agent's branch and working files were not edited or merged. The import reads an immutable committed snapshot with `git show`, verifies original PNG/SVG hashes, and indexes only completed entries with a recorded review, an approved-batch provenance record, or an explicit alias to a reviewed canonical entry.

The original traces total about 929 MiB; 116 exceed the editor's 10,000-object scene limit individually. The app therefore uses separate derivatives of the approved PNG masters: maximum side 1024 pixels before tracing, a 48-color palette, VTracer 0.6.15, Pillow 11.3.0, and a four-pixel speckle threshold. Tracer-generated intermediate colors are mapped back to that palette. Each derivative is still an SVG with editable paths; the largest contains 3,334 regions. The collection is about 128 MiB and is excluded from service-worker installation precaching. An asset insertion that would exceed the total scene object limit is rejected before changing the figure. Thumbnails load while browsing; SVGs load on insertion or when the user explicitly prepares the offline pack.

[Snapshot receipt](../opensketch-generated-snapshot.json) records canonical names, aliases and source review notes. [Derivative receipt](../opensketch-generated-derivatives.json) records the recipe and source/output hashes. Original masters remain available on the artwork branch through each asset's source link. Derivatives approximate gradients and very fine projections; they are not lossless copies of the masters. Side-by-side contact sheets were inspected for all 211 entries. A pixel comparison also records silhouette/color differences; it is a diagnostic, not a biological validation or proof of visual equivalence.

To refresh, first select and review a new immutable production commit. From this worktree, with the pinned Python dependencies installed:

```sh
python scripts/assets/trace-generated-app.py <40-character-source-commit>
node scripts/assets/sync-generated.mjs <40-character-source-commit>
pnpm exec tsx scripts/scientific/export-presets.ts
```

Inspect the derivatives and run the artwork and scientific-structure tests before publishing. Do not run the sync against another agent's uncommitted work or overwrite the protected planning inventories. Integration hooks are confined to the manifest, shape creation, selection controls, inspector and strict project metadata validation. The geometry and settings contract live in editor-core; no host/persistence service extraction was attempted.

## Public behavior references

BioRender's public help documents describe repeated membrane, nucleic-acid, vessel and cell brushes ([Using brushes](https://help.biorender.com/hc/en-gb/articles/17605467111837-Using-brushes)), path anchors, unit sizing and conversion into separate parts ([Editing brushes](https://help.biorender.com/hc/en-gb/articles/17605491754013-How-to-edit-your-brushes)), and antibodies with movable components ([Editable antibodies](https://help.biorender.com/hc/en-gb/articles/22196673682589-Editable-antibody-icons)). These informed functional coverage only. No BioRender artwork, screenshots, SVG source, private catalog or template geometry was imported. Public help is not an exhaustive inventory of every editable BioRender asset.

## Validation

Unit coverage includes legacy shape preservation, new preset geometry, fixed endpoints during rotated/nested edits, cloning, strict project round-trips, malformed settings, palette retention, conversion and cell containment. The artwork tests check all 211 hashes, path budgets, palette limits, categories, thumbnails and alias deduplication. Browser coverage exercises real handle dragging, undo/redo, bending, recoloring, save/reload, SVG export, conversion, source filtering, insertion and alias search. Type checking and production build are run locally. Hosted GitHub Actions remain intentionally disabled.

[Visual QA report with interaction recording and all artwork comparison sheets](https://pub-2522e09cc0ae4b1ba2ff37cbba779674.r2.dev/opensketch/scientific-structures-20260905/index.html). Final local validation: 477 unit tests, two Chromium end-to-end tests, typecheck and production build passed. All four protected baseline file hashes match.

## Sidebar follow-up

The Assets sidebar now exposes only OpenSketch generated artwork and OpenSketch structures (228 cards total). All 17 structural presets carry an **Editable** badge and a teal outline. Here “Editable” means path controls or movable semantic components; it distinguishes them from artwork composed of traced color regions. Clicking or dragging a structure card creates the procedural object, preserving its controls. Search includes the editable keyword.

NIH BioArt, SciDraw, BioIcons, Arcadia and other prior collections are excluded from browsing, search, source filters, recent/favorite results and the offline pack UI. Their files and a separate internal lookup manifest remain for existing project references. The About dialog no longer advertises those sources. Stale source filters reset to All sources.

Validation: 478 unit tests, three targeted Chromium flows, typecheck and production build pass. [Sidebar screenshots and recording](https://pub-2522e09cc0ae4b1ba2ff37cbba779674.r2.dev/opensketch/editable-sidebar-20260905/index.html).

## Circular membranes

Curved membrane and Membrane ring now use an analytical circular arc, rather than a three-point interpolated path. Lipid positions have constant radius and follow the circle tangent. The curved preset begins as a semicircle; the ring begins at 360°. In Edit, set radius and arc angle, drag the radius/arc-end handles, or choose **Make full circle**. A full circle has no duplicated lipid at its seam. Save/reload retains the circular settings. Existing freeform membrane objects remain readable and offer **Use circular arc** to convert them explicitly.

Two additional asset cards, **Circular membrane (fixed)** and **Circular monolayer (fixed)**, provide complete circular SVG artwork without procedural controls or an Editable badge. They retain ordinary SVG placement, rotation and scaling. The sidebar now contains 230 OpenSketch assets, including the 17 Editable structures. These new files do not replace any original inventory entry.

Validation covers constant radius and tangent orientation at 30°, 180°, 270°, 359° and 360°, a rotated arc edit retaining its center, strict metadata validation, full-circle save/reload, and insertion of a fixed circle without procedural metadata. [Circular membrane screenshots and recording](https://pub-2522e09cc0ae4b1ba2ff37cbba779674.r2.dev/opensketch/round-membranes-20260905/index.html).

## Curvature controls

The Edit panel now offers a signed curvature slider and Straighten for open bilayers, monolayers, decorated surfaces, protein-domain chains, RNA, vessels, epithelial rows, actin, microtubules and chromatin. Positive and negative angles bend in opposite directions. Changing curvature replaces the freeform path with a uniform circular arc while preserving both endpoints, including on rotated or scaled objects. Unit size and styling remain unchanged. Closed circles have a looser/tighter curvature slider that changes radius while preserving the center. Existing radius, sweep and canvas handles remain available.

DNA retains its existing manual path editing; fixed SVGs and separate semantic components do not receive procedural curvature controls. Composite authors should use these editable structures with existing protein and cell assets rather than redraw a complete composite. Curvature is saved in the project and participates in the existing property-edit undo history.

Validation: 483 unit tests, five Chromium interaction tests, typecheck and production build pass. Tests cover signed curvature, endpoint preservation, straightening, undo and reload. A recorded visual check also verifies closed-circle tightening. [Screenshots and recording](https://pub-2522e09cc0ae4b1ba2ff37cbba779674.r2.dev/opensketch/curvature-controls-20260905/index.html).

## Asset color palettes

Edit now exposes 60 presets: fifteen color families with Light, Soft, Classic and Deep shades. Restore to Default restores the source palette. Presets recolor existing vector paints in memory; no SVG variants are generated. Existing preset IDs remain available.

For traced artwork, presets recolor regions larger than 0.03% of the asset's area, including contrasting large structures such as nuclei. Smaller regions retain their original paints even when they share a color with a larger region. Area is estimated from each path's bounding box and transform; this is a size heuristic, not organelle recognition. Neutral dark outlines, bright highlights and alpha values remain intact. Large regions use distinct shades of the selected palette. Procedural structures theme both body and accent roles while retaining their outline colors. Curvature edits retain the selected colors.

Validation covers palette uniqueness, contrasting colors, alpha preservation, exact original restoration, undo, project reload, and membrane curvature after recoloring. [Visual examples and recording](https://pub-2522e09cc0ae4b1ba2ff37cbba779674.r2.dev/opensketch/asset-region-palettes-20260905/index.html).

The palette now opens in a wider pop-out, including White, Gray and Charcoal rows and a single Restore to Default button in the sidebar. New SVGs can declare explicit color roles; see [the generation handoff](GENERATION-HANDOFF.md).
