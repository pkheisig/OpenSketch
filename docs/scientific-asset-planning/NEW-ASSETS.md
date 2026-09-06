# New building-block candidates

12 distinct morphology or topology candidates after comparison with the 768-name baseline. These are planning requests, not permission to generate artwork. First try existing editable geometry; a candidate that can be expressed as a preset should remain a preset.

[Catalog guide](README.md) · [Assembly rules](ASSEMBLY-INSTRUCTIONS.md)

<a id="a001"></a>

## A001 — Ferritin protein cage

**Category:** Proteins. **Disposition:** new.

**Verified scientific scope:** Ferritin provides a hollow protein shell for iron storage.

**Proposed construction:** Plan an intact sphere and a cutaway of the same shell. Keep the cavity, shell and optional iron-core overlay separately addressable. Use a cage silhouette rather than the open tunnel of a chaperonin; do not prescribe atomic surface detail.

**States:** empty; iron-loaded; cutaway.

**Limits:** A schematic shell does not establish a species-specific subunit composition. Resolve an exact structure before showing numbered subunits.

**Deduplication:** Closest baseline: ring-shaped protein complex and chaperonin barrel; neither is a closed storage cage.

**Evidence:** [FERR](https://pdb101.rcsb.org/motm/35) (Storing Iron; Transferrin and transferrin receptor)

**Reusable dependencies:** `generic-globular-protein` (generic globular protein; complete at baseline).

<a id="a002"></a>

## A002 — Fibrinogen monomer

**Category:** Extracellular matrix. **Disposition:** new.

**Verified scientific scope:** Soluble fibrinogen is cleaved to produce fibrin, which can assemble into fibers.

**Proposed construction:** Use an elongated molecule with a central region and two distal lobes connected by slender arms. Provide removable cleavage-site annotations and end attachment points so copies can later form a fiber. Keep the soluble precursor separate from the assembled network.

**States:** intact; cleavage annotations; assembly-ready.

**Limits:** Flexible regions are not completely resolved in many structures. Avoid treating the drawing as exact molecular geometry.

**Deduplication:** Closest baseline: fibrin fiber, which represents the polymer rather than soluble precursor.

**Evidence:** [FIB](https://pdb101.rcsb.org/motm/83) (Building a Scab; Flexible Fibrin; assembly discussion)

**Reusable dependencies:** `fibrin-fiber` (fibrin fiber; pending at baseline).

<a id="a003"></a>

## A003 — Lipopolysaccharide molecule

**Category:** Microbiology. **Disposition:** new.

**Verified scientific scope:** LPS connects a lipid anchor to carbohydrate regions on Gram-negative bacterial surfaces.

**Proposed construction:** Provide a lipid-anchor module beneath an editable sugar-chain region. Mark membrane insertion and extracellular chain endpoints. Offer schematic short-chain and extended-chain states with strain identity left unset.

**States:** short carbohydrate; extended carbohydrate; membrane-anchored.

**Limits:** Do not infer a fixed sugar sequence, tail count or universal O-antigen length from a generic LPS symbol.

**Deduplication:** Closest baseline: glycocalyx and phospholipid; a single LPS building block has a distinct composite molecular architecture.

**Evidence:** [LPS](https://pdb101.rcsb.org/learn/structural-biology-highlights/making-lipopolysaccharide) (Introduction; Lipid Carrier)

**Reusable dependencies:** `phospholipid` (phospholipid; pending at baseline).

<a id="a004"></a>

## A004 — IgE Fc domain module

**Category:** Immunology. **Disposition:** new.

**Verified scientific scope:** IgE Fc contains a C-epsilon-2 domain pair and can adopt a bent configuration distinct from IgG Fc.

**Proposed construction:** Design an Fc-only module with paired domain regions and two Fab attachment anchors. Preserve a bent silhouette and expose the receptor-binding side. Full IgE must later reuse two library Fab fragments with this module.

**States:** unbound schematic; receptor-bound placeholder.

**Limits:** The cited structure contains Fc, not complete IgE; it does not establish the bound whole-antibody geometry.

**Deduplication:** Closest baseline: antibody Fc fragment and generic IgG antibody; do not relabel IgG Fc as structurally detailed IgE.

**Evidence:** [IGEF](https://www.rcsb.org/structure/1O0V) (Primary Citation abstract)

**Reusable dependencies:** `antibody-fab-fragment` (antibody Fab fragment; complete at baseline).

<a id="a005"></a>

## A005 — Bacterial porin beta-barrel

**Category:** Microbiology. **Disposition:** new.

**Verified scientific scope:** Classical porins provide water-filled diffusion paths through the bacterial outer membrane.

**Proposed construction:** Plan a short membrane-spanning barrel with a visible lumen and rim loops. Supply side and axial views with separate lumen and membrane anchors. Assemble oligomers from instances; label the selected porin before giving an oligomer count.

**States:** side view; axial view; restricted lumen.

**Limits:** Porins vary in selectivity and oligomeric organization. Do not turn the archetype into a universal ATP-driven transporter.

**Deduplication:** Closest baseline: ligand-gated ion channel and solute carrier transporter; beta-barrel outer-membrane architecture differs.

**Evidence:** [PORIN](https://pdb101.rcsb.org/global-health/antimicrobial-resistance/drugs/antibiotic-resistance-mechanisms/porins) (Normal Function; Types; Structure; Resistance Due to Decreased Permeability)

**Reusable dependencies:** `transmembrane-protein` (transmembrane protein; pending at baseline).

<a id="a006"></a>

## A006 — Aggrecan proteoglycan monomer

**Category:** Extracellular matrix. **Disposition:** new.

**Verified scientific scope:** Aggrecan has glycosaminoglycan side chains attached to a protein core.

**Proposed construction:** Plan a flexible core with detachable brush-like side chains and a designated attachment region. Preserve chain/core separation for intact and fragmented states. A cartilage panel must assemble these with existing collagen and cell assets.

**States:** intact; reduced side chains; fragmented.

**Limits:** This is an aggrecan archetype, not the architecture of every proteoglycan; no quantitative stiffness follows from chain density in the icon.

**Deduplication:** Closest baseline: extracellular matrix mesh and collagen fibril; neither represents a single decorated proteoglycan.

**Evidence:** [AGG](https://www.ncbi.nlm.nih.gov/books/NBK604357/) (Abstract; Structure of Aggrecan; Nanomechanics sections)

**Reusable dependencies:** `collagen-fibril` (collagen fibril; complete at baseline).

<a id="a007"></a>

## A007 — Membrane scaffold protein belt

**Category:** Structural biology. **Disposition:** new.

**Verified scientific scope:** Engineered scaffold proteins stabilize the edge of a nanodisc lipid bilayer.

**Proposed construction:** Plan a reusable open/closed belt around a circular or elliptical membrane boundary, with lipid-facing inner edge and exposed outer edge. Build the disc from existing lipid bilayer components and this belt rather than baking a membrane protein into it.

**States:** open belt; closed belt; side view.

**Limits:** Disc dimensions and belt stoichiometry depend on the scaffold construct. No single size is implied.

**Deduplication:** Closest baseline: coiled-coil protein and ring-shaped protein complex; a lipid-edge scaffold has a different assembly role.

**Evidence:** [NANO](https://pdb101.rcsb.org/motm/237) (Introductory description; Good Cholesterol; Exploring the Structure)

**Reusable dependencies:** `lipid-bilayer-cross-section` (lipid bilayer cross-section; complete at baseline).

<a id="a008"></a>

## A008 — G-quadruplex topology module

**Category:** Nucleic acids. **Disposition:** new.

**Verified scientific scope:** Guanine-rich nucleic acid can fold into quadruplex structures.

**Proposed construction:** Plan a strand-followable stack of tetrad placeholders with connecting loops. Retain 5-prime and 3-prime anchors. Use a compact topology view and a simplified small-scale icon; reserve base and ion labels for a specified structure.

**States:** folded; unfolded comparison.

**Limits:** Loop topology and strand orientation are sequence dependent. A telomere need not be folded into this state.

**Deduplication:** Closest baseline: DNA double helix and telomere; neither conveys four-stranded folding.

**Evidence:** [TELO](https://pdb101.rcsb.org/motm/227) (Protecting the Ends; Add Six Bases, Repeat; Quadruplexes)

**Reusable dependencies:** `single-stranded-dna` (single-stranded DNA; pending at baseline).

<a id="a009"></a>

## A009 — Four-way DNA junction topology module

**Category:** Nucleic acids. **Disposition:** new.

**Verified scientific scope:** Holliday junctions connect four DNA arms; their conformation depends on sequence and conditions.

**Proposed construction:** Plan four duplex arms with continuous colored strand paths through the junction. Include an explanatory open layout and a compact stacked arrangement. Crossing strands must remain traceable and must not appear severed.

**States:** open schematic; stacked schematic.

**Limits:** Open layout is an explanatory design choice. The cited deposition directly supports a stacked-X conformation, not a universal angle.

**Deduplication:** Closest baseline: replication fork has three arms; a four-way junction adds a different topology.

**Evidence:** [HJ](https://www.rcsb.org/structure/1P4Y) (Primary Citation abstract; structure metadata)

**Reusable dependencies:** `dna-double-helix` (DNA double helix; pending at baseline).

<a id="a010"></a>

## A010 — Pericyte with vessel-facing processes

**Category:** Cells. **Disposition:** new.

**Verified scientific scope:** Pericytes are associated with the outside of capillary endothelium.

**Proposed construction:** Plan an elongated nucleated cell whose processes can follow a vessel exterior. Provide a vessel-contact anchor and process handles. Keep the vessel itself separate and leave marker labels optional.

**States:** isolated; vessel-associated orientation.

**Limits:** Shape varies by vascular bed. Positioning outside the endothelial lumen is the verified constraint; process lengths are schematic.

**Deduplication:** Closest baseline: smooth muscle cell and fibroblast; the vascular wrapping configuration should remain distinguishable.

**Evidence:** [CAP](https://histology.leeds.ac.uk/home/circulatory/capillaries/) (Continuous; Fenestrated capillaries; Sinusoids)

**Reusable dependencies:** `endothelial-cell` (endothelial cell; complete at baseline).

<a id="a011"></a>

## A011 — Paneth cell with apical granule compartment

**Category:** Cells. **Disposition:** new.

**Verified scientific scope:** Paneth cells occur at intestinal crypt bases and contain antimicrobial secretory granules.

**Proposed construction:** Plan a crypt-compatible epithelial outline with a distinct granule-rich apical region and basal nucleus. Include explicit apical/basal anchors so the cell can be inserted among existing epithelial cells. Keep granules separate for a secretion scene.

**States:** granule-rich; secretion-ready.

**Limits:** Granule colors are design choices, not unstained biological colors. Do not identify all granular epithelial cells as Paneth cells.

**Deduplication:** Closest baseline: goblet cell has a mucus-filled apical cup; Paneth granules should not be drawn as that cup.

**Evidence:** [GUT](https://histology.leeds.ac.uk/home/digestive/small_intestine/) (Structure; Epithelium and Villi; Crypts)

**Reusable dependencies:** `columnar-epithelial-cell` (columnar epithelial cell; complete at baseline); `secretory-vesicle` (secretory vesicle; complete at baseline).

<a id="a012"></a>

## A012 — Type II pneumocyte with secretion anchors

**Category:** Cells. **Disposition:** new.

**Verified scientific scope:** Type II pneumocytes are comparatively compact alveolar epithelial cells that secrete surfactant.

**Proposed construction:** Plan a compact cell cutaway with a nucleus, apical secretion positions and lateral junction anchors. Fit it as a discrete cell in an alveolar wall; expose an apical face toward airspace. Use library vesicles for secretion.

**States:** resting; secretion-ready.

**Limits:** The verified distinction is compact secretory cell versus thin type I cell. Detailed lamellar-body ultrastructure remains outside this specification.

**Deduplication:** Closest baseline: generic epithelial cell; alveolar placement and secretion interfaces motivate this specialized cutaway.

**Evidence:** [LUNG](https://histology.leeds.ac.uk/home/respiratory/respiratory/) (Alveoli; Main constituents of alveolus and interalveolar wall)

**Reusable dependencies:** `generic-epithelial-cell` (generic epithelial cell; complete at baseline); `secretory-vesicle` (secretory vesicle; complete at baseline).
