export interface SciDrawTaxonomyInput {
  name: string;
  category_slug: string;
}

export interface BioIconsTaxonomyInput {
  name: string;
  sourceCategory: string;
}

const FUNGI_AND_PROTISTS =
  /\b(?:abeoforma|agaricus|amoebiformis|aspergillus|bodo saltans|candida|diatom|dictyostelium|diplonema|euglena|isochrysis|monosiga|naegleria|neurospora|paramecium|penicillium|perkinsus|phaeodactylum|saccharomyces|salpingoeca|schizosaccharomyces|sphaeroforma|tetrahymena|ustilago|yarrowia|yeast)\b/;

const PLANTS_AND_ALGAE =
  /\b(?:arabidopsis|bathycoccus|chlamydomonas|chlorella|flower|leaf|micromonas|nannochloropsis|ostreococcus|plant|porphyra|root|symbiodinium|tetraselmis|volvox)\b/;

export function categoryForSciDrawAsset(drawing: SciDrawTaxonomyInput): string {
  const title = drawing.name.toLowerCase();
  const sourceCategory = drawing.category_slug.toLowerCase();

  // Name-level biological identity must win over SciDraw's deliberately broad
  // source buckets. Its "cell" collection also contains viruses, bacteria,
  // retinal tissue, fungi, protists, proteins, and laboratory techniques.
  if (
    /\b(?:virus|virion|phage|adenovirus|coronavirus|hiv|influenza|sars(?:-cov-2)?)\b/.test(title)
  ) {
    return "Viruses";
  }
  if (/\b(?:bacteri(?:a|um)|bacillus|coccus|escherichia coli|e\. ?coli)\b/.test(title)) {
    return "Bacteria";
  }
  if (
    /\b(?:plasmodium|schistosoma|giardia|entamoeba|trypanosoma|leishmania|toxoplasma|babesia)\b/.test(
      title
    )
  ) {
    return "Parasites";
  }
  if (FUNGI_AND_PROTISTS.test(title)) return "Fungi & protists";
  if (PLANTS_AND_ALGAE.test(title)) return "Plants";

  if (
    /\b(?:retina|retinal|epithelial layer|muscle fibers?|histolog|tissue|coronal section|sagittal section|spinal cord section|brain slices?|em slice|organoid)\b/.test(
      title
    )
  ) {
    return "Tissues & histology";
  }

  if (
    /\b(?:protein|enzyme|antibody|receptor|transporter|channels?|kinase|kinesin|tubulin|actin|microtubule|myoglobin)\b/.test(
      title
    )
  ) {
    return "Proteins";
  }
  if (/\b(?:dna|rna|nucleic|chromatin|chromosome|helix|nucleotide|gene|genome)\b/.test(title)) {
    return "Nucleic acids & genetics";
  }
  if (
    /\b(?:molecule|lipid|bilayer|membrane|micelle|liposome|phospholipid|droplet|adenosine|alpha-linolenic acid|atp|c(?:a|g)mp|caffeine|cellulose|cholesterol|fructose|ganglioside|glucose|gtp|haem|lactose|maltose|palmitic acid|pill capsule medicine|sucrose|triacylglyceride|urea|water)\b/.test(
      title
    )
  ) {
    return "Molecules";
  }

  if (
    /\b(?:calcium imaging|patch clamp|perfusion|elisa|qpcr|recordings?|imaging|optogenetics|conditioning|assay|electromyography|foot shock|in-vivo techniques|atumsem|fibsem|gcibsem|sbem|sstem)\b/.test(
      title
    )
  ) {
    return "Techniques & assays";
  }
  if (
    /\b(?:balance|beakers?|blue led|bone cutters?|cage|centrifuge|cpp box|dish|electrode|eppendorf|epm|falcon|ferrule|flask|inhaler|instrument|laboratory|lts standard tips|microscope|microtube|mobile homecage|objective|pipettes?|pipettors?|probe|scanner|scissors|syringe|thermometer|tube|utah array|vial|bottle|rack|illumina|dry baths?|weight)\b/.test(
      title
    ) ||
    title.startsWith("fed3")
  ) {
    return "Equipment";
  }

  if (
    /\b(?:cells?|erythrocyte|neuron|astrocyte|microglia|macrophage|lymphocyte|platelet|organelle|mitochondri|nucleus|adipocyte|basophil|enterocyte|eosinophil|glia|hepatocyte|mast cell|myocyte|neutrophil|oligodendrocyte|ovum|spermatozoa)\b/.test(
      title
    )
  ) {
    return "Cells";
  }
  if (
    /\b(?:synapse|action potential|calcium store|presynaptic|cell cycle|pathway|process|signaling|division|mitosis|transport)\b/.test(
      title
    )
  ) {
    return "Cellular processes";
  }

  if (/\bfiddler crab\b/.test(title)) return "Animals";
  if (
    /\b(?:brain|heart|lung|liver|kidney|bone|muscle|organ|anatom|skin|eye|adrenal gland|embryo|gall bladder|intestine|molar|mouth|pancreas|skull|spine|spleen|stomach|nervous system|optic nerve|cns|hippocampus|cortex|cerebell)\b/.test(
      title
    )
  ) {
    return "Anatomy";
  }
  if (/\b(?:aedes|mosquito|fly|insect|arthropod|ant)\b/.test(title)) {
    return "Arthropods";
  }
  if (/\b(?:apple|coffee|food pellets?)\b/.test(title)) return "Food";
  if (/\b(?:arrows?|symbol|diagram|network|rnn|shape|scidraw (?:icon|logo))\b/.test(title)) {
    return "Symbols & diagrams";
  }

  if (title === "christophe leterrier") return "People";
  if (sourceCategory === "human") {
    if (/\b(?:human|silhouette|head|hand|finger|albert einstein|sleep)\b/.test(title)) {
      return "People";
    }
    return "Anatomy";
  }
  if (sourceCategory === "drosophila") return "Arthropods";
  if (["mouse", "rat", "fish", "bird"].includes(sourceCategory)) return "Animals";

  if (
    /\b(?:animal|alpaca|anolis|aplysia|bat|bird|caenorhabditis|callithrix|carlito syrichta|cat|chameleon|ciona|clytia|crab|exaiptasia|fish|frog|ground squirrel|hofstenia|hydra|hypsibius|lizard|macaca|macaque|microcebus|mnemiopsis|monkey|nematostella|pan troglodytes|pristionchus|rabbit|salamander|schmidtea|snake|sus scrofa|xenopus)\b/.test(
      title
    )
  ) {
    return "Animals";
  }

  // Preserve the upstream bucket only after the more precise title rules.
  if (sourceCategory === "cell") return "Cells";
  return "Other";
}

export function categoryForOrganismAsset(title: string): string {
  const text = title.toLowerCase();
  if (/\b(?:virus|sars-cov-2|influenza|immunodeficiency)\b/.test(text)) return "Viruses";
  if (/\bescherichia coli\b/.test(text)) return "Bacteria";
  if (
    /\b(?:plasmodium|schistosoma|giardia|entamoeba|perkinsus|bodo saltans|naegleria)\b/.test(text)
  ) {
    return "Parasites";
  }
  if (/\b(?:aedes|drosophila)\b/.test(text)) return "Arthropods";
  if (PLANTS_AND_ALGAE.test(text)) return "Plants";
  if (FUNGI_AND_PROTISTS.test(text)) return "Fungi & protists";
  return "Animals";
}

export function categoryForBioIconsAsset(asset: BioIconsTaxonomyInput): string {
  const title = asset.name.toLowerCase();
  const sourceCategory = asset.sourceCategory
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  // BioIcons' upstream categories are useful provenance, but some are very
  // broad. Identity-level title rules take priority so retinal tissue, tumor
  // cells, pathogens, and laboratory items do not inherit a misleading bucket.
  if (
    sourceCategory === "oncology" ||
    /\b(?:adenoma|angiogenesis|cancer|cancerous|carcinoma|leukemia|lymphoma|melanoma|metastasis|neoplasm|oncolog|sarcoma|tumou?r)\b/.test(
      title
    )
  ) {
    return "Cancer & pathology";
  }
  if (
    /\b(?:virus|virion|phage|adenovirus|coronavirus|hiv|influenza|papillomavirus|sars)\b/.test(
      title
    ) ||
    sourceCategory === "viruses"
  ) {
    return "Viruses";
  }
  if (
    /\b(?:plasmodium|schistosoma|giardia|entamoeba|trypanosoma|leishmania|toxoplasma|babesia|parasite)\b/.test(
      title
    ) ||
    sourceCategory === "parasites"
  ) {
    return "Parasites";
  }
  if (FUNGI_AND_PROTISTS.test(title)) return "Fungi & protists";
  if (
    /\b(?:bacteri(?:a|um)|bacillus|biofilm|coccus|escherichia|microbiome|streptococc)\b/.test(
      title
    ) ||
    sourceCategory === "microbiology"
  ) {
    return "Bacteria";
  }
  if (PLANTS_AND_ALGAE.test(title) || sourceCategory === "plants_algae") return "Plants";

  if (
    sourceCategory === "blood_immunology" ||
    /\b(?:antigen presenting|b cell|blood|complement|dendritic|erythrocyte|granulocyte|immune|immun|leukocyte|lymphocyte|macrophage|monocyte|neutrophil|platelet|t cell)\b/.test(
      title
    )
  ) {
    return "Immunology & blood";
  }
  if (
    sourceCategory === "cell_types" ||
    sourceCategory === "cell_lines" ||
    /\b(?:adipocyte|astrocyte|cell line|epithelial cell|fibroblast|hepatocyte|mast cell|myocyte|neuron|oocyte|ovum|sperm(?:atozoa)?)\b/.test(
      title
    )
  ) {
    return "Cells";
  }
  if (
    sourceCategory === "intracellular_components" ||
    sourceCategory === "cell_membrane" ||
    /\b(?:centriole|cytoskeleton|endoplasmic|endosome|golgi|lysosome|membrane|mitochondri|nucleolus|nucleus|organelle|peroxisome|ribosome|vesicle)\b/.test(
      title
    )
  ) {
    return "Cell components";
  }
  if (
    sourceCategory === "receptors_channels" ||
    /\b(?:antibody|channel|enzyme|kinase|protein|receptor|transporter)\b/.test(title)
  ) {
    return "Proteins";
  }
  if (
    ["nucleic_acids", "genetics", "genomics", "epigenetics", "molecular_biology"].includes(
      sourceCategory
    ) ||
    /\b(?:chromatin|chromosome|dna|gene|genom|nucleic|nucleotide|rna)\b/.test(title)
  ) {
    return "Nucleic acids & genetics";
  }
  if (
    [
      "chemistry",
      "amino_acids",
      "peptides",
      "molecular_modelling",
      "molecular_modeling",
      "nanotechnology"
    ].includes(sourceCategory) ||
    /\b(?:amino acid|chemical|lipid|metabolite|molecule|peptide)\b/.test(title)
  ) {
    return "Molecules";
  }
  if (
    sourceCategory === "tissues" ||
    sourceCategory === "extracellular_matrix" ||
    /\b(?:epithelium|histolog|retina|retinal|section|tissue)\b/.test(title)
  ) {
    return "Tissues & histology";
  }
  if (
    ["cell_culture", "procedures", "imaging"].includes(sourceCategory) ||
    /\b(?:assay|blot|centrifug|chromatograph|culture|electrophoresis|facs|flow cytometr|imaging|microscop|pcr|sequenc)\b/.test(
      title
    )
  ) {
    return "Techniques & assays";
  }
  if (
    ["lab_apparatus", "computer_hardware"].includes(sourceCategory) ||
    /\b(?:beaker|bottle|centrifuge|computer|dish|flask|incubator|instrument|microscope|pipette|plate|rack|scanner|syringe|tube|vial)\b/.test(
      title
    )
  ) {
    return "Equipment";
  }
  if (
    sourceCategory === "human_physiology" ||
    sourceCategory === "neuroscience" ||
    /\b(?:anatom|brain|heart|kidney|liver|lung|organ|physiology|skeleton)\b/.test(title)
  ) {
    return "Anatomy";
  }
  if (sourceCategory === "animals") {
    return /\b(?:arthropod|beetle|butterfly|crab|fly|insect|mosquito|spider|tick)\b/.test(title)
      ? "Arthropods"
      : "Animals";
  }
  if (sourceCategory === "people_other") return "People";
  if (
    [
      "scientific_graphs",
      "machine_learning",
      "chemo_and_bioinformatics",
      "safety_symbols"
    ].includes(sourceCategory)
  ) {
    return "Symbols & diagrams";
  }
  if (/\b(?:apoptosis|cell cycle|division|mitosis|pathway|signaling|transport)\b/.test(title)) {
    return "Cellular processes";
  }
  return "Other";
}
