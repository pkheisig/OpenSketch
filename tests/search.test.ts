import { describe, expect, it } from "vitest";
import {
  filterAssetFamilies,
  normalizeSearch,
  type AssetFamily
} from "../packages/editor-core/src";

const antibody: AssetFamily = {
  familyId: "nih-bioart-17",
  title: "Antibody",
  description: "Immunoglobulin G protein",
  category: "Proteins & complexes",
  keywords: ["antibody", "immunoglobulin", "IgG", "immune"],
  author: "NIAID",
  credit: "Courtesy of NIAID",
  license: "Public Domain",
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
      title: "T Cell",
      keywords: ["T Cell", "cell", "lymphocyte"]
    };
    const cd80: AssetFamily = {
      ...antibody,
      familyId: "nih-bioart-68",
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
      category: "Nucleic acids"
    };
    const plate = {
      ...antibody,
      familyId: "plate",
      title: "96 Well Plate",
      category: "Labware & consumables"
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
      animal,
      plate
    ]);
  });

  it("keeps newly classified asset families in their intended browse positions", () => {
    const families = [
      { ...antibody, familyId: "other", title: "Zebra", category: "Other" },
      { ...antibody, familyId: "techniques", title: "Stain", category: "Experimental assemblies" },
      { ...antibody, familyId: "components", title: "Nucleus", category: "Cell structures" },
      { ...antibody, familyId: "cancer", title: "Tumor", category: "Tissues & models" },
      { ...antibody, familyId: "cells", title: "Cell", category: "Cells" }
    ];

    expect(filterAssetFamilies(families, "", "All").map((family) => family.familyId)).toEqual([
      "cells",
      "components",
      "cancer",
      "techniques",
      "other"
    ]);
  });

  it("sorts equal-category browse results by title and keeps search ties stable", () => {
    const zebra = { ...antibody, familyId: "zebra", title: "Zebra protein" };
    const alpha = { ...antibody, familyId: "alpha", title: "Alpha protein" };
    expect(filterAssetFamilies([zebra, alpha], "", "All")).toEqual([alpha, zebra]);
    expect(filterAssetFamilies([zebra, alpha], "protein", "All")).toEqual([zebra, alpha]);
    expect(
      filterAssetFamilies(
        [
          { ...zebra, familyId: "first", title: "Same", category: "Proteins & complexes" },
          { ...alpha, familyId: "second", title: "Same", category: "Proteins & complexes" }
        ],
        "",
        "All"
      ).map((family) => family.familyId)
    ).toEqual(["first", "second"]);
  });

  it("matches plural words ending in ies", () => {
    const bodies = { ...antibody, familyId: "bodies", title: "Cell bodies" };
    expect(filterAssetFamilies([bodies], "bodies")).toEqual([bodies]);
  });

  it("ranks title prefixes, synonym matches, and unknown browse categories", () => {
    const kinase = { ...antibody, familyId: "kinase", title: "Protein kinase" };
    const reticulum = {
      ...antibody,
      familyId: "reticulum",
      title: "Cell structure",
      description: "Endoplasmic reticulum network",
      keywords: ["endoplasmic reticulum"]
    };
    const unlisted = { ...antibody, familyId: "unlisted", title: "Unlisted", category: "Unlisted" };
    expect(filterAssetFamilies([kinase], "protein")).toEqual([kinase]);
    expect(filterAssetFamilies([reticulum], "er")).toEqual([reticulum]);
    expect(filterAssetFamilies([unlisted, antibody], "", "All")).toEqual([antibody, unlisted]);
  });
});
