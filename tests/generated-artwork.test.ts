import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import manifest from "../apps/web/src/generated/opensketch-generated-manifest.json";
import derivatives from "../docs/opensketch-generated-derivatives.json";
import snapshot from "../docs/opensketch-generated-snapshot.json";
import {
  ASSET_CATEGORY_ORDER,
  filterAssetFamilies,
  type AssetManifest
} from "../packages/editor-core/src";

describe("reviewed generated artwork app snapshot", () => {
  it("indexes all distinct artwork once and retains intentional aliases", () => {
    expect(manifest.families).toHaveLength(snapshot.distinctAssets);
    expect(snapshot.completedNames).toBe(217);
    expect(new Set(manifest.families.map((f) => f.familyId)).size).toBe(211);
    expect(
      filterAssetFamilies((manifest as AssetManifest).families, "regulatory T cell").map(
        (f) => f.title
      )
    ).toContain("T lymphocyte");
  });
  it("ships the recorded bounded SVG derivatives and matching thumbnails", () => {
    for (const family of manifest.families) {
      expect(ASSET_CATEGORY_ORDER).toContain(family.category);
      const variant = family.variants[0];
      const bytes = readFileSync(`apps/web/public/${variant.assetPath}`);
      const hash = createHash("sha256").update(bytes).digest("hex");
      const receipt = derivatives.assets.find(
        (e) => variant.id === `opensketch-generated-${e.id}`
      )!;
      expect(hash).toBe(variant.localSha256);
      expect(hash).toBe(receipt.appSvgSha256);
      const svg = bytes.toString();
      expect(svg).not.toMatch(/<image\b|<script\b|<foreignObject\b|NaN|Infinity/);
      expect((svg.match(/<path\b/g) ?? []).length).toBe(receipt.paths);
      expect(receipt.paths).toBeLessThanOrEqual(4000);
      expect(new Set(svg.match(/fill="#[a-f\d]{6}"/gi)).size).toBeLessThanOrEqual(48);
      expect(readFileSync(`apps/web/public/${variant.thumbnailPath}`).length).toBeGreaterThan(100);
    }
  });
});

it("exposes only OpenSketch collections while preserving legacy lookup data", async () => {
  const { assetManifest, bundledAssetManifest } = await import("../apps/web/src/assets/manifest");
  expect(assetManifest.families).toHaveLength(230);
  expect(new Set(assetManifest.families.map((f) => f.sourceName))).toEqual(
    new Set(["OpenSketch generated", "OpenSketch structures"])
  );
  expect(assetManifest.families.filter((f) => f.editableStructure)).toHaveLength(17);
  expect(bundledAssetManifest.families.length).toBeGreaterThan(assetManifest.families.length);
  expect(bundledAssetManifest.families.some((f) => f.nihSourcePage)).toBe(true);
});

it("offers two fixed circular choices without the Editable badge", async () => {
  const { assetManifest } = await import("../apps/web/src/assets/manifest");
  const fixed = assetManifest.families.filter((f) => f.familyId.startsWith("fixed-circular-"));
  expect(fixed).toHaveLength(2);
  for (const family of fixed) {
    expect(family.editableStructure).toBe(false);
    expect(
      readFileSync(`apps/web/public/${family.variants[0].assetPath.replace(/^\//, "")}`).length
    ).toBeGreaterThan(100);
  }
});
