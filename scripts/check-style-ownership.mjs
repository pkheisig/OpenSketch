import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const ownedFiles = [
  "base.css",
  "home.css",
  "editor.css",
  "inspector.css",
  "canvas.css",
  "dialogs.css"
];

function findClosingBrace(source, openIndex) {
  let depth = 1;
  let quote = null;
  let comment = false;
  for (let index = openIndex + 1; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (comment) {
      if (character === "*" && next === "/") {
        comment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === "/" && next === "*") {
      comment = true;
      index += 1;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error("Unclosed CSS block");
}

export function topLevelSelectors(source) {
  const selectors = [];
  let index = 0;
  while (index < source.length) {
    while (/\s/.test(source[index] ?? "")) index += 1;
    if (index >= source.length) break;
    if (source.startsWith("/*", index)) {
      const commentEnd = source.indexOf("*/", index + 2);
      if (commentEnd < 0) throw new Error("Unclosed CSS comment");
      index = commentEnd + 2;
      continue;
    }
    const start = index;
    let quote = null;
    let comment = false;
    let parentheses = 0;
    let brackets = 0;
    let delimiter = null;
    for (; index < source.length; index += 1) {
      const character = source[index];
      const next = source[index + 1];
      if (comment) {
        if (character === "*" && next === "/") {
          comment = false;
          index += 1;
        }
        continue;
      }
      if (quote) {
        if (character === "\\") index += 1;
        else if (character === quote) quote = null;
        continue;
      }
      if (character === "/" && next === "*") {
        comment = true;
        index += 1;
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === "(") {
        parentheses += 1;
      } else if (character === ")") {
        parentheses -= 1;
      } else if (character === "[") {
        brackets += 1;
      } else if (character === "]") {
        brackets -= 1;
      } else if (parentheses === 0 && brackets === 0 && (character === "{" || character === ";")) {
        delimiter = character;
        break;
      }
    }
    if (delimiter === ";") {
      index += 1;
      continue;
    }
    if (delimiter !== "{") throw new Error("Malformed CSS prelude");
    const close = findClosingBrace(source, index);
    const prelude = source.slice(start, index).trim();
    if (!prelude.startsWith("@")) {
      for (const selector of prelude.split(",")) {
        const normalized = selector.trim().replace(/\s+/g, " ");
        if (normalized) selectors.push(normalized);
      }
    } else if (!/^@(?:-[\w]+-)?keyframes\b/i.test(prelude)) {
      selectors.push(...topLevelSelectors(source.slice(index + 1, close)));
    }
    index = close + 1;
  }
  return selectors;
}

export function checkStyleOwnership(root = repoRoot) {
  const stylesDir = path.join(root, "apps/web/src/styles");
  const appEntry = fs.readFileSync(path.join(stylesDir, "app.css"), "utf8");
  const expectedImports = [
    '@import "./tokens.css";',
    '@import "./base.css";',
    '@import "./home.css";',
    '@import "./editor.css";',
    '@import "./inspector.css";',
    '@import "./canvas.css";',
    '@import "./dialogs.css";'
  ];
  const imports = appEntry.split("\n").filter((line) => line.startsWith("@import "));
  if (imports.join("\n") !== expectedImports.join("\n")) {
    throw new Error("app.css imports do not match the deterministic ownership order");
  }
  for (const legacyFile of ["global.css", "opengate-theme.css"]) {
    if (fs.existsSync(path.join(stylesDir, legacyFile))) {
      throw new Error(`retired stylesheet still exists: ${legacyFile}`);
    }
  }
  const seen = new Map();
  for (const file of ownedFiles) {
    const filePath = path.join(stylesDir, file);
    const source = fs.readFileSync(filePath, "utf8");
    if (!source.startsWith("/*") || !source.includes("ownership")) {
      throw new Error(`${file} must declare its stylesheet ownership`);
    }
    for (const selector of topLevelSelectors(source)) {
      const prior = seen.get(selector);
      if (prior && prior !== file) {
        throw new Error(`selector ${selector} is owned by both ${prior} and ${file}`);
      }
      seen.set(selector, file);
    }
  }
  return { files: ownedFiles.length, selectors: seen.size };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = checkStyleOwnership();
  console.log(
    `Style ownership OK: ${result.files} modules, ${result.selectors} top-level selectors.`
  );
}
