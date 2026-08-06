import { describe, expect, it } from "vitest";
import {
  filterAssetFamilies,
  normalizeSearch,
  type AssetFamily
} from "../packages/editor-core/src";

const antibody: AssetFamily = {
  familyId: "nih-bioart-17",
  bioartEntryId: 17,
  title: "Antibody",
  description: "Immunoglobulin G protein",
  category: "Proteins",
  keywords: ["antibody", "immunoglobulin", "IgG", "immune"],
  author: "NIAID",
  credit: "Courtesy of NIAID",
  license: "Public Domain",
  nihSourcePage: "https://bioart.niaid.nih.gov/bioart/17",
  commonsPage: "https://commons.wikimedia.org/",
  defaultVariantId: "nih-bioart-17-a",
  variants: [
    {
      id: "nih-bioart-17-a",
      assetPath: "/assets/a.svg",
      thumbnailPath: "/assets/a.webp"
    }
  ]
};

describe("asset search", () => {
  it("normalizes punctuation and simple plurals", () => {
    expect(normalizeSearch(" T-cells, ")).toBe("t cells");
    expect(normalizeSearch("virus")).toBe("virus");
  });

  it("searches abbreviations and family metadata", () => {
    expect(filterAssetFamilies([antibody], "IgG")).toEqual([antibody]);
    expect(filterAssetFamilies([antibody], "immunoglobulins")).toEqual([antibody]);
    expect(filterAssetFamilies([antibody], "antibody", "Viruses")).toEqual([]);
  });

  it("ranks exact names ahead of expansions and avoids partial biological-code matches", () => {
    const tCell: AssetFamily = {
      ...antibody,
      familyId: "nih-bioart-509",
      bioartEntryId: 509,
      title: "T Cell",
      keywords: ["T Cell", "cell", "lymphocyte"]
    };
    const cd80: AssetFamily = {
      ...antibody,
      familyId: "nih-bioart-68",
      bioartEntryId: 68,
      title: "CD80",
      keywords: ["CD80", "protein"]
    };
    expect(filterAssetFamilies([cd80, tCell], "T cell")).toEqual([tCell]);
  });

  it("prioritizes biochemical and laboratory assets in the unfiltered All tab", () => {
    const cell = {
      ...antibody,
      familyId: "cell",
      title: "Dendritic Cell",
      category: "Cells"
    };
    const dna = {
      ...antibody,
      familyId: "dna",
      title: "DNA Helix",
      description: "Genomic DNA molecule",
      category: "Nucleic acids & genetics"
    };
    const plate = {
      ...antibody,
      familyId: "plate",
      title: "96 Well Plate",
      category: "Equipment"
    };
    const animal = {
      ...antibody,
      familyId: "animal",
      title: "Wood Mouse",
      category: "Animals"
    };

    expect(filterAssetFamilies([animal, plate, dna, antibody, cell], "", "All")).toEqual([
      cell,
      antibody,
      dna,
      plate,
      animal
    ]);
  });

  it("keeps newly classified asset families in their intended browse positions", () => {
    const families = [
      { ...antibody, familyId: "other", title: "Zebra", category: "Other" },
      { ...antibody, familyId: "techniques", title: "Stain", category: "Techniques & assays" },
      { ...antibody, familyId: "components", title: "Nucleus", category: "Cell components" },
      { ...antibody, familyId: "cancer", title: "Tumor", category: "Cancer & pathology" },
      { ...antibody, familyId: "cells", title: "Cell", category: "Cells" }
    ];

    expect(filterAssetFamilies(families, "", "All").map((family) => family.familyId)).toEqual([
      "cells",
      "cancer",
      "components",
      "techniques",
      "other"
    ]);
  });
});
