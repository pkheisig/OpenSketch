# Abstract SVG production guidelines

Use these guidelines when creating, simplifying, assembling, or reviewing abstract scientific SVGs. They record the user's approved direction from the September 6, 2026 SVG studies: visibly reduced detail with the source's recognizable structure, rough shape, proportions, and internal spatial relationships preserved.

## Approved visual standard

Start by opening the [corrected reference gallery](https://pub-2522e09cc0ae4b1ba2ff37cbba779674.r2.dev/OpenSketch/abstract-svg-study/20260906-abstract-corrected/index.html). The user approved this set after corrections to the proteasome, mitochondrion, plasma cell, and neutrophil. The accompanying [reference manifest](approved-reference-manifest.json) pins the ten SVGs by SHA-256 and links to downloadable artwork and browser evidence. These examples establish illustration quality; they are schematic drawings, not validated molecular structural models.

The earlier `shape-preserved`, `abstract-balanced`, and `abstract-simple` studies are iteration history, not the current target. The three initial user SVGs helped establish palette and shading, but their tracing-generated complexity is not a minimum requirement. The later approval of simpler drawings supersedes the earlier request to match their code complexity.

For this abstract workflow, work directly in SVG using existing PNG/SVG assets as visual references. Reuse suitable vector contours and components, or redraw simpler geometry against those references. The older collection's PNG-first generation and tracing recipe is historical context, not the production method for these abstract variants. A rendered PNG preview does not make the SVG raster-derived.

## What to preserve and what to simplify

Preserve the silhouette, width-to-height ratio, orientation, major indentations and lobes, dominant compartments, and defining structures. Keep meaningful holes, channels, ring arrangements, membrane boundaries, attachment points, and subunit relationships. An observer should recognize the same object and view in both versions.

Circular reference bodies must remain circular. Use equal radii for circular envelopes and verify their displayed width and height after transforms and export. Scale uniformly in the SVG and preview; never stretch a circle to fit a display box. Check the body itself rather than bounds enlarged by protruding proteins. Preserve reference ellipses when they express a perspective opening or genuinely elongated anatomy; preserve irregular outlines when the reference is irregular.

Reduce repeated decorative detail: fine surface bumps, small shading islands, excess granules, dense ribosome stippling, minor folds, and repeated membrane units. Use fewer representative elements while retaining their arrangement and meaning. Preserve counts when they encode biological identity or a specified stoichiometry; a schematic repeated-unit count must not imply a measured or exact molecular structure.

Use broad flat colour areas with restrained shadows or highlights where they clarify depth or separate parts. Match the approved asset's palette family: purple/teal proteins, peach mitochondrial membranes, pink Golgi and lysosome structures, and cool cell interiors. Use smooth, deliberate contours and consistent visible boundary weights. A small palette is useful; a fixed colour count is not a quality target.

Judge simplification in the rendered image at ordinary gallery size. Lower file size, fewer paths, or fewer colours alone do not demonstrate a successful change. When asked to simplify further, reduce visible internal detail as well as shading. The difference must be apparent without zooming or reading metrics, while the defining structures remain clear.

## Workflow and completion criteria

1. **Inspect references before drawing.** Open the existing asset's SVG and PNG where available, plus a relevant approved abstract example. Record the exact reference path or URL and hash, its visible bounds, and the structures that identify it. Record which details may be reduced. This step is complete when shape, topology, and decorative detail are distinguished for the specific asset.
2. **Establish the outer shape and layout.** Match the reference orientation, visible aspect ratio, major contours, compartment positions, and negative spaces before adding colour detail. Reuse a source outline or simplify a sampled vector boundary when freehand reconstruction drifts. Measure visible artwork bounds rather than the padded SVG canvas. This step is complete when a silhouette comparison shows the same rough object and view.
3. **Simplify deliberately.** Draw larger, smoother regions and fewer repeated internal elements. Keep coherent subunits, compartments, and open spaces. Group biological parts where practical, and reuse existing geometry for assemblies. This step is complete when simplification is visible and no defining feature has disappeared.
4. **Check internal geometry.** Inspect every compartment boundary, organelle, pore, and attachment. Check containment including strokes and transforms. Keep visible clearance where structures are separate; retain contact only where it is biologically intended. Use transformed point samples and boundary-distance checks for questionable overlaps, then inspect the render. This step is complete when accidental touching, crossing, clipping, and misplaced contents have been resolved.
5. **Compare renders at matched scale.** Show reference, previous iteration, and current drawing when revising. Normalize visible bounds to the same display box with uniform scaling, preserving each aspect ratio. Inspect a gallery-sized image and a larger detail view on light and dark or checkerboard backgrounds. This step is complete only after reviewing every changed asset and correcting discrepancies visible in the output.
6. **Validate and save evidence.** Parse SVGs, check unique IDs, complete viewBoxes, transparency, and safe vector content. Render the final files in a browser; verify images load and open the SVGs under review. Save provenance, measurements, preview images, browser screenshots, and available recordings. Publish review evidence through the established R2 route and verify the links. Record unavailable checks precisely. This step is complete when the saved artifact and displayed evidence describe the same version.
7. **Preserve versions and report status.** Save revisions separately, retaining approved originals and earlier attempts. Record which assets changed and what was checked. Keep generated, accepted, committed, pushed, and app-integrated states separate. Commit or push artwork only within the user's authorization; sharing preview evidence does not imply a Git push or app integration.

## Geometry lessons from the approved corrections

| Asset or feature | Failure observed | Required check and correction |
| --- | --- | --- |
| Proteasome | The simplified barrel became wider relative to its height and its top exceeded the viewBox. | Compare visible proportions with the reference and retain the stacked rings and central pore. The measured reference width/height was about 0.622; the rejected redraw was about 0.791. Those values belong to this view, not every proteasome illustration. Include all geometry and strokes within the viewBox. |
| Mitochondrion | A freehand outline became rounder and lost the reference's characteristic bend; one revised crista crossed the inner membrane. | Derive the simplified silhouette from the existing outline where needed. Preserve the kidney-like bend and double membrane. Keep the reduced cristae within the inner membrane and retain the intended attachment relationships. |
| Plasma cell | Outer ER curves reached the cell membrane; peripheral organelles were crowded. | Keep the eccentric nucleus and internal arrangement. Move or reshape ER and nearby organelles to leave a visible cytoplasmic gap. Check the entire curves and their stroke widths, not just endpoints or centres. |
| Neutrophil | Decorative granules were drawn over the nucleus. | Keep granules in cytoplasm and preserve the connected lobulated nucleus. Check overlaps after every placement change. |
| Transport vesicle | Removing small paths by area erased parts of the membrane unevenly. | Simplify the repeated units coherently into continuous bands and a reduced representative pattern. Preserve the enclosing boundary and luminal contents. |
| Aquaporin | Aggressive path removal eliminated a pore. | Preserve every meaningful channel opening in the chosen schematic view. Simplify surrounding folds rather than removing defining negative space. |
| Ribosome | Surface reduction can erase the distinction between large and small subunits. | Retain the two-subunit layout, cleft, and broad lobe organization while reducing micro-lobes and surface texture. |
| Golgi | Repetition can be reduced without losing the stacked organization. | Keep curved cisternae, stack orientation, separation, and representative vesicles. In a cell assembly, also check spacing from the nucleus and plasma membrane. |

Measure aspect ratio and landmark placement as diagnostics, not as substitutes for viewing the drawing. A matching bounding box can still contain the wrong contour or arrangement. Avoid solving a local shape error by stretching the entire drawing and distorting its subunits.

## Approaches that failed

- **Matching path counts or bytes.** Hundreds of tracing-generated regions do not define the desired detail level. The accepted examples use far fewer deliberate shapes. Do not add detail or code merely to resemble reference metrics.
- **Palette-only simplification.** Reducing colours from 24 to 8 to 6 produced changes the user repeatedly found too small. Simplify the visible structures when the request concerns detail.
- **Global largest-path filtering.** Area ranking cannot distinguish highlights from biologically meaningful small features. It removed membrane elements and pores. Use it only as a draft aid followed by asset-specific inspection and reconstruction.
- **Inventing a generic replacement shape.** A clean-looking icon still fails if the original silhouette, proportions, or component layout changes. Use the existing artwork to constrain the redraw.
- **Trusting a successful render.** Valid XML, a completed screenshot, and fewer paths do not establish correct geometry. Inspect the actual final image and state any remaining limitation.
- **Unfair comparisons.** Unequal padding, stretching to fill a box, clipped artwork, or black resize padding obscure the result. Use transparent padding, uniform scaling, matching visible display size, and clear version labels. Verify labels are present in the exported overview.

## SVG and evidence requirements

Use editable vector elements with stable unique IDs. Prefer useful biological groups over arbitrary colour-region groups; describe the actual grouping rather than claiming semantic editability for a trace. Reuse canonical components in composites when appropriate. Keep standalone SVGs free of embedded raster images, scripts, foreignObject content, and external rendering dependencies.

Set the viewBox from complete visible geometry with room for strokes. A source canvas size or a copied viewBox may clip a redraw. Preview resizing must preserve transparency and aspect ratio. Inspect the SVG itself as well as a PNG thumbnail.

Record reference identity, output hash, generation or editing method, version, and actual QA observations. Distinguish reused paths, newly drawn geometry, and PNG-derived tracing. Hashes prove file identity, not visual correctness. Sampled containment checks can miss narrow crossings; pair them with stroke-aware inspection and a browser render. Clearance measurements from one asset are examples, not universal thresholds.

For ambiguous anatomy or a reference that cannot resolve a meaningful structural choice, ask a focused question. Otherwise continue routine drawing, comparison, and correction autonomously. Preserve the approved simplification level while fixing geometry; avoid reintroducing fine detail to hide a shape error.

## Final acceptance checklist

- [ ] Same recognizable object, view, rough silhouette, proportions, and compartment layout as the reference.
- [ ] Circular bodies remain circular after transforms and export; perspective ellipses and irregular reference shapes remain intentional.
- [ ] Defining pores, boundaries, connections, and biologically meaningful arrangements preserved.
- [ ] Simplification visible at normal display size; unnecessary fine detail removed coherently.
- [ ] No accidental membrane contact, compartment crossing, misplaced contents, or clipped geometry.
- [ ] Reference and final compared fairly; every modified SVG visually inspected at normal and enlarged sizes.
- [ ] SVG structure, IDs, transparency, and standalone rendering checked; evidence tied to final hashes.
- [ ] Previous versions preserved; approval and Git/app integration status reported accurately.
