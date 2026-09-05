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

  it("preserves comment-like text inside selector strings", () => {
    expect(topLevelSelectors('.foo[data-label="a/*b*/c"] { color: red; }')).toEqual([
      '.foo[data-label="a/*b*/c"]'
    ]);
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

  it("canonicalizes selector comments, attribute quotes, and HTML element case", () => {
    expect(topLevelSelectors(`HTML[data-theme='light'] { color: red; }`)).toEqual([
      "html[data-theme=light]"
    ]);
  });

  it("accepts the repository stylesheet inventory", () => {
    expect(checkStyleOwnership().modules).toBe(6);
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
    expectFixtureFailure(
      (stylesDir) =>
        fs.appendFileSync(path.join(stylesDir, "home.css"), "\nHTML[data-theme='light'] {}\n"),
      "selector html[data-theme=light] is owned by both"
    );
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

  it("rejects imports and missing ownership declarations in modules", () => {
    expectFixtureFailure((stylesDir) => {
      fs.appendFileSync(path.join(stylesDir, "home.css"), '\n@IMPORT "./other.css";\n');
    }, "home.css must not import another stylesheet");
    expectFixtureFailure((stylesDir) => {
      const basePath = path.join(stylesDir, "base.css");
      fs.writeFileSync(
        basePath,
        fs.readFileSync(basePath, "utf8").replace("shared primitive ownership", "shared primitives")
      );
    }, "base.css must declare its stylesheet ownership");
  });

  it("ignores import text inside comments and strings", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "opensketch-style-"));
    const stylesDir = path.join(root, "apps/web/src/styles");
    fs.mkdirSync(stylesDir, { recursive: true });
    fs.cpSync(sourceStyles, stylesDir, { recursive: true });
    try {
      fs.appendFileSync(
        path.join(stylesDir, "home.css"),
        '\n/* @import "./comment.css"; */\n.import-copy { content: "@import ./string.css"; }\n'
      );
      expect(() => checkStyleOwnership(root)).not.toThrow();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps body-portal menu selectors independent of the app wrapper", () => {
    const canvas = fs.readFileSync(path.join(sourceStyles, "canvas.css"), "utf8");
    const inspector = fs.readFileSync(path.join(sourceStyles, "inspector.css"), "utf8");
    expect(canvas).not.toMatch(/\.opensketch-app \.canvas-context-menu/);
    expect(inspector).not.toMatch(/\.opensketch-app \.asset-variant-menu/);
  });

  it("keeps accessibility and dark preview overrides in owned modules", () => {
    const base = fs.readFileSync(path.join(sourceStyles, "base.css"), "utf8");
    const home = fs.readFileSync(path.join(sourceStyles, "home.css"), "utf8");
    expect(base).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    expect(base).toMatch(/animation-duration: 0\.01ms !important/);
    expect(home).toMatch(
      /\.opensketch-app\[data-opensketch-theme="dark"\] \.project-preview-vector\.transparent/
    );
    expect(home).toMatch(/#40382f/);
  });
});
