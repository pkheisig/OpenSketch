import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { AssetManifest } from "../packages/editor-core/src/types";

const root = path.resolve(import.meta.dirname, "..");

async function loadManifest(): Promise<AssetManifest> {
  return JSON.parse(
    await readFile(
      path.join(root, "apps/web/src/generated/open-assets-manifest.json"),
      "utf8"
    )
  ) as AssetManifest;
}

describe("open scientific-art collection", () => {
  it("bundles every usable SciDraw SVG and the complete Arcadia organism library", async () => {
    const manifest = await loadManifest();
    const sciDraw = manifest.families.filter((family) => family.sourceName === "SciDraw");
    const organisms = manifest.families.filter((family) =>
      family.sourceName?.startsWith("Arcadia Science")
    );

    expect(sciDraw).toHaveLength(609);
    expect(organisms).toHaveLength(71);
    expect(organisms.flatMap((family) => family.variants)).toHaveLength(142);
  });

  it("retains licenses, attribution, sources, and only local asset paths", async () => {
    const manifest = await loadManifest();
    const variantIds = new Set<string>();

    for (const family of manifest.families) {
      expect(["CC0-1.0", "CC-BY-4.0"]).toContain(family.license);
      expect(family.author).not.toBe("");
      expect(family.credit).not.toBe("");
      expect(family.sourcePage).toMatch(/^https:\/\//);
      expect(family.licenseUrl).toMatch(/^https:\/\//);
      expect(family.variants.some((variant) => variant.id === family.defaultVariantId)).toBe(
        true
      );

      for (const variant of family.variants) {
        expect(variant.assetPath).not.toMatch(/^https?:/);
        expect(variant.thumbnailPath).not.toMatch(/^https?:/);
        expect(variantIds.has(variant.id)).toBe(false);
        variantIds.add(variant.id);
      }
    }
  });
});
