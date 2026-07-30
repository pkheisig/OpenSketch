import type { AssetFamily } from "@workspace/editor-core";

const WIDTH = 378;
const HEIGHT = 252;
const PLATE_FACE_RIGHT = 359;
const PLATE_FACE_BOTTOM = 232;
const SOURCE_PAGE = "https://github.com/pkheisig/OpenSketch";
const WELL_GRID: Record<
  number,
  { left: number; top: number; width: number; height: number }
> = {
  6: { left: 48, top: 48, width: 288, height: 168 },
  12: { left: 44, top: 44, width: 296, height: 176 },
  24: { left: 40, top: 40, width: 304, height: 184 },
  48: { left: 36, top: 36, width: 312, height: 188 },
  96: { left: 32, top: 32, width: 320, height: 192 },
  384: { left: 28, top: 28, width: 324, height: 196 }
};
const WELL_RADIUS_RATIO: Record<number, number> = {
  6: 0.46,
  12: 0.44,
  24: 0.41,
  48: 0.35,
  96: 0.34,
  384: 0.3
};
const LABEL_FONT_SIZE: Record<number, number> = {
  6: 16,
  12: 14,
  24: 11,
  48: 8.5,
  96: 7,
  384: 5.2
};

function svgDataUrl(source: string): string {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(source)}`;
}

function wellPlateSvg(rows: number, columns: number): string {
  const wellCount = rows * columns;
  const grid = WELL_GRID[wellCount] ?? WELL_GRID[96];
  const xStep = grid.width / columns;
  const yStep = grid.height / rows;
  const radius = Math.max(3.2, Math.min(xStep, yStep) * (WELL_RADIUS_RATIO[wellCount] ?? 0.36));
  const wells = Array.from({ length: rows * columns }, (_, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const cx = grid.left + (column + 0.5) * xStep;
    const cy = grid.top + (row + 0.5) * yStep;
    const strokeWidth = Math.max(0.8, Math.min(1.8, radius * 0.1));
    const rimWidth = Math.max(1.4, Math.min(3.4, radius * 0.18));
    return [
      `<circle data-well-shadow="${row + 1}-${column + 1}" cx="${cx.toFixed(2)}" cy="${(cy + Math.max(0.8, radius * 0.08)).toFixed(2)}" r="${(radius + rimWidth * 0.55).toFixed(2)}" fill="#c8d7d5"/>`,
      `<circle data-well-rim="${row + 1}-${column + 1}" cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${(radius + rimWidth * 0.4).toFixed(2)}" fill="#f8fbfa" stroke="#b6c9c7" stroke-width="${rimWidth.toFixed(2)}"/>`,
      `<circle id="well-${row + 1}-${column + 1}" cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${radius.toFixed(2)}" fill="#d9eef4" stroke="#5f858a" stroke-width="${strokeWidth.toFixed(2)}"/>`
    ].join("");
  }).join("");
  const labelFontSize = LABEL_FONT_SIZE[wellCount] ?? 8.5;
  const columnLabelY = grid.top - Math.max(7, labelFontSize * 0.65);
  const rowLabelX = grid.left - Math.max(8, labelFontSize * 0.85);
  const columnLabels = Array.from({ length: columns }, (_, column) => {
    const x = grid.left + (column + 0.5) * xStep;
    return `<text id="column-label-${column + 1}" x="${x.toFixed(2)}" y="${columnLabelY.toFixed(2)}" text-anchor="middle">${column + 1}</text>`;
  }).join("");
  const rowLabels = Array.from({ length: rows }, (_, row) => {
    const y = grid.top + (row + 0.5) * yStep;
    return `<text id="row-label-${row + 1}" x="${rowLabelX.toFixed(2)}" y="${y.toFixed(2)}" text-anchor="middle" dominant-baseline="central">${String.fromCharCode(65 + row)}</text>`;
  }).join("");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" data-grid-left="${grid.left}" data-grid-top="${grid.top}" data-grid-width="${grid.width}" data-grid-height="${grid.height}" data-plate-face-right="${PLATE_FACE_RIGHT}" data-plate-face-bottom="${PLATE_FACE_BOTTOM}">`,
    '<path id="plate-depth" d="M28 12H356c10 0 18 8 18 18v202c0 10-8 18-18 18H30L10 230V32Z" fill="#bed1d2" stroke="#6f9295" stroke-width="2"/>',
    '<path id="plate-side" d="M368 24l6 6v202c0 10-8 18-18 18H30l-6-6h328c9 0 16-7 16-16Z" fill="#abc4c7" stroke="#6f9295" stroke-width="1.5"/>',
    '<path id="plate" d="M28 4H352c9 0 16 7 16 16v206c0 9-7 16-16 16H28L4 218V28Z" fill="#eef5f5" stroke="#587d82" stroke-width="2.4"/>',
    '<path id="plate-inset" d="M30 13H349c6 0 10 4 10 10v199c0 6-4 10-10 10H30L14 216V31Z" fill="#e5eff1" stroke="#a8c2c5" stroke-width="2"/>',
    '<path id="plate-highlight" d="M31 17H347c5 0 8 3 8 8" fill="none" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round" opacity=".9"/>',
    `<g id="column-labels" fill="#315f76" font-family="'Source Sans 3', sans-serif" font-size="${labelFontSize}" font-weight="600">`,
    columnLabels,
    "</g>",
    `<g id="row-labels" fill="#315f76" font-family="'Source Sans 3', sans-serif" font-size="${labelFontSize}" font-weight="600">`,
    rowLabels,
    "</g>",
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
