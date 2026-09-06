# Further asset and recipe ideas

36 independently brainstormed specializations. These have not been source-verified and are not ready for scientific implementation. Each lists the exact check still required and existing library coverage. Do not count them as 36 new primitive assets.

[Catalog guide](README.md) · [Assembly rules](ASSEMBLY-INSTRUCTIONS.md)

<a id="b001"></a>

## B001 — Stomatal opening and closing comparison

**Category:** Plant biology. **Disposition:** specialized_recipe_candidate.

**Proposed scene:** Reuse guard cells and a leaf-surface frame in matched open and closed states; add independent water/ion annotations rather than deforming the entire leaf.

**Required verification:** Verify guard-cell geometry, ion transport and the selected environmental response in an authoritative plant source.

**Existing coverage:** stomatal guard-cell pair. Expand that concept; do not add a duplicate primitive.

**Reusable dependencies:** `stomatal-guard-cell-pair` (stomatal guard-cell pair; pending at baseline); `leaf` (leaf; pending at baseline).

<a id="b002"></a>

## B002 — Root radial water-transport routes

**Category:** Plant biology. **Disposition:** specialized_recipe_candidate.

**Proposed scene:** Construct a layered root cross-section using plant cells and wall segments; distinguish wall-space and cytoplasmic routes with separate connectors.

**Required verification:** Verify endodermal barrier placement, route definitions and which new topology components are actually needed.

**Existing coverage:** root system. Expand that concept; do not add a duplicate primitive.

**Reusable dependencies:** `root-hair-cell` (root hair cell; pending at baseline); `generic-plant-cell` (generic plant cell; pending at baseline); `plant-cell-wall-segment` (plant cell wall segment; pending at baseline).

<a id="b003"></a>

## B003 — Source-to-sink phloem transport

**Category:** Plant biology. **Disposition:** specialized_recipe_candidate.

**Proposed scene:** Connect a source leaf and a sink organ through a clearly labeled vascular path, using editable loading and unloading insets.

**Required verification:** Verify transport model and tissue anatomy; sieve elements may need a genuinely distinct building block.

**Existing coverage:** root system. Expand that concept; do not add a duplicate primitive.

**Reusable dependencies:** `leaf` (leaf; pending at baseline); `root-system` (root system; pending at baseline); `seed` (seed; pending at baseline); `generic-plant-cell` (generic plant cell; pending at baseline).

<a id="b004"></a>

## B004 — Thylakoid electron-transfer map

**Category:** Plant biology. **Disposition:** specialized_recipe_candidate.

**Proposed scene:** Use the chloroplast context and a membrane inset with labeled protein nodes, electron arrows and a separate proton path.

**Required verification:** Verify photosystem order, membrane sides and proton stoichiometry before adding quantitative labels.

**Existing coverage:** roadmap:59. Expand that concept; do not add a duplicate primitive.

**Reusable dependencies:** `chloroplast` (chloroplast; pending at baseline); `lipid-bilayer-cross-section` (lipid bilayer cross-section; complete at baseline); `atp-synthase` (ATP synthase; complete at baseline); `generic-globular-protein` (generic globular protein; complete at baseline).

<a id="b005"></a>

## B005 — Mycorrhizal root interface

**Category:** Plant biology. **Disposition:** specialized_recipe_candidate.

**Proposed scene:** Place fungal hyphae beside a root cell context and use separate nutrient-exchange arrows across a labeled interface.

**Required verification:** Select arbuscular or ectomycorrhizal organization; verify the relevant interface rather than blending the two.

**Existing coverage:** root system. Expand that concept; do not add a duplicate primitive.

**Reusable dependencies:** `filamentous-fungal-hypha` (filamentous fungal hypha; pending at baseline); `root-hair-cell` (root hair cell; pending at baseline); `generic-plant-cell` (generic plant cell; pending at baseline).

<a id="b006"></a>

## B006 — Pollen tube guidance to an ovule

**Category:** Development. **Disposition:** specialized_recipe_candidate.

**Proposed scene:** Reuse pollen and floral context with an editable tube path and destination inset.

**Required verification:** Verify tissue geometry and fertilization stages; identify whether tube or ovule topology is missing.

**Existing coverage:** flower. Expand that concept; do not add a duplicate primitive.

**Reusable dependencies:** `pollen-grain` (pollen grain; pending at baseline); `flower` (flower; pending at baseline); `generic-plant-cell` (generic plant cell; pending at baseline).

<a id="b007"></a>

## B007 — Bacterial sporulation stage sequence

**Category:** Microbiology. **Disposition:** specialized_recipe_candidate.

**Proposed scene:** Reuse a rod bacterium and spore in successive compartment states; make septum and envelope overlays independently editable.

**Required verification:** Verify species-specific septation, engulfment and coat order.

**Existing coverage:** bacterial endospore. Expand that concept; do not add a duplicate primitive.

**Reusable dependencies:** `rod-shaped-bacterium` (rod-shaped bacterium; pending at baseline); `bacterial-endospore` (bacterial endospore; pending at baseline); `plasma-membrane-segment` (plasma membrane segment; complete at baseline).

<a id="b008"></a>

## B008 — Asymmetric yeast budding and separation

**Category:** Microbiology. **Disposition:** specialized_recipe_candidate.

**Proposed scene:** Arrange linked yeast instances across bud emergence, growth and separation; preserve mother/bud identity across panels.

**Required verification:** Verify nuclear segregation and cell-wall remodeling events for a chosen organism.

**Existing coverage:** budding yeast cell. Expand that concept; do not add a duplicate primitive.

**Reusable dependencies:** `budding-yeast-cell` (budding yeast cell; pending at baseline); `nucleus` (nucleus; complete at baseline); `actin-filament` (actin filament; complete at baseline).

<a id="b009"></a>

## B009 — Biofilm dispersal versus growth

**Category:** Microbiology. **Disposition:** specialized_recipe_candidate.

**Proposed scene:** Reuse bacterial groups and extracellular matrix in two panels; release a subset into a separate planktonic lane.

**Required verification:** Verify dispersal triggers and matrix composition for a specified biofilm model.

**Existing coverage:** roadmap:76. Expand that concept; do not add a duplicate primitive.

**Reusable dependencies:** `bacterial-biofilm-microcolony` (bacterial biofilm microcolony; pending at baseline); `rod-shaped-bacterium` (rod-shaped bacterium; pending at baseline); `extracellular-dna-web` (extracellular DNA web; pending at baseline).

<a id="b010"></a>

## B010 — Conjugative DNA transfer and establishment

**Category:** Microbiology. **Disposition:** specialized_recipe_candidate.

**Proposed scene:** Use the existing conjugation pair and a plasmid inset to distinguish donor DNA, transferred strand and recipient establishment.

**Required verification:** Verify strand processing, transfer direction and replication stages for a selected plasmid system.

**Existing coverage:** roadmap:75. Expand that concept; do not add a duplicate primitive.

**Reusable dependencies:** `bacterial-conjugation-pair-with-pilus` (bacterial conjugation pair with pilus; pending at baseline); `circular-plasmid-dna` (circular plasmid DNA; pending at baseline); `single-stranded-dna` (single-stranded DNA; pending at baseline).

<a id="b011"></a>

## B011 — Bacterial efflux versus reduced entry

**Category:** Microbiology. **Disposition:** specialized_recipe_candidate.

**Proposed scene:** Build matched cell-envelope panels separating outward active transport from inward permeability changes.

**Required verification:** Verify the chosen pump family; do not substitute an ABC transporter for every efflux mechanism.

**Existing coverage:** roadmap:84. Expand that concept; do not add a duplicate primitive.

**Reusable dependencies:** `gram-negative-cell-envelope-cross-section` (Gram-negative cell-envelope cross-section; pending at baseline); `abc-transporter` (ABC transporter; pending at baseline); `small-molecule-drug` (small-molecule drug; pending at baseline).

<a id="b012"></a>

## B012 — Phage lytic and lysogenic decision diagram

**Category:** Microbiology. **Disposition:** specialized_recipe_candidate.

**Proposed scene:** Branch the existing phage/host context into replicated-particle production and integrated-genome maintenance states.

**Required verification:** Choose a temperate phage and verify integration, induction and lifecycle boundaries.

**Existing coverage:** roadmap:78. Expand that concept; do not add a duplicate primitive.

**Reusable dependencies:** `bacteriophage` (bacteriophage; pending at baseline); `rod-shaped-bacterium` (rod-shaped bacterium; pending at baseline); `viral-dna-genome` (viral DNA genome; pending at baseline); `dna-double-helix` (DNA double helix; pending at baseline).

<a id="b013"></a>

## B013 — Antibody class-switch DNA rearrangement

**Category:** Immunology. **Disposition:** specialized_recipe_candidate.

**Proposed scene:** Use a labeled DNA locus and a B-cell context, keeping variable-region identity separate from constant-region replacement.

**Required verification:** Verify switch-region topology and distinguish class switching from somatic hypermutation.

**Existing coverage:** B lymphocyte. Expand that concept; do not add a duplicate primitive.

**Reusable dependencies:** `b-lymphocyte` (B lymphocyte; complete at baseline); `dna-double-helix` (DNA double helix; pending at baseline); `igg-antibody` (generic IgG antibody; complete at baseline); `igm-pentamer` (IgM pentamer; pending at baseline).

<a id="b014"></a>

## B014 — Germinal-center selection itinerary

**Category:** Immunology. **Disposition:** specialized_recipe_candidate.

**Proposed scene:** Arrange linked B-cell states and helper-cell contacts inside a lymphoid context, with explicit movement and selection connectors.

**Required verification:** Verify light/dark zone roles and whether follicular dendritic-cell morphology is a missing primitive.

**Existing coverage:** lymph node cross-section. Expand that concept; do not add a duplicate primitive.

**Reusable dependencies:** `b-lymphocyte` (B lymphocyte; complete at baseline); `t-lymphocyte` (T lymphocyte; complete at baseline); `lymph-node-cross-section` (lymph node cross-section; pending at baseline); `antigen-antibody-immune-complex` (antigen-antibody immune complex; pending at baseline).

<a id="b015"></a>

## B015 — Leukocyte rolling to arrest under flow

**Category:** Immunology. **Disposition:** specialized_recipe_candidate.

**Proposed scene:** Reuse an endothelial strip and leukocyte instances, with selectin and integrin insets linked to sequential movement states.

**Required verification:** Verify receptor-ligand pairs, affinity states and the selected leukocyte context.

**Existing coverage:** roadmap:23. Expand that concept; do not add a duplicate primitive.

**Reusable dependencies:** `endothelial-monolayer` (endothelial monolayer; pending at baseline); `neutrophil` (neutrophil; complete at baseline); `selectin` (selectin; pending at baseline); `integrin-alpha-beta-heterodimer` (integrin alpha-beta heterodimer; pending at baseline).

<a id="b016"></a>

## B016 — Efferocytosis recognition and resolution

**Category:** Immunology. **Disposition:** specialized_recipe_candidate.

**Proposed scene:** Place apoptotic-body instances beside a macrophage, then use linked engulfment and post-engulfment annotation panels.

**Required verification:** Verify recognition bridges and downstream response; keep this distinct from microbial phagocytosis.

**Existing coverage:** roadmap:11. Expand that concept; do not add a duplicate primitive.

**Reusable dependencies:** `apoptotic-body` (apoptotic body; complete at baseline); `macrophage` (macrophage; complete at baseline); `phagosome` (phagosome; complete at baseline); `phospholipid` (phospholipid; pending at baseline).

<a id="b017"></a>

## B017 — NK activating and inhibitory signal balance

**Category:** Immunology. **Disposition:** specialized_recipe_candidate.

**Proposed scene:** Use an NK/target contact with independent activating and inhibitory receptor lanes and a configurable output annotation.

**Required verification:** Verify receptor specificity and licensing context; avoid a deterministic missing-self cartoon.

**Existing coverage:** roadmap:10. Expand that concept; do not add a duplicate primitive.

**Reusable dependencies:** `natural-killer-cell` (natural killer cell; complete at baseline); `generic-cancer-cell` (generic cancer cell; complete at baseline); `mhc-class-i` (MHC class I; pending at baseline); `single-pass-immunoglobulin-like-receptor` (single-pass immunoglobulin-like receptor; pending at baseline).

<a id="b018"></a>

## B018 — Innate-cell inflammasome and gasdermin output

**Category:** Immunology. **Disposition:** specialized_recipe_candidate.

**Proposed scene:** Reuse an inflammasome and a membrane inset, separating assembly, protease activation and membrane-pore output.

**Required verification:** Verify inflammasome type, caspase and gasdermin cleavage; assess whether a gasdermin pore needs a new module.

**Existing coverage:** roadmap:21;roadmap:33. Expand that concept; do not add a duplicate primitive.

**Reusable dependencies:** `inflammasome-complex` (inflammasome complex; pending at baseline); `generic-enzyme` (generic enzyme; complete at baseline); `plasma-membrane-segment` (plasma membrane segment; complete at baseline).

<a id="b019"></a>

## B019 — ER protein quality-control routing

**Category:** Cell biology. **Disposition:** specialized_recipe_candidate.

**Proposed scene:** Place folded and unresolved protein presets inside an ER context with distinct forward-transport and degradation lanes.

**Required verification:** Verify ER-associated degradation direction, membrane extraction and chaperone roles.

**Existing coverage:** roadmap:26. Expand that concept; do not add a duplicate primitive.

**Reusable dependencies:** `rough-endoplasmic-reticulum` (rough endoplasmic reticulum; complete at baseline); `generic-globular-protein` (generic globular protein; complete at baseline); `ubiquitinated-protein` (ubiquitinated protein; pending at baseline); `proteasome` (proteasome; complete at baseline).

<a id="b020"></a>

## B020 — Organelle contact-site lipid exchange

**Category:** Cell biology. **Disposition:** specialized_recipe_candidate.

**Proposed scene:** Place ER and mitochondrion in close proximity with an explicit gap and exchange connectors, keeping their membranes unfused.

**Required verification:** Verify contact-site tether and lipid-transfer mechanism; proximity must not imply membrane fusion.

**Existing coverage:** roadmap:58. Expand that concept; do not add a duplicate primitive.

**Reusable dependencies:** `smooth-endoplasmic-reticulum` (smooth endoplasmic reticulum; complete at baseline); `mitochondrion` (mitochondrion; complete at baseline); `phospholipid` (phospholipid; pending at baseline).

<a id="b021"></a>

## B021 — Stress granule assembly and recovery

**Category:** Cell biology. **Disposition:** specialized_recipe_candidate.

**Proposed scene:** Use RNA/protein instances to populate a reversible granule group, with a separate resumed-translation panel.

**Required verification:** Verify stress context and distinguish a qualitative condensate diagram from measured phase separation.

**Existing coverage:** stress granule. Expand that concept; do not add a duplicate primitive.

**Reusable dependencies:** `stress-granule` (stress granule; complete at baseline); `messenger-rna` (messenger RNA; pending at baseline); `generic-globular-protein` (generic globular protein; complete at baseline); `ribosome-translating-mrna` (ribosome translating mRNA; pending at baseline).

<a id="b022"></a>

## B022 — Receptor recycling versus lysosomal sorting

**Category:** Cell biology. **Disposition:** specialized_recipe_candidate.

**Proposed scene:** Split an internalized receptor lane into surface return and lysosomal delivery while preserving cargo identity.

**Required verification:** Verify sorting signals and named receptor behavior; avoid assigning one fate to all receptors.

**Existing coverage:** roadmap:61. Expand that concept; do not add a duplicate primitive.

**Reusable dependencies:** `early-endosome` (early endosome; complete at baseline); `late-endosome` (late endosome; complete at baseline); `lysosome` (lysosome; complete at baseline); `transmembrane-protein` (transmembrane protein; pending at baseline); `transport-vesicle` (transport vesicle; complete at baseline).

<a id="b023"></a>

## B023 — Mitochondrial fission and fusion comparison

**Category:** Cell biology. **Disposition:** specialized_recipe_candidate.

**Proposed scene:** Use linked mitochondrion states with separate constriction and joining sequences; keep inner/outer membranes distinguishable.

**Required verification:** Verify machinery and membrane order; do not equate all fragmentation with apoptosis.

**Existing coverage:** roadmap:58. Expand that concept; do not add a duplicate primitive.

**Reusable dependencies:** `mitochondrion` (mitochondrion; complete at baseline); `generic-globular-protein` (generic globular protein; complete at baseline); `lipid-bilayer-cross-section` (lipid bilayer cross-section; complete at baseline).

<a id="b024"></a>

## B024 — Axonal conduction across myelin gaps

**Category:** Neurobiology. **Disposition:** specialized_recipe_candidate.

**Proposed scene:** Repeat myelin segments around an axon and label nodes, with a distinct propagation annotation above the structure.

**Required verification:** Verify ion-channel localization and the chosen electrophysiological abstraction.

**Existing coverage:** node of Ranvier. Expand that concept; do not add a duplicate primitive.

**Reusable dependencies:** `isolated-axon` (isolated axon; complete at baseline); `myelin-sheath` (myelin sheath; complete at baseline); `node-of-ranvier` (node of Ranvier; complete at baseline); `voltage-gated-ion-channel` (voltage-gated ion channel; pending at baseline).

<a id="b025"></a>

## B025 — Astrocyte-neuron metabolic exchange

**Category:** Neurobiology. **Disposition:** specialized_recipe_candidate.

**Proposed scene:** Place an astrocyte and neuron in a tissue context with labeled metabolite-transfer arrows that can be toggled by hypothesis.

**Required verification:** Verify each metabolite route and distinguish supported observations from contested shuttle models.

**Existing coverage:** roadmap:95. Expand that concept; do not add a duplicate primitive.

**Reusable dependencies:** `astrocyte` (astrocyte; complete at baseline); `neuron` (neuron; complete at baseline); `glucose` (glucose; pending at baseline); `small-blood-vessel` (small blood vessel; pending at baseline).

<a id="b026"></a>

## B026 — Glomerular filtration barrier layers

**Category:** Tissue biology. **Disposition:** specialized_recipe_candidate.

**Proposed scene:** Build a cutaway from endothelium, basement membrane and podocyte processes, with a separate filtrate-side label.

**Required verification:** Verify layer order, slit diaphragm and filtration-selectivity claims; do not infer selectivity from icon size alone.

**Existing coverage:** roadmap:89. Expand that concept; do not add a duplicate primitive.

**Reusable dependencies:** `renal-glomerulus` (renal glomerulus; pending at baseline); `endothelial-cell` (endothelial cell; complete at baseline); `basement-membrane` (basement membrane; pending at baseline); `podocyte` (podocyte; complete at baseline).

<a id="b027"></a>

## B027 — Bone remodeling coupling

**Category:** Tissue biology. **Disposition:** specialized_recipe_candidate.

**Proposed scene:** Arrange resorption and formation regions along one bone surface using osteoclast and osteoblast instances.

**Required verification:** Verify temporal coupling and matrix deposition; mineralization is a distinct stage.

**Existing coverage:** roadmap:92. Expand that concept; do not add a duplicate primitive.

**Reusable dependencies:** `bone-trabecula` (bone trabecula; pending at baseline); `osteoclast` (osteoclast; complete at baseline); `osteoblast` (osteoblast; complete at baseline); `osteocyte` (osteocyte; complete at baseline).

<a id="b028"></a>

## B028 — Hepatic lobule directional flows

**Category:** Tissue biology. **Disposition:** specialized_recipe_candidate.

**Proposed scene:** Overlay separate blood and bile routes on a reusable lobule frame with unambiguous directions and endpoints.

**Required verification:** Verify portal/central anatomy and canalicular bile direction; identify missing duct components.

**Existing coverage:** roadmap:90. Expand that concept; do not add a duplicate primitive.

**Reusable dependencies:** `liver-lobule` (liver lobule; pending at baseline); `hepatocyte` (hepatocyte; complete at baseline); `small-blood-vessel` (small blood vessel; pending at baseline).

<a id="b029"></a>

## B029 — Transwell migration with counting endpoint

**Category:** Methods. **Disposition:** specialized_recipe_candidate.

**Proposed scene:** Place cells above a porous insert, directional cues below and migrated cells in a separately countable lower compartment.

**Required verification:** Verify assay configuration and distinguish migration from proliferation or differential survival.

**Existing coverage:** Transwell insert. Expand that concept; do not add a duplicate primitive.

**Reusable dependencies:** `transwell-insert` (Transwell insert; pending at baseline); `porous-membrane-insert` (porous membrane insert; pending at baseline); `rounded-suspension-cell` (rounded suspension cell; complete at baseline); `chemokine` (chemokine; pending at baseline).

<a id="b030"></a>

## B030 — Magnetic enrichment with retained and depleted fractions

**Category:** Methods. **Disposition:** specialized_recipe_candidate.

**Proposed scene:** Use antibody-bead-cell groups passing a magnetic column, retaining both output fractions with explicit labels.

**Required verification:** Verify positive versus negative selection and recovery sequence; purity is measured, not implied.

**Existing coverage:** magnetic separation column. Expand that concept; do not add a duplicate primitive.

**Reusable dependencies:** `magnetic-bead-cell-complex` (magnetic-bead-cell complex; pending at baseline); `magnetic-separation-column` (magnetic separation column; pending at baseline); `cell-sort-collection-tube-rack` (cell-sort collection tube rack; pending at baseline).

<a id="b031"></a>

## B031 — Organoid passage and recovery overview

**Category:** Methods. **Disposition:** specialized_recipe_candidate.

**Proposed scene:** Arrange source organoid, separated material and regrowing groups in culture contexts with an independent viability checkpoint.

**Required verification:** Choose an organoid system and verify whether fragmentation or dissociation is appropriate.

**Existing coverage:** roadmap:116. Expand that concept; do not add a duplicate primitive.

**Reusable dependencies:** `organoid` (organoid; complete at baseline); `extracellular-matrix-gel-dome` (extracellular matrix gel dome; pending at baseline); `24-well-plate` (24-well plate; pending at baseline).

<a id="b032"></a>

## B032 — Perfused organ-on-chip barrier measurement

**Category:** Methods. **Disposition:** specialized_recipe_candidate.

**Proposed scene:** Build two channels separated by a cell-covered porous membrane; add independent perfusion and sampling connectors.

**Required verification:** Verify channel orientation, flow regime and readout; do not invent a permeability value.

**Existing coverage:** organ-on-chip device. Expand that concept; do not add a duplicate primitive.

**Reusable dependencies:** `organ-on-chip-device` (organ-on-chip device; pending at baseline); `porous-membrane-chip` (porous membrane chip; pending at baseline); `endothelial-monolayer` (endothelial monolayer; pending at baseline); `perfusion-pump` (perfusion pump; pending at baseline).

<a id="b033"></a>

## B033 — Spatial spot mixtures versus individual cells

**Category:** Single-cell methods. **Disposition:** specialized_recipe_candidate.

**Proposed scene:** Overlay capture spots on a tissue frame and show several cell instances intersecting a spot, followed by an explicitly mixed readout.

**Required verification:** Verify platform resolution and capture model; do not label a multicell spot as a single cell.

**Existing coverage:** roadmap:57. Expand that concept; do not add a duplicate primitive.

**Reusable dependencies:** `spatial-transcriptomics-slide` (spatial transcriptomics slide; pending at baseline); `tissue-capture-spot-array` (tissue capture spot array; pending at baseline); `epithelial-sheet` (epithelial sheet; pending at baseline).

<a id="b034"></a>

## B034 — Ambient RNA and multiplet quality-control panel

**Category:** Single-cell methods. **Disposition:** specialized_recipe_candidate.

**Proposed scene:** Create empty, singlet and doublet partition scenes with separate ambient RNA tokens and downstream quality-control annotations.

**Required verification:** Verify technical failure modes and limits of computational correction for the chosen assay.

**Existing coverage:** roadmap:56. Expand that concept; do not add a duplicate primitive.

**Reusable dependencies:** `single-cell-droplet-with-barcoded-bead` (single-cell droplet with barcoded bead; pending at baseline); `rounded-suspension-cell` (rounded suspension cell; complete at baseline); `messenger-rna` (messenger RNA; pending at baseline).

<a id="b035"></a>

## B035 — Surface binding versus internalization assay

**Category:** Methods. **Disposition:** specialized_recipe_candidate.

**Proposed scene:** Pair surface-bound probe and intracellular probe panels using the same receptor/ligand group and a time annotation.

**Required verification:** Verify controls that distinguish internalization from surface signal; fluorescence location alone may be insufficient.

**Existing coverage:** roadmap:103. Expand that concept; do not add a duplicate primitive.

**Reusable dependencies:** `transmembrane-protein` (transmembrane protein; pending at baseline); `fluorophore-conjugated-antibody` (fluorophore-conjugated antibody; pending at baseline); `early-endosome` (early endosome; complete at baseline).

<a id="b036"></a>

## B036 — Chromatographic separation and fraction identity

**Category:** Methods. **Disposition:** specialized_recipe_candidate.

**Proposed scene:** Link a sample mixture to a column, editable elution trace and individual fraction tubes with consistent component colors.

**Required verification:** Verify separation principle and calibration; elution position is not automatically molecular identity.

**Existing coverage:** size-exclusion chromatography column. Expand that concept; do not add a duplicate primitive.

**Reusable dependencies:** `size-exclusion-chromatography-column` (size-exclusion chromatography column; pending at baseline); `generic-globular-protein` (generic globular protein; complete at baseline); `fraction-collector` (fraction collector; pending at baseline); `microcentrifuge-tube` (microcentrifuge tube; complete at baseline).
