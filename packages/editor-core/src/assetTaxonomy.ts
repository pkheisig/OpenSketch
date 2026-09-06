/** Primary categories describe the depicted object; topics support cross-category filtering. */
export const ASSET_CATEGORY_DEFINITIONS = {
  Cells:
    "Individual eukaryotic cells and recognizable cell states; multicellular tissue assemblies belong in Tissues & models.",
  "Cell structures":
    "Organelles, cytoskeleton, intracellular vesicles and isolated subcellular structures; membrane junctions have a separate category.",
  "Membranes & junctions":
    "Bilayers, membrane domains, cell contacts and protrusions; isolated receptor proteins belong in Proteins & complexes.",
  "Proteins & complexes":
    "Proteins, antibodies, receptors, enzymes and protein-dominated molecular assemblies.",
  "Nucleic acids": "DNA, RNA, chromosomes and nucleic-acid-dominated molecular structures.",
  "Molecules & particles":
    "Small molecules, lipids, polymers, nanoparticles and free assay beads; proteins and nucleic acids have separate categories.",
  "Tissues & models":
    "Tissue microanatomy, extracellular matrix, organoids, spheroids and tissue engineering constructs.",
  "Organs & anatomy":
    "Whole organs and macroscopic anatomical structures; cellular and histological sections belong in Tissues & models.",
  Viruses: "Virions, viral components and virus-centered entry or budding assemblies.",
  "Bacteria & archaea": "Prokaryotic cells, communities and prokaryotic structures.",
  "Fungi & protists":
    "Fungi and non-helminth protists; parasite-specific specimens are filed in Parasites.",
  Parasites: "Protozoan or helminth parasites, their stages and infection-specific specimens.",
  Plants: "Whole plants, plant organs and plant-specific cells or structures.",
  "Development & embryos":
    "Fertilization and embryonic stages, including embryo-specific sections.",
  Animals: "Whole model animals and animal-specific life stages other than embryos.",
  "Labware & consumables":
    "Containers, pipettes, tips, plates, slides, filters and passive disposable laboratory tools.",
  Instruments:
    "Active laboratory measurement, processing and automation instruments; microscopy and culture equipment have separate categories.",
  "Microscopy & imaging":
    "Microscopes, imaging systems and their dedicated optical or imaging accessories.",
  "Culture & microfluidics":
    "Culture chambers, bioreactors, chips and microfluidic hardware; living models belong in Tissues & models.",
  "Lab infrastructure & safety":
    "Storage, cold chain, containment, sterilization, protective clothing and safety infrastructure.",
  "Animal & clinical equipment":
    "Animal handling, surgery, administration and clinical sample-collection equipment.",
  "Experimental assemblies":
    "Multi-part assay complexes, experimental preparations and readout schematics that do not represent one standalone object."
} as const;
export const ASSET_CATEGORY_ORDER = Object.keys(ASSET_CATEGORY_DEFINITIONS);
