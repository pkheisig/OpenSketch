import type { AssetFamily } from "@workspace/editor-core";

const WIDTH = 360;
const HEIGHT = 240;
const SOURCE_PAGE = "https://github.com/pkheisig/OpenSketch";
const PLATE_INSET = { left: 18, top: 18, width: 324, height: 204 };
const WELL_RADIUS_RATIO: Record<number, number> = {
  6: 0.48,
  12: 0.45,
  24: 0.4,
  48: 0.36,
  96: 0.34,
  384: 0.32
};

function svgDataUrl(source: string): string {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(source)}`;
}

function wellPlateSvg(rows: number, columns: number): string {
  const wellCount = rows * columns;
  const xStep = PLATE_INSET.width / columns;
  const yStep = PLATE_INSET.height / rows;
  const radius = Math.max(3.2, Math.min(xStep, yStep) * (WELL_RADIUS_RATIO[wellCount] ?? 0.36));
  const wells = Array.from({ length: rows * columns }, (_, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const cx = PLATE_INSET.left + (column + 0.5) * xStep;
    const cy = PLATE_INSET.top + (row + 0.5) * yStep;
    return `<circle id="well-${row + 1}-${column + 1}" cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${radius.toFixed(2)}" fill="#ffffff" stroke="#78918f" stroke-width="${Math.max(1.2, radius * 0.12).toFixed(2)}"/>`;
  }).join("");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}">`,
    '<rect id="plate" x="8" y="8" width="344" height="224" rx="20" fill="#eef4f2" stroke="#536d6b" stroke-width="4"/>',
    `<rect id="plate-inset" x="${PLATE_INSET.left}" y="${PLATE_INSET.top}" width="${PLATE_INSET.width}" height="${PLATE_INSET.height}" rx="14" fill="none" stroke="#b8c8c5" stroke-width="2"/>`,
    wells,
    "</svg>"
  ].join("");
}

function petriDishSvg(): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}">`,
    '<ellipse id="dish-shadow" cx="180" cy="124" rx="110" ry="92" fill="#dce8e5"/>',
    '<ellipse id="dish-rim" cx="180" cy="116" rx="110" ry="92" fill="#f9fcfb" stroke="#536d6b" stroke-width="5"/>',
    '<ellipse id="culture-surface" cx="180" cy="116" rx="93" ry="76" fill="#edf7f5" stroke="#91aaa6" stroke-width="3"/>',
    '<path id="lid-highlight" d="M105 88c22-34 61-51 102-44 23 4 42 14 56 28" fill="none" stroke="#ffffff" stroke-width="8" stroke-linecap="round" opacity=".8"/>',
    "</svg>"
  ].join("");
}

function family(
  slug: string,
  title: string,
  description: string,
  source: string,
  entryId: number,
  keywords: string[]
): AssetFamily {
  const id = `opensketch-${slug}`;
  const dataUrl = svgDataUrl(source);
  return {
    familyId: id,
    bioartEntryId: entryId,
    title,
    description,
    category: "Equipment",
    keywords: [title, "top view", "labware", "experiment layout", ...keywords],
    author: "OpenSketch contributors",
    credit: "OpenSketch",
    license: "Public Domain",
    nihSourcePage: SOURCE_PAGE,
    commonsPage: SOURCE_PAGE,
    defaultVariantId: id,
    variants: [
      {
        id,
        assetPath: dataUrl,
        thumbnailPath: dataUrl,
        width: WIDTH,
        height: HEIGHT
      }
    ]
  };
}

export const TOP_VIEW_LABWARE_FAMILIES: AssetFamily[] = [
  family(
    "6-well-plate-top-view",
    "6 Well Plate Top View",
    "Standard 2 by 3 well plate viewed from above",
    wellPlateSvg(2, 3),
    -1006,
    ["6 well plate", "2x3", "culture plate"]
  ),
  family(
    "12-well-plate-top-view",
    "12 Well Plate Top View",
    "Standard 3 by 4 well plate viewed from above",
    wellPlateSvg(3, 4),
    -1012,
    ["12 well plate", "3x4", "culture plate"]
  ),
  family(
    "24-well-plate-top-view",
    "24 Well Plate Top View",
    "Standard 4 by 6 well plate viewed from above",
    wellPlateSvg(4, 6),
    -1024,
    ["24 well plate", "4x6", "culture plate"]
  ),
  family(
    "48-well-plate-top-view",
    "48 Well Plate Top View",
    "Standard 6 by 8 well plate viewed from above",
    wellPlateSvg(6, 8),
    -1048,
    ["48 well plate", "6x8", "culture plate"]
  ),
  family(
    "96-well-plate-top-view",
    "96 Well Plate Top View",
    "Standard 8 by 12 microplate viewed from above",
    wellPlateSvg(8, 12),
    -1096,
    ["96 well plate", "8x12", "microplate", "assay plate"]
  ),
  family(
    "384-well-plate-top-view",
    "384 Well Plate Top View",
    "Standard 16 by 24 microplate viewed from above",
    wellPlateSvg(16, 24),
    -1384,
    ["384 well plate", "16x24", "microplate", "assay plate"]
  ),
  family(
    "petri-dish-top-view",
    "Petri Dish Top View",
    "Empty culture dish viewed from above",
    petriDishSvg(),
    -2001,
    ["petri dish", "culture dish", "dish", "cell culture"]
  )
];
