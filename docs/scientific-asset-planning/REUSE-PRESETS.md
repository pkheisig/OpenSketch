# Reuse and identity presets

18 configurations of existing artwork. None counts as a new primitive. Labels, state overlays and placement rules carry the specialization.

[Catalog guide](README.md) · [Assembly rules](ASSEMBLY-INSTRUCTIONS.md)

<a id="p001"></a>

## P001 — Type I pneumocyte placement preset

**Category:** Cells. **Disposition:** reuse.

**Verified scientific scope:** Type I pneumocytes form a thin alveolar diffusion surface.

**Proposed construction:** Reuse a flattened epithelial outline with a nucleus bulge and long lateral junction anchors. Apply the type I label only in an alveolar context.

**States:** extended; alveolar-wall placement.

**Limits:** Do not stretch the nucleus with the entire outline; keep cell identity and tissue context explicit.

**Deduplication:** generic epithelial cell

**Evidence:** [LUNG](https://histology.leeds.ac.uk/home/respiratory/respiratory/) (Alveoli; Main constituents of alveolus and interalveolar wall)

**Reusable dependencies:** `generic-epithelial-cell` (generic epithelial cell; complete at baseline); `tight-junction` (tight junction; complete at baseline).

<a id="p002"></a>

## P002 — Enterocyte brush-border preset

**Category:** Cells. **Disposition:** reuse.

**Verified scientific scope:** Enterocytes have apical microvilli along the intestinal absorptive surface.

**Proposed construction:** Reuse a columnar epithelial cell and place repeated microvilli on its apical face. Preserve a separate nucleus and basal attachment.

**States:** isolated; epithelial row.

**Limits:** Microvilli are not motile cilia.

**Deduplication:** columnar epithelial cell;microvilli

**Evidence:** [GUT](https://histology.leeds.ac.uk/home/digestive/small_intestine/) (Structure; Epithelium and Villi; Crypts)

**Reusable dependencies:** `columnar-epithelial-cell` (columnar epithelial cell; complete at baseline); `microvilli` (microvilli; complete at baseline).

<a id="p003"></a>

## P003 — Intestinal endocrine-cell identity preset

**Category:** Cells. **Disposition:** reuse.

**Verified scientific scope:** Endocrine cells in intestinal crypts produce gastrointestinal hormones.

**Proposed construction:** Reuse a generic epithelial cell with an endocrine identity label and an optional secretion annotation. Do not create one new silhouette for every hormone.

**States:** unlabeled archetype; named hormone annotation.

**Limits:** The source does not establish a unique silhouette for each endocrine subtype. Detailed polarity requires subtype-specific verification.

**Deduplication:** generic epithelial cell

**Evidence:** [GUT](https://histology.leeds.ac.uk/home/digestive/small_intestine/) (Structure; Epithelium and Villi; Crypts)

**Reusable dependencies:** `generic-epithelial-cell` (generic epithelial cell; complete at baseline); `secretory-vesicle` (secretory vesicle; complete at baseline).

<a id="p004"></a>

## P004 — Fenestrated endothelial-cell preset

**Category:** Cells. **Disposition:** reuse.

**Verified scientific scope:** Fenestrated capillary endothelium contains pores that support molecular exchange.

**Proposed construction:** Reuse an endothelial cell, with a removable pore-pattern overlay away from the nucleus. Keep the basement membrane as another component.

**States:** continuous; fenestrated overlay.

**Limits:** Fenestrae and intercellular gaps are different features; do not make all fenestrated barriers equally permeable.

**Deduplication:** endothelial cell

**Evidence:** [CAP](https://histology.leeds.ac.uk/home/circulatory/capillaries/) (Continuous; Fenestrated capillaries; Sinusoids)

**Reusable dependencies:** `endothelial-cell` (endothelial cell; complete at baseline); `basement-membrane` (basement membrane; pending at baseline).

<a id="p005"></a>

## P005 — IFNAR1/IFNAR2 identity preset

**Category:** Immunology. **Disposition:** reuse.

**Verified scientific scope:** Type I interferon binds a receptor composed of IFNAR1 and IFNAR2.

**Proposed construction:** Reuse the heterodimeric cytokine-receptor archetype; label its chains independently and expose cytosolic partner anchors.

**States:** unbound; ligand-associated.

**Limits:** Chain identity does not justify inventing a new generic receptor drawing.

**Deduplication:** heterodimeric cytokine receptor

**Evidence:** [IFN](https://reactome.org/content/detail/R-HSA-909733) (Summary and Events: receptor assembly, JAKs, STATs and ISGF3)

**Reusable dependencies:** `heterodimeric-cytokine-receptor` (heterodimeric cytokine receptor; pending at baseline).

<a id="p006"></a>

## P006 — PD-1 identity preset

**Category:** Immunology. **Disposition:** reuse.

**Verified scientific scope:** PD-1 acts as an inhibitory receptor in T-cell signaling.

**Proposed construction:** Reuse the single-pass immunoglobulin-like receptor. Put the binding anchor outside the membrane and the phosphatase-association annotation inside.

**States:** unligated; ligated; phosphorylation overlay.

**Limits:** Use a generic topology unless the precise domain structure is independently checked.

**Deduplication:** single-pass immunoglobulin-like receptor

**Evidence:** [PD1](https://reactome.org/content/detail/R-HSA-389948) (Summary and Events: ligation and phosphatase recruitment)

**Reusable dependencies:** `single-pass-immunoglobulin-like-receptor` (single-pass immunoglobulin-like receptor; pending at baseline).

<a id="p007"></a>

## P007 — PD-L1 identity preset

**Category:** Immunology. **Disposition:** reuse.

**Verified scientific scope:** PD-L1 participates as a PD-1 ligand.

**Proposed construction:** Use a membrane-tethered ligand with a PD-L1 text label, keeping its extracellular binding anchor compatible with P006.

**States:** available; antibody-occupied.

**Limits:** A ligand label does not establish exact ectodomain geometry or glycosylation.

**Deduplication:** generic membrane-tethered ligand

**Evidence:** [PD1](https://reactome.org/content/detail/R-HSA-389948) (Summary and Events: ligation and phosphatase recruitment)

**Reusable dependencies:** `generic-membrane-tethered-ligand` (generic membrane-tethered ligand; pending at baseline).

<a id="p008"></a>

## P008 — Signaling kinase identity preset

**Category:** Signaling. **Disposition:** reuse.

**Verified scientific scope:** TCR and BCR pathways use named kinases such as LCK, ZAP-70 and SYK.

**Proposed construction:** Reuse the enzyme archetype with independent name and phosphorylation overlays. Expose substrate and recruiter anchors; change labels rather than generate a new blob for each kinase.

**States:** inactive annotation; active annotation; recruited.

**Limits:** Activity annotations are context-dependent; color alone must not imply activation.

**Deduplication:** generic enzyme

**Evidence:** [TCR](https://reactome.org/content/detail/R-HSA-202403) (Summary and Events: Phosphorylation of CD3; Translocation of ZAP-70); [BCR](https://reactome.org/content/detail/R-HSA-983705) (Summary paragraphs 1-7)

**Reusable dependencies:** `generic-enzyme` (generic enzyme; complete at baseline).

<a id="p009"></a>

## P009 — Signaling phosphatase identity preset

**Category:** Signaling. **Disposition:** reuse.

**Verified scientific scope:** PD-1-associated phosphatases attenuate signaling by dephosphorylation.

**Proposed construction:** Reuse a generic enzyme with SHP-1 or SHP-2 as a label and a catalytic relationship to a selected substrate.

**States:** free; recruited; substrate-associated.

**Limits:** A generic phosphatase icon does not specify all downstream targets or exclude alternative mechanisms.

**Deduplication:** generic enzyme

**Evidence:** [PD1](https://reactome.org/content/detail/R-HSA-389948) (Summary and Events: ligation and phosphatase recruitment)

**Reusable dependencies:** `generic-enzyme` (generic enzyme; complete at baseline).

<a id="p010"></a>

## P010 — STAT/IRF transcription-factor identity preset

**Category:** Signaling. **Disposition:** reuse.

**Verified scientific scope:** STAT1, STAT2 and IRF9 participate in type I interferon signaling.

**Proposed construction:** Reuse protein and DNA-bound transcription-factor archetypes with independent labels. Assemble a named complex only when the correct partners are selected.

**States:** cytosolic; nuclear; DNA-associated.

**Limits:** Do not confuse STAT1 homodimer with STAT1/STAT2/IRF9 ISGF3.

**Deduplication:** generic globular protein

**Evidence:** [IFN](https://reactome.org/content/detail/R-HSA-909733) (Summary and Events: receptor assembly, JAKs, STATs and ISGF3)

**Reusable dependencies:** `generic-globular-protein` (generic globular protein; complete at baseline); `transcription-factor-bound-to-dna` (transcription factor bound to DNA; pending at baseline).

<a id="p011"></a>

## P011 — Transferrin with iron occupancy preset

**Category:** Proteins. **Disposition:** reuse.

**Verified scientific scope:** Transferrin carries iron and releases it in an acidified endosomal setting.

**Proposed construction:** Use one generic protein instance labeled transferrin with two removable iron-occupancy tokens. Tokens are native circles labeled Fe; they are not drug icons.

**States:** apo; one-site schematic; two-site schematic.

**Limits:** The protein outline is an identity schematic, not a verified two-lobe structural depiction.

**Deduplication:** generic globular protein

**Evidence:** [FERR](https://pdb101.rcsb.org/motm/35) (Storing Iron; Transferrin and transferrin receptor)

**Reusable dependencies:** `generic-globular-protein` (generic globular protein; complete at baseline).

<a id="p012"></a>

## P012 — Phosphorylation annotation preset

**Category:** Signaling. **Disposition:** reuse.

**Verified scientific scope:** Phosphorylation marks receptor and adaptor states in the selected signaling pathways.

**Proposed construction:** Attach removable P tokens to named domains or tails, with an optional phosphosite label. Preserve the base asset unchanged.

**States:** unmodified; phosphorylated.

**Limits:** A P token is an annotation. Site and stoichiometry require a cited specific event.

**Deduplication:** generic globular protein

**Evidence:** [TCR](https://reactome.org/content/detail/R-HSA-202403) (Summary and Events: Phosphorylation of CD3; Translocation of ZAP-70); [BCR](https://reactome.org/content/detail/R-HSA-983705) (Summary paragraphs 1-7); [INS](https://reactome.org/content/detail/R-HSA-74751) (Summary and Events: SHC, IRS and attenuation)

**Reusable dependencies:** `generic-globular-protein` (generic globular protein; complete at baseline); `transmembrane-protein` (transmembrane protein; pending at baseline).

<a id="p013"></a>

## P013 — RNA lariat topology preset

**Category:** Nucleic acids. **Disposition:** reuse.

**Verified scientific scope:** Splicing generates an intron lariat through a branch-point linkage.

**Proposed construction:** Reuse an RNA strand, arrange a loop with a tail and add a branch-point connector. Keep the loop closure distinguishable from ordinary backbone continuation.

**States:** intron attached to downstream exon; released lariat.

**Limits:** The branch linkage is not an ordinary 3-prime to 5-prime backbone bond.

**Deduplication:** RNA strand

**Evidence:** [SPLICE](https://reactome.org/content/detail/R-HSA-72163) (Summary paragraphs 1-6)

**Reusable dependencies:** `rna-strand` (RNA strand; pending at baseline).

<a id="p014"></a>

## P014 — Ligand-responsive RNA folding preset

**Category:** Nucleic acids. **Disposition:** reuse.

**Verified scientific scope:** Riboswitch ligand binding stabilizes a regulatory RNA conformation.

**Proposed construction:** Reuse an RNA strand and a labeled ligand token. Provide two editable strand arrangements and a marked ligand pocket without asserting a sequence.

**States:** unbound conformation; bound conformation.

**Limits:** The small-molecule asset is a generic symbol relabeled as the chosen metabolite; binding can increase or decrease expression.

**Deduplication:** RNA strand

**Evidence:** [RIBO](https://pdb101.rcsb.org/motm/130) (Self Control; Flipping the Switch)

**Reusable dependencies:** `rna-strand` (RNA strand; pending at baseline); `small-molecule-drug` (small-molecule drug; pending at baseline).

<a id="p015"></a>

## P015 — C3b-opsonized particle preset

**Category:** Immunology. **Disposition:** reuse.

**Verified scientific scope:** Surface-associated C3b can promote recognition and phagocytosis of a target.

**Proposed construction:** Reuse a bacterial or particle asset and distribute independently selectable protein tokens labeled C3b along its outside. Keep a clean no-opsonin state.

**States:** uncoated; C3b-coated.

**Limits:** Token density is qualitative and does not establish complement deposition measurements.

**Deduplication:** rod-shaped bacterium

**Evidence:** [C3](https://reactome.org/content/detail/R-HSA-166658) (Summary: convergence, outcomes and nomenclature note)

**Reusable dependencies:** `rod-shaped-bacterium` (rod-shaped bacterium; pending at baseline); `generic-globular-protein` (generic globular protein; complete at baseline).

<a id="p016"></a>

## P016 — Annexin V fluorescent probe preset

**Category:** Assays. **Disposition:** reuse.

**Verified scientific scope:** Annexin V binds phosphatidylserine in a calcium-dependent manner.

**Proposed construction:** Reuse a protein archetype with an attached fluorophore marker and an Annexin V label. Provide a lipid-facing binding anchor and separate fluorescence annotation.

**States:** free; PS-associated.

**Limits:** Annexin positivity alone is not a definitive cell-death classification.

**Deduplication:** generic globular protein;fluorescent dye

**Evidence:** [ANNEX](https://www.thermofisher.com/dk/en/home/life-science/cell-analysis/cell-viability-and-regulation/apoptosis/annexin-v-staining.html) (What is Annexin V; How Annexin V staining works; false-positive caveat)

**Reusable dependencies:** `generic-globular-protein` (generic globular protein; complete at baseline); `fluorescent-dye` (fluorescent dye; pending at baseline).

<a id="p017"></a>

## P017 — DNA cohesive-end preset

**Category:** Nucleic acids. **Disposition:** reuse.

**Verified scientific scope:** Compatible DNA ends permit ligation during restriction cloning.

**Proposed construction:** Reuse duplex and single-strand fragments. Preserve strand direction, show a short overhang and allow explicit complementary sequence labels.

**States:** 5-prime overhang; 3-prime overhang; blunt comparison.

**Limits:** Do not imply that all restriction enzymes leave the same kind of overhang.

**Deduplication:** linear DNA fragment

**Evidence:** [CLONE](https://www.addgene.org/protocols/subcloning/) (Design; Digest; Ligate; Transform; Isolate the Finished Plasmid)

**Reusable dependencies:** `linear-dna-fragment` (linear DNA fragment; pending at baseline); `single-stranded-dna` (single-stranded DNA; pending at baseline).

<a id="p018"></a>

## P018 — Barcoded surface-protein measurement preset

**Category:** Assays. **Disposition:** reuse.

**Verified scientific scope:** Antibody-linked oligonucleotides can encode the identity of a bound surface target.

**Proposed construction:** Reuse the DNA-barcoded antibody. Keep target-binding and barcode endpoints separate and annotate target identity without implying fluorescence detection.

**States:** unbound; target-bound; barcode captured.

**Limits:** Antibody barcode identity, sample identity and cell barcode are different fields.

**Deduplication:** DNA-barcoded antibody

**Evidence:** [FEATURE](https://www.10xgenomics.com/support/software/cell-ranger/10.0/getting-started/cr-what-is-feature-bc) (Feature Barcode technology and application bullets)

**Reusable dependencies:** `dna-barcoded-antibody` (DNA-barcoded antibody; pending at baseline).
