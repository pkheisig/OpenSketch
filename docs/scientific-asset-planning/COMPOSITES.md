# Composite recipes

40 source-checked schematic recipes. Disposition distinguishes new topics from expansions of existing inventory/roadmap concepts. Every recipe assembles library instances; the recipe itself is not a request for a new full-scene SVG.

[Catalog guide](README.md) · [Assembly rules](ASSEMBLY-INSTRUCTIONS.md)

<a id="c001"></a>

## C001 — TCR proximal signaling sequence

**Category:** Immunology. **Disposition:** roadmap_expansion.

**Verified scientific scope:** TCR engagement couples CD3 phosphorylation to ZAP-70 recruitment and adaptor signaling.

**Proposed construction:** Place a T-cell membrane opposite a peptide-presenting surface. Anchor TCR/CD3 in the T-cell membrane and peptide-MHC opposite it; put labeled LCK, ZAP-70 and LAT nodes on the cytosolic side. Connect engagement, phosphorylation and recruitment in numbered steps, retaining an unstimulated comparison.

**States:** resting; engaged; proximal signaling.

**Limits:** This is a proximal schematic; CD4/CD8 context and downstream branches must be selected explicitly.

**Deduplication:** roadmap:9

**Evidence:** [TCR](https://reactome.org/content/detail/R-HSA-202403) (Summary and Events: Phosphorylation of CD3; Translocation of ZAP-70)

**Reusable dependencies:** `t-cell-receptor-alpha-beta-heterodimer` (T-cell receptor alpha-beta heterodimer; pending at baseline); `cd3-complex` (CD3 complex; pending at baseline); `peptide-mhc-class-i-complex` (peptide-MHC class I complex; pending at baseline); `plasma-membrane-segment` (plasma membrane segment; complete at baseline); `P008` (Signaling kinase identity preset; planned in this catalog); `P012` (Phosphorylation annotation preset; planned in this catalog).

<a id="c002"></a>

## C002 — BCR recognition to second messengers

**Category:** Immunology. **Disposition:** roadmap_expansion.

**Verified scientific scope:** BCR signaling connects antigen recognition to ITAM kinases and downstream second-messenger pathways.

**Proposed construction:** Use a B-cell outline with one enlarged membrane inset. Place BCR outside-facing, CD79 labels on its signaling partners and SYK/BLNK/PLC-gamma2 inside. Branch a labeled PLC step into DAG at the membrane and IP3 toward an ER calcium-release annotation. Keep ion tokens and pathway arrows editable.

**States:** unbound; antigen-engaged; second-messenger response.

**Limits:** Antigen valency and calcium dynamics vary. Do not draw every BCR as a permanently crosslinked cluster.

**Deduplication:** roadmap:6

**Evidence:** [BCR](https://reactome.org/content/detail/R-HSA-983705) (Summary paragraphs 1-7)

**Reusable dependencies:** `b-lymphocyte` (B lymphocyte; complete at baseline); `b-cell-receptor` (B-cell receptor; pending at baseline); `plasma-membrane-segment` (plasma membrane segment; complete at baseline); `smooth-endoplasmic-reticulum` (smooth endoplasmic reticulum; complete at baseline); `P008` (Signaling kinase identity preset; planned in this catalog); `P012` (Phosphorylation annotation preset; planned in this catalog).

<a id="c003"></a>

## C003 — Complement initiation and three outcomes

**Category:** Immunology. **Disposition:** roadmap_expansion.

**Verified scientific scope:** Complement initiation routes converge on C3 cleavage and have distinct effector outputs.

**Proposed construction:** Build three labeled initiation lanes merging at a C3 cleavage node. Split the output into C3b surface decoration, soluble inflammatory-fragment labels and a terminal membrane-pore panel. Use existing complement complexes and a particle; do not draw all three outcomes as the same arrow or protein.

**States:** initiation; amplification; effector outcomes.

**Limits:** Select a consistent C2-fragment naming convention before naming a convertase; historical conventions differ.

**Deduplication:** roadmap:13

**Evidence:** [C3](https://reactome.org/content/detail/R-HSA-166658) (Summary: convergence, outcomes and nomenclature note)

**Reusable dependencies:** `complement-c1-complex` (complement C1 complex; pending at baseline); `complement-membrane-attack-complex` (complement membrane attack complex; pending at baseline); `P015` (C3b-opsonized particle preset; planned in this catalog); `plasma-membrane-segment` (plasma membrane segment; complete at baseline).

<a id="c004"></a>

## C004 — Class I peptide-loading itinerary

**Category:** Immunology. **Disposition:** roadmap_expansion.

**Verified scientific scope:** Class I peptide loading occurs in the ER before surface delivery through the secretory pathway.

**Proposed construction:** Arrange cytosol, ER lumen, Golgi and surface as distinct compartments. Move peptide tokens into the ER, associate them with class I MHC and route the loaded complex through Golgi to membrane. Label the beta-2-microglobulin partner without inventing a new protein silhouette.

**States:** unloaded; ER-loaded; surface-presented.

**Limits:** This is the conventional loading route, not a complete description of cross-presentation.

**Deduplication:** roadmap:8

**Evidence:** [MHCI](https://reactome.org/content/detail/R-HSA-983170) (Summary and Events: transport into ER, loading and surface transport)

**Reusable dependencies:** `mhc-class-i` (MHC class I; pending at baseline); `peptide-mhc-class-i-complex` (peptide-MHC class I complex; pending at baseline); `linear-peptide` (linear peptide; pending at baseline); `rough-endoplasmic-reticulum` (rough endoplasmic reticulum; complete at baseline); `golgi-apparatus` (Golgi apparatus; complete at baseline); `transport-vesicle` (transport vesicle; complete at baseline); `plasma-membrane-segment` (plasma membrane segment; complete at baseline).

<a id="c005"></a>

## C005 — Class II invariant-chain and peptide exchange

**Category:** Immunology. **Disposition:** roadmap_expansion.

**Verified scientific scope:** Endosomal antigen processing and peptide exchange produce surface class II peptide complexes.

**Proposed construction:** Place incoming antigen in an endocytic lane and class II/invariant-chain in a secretory lane. Merge in an acidic compartment; use removable labels for invariant-chain processing and CLIP exchange. Deliver the loaded class II complex to the surface facing a CD4 T-cell receptor panel.

**States:** invariant-chain associated; CLIP-bearing; peptide-loaded.

**Limits:** The invariant chain and CLIP are different states; do not show extracellular antigen loading directly onto ER class II as the default route.

**Deduplication:** roadmap:8

**Evidence:** [MHCII](https://reactome.org/content/detail/R-HSA-2132295) (Summary and Events: invariant chain, antigen processing and loading)

**Reusable dependencies:** `mhc-class-ii` (MHC class II; pending at baseline); `peptide-mhc-class-ii-complex` (peptide-MHC class II complex; pending at baseline); `late-endosome` (late endosome; complete at baseline); `lysosome` (lysosome; complete at baseline); `linear-peptide` (linear peptide; pending at baseline); `cd4-receptor` (CD4 receptor; complete at baseline); `t-cell-receptor-alpha-beta-heterodimer` (T-cell receptor alpha-beta heterodimer; pending at baseline).

<a id="c006"></a>

## C006 — Modular full IgE schematic

**Category:** Immunology. **Disposition:** new.

**Verified scientific scope:** IgE combines antigen-binding arms with an Fc region structurally distinct from IgG Fc.

**Proposed construction:** Attach two existing Fab instances to the planned IgE Fc module, preserving each arm as a linked component. Provide antigen-facing endpoints and an Fc receptor-facing endpoint. Label the result a schematic; do not claim a complete crystallographic pose.

**States:** unbound; antigen-associated placeholder.

**Limits:** The Fc deposition verifies Fc architecture, not a universal whole-antibody arm angle.

**Deduplication:** No matching named primitive or numbered roadmap recipe found in manual topic comparison. This is a new recipe, not a new primitive.

**Evidence:** [IGEF](https://www.rcsb.org/structure/1O0V) (Primary Citation abstract)

**Reusable dependencies:** `antibody-fab-fragment` (antibody Fab fragment; complete at baseline); `A004` (IgE Fc domain module; planned in this catalog).

<a id="c007"></a>

## C007 — Allergen-triggered mast-cell degranulation

**Category:** Immunology. **Disposition:** roadmap_expansion.

**Verified scientific scope:** Aggregation of IgE-bound Fc epsilon receptors can trigger mast-cell mediator release.

**Proposed construction:** Use a mast-cell cutaway with membrane receptor instances and modular IgE outside. A multivalent allergen token bridges receptor-associated IgE; inside, connect a SYK/PLC/calcium annotation to separate granules and exocytosis arrows. Provide sensitized and activated panels.

**States:** sensitized; crosslinked; degranulating.

**Limits:** Receptor subunits are named schematic groups; do not equate unbound soluble IgE with receptor crosslinking.

**Deduplication:** roadmap:15

**Evidence:** [IGE](https://reactome.org/content/detail/R-HSA-2454202) (Summary and Events: IgE binding, aggregation and degranulation)

**Reusable dependencies:** `mast-cell` (mast cell; complete at baseline); `single-pass-immunoglobulin-like-receptor` (single-pass immunoglobulin-like receptor; pending at baseline); `secretory-vesicle` (secretory vesicle; complete at baseline); `C006` (Modular full IgE schematic; planned in this catalog); `P008` (Signaling kinase identity preset; planned in this catalog).

<a id="c008"></a>

## C008 — PD-1 inhibitory contact

**Category:** Immunology. **Disposition:** roadmap_expansion.

**Verified scientific scope:** PD-1 ligation recruits phosphatases that attenuate T-cell signaling.

**Proposed construction:** Place a T-cell membrane opposite a ligand-bearing membrane. Align PD-1 with PD-L1 across the gap, recruit a SHP-labeled enzyme inside the T cell and draw an inhibitory connector to a named proximal signaling node. Keep ligand occupancy and inhibition as separate annotations.

**States:** unligated; ligated; phosphatase recruited.

**Limits:** Checkpoint engagement is not a binary guarantee of cell inactivity; a blockade panel would need a specific intervention source.

**Deduplication:** roadmap:17

**Evidence:** [PD1](https://reactome.org/content/detail/R-HSA-389948) (Summary and Events: ligation and phosphatase recruitment)

**Reusable dependencies:** `plasma-membrane-segment` (plasma membrane segment; complete at baseline); `P006` (PD-1 identity preset; planned in this catalog); `P007` (PD-L1 identity preset; planned in this catalog); `P009` (Signaling phosphatase identity preset; planned in this catalog); `t-cell-receptor-alpha-beta-heterodimer` (T-cell receptor alpha-beta heterodimer; pending at baseline).

<a id="c009"></a>

## C009 — Type I interferon receptor-to-nucleus response

**Category:** Immunology. **Disposition:** new.

**Verified scientific scope:** Type I interferon signaling produces the STAT1/STAT2/IRF9 complex ISGF3.

**Proposed construction:** Place one IFN ligand above IFNAR1/2. Attach JAK1 and TYK2 labels inside, then show separate STAT1, STAT2 and IRF9 instances assembling into a named group. Route that group through a nuclear boundary to a DNA-response annotation.

**States:** ligand-free; receptor-active; ISGF3 nuclear.

**Limits:** Do not substitute a STAT1 homodimer for ISGF3 or imply every interferon uses this receptor.

**Deduplication:** No matching named primitive or numbered roadmap recipe found in manual topic comparison. This is a new recipe, not a new primitive.

**Evidence:** [IFN](https://reactome.org/content/detail/R-HSA-909733) (Summary and Events: receptor assembly, JAKs, STATs and ISGF3)

**Reusable dependencies:** `small-globular-cytokine` (small globular cytokine; pending at baseline); `P005` (IFNAR1/IFNAR2 identity preset; planned in this catalog); `P008` (Signaling kinase identity preset; planned in this catalog); `P010` (STAT/IRF transcription-factor identity preset; planned in this catalog); `nucleus` (nucleus; complete at baseline); `dna-double-helix` (DNA double helix; pending at baseline).

<a id="c010"></a>

## C010 — Canonical WNT on/off comparison

**Category:** Signaling. **Disposition:** new.

**Verified scientific scope:** Canonical WNT stabilizes beta-catenin and changes its transcriptional role.

**Proposed construction:** Create matched WNT-absent and WNT-present panels using the same membrane, Frizzled and nucleus. In the absent panel group Axin/APC/CK1/GSK3 labels around beta-catenin and route turnover to proteasome. In the present panel annotate LRP5/6 with Frizzled and route stabilized beta-catenin to LEF/TCF at DNA.

**States:** WNT absent; canonical response.

**Limits:** Noncanonical WNT pathways are outside this recipe; generic protein nodes are not verified domain structures.

**Deduplication:** No matching named primitive or numbered roadmap recipe found in manual topic comparison. This is a new recipe, not a new primitive.

**Evidence:** [WNT](https://reactome.org/content/detail/R-HSA-195721) (Summary: canonical pathway and context dependence)

**Reusable dependencies:** `frizzled-receptor` (Frizzled receptor; pending at baseline); `transmembrane-protein` (transmembrane protein; pending at baseline); `generic-globular-protein` (generic globular protein; complete at baseline); `generic-enzyme` (generic enzyme; complete at baseline); `proteasome` (proteasome; complete at baseline); `nucleus` (nucleus; complete at baseline); `dna-double-helix` (DNA double helix; pending at baseline).

<a id="c011"></a>

## C011 — Neighbor-dependent NOTCH cleavage

**Category:** Signaling. **Disposition:** new.

**Verified scientific scope:** A membrane ligand on a neighboring cell triggers NOTCH cleavage and nuclear NICD signaling.

**Proposed construction:** Place two adjacent cell membranes with ligand and Notch facing across the intercellular space. Mark extracellular and intramembrane cleavage as separate steps; detach an NICD-labeled token on the receiving cell side and route it to an RBPJ/MAML-labeled nuclear group.

**States:** neighbor contact; cleavage; NICD nuclear.

**Limits:** Keep the ligand membrane-bound and avoid depicting NICD as the entire intact receptor entering the nucleus.

**Deduplication:** No matching named primitive or numbered roadmap recipe found in manual topic comparison. This is a new recipe, not a new primitive.

**Evidence:** [NOTCH](https://reactome.org/content/detail/R-HSA-1980143) (Summary paragraphs 1-3)

**Reusable dependencies:** `notch-receptor` (Notch receptor; pending at baseline); `generic-membrane-tethered-ligand` (generic membrane-tethered ligand; pending at baseline); `plasma-membrane-segment` (plasma membrane segment; complete at baseline); `generic-globular-protein` (generic globular protein; complete at baseline); `nucleus` (nucleus; complete at baseline).

<a id="c012"></a>

## C012 — Insulin receptor activation and attenuation

**Category:** Signaling. **Disposition:** roadmap_expansion.

**Verified scientific scope:** Insulin-receptor phosphorylation recruits signaling pathways; internalization participates in attenuation.

**Proposed construction:** Use matched surface and internalized receptor groups. Bind a labeled insulin token to the receptor, add cytosolic phosphorylation labels and branch to IRS and SHC nodes. Route an internalization arrow into a separate endosomal receptor state; retain an attenuation label rather than erasing every downstream event.

**States:** unbound; phosphorylated; internalized.

**Limits:** The generic receptor is a schematic; insulin receptor preassembly must not be drawn as ligand-induced dimerization of free monomers.

**Deduplication:** roadmap:31

**Evidence:** [INS](https://reactome.org/content/detail/R-HSA-74751) (Summary and Events: SHC, IRS and attenuation)

**Reusable dependencies:** `receptor-tyrosine-kinase-dimer` (receptor tyrosine kinase dimer; pending at baseline); `linear-peptide` (linear peptide; pending at baseline); `P012` (Phosphorylation annotation preset; planned in this catalog); `generic-globular-protein` (generic globular protein; complete at baseline); `early-endosome` (early endosome; complete at baseline).

<a id="c013"></a>

## C013 — Mitochondrial commitment to intrinsic apoptosis

**Category:** Cell biology. **Disposition:** roadmap_expansion.

**Verified scientific scope:** BCL-2-family control links cellular stress to mitochondrial release of apoptotic factors.

**Proposed construction:** Place stress inputs beside a mitochondrion. Add BAX/BAK and anti-apoptotic regulator labels at the outer membrane, then a release arrow to cytochrome-c and an existing apoptosome group. Continue to a named caspase annotation and an apoptotic cell state.

**States:** restrained; outer-membrane permeabilization; downstream response.

**Limits:** Keep outer and inner mitochondrial membranes distinct. This omits other death pathways and does not assert a universal irreversible threshold.

**Deduplication:** roadmap:34

**Evidence:** [APOP](https://reactome.org/content/detail/R-HSA-109606) (Summary and Events: BAX/BAK and apoptotic factor response)

**Reusable dependencies:** `mitochondrion` (mitochondrion; complete at baseline); `generic-globular-protein` (generic globular protein; complete at baseline); `apoptosome` (apoptosome; pending at baseline); `apoptotic-cell` (apoptotic cell; complete at baseline).

<a id="c014"></a>

## C014 — Cargo enclosure and autolysosome formation

**Category:** Cell biology. **Disposition:** roadmap_expansion.

**Verified scientific scope:** Macroautophagy encloses cargo before fusion with the lysosomal system.

**Proposed construction:** Use the existing autophagosome as the closed state; construct an open double-membrane cup from membrane components for the preceding state. Place a cargo group inside, seal the cup and connect the resulting vesicle to a lysosome/autolysosome endpoint. Maintain two membrane contours at enclosure.

**States:** open phagophore; sealed autophagosome; autolysosome.

**Limits:** An autophagosome is not a single-membrane endosome. Cargo-receptor specificity requires a separate source.

**Deduplication:** roadmap:63

**Evidence:** [AUTO](https://reactome.org/content/detail/R-HSA-1632852) (Summary: isolation membrane, autophagosome and autolysosome)

**Reusable dependencies:** `lipid-bilayer-cross-section` (lipid bilayer cross-section; complete at baseline); `autophagosome` (autophagosome; complete at baseline); `lysosome` (lysosome; complete at baseline); `generic-globular-protein` (generic globular protein; complete at baseline).

<a id="c016"></a>

## C016 — Transferrin uptake and receptor recycling

**Category:** Cell biology. **Disposition:** new.

**Verified scientific scope:** Transferrin releases iron after receptor-mediated uptake into an acidified endosomal setting.

**Proposed construction:** Arrange plasma membrane, endosome and a return lane. Bind iron-bearing transferrin to a receptor token, internalize the group, detach iron tokens under an acidification label, then return receptor and apo-transferrin to the surface for release.

**States:** surface-bound; acidic release; recycled.

**Limits:** The receptor token is topology-neutral and must be labeled; no particular receptor structure or iron-export machinery is claimed.

**Deduplication:** No matching named primitive or numbered roadmap recipe found in manual topic comparison. This is a new recipe, not a new primitive.

**Evidence:** [FERR](https://pdb101.rcsb.org/motm/35) (Storing Iron; Transferrin and transferrin receptor)

**Reusable dependencies:** `P011` (Transferrin with iron occupancy preset; planned in this catalog); `transmembrane-protein` (transmembrane protein; pending at baseline); `plasma-membrane-segment` (plasma membrane segment; complete at baseline); `early-endosome` (early endosome; complete at baseline).

<a id="c017"></a>

## C017 — Fibrinogen cleavage to editable fibrin network

**Category:** Extracellular matrix. **Disposition:** baseline_expansion.

**Verified scientific scope:** Thrombin cleavage enables fibrin assembly into fibers.

**Proposed construction:** Start with a few linked fibrinogen instances and a thrombin-labeled enzyme. Use cleavage annotations followed by an assembly arrow to existing fibrin fibers. Build the final mesh from repeated fibers with explicit junctions, optionally placing platelets within the network as another layer.

**States:** soluble precursor; cleavage; network.

**Limits:** A network illustration does not specify polymerization kinetics or crosslink chemistry.

**Deduplication:** blood clot with platelets and fibrin

**Evidence:** [FIB](https://pdb101.rcsb.org/motm/83) (Building a Scab; Flexible Fibrin; assembly discussion)

**Reusable dependencies:** `A002` (Fibrinogen monomer; planned in this catalog); `generic-enzyme` (generic enzyme; complete at baseline); `fibrin-fiber` (fibrin fiber; pending at baseline); `platelet` (platelet; complete at baseline).

<a id="c018"></a>

## C018 — Platelet activation and recruitment loop

**Category:** Hematology. **Disposition:** baseline_expansion.

**Verified scientific scope:** Platelet agonists amplify recruitment and aggregation after activation.

**Proposed construction:** Lay out resting and activated platelets along a vessel-wall context. Release labeled ADP/ATP tokens from the activated group, route them to neighboring platelet receptors and close a positive-feedback arrow. Keep alpha-IIb/beta-3 labels attached to integrin instances in an aggregation inset.

**States:** resting; activated; recruiting.

**Limits:** Do not present the feedback loop as the full coagulation cascade or assign unsupported clotting-factor complexes.

**Deduplication:** blood clot with platelets and fibrin

**Evidence:** [PLT](https://reactome.org/content/detail/R-HSA-76002) (Summary and Events: Platelet Aggregation)

**Reusable dependencies:** `platelet` (platelet; complete at baseline); `endothelial-monolayer` (endothelial monolayer; pending at baseline); `adp` (ADP; pending at baseline); `atp` (ATP; pending at baseline); `integrin-alpha-beta-heterodimer` (integrin alpha-beta heterodimer; pending at baseline).

<a id="c019"></a>

## C019 — Membrane protein in a nanodisc

**Category:** Structural biology. **Disposition:** new.

**Verified scientific scope:** A scaffold belt stabilizes a small bilayer disc that can hold a membrane protein.

**Proposed construction:** Arrange lipid instances into a bilayer patch, wrap its hydrophobic edge with the planned scaffold belt and insert an existing transmembrane protein through the patch. Provide top and tilted side views with individually selectable belt, lipids and protein.

**States:** empty disc; protein-containing disc.

**Limits:** Protein copy number, belt count and dimensions remain configurable; this is not a claim about a specific preparation.

**Deduplication:** No matching named primitive or numbered roadmap recipe found in manual topic comparison. This is a new recipe, not a new primitive.

**Evidence:** [NANO](https://pdb101.rcsb.org/motm/237) (Introductory description; Good Cholesterol; Exploring the Structure)

**Reusable dependencies:** `A007` (Membrane scaffold protein belt; planned in this catalog); `lipid-bilayer-cross-section` (lipid bilayer cross-section; complete at baseline); `transmembrane-protein` (transmembrane protein; pending at baseline).

<a id="c020"></a>

## C020 — Riboswitch ligand-dependent state comparison

**Category:** Nucleic acids. **Disposition:** new.

**Verified scientific scope:** Ligand binding can stabilize a regulatory RNA fold and alter gene expression.

**Proposed construction:** Duplicate the same RNA preset into unbound and bound panels. Keep ligand identity and the expression-platform region labeled. Use an editable output badge reading increased or decreased expression only after the chosen riboswitch class is specified.

**States:** unbound; ligand-bound.

**Limits:** No universal ON direction is implied; a particular terminator or ribosome-binding-site mechanism needs additional verification.

**Deduplication:** No matching named primitive or numbered roadmap recipe found in manual topic comparison. This is a new recipe, not a new primitive.

**Evidence:** [RIBO](https://pdb101.rcsb.org/motm/130) (Self Control; Flipping the Switch)

**Reusable dependencies:** `P014` (Ligand-responsive RNA folding preset; planned in this catalog); `messenger-rna` (messenger RNA; pending at baseline).

<a id="c021"></a>

## C021 — Telomerase repeat-extension cycle

**Category:** Nucleic acids. **Disposition:** roadmap_expansion.

**Verified scientific scope:** Telomerase uses an internal RNA template to extend a telomeric DNA end.

**Proposed construction:** Place the DNA 3-prime end against an RNA-containing protein group labeled telomerase. Align a short RNA template region with the extension site; show repeat addition and repositioning as separate arrows. Preserve DNA/RNA identities and strand-end labels throughout.

**States:** aligned; extended; repositioned.

**Limits:** Sequence labels and repeat length must specify organism; the overview does not model complete telomere replication.

**Deduplication:** roadmap:55

**Evidence:** [TELO](https://pdb101.rcsb.org/motm/227) (Protecting the Ends; Add Six Bases, Repeat; Quadruplexes)

**Reusable dependencies:** `telomere` (telomere; pending at baseline); `single-stranded-dna` (single-stranded DNA; pending at baseline); `rna-strand` (RNA strand; pending at baseline); `generic-globular-protein` (generic globular protein; complete at baseline); `nucleotide` (nucleotide; pending at baseline).

<a id="c022"></a>

## C022 — Telomeric overhang versus quadruplex state

**Category:** Nucleic acids. **Disposition:** roadmap_expansion.

**Verified scientific scope:** Guanine-rich telomeric DNA can form quadruplex structures.

**Proposed construction:** Reuse one telomere context and replace only its exposed overhang state with the planned G-quadruplex module. Use a reversible state connector and retain strand endpoints. Keep optional shelterin labels outside the fold instead of embedding all telomere proteins in one icon.

**States:** extended overhang; quadruplex schematic.

**Limits:** Do not portray quadruplex folding as obligatory at all chromosome ends.

**Deduplication:** roadmap:55

**Evidence:** [TELO](https://pdb101.rcsb.org/motm/227) (Protecting the Ends; Add Six Bases, Repeat; Quadruplexes)

**Reusable dependencies:** `telomere` (telomere; pending at baseline); `single-stranded-dna` (single-stranded DNA; pending at baseline); `A008` (G-quadruplex topology module; planned in this catalog).

<a id="c023"></a>

## C023 — Spliceosomal branch formation and exon joining

**Category:** Nucleic acids. **Disposition:** roadmap_expansion.

**Verified scientific scope:** Spliceosomal chemistry forms an intron lariat and joins the flanking exons.

**Proposed construction:** Represent two exon blocks connected by an intron strand. Place the existing spliceosome around the junction and mark the branch point. Step one forms a loop linked to the downstream exon; step two joins exons and releases the lariat preset. Preserve exon colors between states.

**States:** pre-mRNA; branched intermediate; joined exons and lariat.

**Limits:** This depicts the major spliceosome pathway; branch linkage must not look like an ordinary backbone continuation.

**Deduplication:** roadmap:27

**Evidence:** [SPLICE](https://reactome.org/content/detail/R-HSA-72163) (Summary paragraphs 1-6)

**Reusable dependencies:** `spliceosome` (spliceosome; pending at baseline); `rna-strand` (RNA strand; pending at baseline); `messenger-rna` (messenger RNA; pending at baseline); `P013` (RNA lariat topology preset; planned in this catalog).

<a id="c025"></a>

## C025 — Restriction cloning with orientation check

**Category:** Methods. **Disposition:** new.

**Verified scientific scope:** Compatible ends enable ligation, while screening is needed to verify the resulting construct.

**Proposed construction:** Arrange donor, cut insert and opened recipient plasmid in parallel lanes; match end labels before joining. Follow ligation with transformation and a separate verification checkpoint. Keep incorrect orientation as an optional clearly marked alternative, not a successful endpoint.

**States:** donor and recipient; compatible ends; candidate clone; verified construct.

**Limits:** Colony growth alone is not construct verification; this diagram is a conceptual workflow, not an operational protocol.

**Deduplication:** No matching named primitive or numbered roadmap recipe found in manual topic comparison. This is a new recipe, not a new primitive.

**Evidence:** [CLONE](https://www.addgene.org/protocols/subcloning/) (Design; Digest; Ligate; Transform; Isolate the Finished Plasmid)

**Reusable dependencies:** `circular-plasmid-dna` (circular plasmid DNA; pending at baseline); `linear-dna-fragment` (linear DNA fragment; pending at baseline); `P017` (DNA cohesive-end preset; planned in this catalog); `generic-enzyme` (generic enzyme; complete at baseline); `bacterial-colony-on-agar` (bacterial colony on agar; pending at baseline); `dna-electrophoresis-gel-with-bands` (DNA electrophoresis gel with bands; pending at baseline).

<a id="c026"></a>

## C026 — Overlap-based Gibson assembly mechanism

**Category:** Methods. **Disposition:** new.

**Verified scientific scope:** Gibson assembly combines exonuclease, polymerase and ligase activities on overlapping fragments.

**Proposed construction:** Place color-coded fragments with matched overlap labels. Show exposed complementary regions after end processing, annealing, gap filling and nick sealing as four distinct states. Retain the same fragment colors in the assembled product and show circularization only for a circular design.

**States:** overlap design; annealed; filled; sealed.

**Limits:** Overlaps are designed homology, not arbitrary restriction overhangs; no reaction conditions are specified.

**Deduplication:** No matching named primitive or numbered roadmap recipe found in manual topic comparison. This is a new recipe, not a new primitive.

**Evidence:** [GIBSON](https://www.addgene.org/protocols/gibson-assembly/) (Procedure: design and enzyme functions)

**Reusable dependencies:** `linear-dna-fragment` (linear DNA fragment; pending at baseline); `single-stranded-dna` (single-stranded DNA; pending at baseline); `generic-enzyme` (generic enzyme; complete at baseline); `circular-plasmid-dna` (circular plasmid DNA; pending at baseline).

<a id="c027"></a>

## C027 — Type IIS ordered assembly logic

**Category:** Methods. **Disposition:** new.

**Verified scientific scope:** Golden Gate assembly uses cleavage outside recognition sites to produce designed ligation ends.

**Proposed construction:** Use several color-coded DNA modules with separate recognition-site and overhang labels. Draw cleavage outside each recognition site, then order fragments by compatible ends. Keep removed recognition regions visibly excluded from the intended joined product.

**States:** site-bearing modules; cut modules; ordered product.

**Limits:** Directionality depends on the chosen overhang design; do not imply every arbitrary mixture self-orders.

**Deduplication:** No matching named primitive or numbered roadmap recipe found in manual topic comparison. This is a new recipe, not a new primitive.

**Evidence:** [GOLD](https://www.neb-online.de/en/cloning-synthetic-biology/dna-assembly/golden-gate-assembly/) (Overview and Golden Gate Assembly workflow)

**Reusable dependencies:** `linear-dna-fragment` (linear DNA fragment; pending at baseline); `P017` (DNA cohesive-end preset; planned in this catalog); `generic-enzyme` (generic enzyme; complete at baseline); `circular-plasmid-dna` (circular plasmid DNA; pending at baseline).

<a id="c028"></a>

## C028 — Single-cell ATAC partition and library workflow

**Category:** Single-cell methods. **Disposition:** roadmap_expansion.

**Verified scientific scope:** The described single-cell ATAC workflow transposes nuclei before partitioning.

**Proposed construction:** Start with nuclei and a transposition step outside droplets. Then partition with a barcoded bead, connect barcode incorporation to indexed library fragments and end with a sequencing/read-assignment panel. Label empty and multiplet partitions as possible states.

**States:** bulk transposition; partitioning; barcoded library.

**Limits:** One partition barcode does not guarantee one biological cell. The order is specific to the cited assay generation.

**Deduplication:** roadmap:56

**Evidence:** [ATAC](https://www.10xgenomics.com/support/epi-atac/documentation/steps/experimental-design-and-planning/getting-started-single-cell-atac) (Introduction)

**Reusable dependencies:** `nucleus` (nucleus; complete at baseline); `transposase-dna-complex` (transposase-DNA complex; pending at baseline); `single-cell-droplet-with-barcoded-bead` (single-cell droplet with barcoded bead; pending at baseline); `barcoded-capture-bead` (barcoded capture bead; pending at baseline); `indexed-dna-library-fragment` (indexed DNA library fragment; pending at baseline); `sequencing-flow-cell` (sequencing flow cell; pending at baseline).

<a id="c029"></a>

## C029 — Joint RNA and antibody-tag measurement

**Category:** Single-cell methods. **Disposition:** roadmap_expansion.

**Verified scientific scope:** Antibody oligonucleotide tags can be measured alongside gene expression in a single-cell workflow.

**Proposed construction:** Place a surface-bound barcoded antibody on a cell, then put the cell and a capture bead in a partition. Split output into RNA-derived library and antibody-tag library while retaining a common cell-barcode label. Use distinct colors and labels for feature identity versus cell identity.

**States:** labeled cells; partition; two linked measurements.

**Limits:** A tag count is assay evidence, not an exact molecule count or proof of target function.

**Deduplication:** roadmap:56

**Evidence:** [FEATURE](https://www.10xgenomics.com/support/software/cell-ranger/10.0/getting-started/cr-what-is-feature-bc) (Feature Barcode technology and application bullets)

**Reusable dependencies:** `rounded-suspension-cell` (rounded suspension cell; complete at baseline); `P018` (Barcoded surface-protein measurement preset; planned in this catalog); `single-cell-droplet-with-barcoded-bead` (single-cell droplet with barcoded bead; pending at baseline); `messenger-rna` (messenger RNA; pending at baseline); `indexed-dna-library-fragment` (indexed DNA library fragment; pending at baseline).

<a id="c030"></a>

## C030 — Captured guide identity linked to transcriptome

**Category:** Single-cell methods. **Disposition:** roadmap_expansion.

**Verified scientific scope:** Captured CRISPR guide identities can be linked to single-cell gene-expression data.

**Proposed construction:** Show a cell with a guide-RNA label, a partition and two output tracks: guide identity and transcriptome. Join tracks with the shared cell-barcode field. End with an association panel, leaving perturbation efficacy as a separate validation badge.

**States:** guide-bearing cell; captured identity; linked readouts.

**Limits:** Guide detection does not establish successful editing or prove that an observed expression change is causal.

**Deduplication:** roadmap:56

**Evidence:** [FEATURE](https://www.10xgenomics.com/support/software/cell-ranger/10.0/getting-started/cr-what-is-feature-bc) (Feature Barcode technology and application bullets)

**Reusable dependencies:** `guide-rna` (guide RNA; pending at baseline); `rounded-suspension-cell` (rounded suspension cell; complete at baseline); `single-cell-droplet-with-barcoded-bead` (single-cell droplet with barcoded bead; pending at baseline); `messenger-rna` (messenger RNA; pending at baseline); `barcoded-oligonucleotide` (barcoded oligonucleotide; pending at baseline).

<a id="c031"></a>

## C031 — Sample multiplexing with distinct barcode roles

**Category:** Single-cell methods. **Disposition:** roadmap_expansion.

**Verified scientific scope:** Sample tags add sample identity to single-cell measurements.

**Proposed construction:** Give each input sample a distinct tag label, pool the cell groups and route them into partitions. At output show separate fields for sample tag, cell barcode and feature identity; include ambiguous-tag assignments as unresolved.

**States:** separate samples; pooled; assigned or ambiguous.

**Limits:** Do not conflate a sample tag with a unique cell barcode or assume every cell has a clean sample assignment.

**Deduplication:** roadmap:56

**Evidence:** [FEATURE](https://www.10xgenomics.com/support/software/cell-ranger/10.0/getting-started/cr-what-is-feature-bc) (Feature Barcode technology and application bullets)

**Reusable dependencies:** `cell-hashing-antibody-tag-complex` (cell hashing antibody-tag complex; pending at baseline); `rounded-suspension-cell` (rounded suspension cell; complete at baseline); `single-cell-droplet-with-barcoded-bead` (single-cell droplet with barcoded bead; pending at baseline); `barcoded-oligonucleotide` (barcoded oligonucleotide; pending at baseline).

<a id="c032"></a>

## C032 — Annexin and membrane-integrity interpretation panel

**Category:** Assays. **Disposition:** roadmap_expansion.

**Verified scientific scope:** Annexin V reports accessible phosphatidylserine; membrane damage affects interpretation.

**Proposed construction:** Build a membrane inset with PS labels and a calcium-dependent Annexin probe. Pair it with a membrane-impermeant-dye annotation and an editable two-axis schematic. Label quadrants by measured positivity first; annotate double positivity as compatible with late apoptotic or other dead cells.

**States:** Annexin negative or positive; integrity-dye negative or positive.

**Limits:** Do not label every double-positive cell late apoptotic or treat Annexin alone as a definitive death assay.

**Deduplication:** roadmap:104

**Evidence:** [ANNEX](https://www.thermofisher.com/dk/en/home/life-science/cell-analysis/cell-viability-and-regulation/apoptosis/annexin-v-staining.html) (What is Annexin V; How Annexin V staining works; false-positive caveat)

**Reusable dependencies:** `plasma-membrane-segment` (plasma membrane segment; complete at baseline); `phospholipid` (phospholipid; pending at baseline); `P016` (Annexin V fluorescent probe preset; planned in this catalog); `fluorescent-dye` (fluorescent dye; pending at baseline); `apoptotic-cell` (apoptotic cell; complete at baseline); `necrotic-cell` (necrotic cell; complete at baseline).

<a id="c033"></a>

## C033 — Intestinal crypt epithelial composition

**Category:** Tissue biology. **Disposition:** roadmap_expansion.

**Verified scientific scope:** Intestinal crypts contain multiple epithelial cell types including Paneth and endocrine cells.

**Proposed construction:** Use the crypt as a context frame. Place repeated epithelial instances along its wall, Paneth cells at the base and independently labeled endocrine and goblet cells among them. Keep the lumen unobstructed and cell identities selectable.

**States:** overview; cell-type inset.

**Limits:** This is a composition map, not a validated stem-cell lineage trajectory or a quantitative cell-frequency chart.

**Deduplication:** roadmap:88

**Evidence:** [GUT](https://histology.leeds.ac.uk/home/digestive/small_intestine/) (Structure; Epithelium and Villi; Crypts)

**Reusable dependencies:** `intestinal-crypt` (intestinal crypt; pending at baseline); `columnar-epithelial-cell` (columnar epithelial cell; complete at baseline); `goblet-cell` (goblet cell; complete at baseline); `A011` (Paneth cell with apical granule compartment; planned in this catalog); `P003` (Intestinal endocrine-cell identity preset; planned in this catalog).

<a id="c034"></a>

## C034 — Villus exchange routes and brush border

**Category:** Tissue biology. **Disposition:** roadmap_expansion.

**Verified scientific scope:** Villi combine an absorptive epithelium with blood and lymphatic vessels.

**Proposed construction:** Use a villus context and add an enlarged apical brush-border inset from enterocyte presets. Draw separate capillary and lacteal paths inside the villus, with labels rather than an undifferentiated vascular tube. Keep lumen-to-epithelium direction clear.

**States:** whole villus; surface inset.

**Limits:** Nutrient-specific transporters and blood-versus-lymph routing need additional substrate-specific evidence.

**Deduplication:** roadmap:88

**Evidence:** [GUT](https://histology.leeds.ac.uk/home/digestive/small_intestine/) (Structure; Epithelium and Villi; Crypts)

**Reusable dependencies:** `intestinal-villus` (intestinal villus; pending at baseline); `P002` (Enterocyte brush-border preset; planned in this catalog); `goblet-cell` (goblet cell; complete at baseline); `capillary-cross-section` (capillary cross-section; pending at baseline); `lymphatic-vessel` (lymphatic vessel; pending at baseline).

<a id="c035"></a>

## C035 — Alveolar air-blood diffusion barrier

**Category:** Tissue biology. **Disposition:** roadmap_expansion.

**Verified scientific scope:** Thin alveolar epithelium and capillary endothelium form the gas-exchange interface.

**Proposed construction:** Build an alveolar wall from flattened type I presets, basement-membrane components and endothelial cells. Place airspace on one side and erythrocytes in a capillary lumen on the other. Add independent O2 and CO2 arrows with opposing directions across the barrier.

**States:** tissue view; barrier inset.

**Limits:** Widths and distances are schematic; do not represent cell layers as equal-thickness slabs or claim a measured diffusion rate.

**Deduplication:** roadmap:87

**Evidence:** [LUNG](https://histology.leeds.ac.uk/home/respiratory/respiratory/) (Alveoli; Main constituents of alveolus and interalveolar wall)

**Reusable dependencies:** `alveolus` (alveolus; pending at baseline); `P001` (Type I pneumocyte placement preset; planned in this catalog); `basement-membrane` (basement membrane; pending at baseline); `endothelial-cell` (endothelial cell; complete at baseline); `erythrocyte` (erythrocyte; complete at baseline).

<a id="c036"></a>

## C036 — Type II cell surfactant secretion context

**Category:** Tissue biology. **Disposition:** roadmap_expansion.

**Verified scientific scope:** Type II pneumocytes secrete surfactant toward the alveolar airspace.

**Proposed construction:** Place the planned type II cell among type I cell presets. Orient secretion anchors toward the airspace; move separate vesicle instances toward that face and add a surface-film annotation. Keep the surfactant layer distinct from the basement membrane below the cells.

**States:** stored secretion; apical release; surface film.

**Limits:** The film is a symbolic overlay; molecular surfactant composition and lamellar-body detail are not specified.

**Deduplication:** roadmap:87

**Evidence:** [LUNG](https://histology.leeds.ac.uk/home/respiratory/respiratory/) (Alveoli; Main constituents of alveolus and interalveolar wall)

**Reusable dependencies:** `A012` (Type II pneumocyte with secretion anchors; planned in this catalog); `P001` (Type I pneumocyte placement preset; planned in this catalog); `secretory-vesicle` (secretory vesicle; complete at baseline); `alveolus` (alveolus; pending at baseline).

<a id="c037"></a>

## C037 — Capillary wall architecture comparison

**Category:** Tissue biology. **Disposition:** roadmap_expansion.

**Verified scientific scope:** Continuous, fenestrated and sinusoidal capillary architectures differ.

**Proposed construction:** Create three matched vessel cross-section panels with consistent lumen orientation. Reuse endothelial and basement-membrane components; add fenestrae as intracellular pore overlays and sinusoidal discontinuities as a separately labeled pattern. Use an optional external pericyte only in the appropriate contextual panel.

**States:** continuous; fenestrated; sinusoidal.

**Limits:** Do not generalize pore sizes, basement-membrane continuity or permeability to every organ from the generic panels.

**Deduplication:** roadmap:86

**Evidence:** [CAP](https://histology.leeds.ac.uk/home/circulatory/capillaries/) (Continuous; Fenestrated capillaries; Sinusoids)

**Reusable dependencies:** `capillary-cross-section` (capillary cross-section; pending at baseline); `endothelial-cell` (endothelial cell; complete at baseline); `P004` (Fenestrated endothelial-cell preset; planned in this catalog); `basement-membrane` (basement membrane; pending at baseline); `A010` (Pericyte with vessel-facing processes; planned in this catalog).

<a id="c038"></a>

## C038 — Pericyte-endothelial spatial relationship

**Category:** Tissue biology. **Disposition:** roadmap_expansion.

**Verified scientific scope:** Pericytes associate with the abluminal side of capillary endothelium.

**Proposed construction:** Use a short endothelial tube or existing vessel context and place pericyte processes along its exterior. Add a cutaway showing lumen, endothelial layer and exterior cell contact. Keep pericyte and endothelium as different selectable cell groups.

**States:** longitudinal view; cross-section inset.

**Limits:** This establishes location, not a universal pericyte coverage fraction or molecular signaling mechanism.

**Deduplication:** roadmap:85

**Evidence:** [CAP](https://histology.leeds.ac.uk/home/circulatory/capillaries/) (Continuous; Fenestrated capillaries; Sinusoids)

**Reusable dependencies:** `small-blood-vessel` (small blood vessel; pending at baseline); `endothelial-cell` (endothelial cell; complete at baseline); `A010` (Pericyte with vessel-facing processes; planned in this catalog); `basement-membrane` (basement membrane; pending at baseline).

<a id="c039"></a>

## C039 — Outer-membrane porin diffusion and reduced access

**Category:** Microbiology. **Disposition:** roadmap_expansion.

**Verified scientific scope:** Porins provide diffusion paths; reduced permeability can contribute to resistance.

**Proposed construction:** Insert porin instances into the outer membrane of the Gram-negative envelope. Route a labeled compatible solute through the lumen into periplasm in one panel; reduce channel availability or show restricted passage in the comparison. Keep the inner membrane separate and do not add an ATP-consumption arrow.

**States:** permeable schematic; reduced-access schematic.

**Limits:** Permeability effects depend on compound and porin. Reduced entry does not by itself prove clinical antibiotic resistance.

**Deduplication:** roadmap:84

**Evidence:** [PORIN](https://pdb101.rcsb.org/global-health/antimicrobial-resistance/drugs/antibiotic-resistance-mechanisms/porins) (Normal Function; Types; Structure; Resistance Due to Decreased Permeability)

**Reusable dependencies:** `gram-negative-cell-envelope-cross-section` (Gram-negative cell-envelope cross-section; pending at baseline); `A005` (Bacterial porin beta-barrel; planned in this catalog); `small-molecule-drug` (small-molecule drug; pending at baseline).

<a id="c040"></a>

## C040 — LPS position in a Gram-negative envelope

**Category:** Microbiology. **Disposition:** roadmap_expansion.

**Verified scientific scope:** LPS combines lipid anchoring with carbohydrate regions at the bacterial surface.

**Proposed construction:** Reuse the Gram-negative envelope frame and attach LPS lipid regions into the outer-facing membrane leaflet. Extend carbohydrate chains toward the extracellular side, leaving periplasm and inner membrane distinct. Use variable chain lengths as qualitative variants.

**States:** short carbohydrate schematic; extended carbohydrate schematic.

**Limits:** Carbohydrate composition varies; do not call every generic chain a specific bacterial serotype.

**Deduplication:** roadmap:72

**Evidence:** [LPS](https://pdb101.rcsb.org/learn/structural-biology-highlights/making-lipopolysaccharide) (Introduction; Lipid Carrier)

**Reusable dependencies:** `gram-negative-cell-envelope-cross-section` (Gram-negative cell-envelope cross-section; pending at baseline); `A003` (Lipopolysaccharide molecule; planned in this catalog).

<a id="c041"></a>

## C041 — Aggrecan-collagen cartilage matrix organization

**Category:** Extracellular matrix. **Disposition:** roadmap_expansion.

**Verified scientific scope:** Aggrecan and collagen contribute different structural features to cartilage matrix.

**Proposed construction:** Place aggrecan brush instances between collagen fibrils around a chondrocyte context. Keep collagen, aggrecan cores and side chains as separate groups. Offer intact and reduced-aggrecan illustrative states with identical layout for comparison.

**States:** organized matrix; reduced-aggrecan comparison.

**Limits:** Do not infer stiffness values, disease severity or a specific degradation enzyme from the schematic density.

**Deduplication:** roadmap:99

**Evidence:** [AGG](https://www.ncbi.nlm.nih.gov/books/NBK604357/) (Abstract; Structure of Aggrecan; Nanomechanics sections)

**Reusable dependencies:** `A006` (Aggrecan proteoglycan monomer; planned in this catalog); `collagen-fibril` (collagen fibril; complete at baseline); `chondrocyte` (chondrocyte; complete at baseline); `extracellular-matrix-mesh` (extracellular matrix mesh; pending at baseline).

<a id="c042"></a>

## C042 — STING trafficking to interferon-response signaling

**Category:** Immunology. **Disposition:** new.

**Verified scientific scope:** STING signaling involves a localization change and TBK1/IRF3-dependent response.

**Proposed construction:** Place a STING-labeled membrane protein at ER, add a trafficking arrow toward a Golgi/perinuclear state and connect TBK1 and IRF3 labels to a nuclear response annotation. Keep activation input as an explicitly unspecified upstream node.

**States:** ER-localized; trafficked; downstream response.

**Limits:** This source mixes historical human and mouse evidence. A cGAS/cGAMP mechanism or species-specific residues require a newer targeted source.

**Deduplication:** No matching named primitive or numbered roadmap recipe found in manual topic comparison. This is a new recipe, not a new primitive.

**Evidence:** [STING](https://reactome.org/content/detail/R-HSA-1834941) (Summary: ER localization, trafficking and TBK1/IRF3)

**Reusable dependencies:** `smooth-endoplasmic-reticulum` (smooth endoplasmic reticulum; complete at baseline); `golgi-apparatus` (Golgi apparatus; complete at baseline); `transmembrane-protein` (transmembrane protein; pending at baseline); `generic-enzyme` (generic enzyme; complete at baseline); `generic-globular-protein` (generic globular protein; complete at baseline); `nucleus` (nucleus; complete at baseline).
