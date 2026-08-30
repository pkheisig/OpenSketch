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
const selectorFiles = ["tokens.css", ...ownedFiles];

function stripCssComments(source) {
  let result = "";
  let quote = null;
  let comment = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (comment) {
      if (character === "*" && next === "/") {
        comment = false;
        result += " ";
        index += 1;
      } else if (character === "\n" || character === "\r") {
        result += character;
      }
      continue;
    }
    if (quote) {
      result += character;
      if (character === "\\" && next !== undefined) {
        result += next;
        index += 1;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === "/" && next === "*") {
      comment = true;
      result += " ";
      index += 1;
    } else if (character === '"' || character === "'") {
      quote = character;
      result += character;
    } else {
      result += character;
    }
  }
  return result;
}

function containsCssImport(source) {
  let quote = null;
  let comment = false;
  for (let index = 0; index < source.length; index += 1) {
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
      if (character === "\\" && next !== undefined) index += 1;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === "/" && next === "*") {
      comment = true;
      index += 1;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (
      character === "@" &&
      source.slice(index + 1, index + 7).toLowerCase() === "import" &&
      !/[\w-]/.test(source[index + 7] ?? "")
    ) {
      return true;
    }
  }
  return false;
}

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

function splitSelectorList(prelude) {
  const selectors = [];
  let start = 0;
  let quote = null;
  let comment = false;
  let parentheses = 0;
  let brackets = 0;
  for (let index = 0; index < prelude.length; index += 1) {
    const character = prelude[index];
    const next = prelude[index + 1];
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
    } else if (character === "," && parentheses === 0 && brackets === 0) {
      selectors.push(prelude.slice(start, index));
      start = index + 1;
    }
  }
  selectors.push(prelude.slice(start));
  return selectors;
}

function normalizeSelectorWhitespace(selector) {
  let normalized = "";
  let quote = null;
  let pendingSpace = false;
  for (let index = 0; index < selector.length; index += 1) {
    const character = selector[index];
    const next = selector[index + 1];
    if (quote) {
      normalized += character;
      if (character === "\\" && next !== undefined) {
        normalized += next;
        index += 1;
      } else if (character === quote) {
        quote = null;
      }
    } else if (character === '"' || character === "'") {
      if (pendingSpace && normalized) normalized += " ";
      pendingSpace = false;
      quote = character;
      normalized += character;
    } else if (/\s/.test(character)) {
      if (normalized) pendingSpace = true;
    } else {
      if (pendingSpace && normalized) normalized += " ";
      pendingSpace = false;
      normalized += character;
    }
  }
  return normalized.trim();
}

function normalizeSelector(selector) {
  let normalized = normalizeSelectorWhitespace(selector);
  normalized = normalized.replace(
    /\[([^\]]*)\]/g,
    (_match, contents) =>
      `[${contents.replace(/(\s*(?:[~|^$*]?=)\s*)(["'])([A-Za-z_][\w-]*)\2/g, "$1$3")}]`
  );

  let result = "";
  let chunk = "";
  let quote = null;
  let brackets = 0;
  const flushChunk = () => {
    result += chunk.replace(
      /(^|[\s>+~|,(])([A-Za-z][\w-]*)(?=$|[\s>+~|.#:[,(*)])/g,
      (_match, prefix, name) => `${prefix}${name.toLowerCase()}`
    );
    chunk = "";
  };
  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];
    const next = normalized[index + 1];
    if (quote) {
      result += character;
      if (character === "\\" && next !== undefined) {
        result += next;
        index += 1;
      } else if (character === quote) {
        quote = null;
      }
    } else if (character === '"' || character === "'") {
      flushChunk();
      quote = character;
      result += character;
    } else if (brackets > 0) {
      result += character;
      if (character === "]") brackets -= 1;
    } else if (character === "[") {
      flushChunk();
      brackets = 1;
      result += character;
    } else {
      chunk += character;
    }
  }
  flushChunk();
  return result;
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
    const prelude = stripCssComments(source.slice(start, index)).trim();
    if (!prelude.startsWith("@")) {
      for (const selector of splitSelectorList(prelude)) {
        const normalized = normalizeSelector(selector);
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
  const imports = stripCssComments(appEntry)
    .split(/\r?\n/)
    .map((line) => line.replace(/^\uFEFF/, "").trim())
    .filter((line) => line.startsWith("@import "))
    .map((line) => line.trim());
  if (imports.join("\n") !== expectedImports.join("\n")) {
    throw new Error("app.css imports do not match the deterministic ownership order");
  }
  for (const legacyFile of ["global.css", "opengate-theme.css"]) {
    if (fs.existsSync(path.join(stylesDir, legacyFile))) {
      throw new Error(`retired stylesheet still exists: ${legacyFile}`);
    }
  }
  const expectedStyleFiles = new Set(["app.css", ...selectorFiles]);
  const actualStyleFiles = fs
    .readdirSync(stylesDir)
    .filter((file) => file.endsWith(".css"))
    .sort();
  if (actualStyleFiles.join("\n") !== [...expectedStyleFiles].sort().join("\n")) {
    throw new Error("styles directory contains an unowned or missing stylesheet");
  }
  const seen = new Map();
  for (const file of selectorFiles) {
    const filePath = path.join(stylesDir, file);
    const source = fs.readFileSync(filePath, "utf8");
    const normalizedSource = source.replace(/^\uFEFF/, "").trimStart();
    const header = normalizedSource.match(/^\/\*[\s\S]*?\*\//)?.[0] ?? "";
    if (!header || !/ownership/i.test(header)) {
      throw new Error(`${file} must declare its stylesheet ownership`);
    }
    if (containsCssImport(source)) {
      throw new Error(`${file} must not import another stylesheet`);
    }
    for (const selector of topLevelSelectors(source)) {
      const normalized = normalizeSelector(selector);
      const prior = seen.get(normalized);
      if (prior && prior !== file) {
        throw new Error(`selector ${normalized} is owned by both ${prior} and ${file}`);
      }
      seen.set(normalized, file);
    }
  }
  return { modules: ownedFiles.length, selectorFiles: selectorFiles.length, selectors: seen.size };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = checkStyleOwnership();
  console.log(
    `Style ownership OK: ${result.modules} owned modules, ${result.selectors} top-level selectors.`
  );
}
