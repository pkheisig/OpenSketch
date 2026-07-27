import { describe, expect, it } from "vitest";
import manifest from "../apps/web/src/generated/nih-bioart-manifest.json";
import taxonomy from "../data/taxonomy.json";
import { taxonomyIndex } from "../scripts/assets/taxonomy";

const categoryByEntry = taxonomyIndex(taxonomy);
const familyByEntry = new Map(
  manifest.families.map((family) => [family.bioartEntryId, family] as const)
);

describe("reviewed NIH BioArt taxonomy", () => {
  it("assigns every family exactly once and has no stale assignments", () => {
    expect(categoryByEntry.size).toBe(manifest.families.length);
    expect([...categoryByEntry.keys()].sort((a, b) => a - b)).toEqual(
      manifest.families.map((family) => family.bioartEntryId).sort((a, b) => a - b)
    );
    for (const family of manifest.families) {
      expect(categoryByEntry.get(family.bioartEntryId)).toBe(family.category);
    }
  });

  it("uses a molecular-to-macroscopic browse order", () => {
    expect(taxonomy.categories).toEqual([
      "Cells",
      "Proteins",
      "Molecules",
      "Nucleic acids & genetics",
      "Cellular processes",
      "Equipment",
      "Bacteria",
      "Viruses",
      "Parasites",
      "Anatomy",
      "People",
      "Animals",
      "Arthropods",
      "Plants",
      "Food",
      "Symbols & diagrams",
      "Other"
    ]);
  });

  it.each([
    [10, "Activated Neutrophil", "Cells"],
    [64, "Bunyavirus", "Viruses"],
    [68, "CD80", "Proteins"],
    [417, "Prairie Dog Black Tailed", "Animals"],
    [524, "Tree Dwelling Crab Eating Macaque", "Animals"],
    [600, "Horse", "Animals"],
    [580, "Western Blot Transfer Device", "Equipment"],
    [634, "Trypanosoma cruzi", "Parasites"]
  ])("classifies NIH BioArt %i %s as %s", (entryId, title, category) => {
    expect(familyByEntry.get(entryId)).toMatchObject({ title, category });
  });
});
