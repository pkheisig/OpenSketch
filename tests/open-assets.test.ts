import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { AssetManifest } from "../packages/editor-core/src/types";
import {
  categoryForBioIconsAsset,
  categoryForOrganismAsset,
  categoryForSciDrawAsset
} from "../scripts/assets/open-taxonomy";

const root = path.resolve(import.meta.dirname, "..");

async function loadManifest(): Promise<AssetManifest> {
  return JSON.parse(
    await readFile(path.join(root, "apps/web/src/generated/open-assets-manifest.json"), "utf8")
  ) as AssetManifest;
}

describe("open scientific-art collection", () => {
  it("bundles every usable SciDraw SVG, Arcadia organism, and attributable BioIcons SVG", async () => {
    const manifest = await loadManifest();
    const sciDraw = manifest.families.filter((family) => family.sourceName === "SciDraw");
    const organisms = manifest.families.filter((family) =>
      family.sourceName?.startsWith("Arcadia Science")
    );
    const bioIcons = manifest.families.filter((family) =>
      family.sourceName?.startsWith("BioIcons")
    );

    expect(sciDraw).toHaveLength(608);
    expect(organisms).toHaveLength(71);
    expect(organisms.flatMap((family) => family.variants)).toHaveLength(142);
    expect(bioIcons).toHaveLength(2_827);
  });

  it("retains licenses, attribution, sources, and only local asset paths", async () => {
    const manifest = await loadManifest();
    const variantIds = new Set<string>();

    for (const family of manifest.families) {
      expect([
        "CC0-1.0",
        "CC-BY-3.0",
        "CC-BY-4.0",
        "CC-BY-SA-3.0",
        "CC-BY-SA-4.0",
        "MIT",
        "BSD-3-Clause"
      ]).toContain(family.license);
      expect(family.author).not.toBe("");
      expect(family.credit).not.toBe("");
      expect(family.sourcePage).toMatch(/^https:\/\//);
      expect(family.licenseUrl).toMatch(/^https:\/\//);
      expect(family.variants.some((variant) => variant.id === family.defaultVariantId)).toBe(true);

      for (const variant of family.variants) {
        expect(variant.assetPath).not.toMatch(/^https?:/);
        expect(variant.thumbnailPath).not.toMatch(/^https?:/);
        expect(variantIds.has(variant.id)).toBe(false);
        variantIds.add(variant.id);
      }
    }
  });

  it.each([
    ["Chicken retina", "cell", "Tissues & histology"],
    ["Chameleon retina", "cell", "Tissues & histology"],
    ["Adenovirus", "cell", "Viruses"],
    ["Escherichia coli", "cell", "Bacteria"],
    ["Candida albicans", "cell", "Fungi & protists"],
    ["Kinesin", "cell", "Proteins"],
    ["Pipette", "cell", "Equipment"],
    ["patch clamp", "cell", "Techniques & assays"],
    ["Chlamydomonas reinhardtii", "cell", "Plants"],
    ["Caffeine", "other", "Molecules"]
  ])("classifies %s independently of SciDraw's coarse %s bucket", (name, source, category) => {
    expect(categoryForSciDrawAsset({ name, category_slug: source })).toBe(category);
  });

  it.each([
    ["cancerous cell 1", "Oncology", "Cancer & pathology"],
    ["tumor", "Oncology", "Cancer & pathology"],
    ["Chicken retina", "Tissues", "Tissues & histology"],
    ["T Cell", "Blood_Immunology", "Immunology & blood"],
    ["Mitochondrion", "Intracellular_components", "Cell components"],
    ["Incubator", "Lab_apparatus", "Equipment"],
    ["Adenovirus", "Viruses", "Viruses"]
  ])("maps BioIcons %s from %s to %s", (name, sourceCategory, category) => {
    expect(categoryForBioIconsAsset({ name, sourceCategory })).toBe(category);
  });

  it("keeps the generated catalog aligned with the deterministic taxonomy", async () => {
    const manifest = await loadManifest();
    for (const family of manifest.families) {
      const expected = family.sourceName?.startsWith("Arcadia Science")
        ? categoryForOrganismAsset(family.title)
        : family.sourceName?.startsWith("BioIcons")
          ? categoryForBioIconsAsset({
              name: family.title,
              sourceCategory: family.keywords[1] ?? ""
            })
          : categoryForSciDrawAsset({
              name: family.title,
              category_slug: family.keywords[1] ?? ""
            });
      expect(family.category, family.title).toBe(expected);
    }
  });

  it("does not misfile tissue, pathogens, fungi, proteins, or equipment as cells", async () => {
    const manifest = await loadManifest();
    const cells = manifest.families
      .filter((family) => family.category === "Cells")
      .map((family) => family.title);
    expect(cells).not.toContain("Chicken retina");
    expect(cells).not.toContain("Adenovirus");
    expect(cells).not.toContain("Escherichia coli");
    expect(cells).not.toContain("Candida albicans");
    expect(cells).not.toContain("Kinesin");
    expect(cells).not.toContain("Pipette");
  });

  it("does not bundle the invalid upstream caffeine SVG", async () => {
    const manifest = await loadManifest();
    expect(manifest.families.map((family) => family.familyId)).not.toContain(
      "scidraw-caffeine-bad266e2"
    );
  });

  it("exposes BioIcons oncology artwork in a dedicated cancer category", async () => {
    const manifest = await loadManifest();
    const cancer = manifest.families.filter(
      (family) =>
        family.sourceName?.startsWith("BioIcons") && family.category === "Cancer & pathology"
    );
    expect(cancer.length).toBeGreaterThanOrEqual(35);
    expect(cancer.map((family) => family.title)).toEqual(
      expect.arrayContaining(["Cancerous Cell 1", "Carcinoma", "Tumor"])
    );
  });
});
