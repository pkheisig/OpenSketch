import { describe, expect, it } from "vitest";
import {
  ASSET_INSERT_MAX_SIDE,
  WELL_PLATE_INSERT_WIDTH,
  assetInsertionScale
} from "../apps/web/src/editor/assetInsertion";

describe("asset insertion sizing", () => {
  it.each(["6 Well Plate", "24 Well Plate Top View", "128 well plate top view"])(
    "inserts %s at the standard well-plate width",
    (title) => {
      const sourceWidth = 640;
      const scale = assetInsertionScale(title, sourceWidth, 420);
      expect(sourceWidth * scale).toBe(WELL_PLATE_INSERT_WIDTH);
    }
  );

  it("keeps the existing maximum-side rule for other assets", () => {
    const scale = assetInsertionScale("Activated Neutrophil", 400, 600);
    expect(600 * scale).toBe(ASSET_INSERT_MAX_SIDE);
    expect(assetInsertionScale("Small Protein", 80, 60)).toBe(1);
  });
});
