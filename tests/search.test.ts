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
});
