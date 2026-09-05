# Instructions for the future Astra asset agent

## Current authorization

The user subsequently authorized the app integration and palette controls on this branch. Follow [GENERATION-HANDOFF.md](GENERATION-HANDOFF.md) for new asset construction, explicit color roles and the first review batch. Keep the original 768-name inventories and unrelated production artwork unchanged. Do not treat the planning catalog as proof that pending assets already exist.

## Reuse contract

1. Read the chosen recipe, its caveat and source location. Recheck the current library and the corresponding existing roadmap concept before starting.
2. Resolve each dependency by stable asset ID. Reuse completed **OpenSketch library assets**. A pending inventory item remains a dependency; its presence in a checklist does not mean artwork exists.
3. Instantiate each component as a linked library instance. Use separate instance IDs and transforms when a recipe repeats a cell, protein, lipid or antibody. Preserve its library source identity and provenance.
4. Build composites as editable groups of these instances, with independent labels, membranes, state overlays and connectors. **Do not generate an entire pathway or tissue scene from scratch as a single SVG. Do not flatten the group into replacement artwork.** An exported figure may be a single SVG file, but its internal component identity and editable grouping must remain recoverable.
5. A renamed generic protein usually needs an identity preset, not newly generated artwork. Kinases, phosphatases and many named factors can use the same archetype with correct labels. A meaningful new topology or morphology can justify a primitive candidate. A007–A009 in particular should first be attempted with editable belt/strand geometry.
6. Create a genuinely missing component only during a later explicitly authorized production task. Record its new library ID and update the recipe dependency. Never hide a missing primitive by baking it into a whole-scene image.
7. Use our current approved OpenSketch styling: existing palette, outlines, shading, scale and view conventions. Resolve those choices from the current approved library, not from a commercial reference image. These specifications intentionally do not invent fixed styling values.

## Scene description to implementation

For each recipe, create an assembly manifest during implementation containing:

- Scene ID, recipe ID/version, source URLs and applicable scientific context (organism, cell type or assay generation).
- Instances with library ID, role, transform, compartment and state. Counts in a teaching scene are illustrative unless the evidence explicitly supports stoichiometry.
- Attachment anchors with membrane side and ligand/substrate-facing direction. Suggested roles include extracellular binding, cytosolic signaling, lumen, apical face, basal face and DNA strand endpoints.
- Typed relationships: binding, recruitment, transport, conversion, activation, inhibition or association. An arrow must have one stated meaning; a binding line must not silently mean catalysis.
- Groups, independent labels, optional panels and view-specific occlusion. Keep all inputs editable rather than rendering labels into artwork.
- Dependency availability and unresolved checks. Do not label a scene complete while required components or scientific decisions remain unresolved.

Native circles, arrows, brackets, text and simple compartment boundaries do not require new scientific artwork. They still need explicit meaning: Fe tokens are iron annotations, P tokens indicate a stated phosphorylation context, and arbitrary colored blobs are not evidence of an atomic structure.

## Scientific checks before accepting a composite

Check membrane orientation, compartment continuity, strand direction and reaction order against the cited scope. Preserve identity across sequential states. Distinguish measured quantities from illustrative multiplicity, and ligand occupancy from guaranteed downstream function.

Use the entry's caveat as an acceptance condition. Examples: keep IFNAR's STAT1/STAT2/IRF9 complex distinct from a STAT1 homodimer; perform the cited ATAC bulk transposition before droplet partitioning; distinguish C3b opsonization from terminal pore formation; do not call every Annexin/dye double-positive cell late apoptotic.

An exact protein structure, binding pose, quantitative stoichiometry, diagnostic conclusion or species-specific mechanism needs evidence beyond an archetype. Reopen the cited source and retrieve a specific primary reference when that detail becomes necessary. Source-checked schematic scope is not atomic structural validation.

## Presets, existing composites and brainstorms

Presets P001–P018 reuse baseline artwork and add no primitive count. Composite entries marked `roadmap_expansion` or `baseline_expansion` extend the named existing concept. Associate their specification with that concept instead of creating a duplicate top-level asset.

Brainstorms B001–B036 are not source-verified. Complete each entry's required verification, resolve remaining morphology needs, repeat deduplication and assign evidence before promoting it. Neither a plausible name nor a future-source suggestion is a verified scientific description.

## Reference provenance

Use the independently written scientific descriptions and linked factual sources. This planning dataset contains no BioRender screenshots, catalog exports, descriptions or traced layouts. Do not build a commercial-asset reference archive or reproduce a template's visual composition from its description. Scientific pathway relationships can guide an original layout; the layout itself must be designed for our components and styling.

## Preservation and final acceptance

Keep the original inventory and additions files unchanged. A later production task should record new work separately and preserve unrelated worktree changes. Before marking a composite done, check resolved dependency IDs, inspect its rendered result at normal and enlarged size, verify labels/connectors and retain an editable assembly manifest. These are future acceptance instructions; no artwork verification is claimed by this planning branch.
