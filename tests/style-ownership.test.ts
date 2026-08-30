import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkStyleOwnership, topLevelSelectors } from "../scripts/check-style-ownership.mjs";

const sourceStyles = path.resolve(process.cwd(), "apps/web/src/styles");

function expectFixtureFailure(mutator: (stylesDir: string) => void, message: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "opensketch-style-"));
  const stylesDir = path.join(root, "apps/web/src/styles");
  fs.mkdirSync(stylesDir, { recursive: true });
  fs.cpSync(sourceStyles, stylesDir, { recursive: true });
  try {
    mutator(stylesDir);
    expect(() => checkStyleOwnership(root)).toThrow(message);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

describe("stylesheet ownership checks", () => {
  it("keeps functional pseudo-class and attribute commas inside selectors", () => {
    expect(
      topLevelSelectors(`
        .foo:is(.a, .b), .bar[data-label="a,b"], .baz /* comment */ { color: red; }
      `)
    ).toEqual([".foo:is(.a, .b)", '.bar[data-label="a,b"]', ".baz"]);
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

  it("rejects duplicate selectors across modules, including comment variants", () => {
    expectFixtureFailure(
      (stylesDir) => fs.appendFileSync(path.join(stylesDir, "home.css"), "\n.button:hover {}\n"),
      "selector .button:hover is owned by both"
    );
    expectFixtureFailure((stylesDir) => {
      fs.appendFileSync(path.join(stylesDir, "base.css"), "\n.commented {}\n");
      fs.appendFileSync(path.join(stylesDir, "home.css"), "\n.commented /* note */ {}\n");
    }, "selector .commented is owned by both");
  });

  it("rejects unmanaged and retired stylesheets", () => {
    expectFixtureFailure(
      (stylesDir) => fs.writeFileSync(path.join(stylesDir, "unowned.css"), "/* no owner */"),
      "unowned or missing stylesheet"
    );
    expectFixtureFailure(
      (stylesDir) => fs.writeFileSync(path.join(stylesDir, "global.css"), "/* legacy */"),
      "retired stylesheet still exists"
    );
  });

  it("rejects a non-deterministic entry-point import order", () => {
    expectFixtureFailure((stylesDir) => {
      const appPath = path.join(stylesDir, "app.css");
      fs.writeFileSync(
        appPath,
        fs.readFileSync(appPath, "utf8").replace("./home.css", "./base.css")
      );
    }, "deterministic ownership order");
  });
});
