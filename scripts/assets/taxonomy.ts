import type { NihBioartRecord } from "./nih-source";

export interface AssetTaxonomy {
  version: 1;
  categories: string[];
  assignments: Record<string, number[]>;
}

const NIH_CATEGORY_MAP = new Map<string, string>([
  ["cells and organelles", "Cells"],
  ["cell scenes", "Cells"],
  ["proteins", "Proteins"],
  ["molecules", "Molecules"],
  ["equipment", "Equipment"],
  ["techniques", "Cellular processes"],
  ["cellular processes", "Cellular processes"],
  ["bacteria", "Bacteria"],
  ["viruses", "Viruses"],
  ["parasites", "Parasites"],
  ["anatomy", "Anatomy"],
  ["people", "People"],
  ["animals", "Animals"],
  ["arthropods", "Arthropods"],
  ["plants", "Plants"],
  ["food", "Food"],
  ["shapes", "Symbols & diagrams"],
  ["data visualization", "Symbols & diagrams"]
]);

export function categoryForNihRecord(record: NihBioartRecord): string {
  const title = record.title.toLowerCase();

  // NIH files that depict genetic material are more useful in the dedicated
  // genetics collection than in NIH's broader "Molecules" category.
  if (
    /\b(?:dna|rna|chromatin|chromosome|plasmid|allele|pedigree)\b/.test(title) ||
    /\bgene mutation\b/.test(title)
  ) {
    return "Nucleic acids & genetics";
  }

  // NIH groups bacteria under "Other Organisms", so retain an explicit
  // organism-name fallback for bacterial records.
  if (
    /\b(?:bacteri(?:a|um)|borrelia|spirochete|tuberculosis|microbiota)\b/.test(title)
  ) {
    return "Bacteria";
  }

  // Respect NIH's ordered, first-party categories before looking at descriptive
  // text. Descriptions commonly mention pathogens that a cell interacts with;
  // those words must never turn the cell itself into a virus illustration.
  for (const sourceCategory of record.category.split(",")) {
    const mapped = NIH_CATEGORY_MAP.get(sourceCategory.trim().toLowerCase());
    if (mapped) return mapped;
  }

  if (
    /\b(?:virus|virion|bunyavirus|flavivirus|hantavirus|arenavirus|adenovirus|lentivirus|filovirus|sars-cov-2|vsv|hiv)\b/.test(
      title
    )
  ) {
    return "Viruses";
  }
  if (/\b(?:malaria|plasmodium|leishmania|toxoplasma|trypanosoma|babesia)\b/.test(title)) {
    return "Parasites";
  }
  if (/\b(?:tick|mosquito|sandfly|flea|bee|lobster)\b/.test(title)) {
    return "Arthropods";
  }
  if (/\b(?:arrow|symbol|diagram|graph|poster|thought bubble|lightning bolt)\b/.test(title)) {
    return "Symbols & diagrams";
  }
  return "Other";
}

export function taxonomyIndex(taxonomy: AssetTaxonomy): Map<number, string> {
  const categorySet = new Set(taxonomy.categories);
  const assignmentCategories = Object.keys(taxonomy.assignments);
  const undeclared = assignmentCategories.filter((category) => !categorySet.has(category));
  const unassignedCategories = taxonomy.categories.filter(
    (category) => !Object.hasOwn(taxonomy.assignments, category)
  );
  if (undeclared.length || unassignedCategories.length) {
    throw new Error(
      [
        undeclared.length ? `undeclared categories: ${undeclared.join(", ")}` : "",
        unassignedCategories.length
          ? `categories without assignments: ${unassignedCategories.join(", ")}`
          : ""
      ]
        .filter(Boolean)
        .join("; ")
    );
  }

  const index = new Map<number, string>();
  for (const category of taxonomy.categories) {
    for (const entryId of taxonomy.assignments[category] ?? []) {
      const previous = index.get(entryId);
      if (previous) {
        throw new Error(`NIH BioArt ${entryId} is assigned to both ${previous} and ${category}.`);
      }
      index.set(entryId, category);
    }
  }
  return index;
}

export function categoryForEntry(
  taxonomy: AssetTaxonomy,
  entryId: number,
  index = taxonomyIndex(taxonomy)
): string {
  const category = index.get(entryId);
  if (!category) {
    throw new Error(
      `NIH BioArt ${entryId} has no reviewed category. Add it to data/taxonomy.json before importing.`
    );
  }
  return category;
}
