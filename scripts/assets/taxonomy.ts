export interface AssetTaxonomy {
  version: 1;
  categories: string[];
  assignments: Record<string, number[]>;
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
