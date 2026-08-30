import { describe, expect, it } from "vitest";
import { checkStyleOwnership, topLevelSelectors } from "../scripts/check-style-ownership.mjs";

describe("stylesheet ownership checks", () => {
  it("keeps functional pseudo-class and attribute commas inside selectors", () => {
    expect(
      topLevelSelectors(`
        .foo:is(.a, .b), .bar[data-label="a,b"] { color: red; }
      `)
    ).toEqual([".foo:is(.a, .b)", '.bar[data-label="a,b"]']);
  });

  it("checks selectors nested in responsive at-rules", () => {
    expect(
      topLevelSelectors(`
        @media (max-width: 820px) {
          .foo:is(.a, .b) { color: red; }
        }
      `)
    ).toEqual([".foo:is(.a, .b)"]);
  });

  it("accepts the repository stylesheet inventory", () => {
    expect(checkStyleOwnership().files).toBe(6);
  });
});
