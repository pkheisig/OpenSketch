import { describe, expect, it } from "vitest";
import manifest from "../apps/web/src/generated/nih-bioart-manifest.json";
import taxonomy from "../data/taxonomy.json";
import type { NihBioartRecord } from "../scripts/assets/nih-source";
import { categoryForNihRecord, taxonomyIndex } from "../scripts/assets/taxonomy";

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
    [634, "Trypanosoma cruzi", "Parasites"],
    [14, "Alveoli", "Cells"],
    [180, "Granulocyte Macrophage Progenitor Cell", "Cells"],
    [312, "Macrophage", "Cells"],
    [313, "Macrophage", "Cells"],
    [316, "Malaria Infected Red Blood Cell", "Parasites"],
    [586, "Placenta Cellular Cross Section", "Anatomy"],
    [677, "Skin Cross-Section", "Anatomy"],
    [688, "Blood-Brain Barrier", "Anatomy"],
    [123, "DNA", "Nucleic acids & genetics"],
    [405, "Pickup Truck", "Equipment"]
  ])("classifies NIH BioArt %i %s as %s", (entryId, title, category) => {
    expect(familyByEntry.get(entryId)).toMatchObject({ title, category });
  });

  it("uses NIH categories before pathogen words in descriptive metadata", () => {
    const record = {
      entryId: 999,
      title: "Macrophage",
      description: "A macrophage responding to a virus infection.",
      category: "Cells and Organelles",
      keywords: ["virus", "innate immunity"],
      author: "NIAID",
      license: "Public Domain",
      sourcePage: "https://bioart.niaid.nih.gov/bioart/999",
      svgFileIds: [1]
    } satisfies NihBioartRecord;

    expect(categoryForNihRecord(record)).toBe("Cells");
    expect(categoryForNihRecord({ ...record, title: "Hantavirus", category: "Viruses" })).toBe(
      "Viruses"
    );
    expect(categoryForNihRecord({ ...record, title: "DNA", category: "Molecules" })).toBe(
      "Nucleic acids & genetics"
    );
  });
});
