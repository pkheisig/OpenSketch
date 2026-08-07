# Assembled scientific asset roadmap

This is the backlog for generated, reusable SVG assemblies in OpenSketch. The visual reference is `complex.svg`: transparent canvas, bold dark outline, flat scientific colors, strong silhouette, deliberate symmetry, and editable grouped components.

## Generation contract

- Every asset is a real SVG with a `viewBox`, no raster images, no external URLs, scripts, or embedded HTML.
- Components remain grouped and named semantically where possible: `hub`, `arm`, `receptor`, `ligand`, `membrane`, `payload`, `label-anchor`.
- Use one coherent visual system: dark outline, flat fills, restrained secondary colors, clear depth through overlap and line weight rather than glossy 3D effects.
- Prefer a clean explanatory schematic over invented atomic detail. Structural references may guide geometry, but the result must communicate the assembly at figure scale.
- Each family gets variants only when they change a real visual or scientific use case: class, orientation, payload, binding state, color channel, or assembly state.
- Generate five pilot assets first, render each in chat, inspect the SVG structurally, and revise the style before expanding the catalog.

## Pilot batch: generate these five first

These five test the most important assembly patterns while staying in one immune-reagent family.

1. **MHC class-I tetramer** — four pMHC arms around a central streptavidin hub; peptide and fluorophore variants.
2. **MHC class-II tetramer** — four longer class-II pMHC arms around the same hub; class-I/class-II silhouette must be visibly distinct.
3. **pMHC:TCR recognition complex** — one pMHC, one TCR, optional CD3 cluster, and a contact/interface highlight.
4. **Bispecific T-cell engager** — antibody-like bridge connecting a T cell marker to a tumor-cell marker; bound and unbound variants.
5. **CAR-T immune synapse** — engineered receptor on a T-cell membrane engaging an antigen on a target cell; signaling-tail variant.

## 1. Immune recognition and cellular interactions

6. B-cell receptor bound to membrane antigen — IgM-style and IgG-style variants.
7. Antibody-antigen immune complex — one antigen, two-antibody, and lattice variants.
8. Dendritic cell antigen presentation — endosomal processing, MHC loading, and surface presentation states.
9. T-cell immune synapse — central supramolecular activation cluster with peripheral adhesion ring.
10. NK-cell killing synapse — activating/inhibitory receptor balance variants.
11. Macrophage phagocytosis — attached particle, engulfment cup, and internalized phagosome.
12. Neutrophil NETosis — resting cell, chromatin release, and extracellular trap states.
13. Complement C3 convertase — classical and alternative pathway assemblies.
14. Membrane attack complex — partial pore, completed pore, and membrane damage variants.
15. Fc-receptor crosslink — immune-complex-triggered receptor clustering.
16. CD28 co-stimulation — TCR plus CD28 engagement at a two-receptor synapse.
17. PD-1/PD-L1 checkpoint — blocked versus released checkpoint variants.
18. CTLA-4/B7 checkpoint — receptor competition at the APC interface.
19. Cytokine receptor dimer — ligand-bound, receptor-crosslinked, and JAK-associated states.
20. Toll-like receptor dimer — extracellular ligand, transmembrane helices, and signaling tails.
21. Inflammasome — sensor, adaptor, caspase, and pore-forming output variants.
22. Antibody-dependent cellular cytotoxicity — NK cell, Fc-bearing antibody, and target cell.
23. Immune cell transmigration — selectin rolling, integrin arrest, and diapedesis states.
24. Granuloma cross-section — macrophage core, lymphocyte ring, and necrotic center variants.

## 2. Protein complexes and molecular machines

25. Ribosome — initiation, elongation, and termination assemblies.
26. Proteasome — capped, uncapped, substrate-bound, and peptide-output variants.
27. Spliceosome — pre-mRNA, catalytic core, and released intron states.
28. Nuclear pore complex — open transport, cargo-bound, and export states.
29. Chaperonin — open, closed, ATP-bound, and client-bound states.
30. ATP synthase — membrane rotor and catalytic head with proton-flow variant.
31. Receptor tyrosine kinase dimer — ligand-free, ligand-bound, and phosphorylated states.
32. GPCR signaling complex — receptor, ligand, G protein, and arrestin variants.
33. Inflammasome signalosome — sensor oligomer, ASC speck, and caspase recruitment.
34. Apoptosome — cytochrome-c ring, adaptor, and caspase recruitment states.
35. Ubiquitin ligase complex — E1/E2/E3 assembly and substrate-bound variant.
36. DNA repair complex — damage site, repair intermediate, and ligated product.
37. Cohesin ring — open loading, chromatin embrace, and loop-extrusion states.
38. Condensin complex — compacted chromatin loop with ATPase heads.
39. Vesicle coat complex — clathrin cage, COPII vesicle, and COPI vesicle variants.
40. SNARE fusion complex — docked vesicle, zippering, and fused membrane states.
41. Molecular motor on microtubule — kinesin, dynein, cargo, and direction variants.
42. Ribosome-polysome assembly — single ribosome, polysome, and stalled translation states.

## 3. Genome, RNA, and gene regulation

43. DNA double helix with nucleosome — naked DNA, nucleosome, and compact chromatin variants.
44. Enhancer-promoter loop — transcription factor cluster and mediator bridge.
45. RNA polymerase transcription bubble — initiation, elongation, and termination states.
46. CRISPR-Cas9 editing complex — guide RNA, target DNA, cleavage, and repaired outcomes.
47. Base editor — DNA-bound deaminase and editable base window.
48. Prime editor — pegRNA, nicked DNA, reverse transcriptase, and edited strand.
49. Cas13 RNA-targeting complex — guide-bound RNA and cleavage state.
50. mRNA maturation — capping, splicing, polyadenylation, and export states.
51. Translation initiation complex — mRNA, ribosomal subunits, initiator tRNA, and start codon.
52. tRNA charging complex — aminoacyl-tRNA synthetase, tRNA, amino acid, and product.
53. RNA interference complex — siRNA, RISC, target transcript, and cleavage state.
54. DNA replication fork — helicase, polymerases, leading/lagging strands, and Okazaki fragments.
55. Telomere complex — chromosome end, shelterin, and telomerase variants.
56. Single-cell RNA-seq droplet — cell, bead, barcode, lysis, and library states.
57. Spatial transcriptomics spot — tissue section, capture surface, barcodes, and transcripts.

## 4. Cell structures and trafficking

58. Mitochondrion — cristae, respiratory chain, ATP output, and fission/fusion states.
59. Chloroplast — thylakoid stacks, light reactions, and carbon-fixation variants.
60. Golgi apparatus — cis-to-trans trafficking and vesicle budding states.
61. Endosome maturation — early, late, recycling, and lysosomal delivery variants.
62. Lysosome fusion — autophagosome, lysosome, and degradation states.
63. Autophagosome — initiation membrane, sealed vesicle, and lysosome fusion.
64. Peroxisome — import machinery, beta-oxidation, and oxidative stress states.
65. Centrosome — centrioles, pericentriolar material, and spindle-nucleation states.
66. Cilium — basal body, axoneme, motor arms, and signaling receptor variants.
67. Tight junction — epithelial cells, claudins, occludins, and barrier-open state.
68. Gap junction — connexon docking, open channel, and closed channel variants.
69. Focal adhesion — integrin, talin, vinculin, actin, and force-bearing state.
70. Extracellular vesicle — exosome, microvesicle, cargo, and uptake variants.

## 5. Microbiology and infectious disease

71. Gram-positive bacterial envelope — capsule, wall, membrane, and surface proteins.
72. Gram-negative bacterial envelope — outer membrane, periplasm, peptidoglycan, and inner membrane.
73. Bacterial flagellum — basal body, hook, filament, and motility states.
74. Type-III secretion system — needle, translocon, effector delivery, and host membrane.
75. Bacterial conjugation — donor, pilus, plasmid transfer, and recipient states.
76. Biofilm matrix — planktonic cell, attachment, mature biofilm, and dispersal variants.
77. Quorum sensing — signal production, diffusion, receptor binding, and population response.
78. Bacteriophage — adsorption, injection, replication, assembly, and lysis states.
79. Enveloped virus entry — attachment, fusion, uncoating, and endosomal escape.
80. Viral budding — assembly at membrane, scission, and released virion.
81. Viral replication factory — genome, polymerase, capsid, and host membrane compartments.
82. Antigenic drift — virion with old/new surface epitope variants.
83. Bacterial CRISPR defense — spacer acquisition, interference, and target cleavage.
84. Antibiotic target — ribosome, cell wall, DNA gyrase, or folate pathway variants.

## 6. Tissue, organ, and pathology diagrams

85. Blood vessel wall — endothelial barrier, smooth muscle, basement membrane, and leukocyte adhesion.
86. Capillary exchange — oxygen, nutrient, and immune-cell transport states.
87. Alveolus — airspace, surfactant, capillary, and gas exchange variants.
88. Intestinal villus — epithelium, crypt, lumen, immune cells, and microbiome interface.
89. Glomerulus — capillary tuft, podocytes, filtration barrier, and protein leak states.
90. Liver lobule — portal triad, sinusoids, hepatocytes, and bile flow.
91. Skin barrier — epidermal layers, tight junctions, keratin, and wound state.
92. Bone remodeling unit — osteoblast, osteoclast, osteocyte, and resorption/formation states.
93. Cardiac sarcomere — actin, myosin, calcium, relaxed, and contracted states.
94. Neuromuscular junction — motor neuron, vesicles, receptor cluster, and muscle membrane.
95. Chemical synapse — presynaptic release, cleft, postsynaptic receptor, and reuptake states.
96. Blood-brain barrier — endothelial junction, pericyte, astrocyte endfoot, and leaky state.
97. Tumor microenvironment — tumor cell, T cell, macrophage, vessel, and matrix variants.
98. Metastatic extravasation — circulating tumor cell, adhesion, transmigration, and colonization.
99. Fibrosis — activated fibroblast, collagen matrix, wound repair, and scar states.
100. Amyloid plaque — oligomer, fibril, microglia, and neuronal injury variants.

## 7. Assays, instruments, and experimental workflows

101. Antibody sandwich ELISA — capture antibody, analyte, detection antibody, and signal output.
102. Western blot — gel, transfer membrane, bands, antibody probe, and chemiluminescent output.
103. Immunofluorescence staining — target, primary antibody, secondary antibody, and channel variants.
104. Flow cytometry laser path — sheath fluid, cells, laser, scatter, and fluorescence detectors.
105. FACS sorting — droplet formation, charge, deflection plates, and collection tubes.
106. Compensation beads — bead population, fluorophore staining, and spillover matrix states.
107. Gating strategy tree — parent population, sequential gates, and final subset.
108. Microscopy optical path — illumination, objective, sample, emission, and detector.
109. Confocal optical section — pinhole, focal plane, z-stack, and reconstructed volume.
110. Live-cell imaging chamber — dish, cells, perfusion, temperature, and objective.
111. PCR amplification — template, primers, polymerase, cycles, and product.
112. qPCR fluorescence curve — baseline, exponential phase, threshold, and endpoint variants.
113. Lateral-flow test strip — sample pad, conjugate pad, test line, control line, and positive result.
114. Microfluidic droplet generator — channels, junction, droplets, and collection stream.
115. 96-well assay plate — reagent addition, serial dilution, incubation, and readout variants.
116. Organoid culture workflow — stem cells, matrix dome, organoid growth, and harvest states.

## 8. Therapeutics and delivery systems

117. Antibody-drug conjugate — antibody, linker, payload, receptor binding, and internalization.
118. Lipid nanoparticle — ionizable lipid, helper lipid, PEG shell, mRNA cargo, and uptake.
119. Viral vector delivery — capsid, genome, target cell, entry, and expression states.
120. Liposome fusion — encapsulated cargo, membrane docking, fusion pore, and release.
121. Bispecific antibody variants — T-cell engager, NK-cell engager, and receptor agonist.
122. Small-molecule binding pocket — target protein, ligand, bound, and unbound states.
123. PROTAC degradation — target, linker, E3 ligase, ternary complex, and degraded product.
124. Nanobody binding — compact binder, epitope, and multivalent scaffold variants.
125. mRNA vaccine particle — LNP, mRNA, uptake, endosomal escape, and translation.
126. Cell therapy manufacturing — activation, transduction, expansion, wash, and infusion states.

## 9. High-value reusable primitives

127. Membrane bilayer with receptor insertion.
128. Generic antibody with interchangeable arms and Fc.
129. Generic pMHC arm with peptide slot and fluorophore tag.
130. Generic cell membrane with editable receptor anchors.
131. Generic vesicle with cargo slots.
132. Generic DNA/RNA strand with editable sequence markers.
133. Generic protein domain with binding pocket and ligand anchor.
134. Generic microfluidic channel with inlet/outlet ports.
135. Generic microscopy field with selectable cells and signal channels.
136. Generic tissue cross-section frame with layer slots.

## Proposed generation order after the pilot

1. Generate and review the five pilot immune assets.
2. Freeze the visual grammar and component naming conventions.
3. Generate primitives 127–136 so later assemblies can reuse them.
4. Generate the remaining immune-recognition assets.
5. Expand into molecular machines, assays, tissues, microbiology, and therapeutics.
6. Add only reviewed assets to the OpenSketch manifest; keep rejected generations outside the catalog.
