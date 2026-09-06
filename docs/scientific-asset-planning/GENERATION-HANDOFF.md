# Asset-generation handoff

This contract incorporates the user's palette and construction decisions through this branch. Preserve the original 768-name inventory. Use the existing catalog and deduplication records before creating anything. The app supports palette changes dynamically; do not generate one SVG per color.

## Color roles and defaults

Every painted element in a newly authored SVG must inherit or declare one of these attributes:

| Attribute | Meaning | Palette behavior |
|---|---|---|
| data-color-role="primary" | Main body, including white bodies and gray equipment | Theme at every size |
| data-color-role="secondary" | Nucleus, large domains, substantial internal structures | Theme in a distinct source shade |
| data-color-role="outline" | Boundary and structural lines | Preserve |
| data-color-role="highlight" | Deliberate neutral shine or separation | Preserve |
| data-color-role="detail" | Tiny identifying features, eyes, small accents | Preserve |

Group-level roles inherit; a child's explicit role overrides its parent. Large organelles are secondary, never detail merely because their original hue differs. Use separately tagged outline paths when a fill and outline need different behavior. Retain source lightness differences between primary and secondary regions, even if both start gray or white. Pure white primary fills can now be themed; white highlight regions remain white.

Store the intended default paints in the original SVG. A white mouse stays white by default; a gray pipette stays gray. Import captures those paints, Restore to Default restores every source paint exactly. The app supplies one swatch for each of fifteen color families, including white, gray and charcoal, plus continuous saturation and brightness adjustments. Do not substitute a generic neutral preset for exact default restoration.

Roles survive native project save/reload. A standalone exported SVG preserves the rendered vectors and colors; do not assume it retains the native project metadata. Deliver the source SVG with roles plus an editable native project when component identity must survive.

Existing traced assets remain under the size-based fallback. Do not automatically assign organelle roles to traced fragments or rewrite the approved production artwork.

## Construction and styling

Use flat 2D views suitable for detailed composites. Match the approved OpenSketch examples in this branch. Prefer simple paths, circles and explicit groups with clean alignment and shared attachment anchors. Keep labels as separate editor text objects.

For the first newly authored batch, use a 256-unit square viewBox, a 2-unit outer stroke and a 1-unit detail stroke as the comparison baseline; use rounded joins/caps where appropriate. These are pilot values to assess alongside approved artwork, not a mandate to rescale existing SVGs. Keep a transparent canvas and enough inset to prevent clipped strokes. Avoid perspective, baked shadows and raster fragments. Target at most 250 painted elements per primitive; explain exceptions. The checker rejects more than 1000 elements or 1 MB in newly authored primitives.

Extendable membranes, vessels and chains must use existing procedural geometry, preserving repeated-unit size while changing length or curvature. Reuse the procedural renderer rather than constructing a stretched static SVG. Check mirrored orientation and membrane-side attachments explicitly.

## Composites

Follow ASSEMBLY-INSTRUCTIONS.md. Resolve dependencies to stable library IDs. Reuse existing cells, receptor/protein objects, membranes, labels and connectors as separate editable instances. Do not draw a whole pathway as one replacement asset.

Record each instance ID, library ID, transform, biological role and attachment anchors in an assembly manifest. Keep primary/secondary color roles inside components. Do not impose a cell palette on an entire multi-cell composite. Labels and connection meanings remain independent of color.

## First production batch

Use this representative batch before scaling production. It is a review checklist, not a claim that new production artwork has been generated or approved.

| Sample | Existing reference / reuse | Required evidence |
|---|---|---|
| Detailed cell | opensketch-generated-generic-epithelial-cell | Body and nucleus theme together; tiny details stay distinct; 64 px and figure-size views |
| Receptor | editable-receptor | Movable domains, membrane anchor and a contrasting secondary shade |
| Membrane | editable-membrane | Straight, curved and circular forms; dense aligned lipids; colors survive geometry edits |
| Composite | Instances of editable-membrane and editable-receptor plus a library protein | Independent editable components and labels, retained library IDs, readable connections |

Also check a neutral asset pair: opensketch-generated-laboratory-mouse and opensketch-generated-micropipette. Confirm Restore to Default restores native white/gray colors exactly.

For each sample, capture original, green, blue, red and neutral palettes at sidebar size and figure size. Check clipping, misplaced parts, opacity, line weight and small-feature legibility. Exercise undo, save/reload, resizing and vector export. Submit the actual rendered sample batch for review before bulk generation.

## Validation entry points

Run the new-authoring checker on source SVGs:

    python3 docs/scientific-asset-planning/tools/check-authored-svg.py path/to/new-asset.svg

The checker validates role coverage, viewBox, element limits and forbidden embedded content. It cannot establish biological accuracy, visual alignment or a correct anatomical role. Also run the existing SVG sanitizer and inspect the rendered result.

The synthetic tests/fixtures/asset-color-roles.svg fixture exercises role inheritance and white/gray defaults; it is a software fixture, not a scientific asset. Automated browser coverage checks recoloring, original restoration, popup behavior and persistence. Current approved cell and procedural membrane fixtures provide regression evidence; they do not replace review of newly generated artwork.

## Current regression evidence

The existing detailed cell, procedural membrane, receptor and grouped receptor–membrane assembly have been exercised in the app. Their component identities survive native save/reload. Mouse and micropipette defaults restore exactly after recoloring and reopening a project. Empty, non-rendering paths in the existing mouse SVG are excluded during import so the resulting scene remains portable; approved source files remain unchanged.

Validation: 489 unit tests, 11 Chromium flows, typecheck and production build passed. The new-authoring checker passed its valid fixture and rejected a malformed fixture. [Screenshots and recording](https://pub-2522e09cc0ae4b1ba2ff37cbba779674.r2.dev/opensketch/palette-popout-20260905/index.html). This verifies the editor contract and existing references; a future newly generated production batch still needs its own visual acceptance.

Saturation and brightness use immutable base paints, preserve protected details and alpha, and survive native save/reload. Restore to Default resets both adjustments. Historical shade IDs remain readable for old projects; new UI choices use the base family swatches.

## Broad component editing: one level only

Author a useful top-view asset as two to eight broad `<g data-component="…">`
regions when appropriate: for example cell body, nucleus and a large organelle
cluster. Use meaningful component names. Keep outlines, highlights and tiny marks
inside their owning component, with the existing `data-color-role` declarations.
Nested SVG groups inside a component are permitted for construction, but the
editor treats the whole component as one selectable unit. Repeated double-clicks
must never expose its individual paths or smaller subgroups.

Single click selects the complete asset. Double-click enters its component level;
click a component to move, resize, rotate or recolor it. Done exits that level.
These internal groups are not new sidebar library assets. Keep pathway/composite
assemblies as reusable library instances with their existing identities.

New insertions can also infer a few solid oval or rectangular regions from flat SVG geometry.
This does not identify anatomy: inferred groups use neutral region names. A
render comparison rejects changes beyond negligible edge antialiasing, and
ambiguous assets and regions with inseparable backing contours remain whole. Existing saved figures are not automatically
regrouped. Prefer authored components for future assets; do not rely on tracing
or inference to recover their biological structure.
