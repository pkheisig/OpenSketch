import { describe, expect, it } from "vitest";
import {
  assertUniqueAssetCatalog,
  enrichAssetKeywords,
  assetStyleOf,
  findAssetVariantForStyle,
  variantsForStyle
} from "../packages/editor-core/src/assetCatalog";
import { filterAssetFamilies } from "../packages/editor-core/src/search";
import { assetManifest } from "../apps/web/src/assets/manifest";
import { canonicalArtworkGroups } from "../scripts/assets/canonical-artwork.mjs";

describe("canonical asset catalog", () => {
  it("keeps every visible family, variant and artwork unique", () => {
    expect(() => assertUniqueAssetCatalog(assetManifest.families)).not.toThrow();
  });
  it("rejects colliding IDs and identical artwork under a new ID", () => {
    const original = structuredClone(
      assetManifest.families.find((f) => f.variants[0].localSha256)!
    );
    expect(() => assertUniqueAssetCatalog([original, original])).toThrow(/asset ID/);
    const copy = structuredClone(original);
    copy.familyId = "different-name";
    copy.defaultVariantId = copy.variants[0].id = "different-variant";
    expect(() => assertUniqueAssetCatalog([original, copy])).toThrow(/Duplicate artwork/);
  });
  it("finds a canonical asset by added search terms without another catalog row", () => {
    const found = filterAssetFamilies(assetManifest.families, "RBC");
    expect(found.filter((f) => f.title === "erythrocyte")).toHaveLength(1);
    expect(new Set(found.map((f) => f.familyId)).size).toBe(found.length);
  });
  it("does not turn intracellular receptors or anatomy into membrane proteins or labware", () => {
    expect(
      enrichAssetKeywords({ title: "nuclear receptor", category: "Proteins", keywords: [] })
    ).not.toContain("membrane protein");
    expect(
      enrichAssetKeywords({ title: "fallopian tube", category: "Anatomy", keywords: [] })
    ).not.toContain("labware");
  });
  it("deduplicates identical files at different paths while retaining the established ID", () => {
    const sha = "a".repeat(64);
    const entry = {
      status: "complete",
      name: "Cell",
      category: "Cells",
      svg_sha256: sha,
      png: "cell.png",
      png_sha256: "b".repeat(64)
    };
    const groups = canonicalArtworkGroups(
      {
        newName: { ...entry, svg: "svg/newName-bioart-traced.svg" },
        stable: { ...entry, svg: "svg/stable-bioart-traced.svg" }
      },
      [{ id: "stable", sha256: sha }]
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].canonical.id).toBe("stable");
    expect(groups[0].entries.map((entry) => entry.id)).toEqual(["newName", "stable"]);
  });

  it("normalizes legacy variants to Detailed and resolves only the requested style", () => {
    const family = {
      ...assetManifest.families.find((candidate) => candidate.familyId === "editable-cell")!,
      variants: [
        {
          id: "cell-detailed",
          assetPath: "detailed.svg",
          thumbnailPath: "detailed.svg"
        },
        {
          id: "cell-simplified",
          style: "simplified" as const,
          assetPath: "simplified.svg",
          thumbnailPath: "simplified.svg"
        }
      ]
    };

    expect(assetStyleOf(family.variants[0])).toBe("detailed");
    expect(variantsForStyle(family, "simplified").map((variant) => variant.id)).toEqual([
      "cell-simplified"
    ]);
    expect(findAssetVariantForStyle(family, "simplified")?.id).toBe("cell-simplified");
    expect(findAssetVariantForStyle(family, "detailed")?.id).toBe("cell-detailed");
  });

  it("publishes only Detailed or Simplified variants with paired scientific fixtures", () => {
    const styles = new Set(
      assetManifest.families.flatMap((family) =>
        family.variants.map((variant) => assetStyleOf(variant))
      )
    );
    expect(styles).toEqual(new Set(["detailed", "simplified"]));
    expect(
      ["editable-cell", "editable-protein", "opensketch-generated-lysosome"].every((familyId) =>
        assetManifest.families
          .find((family) => family.familyId === familyId)
          ?.variants.some((variant) => assetStyleOf(variant) === "simplified")
      )
    ).toBe(true);
    expect(
      assetManifest.families
        .flatMap((family) => family.variants)
        .filter((variant) => assetStyleOf(variant) === "simplified")
        .every((variant) => /^[a-f0-9]{64}$/.test(variant.localSha256 ?? ""))
    ).toBe(true);
  });
});
