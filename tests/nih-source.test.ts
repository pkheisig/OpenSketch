import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { directSvgUrl, parseNihBioartPage } from "../scripts/assets/nih-source";

function page(payload: string): string {
  return `<html><script>self.__next_f.push([1,${JSON.stringify(payload)}])</script></html>`;
}

describe("direct NIH BioArt metadata", () => {
  it("extracts licensing, metadata, and every SVG representation", () => {
    const html = page(`
11:["$","main",null,{"children":[
["$","x",null,{"children":"BIOART-000673"}],
["$","x",null,{"variant":"h4","color":"heading","children":"Magnetic Cell Sorter"}],
["$","x",null,{"children":["Licensing:\\u00a0",["$","a",null,{"children":"Public Domain"}]]}],
["$","x",null,{"children":"Category:"}],["$","x",null,{"children":"Equipment"}],
["$","x",null,{"dangerouslySetInnerHTML":{"__html":"<p>Magnetic Cell Sorter and Stand</p>"}}],
["$","x",null,{"filemapping":{"2370":{"AI":764610,"SVG":764614},"2371":{"PNG":8,"SVG":764615}}}],
["$","x",null,{"children":"Keywords"}],"$L2b",
["$","x",null,{"children":"Creator"}],"$L2d"
]}]
2b:["$","x",null,{"children":"Magnetic, Sorter"}]
2d:["$","x",null,{"children":"Alexander Stewart"}]
`);
    expect(parseNihBioartPage(673, html)).toEqual({
      entryId: 673,
      title: "Magnetic Cell Sorter",
      description: "Magnetic Cell Sorter and Stand",
      category: "Equipment",
      keywords: ["Magnetic", "Sorter"],
      author: "Alexander Stewart",
      license: "Public Domain",
      sourcePage: "https://bioart.niaid.nih.gov/bioart/673",
      svgFileIds: [764614, 764615]
    });
  });

  it("rejects an error page rather than inventing metadata", () => {
    expect(parseNihBioartPage(999, page(`{"children":"Internal Server Error"}`))).toBeUndefined();
  });

  it("builds the first-party SVG download URL", () => {
    expect(directSvgUrl(673, 764614)).toBe(
      "https://bioart.niaid.nih.gov/api/bioarts/673/files/764614"
    );
  });

  it("bundles newly discovered first-party public-domain assets", () => {
    const manifest = JSON.parse(
      readFileSync(resolve("apps/web/src/generated/nih-bioart-manifest.json"), "utf8")
    ) as {
      families: Array<{
        bioartEntryId: number;
        title: string;
        license: string;
        sourcePage?: string;
        variants: Array<{ sourceFileId?: number; assetPath: string }>;
      }>;
    };
    const sorter = manifest.families.find((family) => family.bioartEntryId === 673);
    expect(sorter).toMatchObject({
      title: "Magnetic Cell Sorter",
      license: "Public Domain",
      sourcePage: "https://bioart.niaid.nih.gov/bioart/673"
    });
    expect(sorter?.variants).toEqual([
      expect.objectContaining({
        sourceFileId: 764614,
        assetPath: "/assets/nih-bioart/nih-bioart-673-764614.svg"
      })
    ]);
  });
});
