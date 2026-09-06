import { Group, Rect } from "../apps/web/node_modules/fabric";
import { describe, expect, it } from "vitest";
import {
  collectProvenanceManifest,
  formatProvenanceCredits,
  provenanceManifestJson
} from "../apps/web/src/export/provenance";

function asset(assetId: string, name: string, provenance: Record<string, string>): Group {
  const group = new Group([new Rect({ width: 12, height: 12 })]);
  group.assetId = assetId;
  group.familyId = `${assetId}-family`;
  group.name = name;
  group.provenance = provenance;
  return group;
}

describe("export provenance", () => {
  it("recursively collects, deduplicates, and orders nested asset records", () => {
    const shared = {
      sourcePage: "https://example.org/shared",
      author: "OpenSketch",
      sourceName: "OpenSketch generated",
      license: "CC-BY-4.0",
      licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
      credit: "Shared author / Example"
    };
    const nested = new Group([
      asset("asset-b", "Beta", shared),
      new Group([
        asset("asset-a", "Alpha", {
          sourcePage: "https://example.org/alpha",
          author: "OpenSketch",
          sourceName: "OpenSketch generated",
          license: "CC0-1.0",
          spdxId: "CC0-1.0",
          attribution: "Alpha author / Example",
          credit: "Alpha author / Example"
        })
      ])
    ]);

    const first = collectProvenanceManifest([nested, asset("asset-b", "Beta", shared)]);
    const second = collectProvenanceManifest([asset("asset-b", "Beta", shared), nested]);

    expect(first).toEqual(second);
    expect(first.assets).toHaveLength(2);
    expect(first.assets.map((record) => record.assetId)).toEqual(["asset-a", "asset-b"]);
    expect(first.assets[0]).toMatchObject({
      name: "Alpha",
      source: "https://example.org/alpha",
      author: "OpenSketch",
      sourceName: "OpenSketch generated",
      license: "CC0-1.0",
      spdxId: "CC0-1.0",
      attribution: "Alpha author / Example",
      credit: "Alpha author / Example"
    });
    const credits = formatProvenanceCredits(first, "Figure", "", "OpenSketch");
    expect(credits).toContain("SPDX ID: CC0-1.0");
    expect(credits.match(/Attribution: Alpha author \/ Example/g)).toHaveLength(1);
    expect(provenanceManifestJson(first)).toBe(provenanceManifestJson(second));
  });

  it("excludes records from retired catalog providers", () => {
    const manifest = collectProvenanceManifest([
      asset("retired-asset", "Old asset", {
        author: "Retired provider",
        sourceName: "Retired collection",
        license: "CC-BY-4.0"
      })
    ]);
    expect(manifest.assets).toEqual([]);
  });

  it("retains the selected style in the exact asset provenance record", () => {
    const selected = asset("editable-cell-simplified", "Cell", {
      sourcePage: "https://github.com/pkheisig/OpenSketch",
      author: "OpenSketch",
      sourceName: "OpenSketch structures",
      license: "AGPL-3.0-only",
      style: "detailed",
      credit: "OpenSketch"
    });
    selected.assetStyle = "simplified";

    const manifest = collectProvenanceManifest([selected]);

    expect(manifest.assets).toEqual([
      expect.objectContaining({ assetId: "editable-cell-simplified", style: "simplified" })
    ]);
    expect(formatProvenanceCredits(manifest, "Figure", "", "OpenSketch")).toContain(
      "Style: simplified"
    );
  });

  it("ignores objects without provenance and produces a readable empty fallback", () => {
    const manifest = collectProvenanceManifest([new Rect({ width: 12, height: 12 })]);
    const credits = formatProvenanceCredits(manifest, "Untitled", "", "OpenSketch");

    expect(manifest).toEqual({ version: 1, assets: [] });
    expect(credits).toContain("No per-asset provenance records were present.");
    expect(credits).not.toContain("undefined");
  });
});
