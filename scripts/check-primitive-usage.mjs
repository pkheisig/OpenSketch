/* global process */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sourceRoot = path.join(root, "apps/web/src");
const errors = [];

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(entryPath);
    return /\.(?:tsx|ts)$/.test(entry.name) ? [entryPath] : [];
  });
}

for (const file of sourceFiles(sourceRoot)) {
  const source = fs.readFileSync(file, "utf8");
  if (!source.includes("createPortal(")) continue;
  if (!source.includes("useOpenSketchPortalRoot")) {
    errors.push(`${path.relative(root, file)} portals must use the themed OpenSketch portal root`);
  }
  if (/createPortal\([\s\S]{0,240},\s*document\.body\s*\)/.test(source)) {
    errors.push(`${path.relative(root, file)} contains a direct document.body portal target`);
  }
}

let diff = "";
try {
  diff = execFileSync("git", ["diff", "--unified=0", "origin/trunk", "--", "apps/web/src"], {
    cwd: root,
    encoding: "utf8"
  });
} catch {
  // Source checks remain useful in source archives without a remote ref.
}

const changedFiles = new Map();
let currentFile;
for (const line of diff.split(/\r?\n/)) {
  const fileMatch = line.match(/^\+\+\+ b\/(.+)$/);
  if (fileMatch) {
    currentFile = path.join(root, fileMatch[1]);
    continue;
  }
  if (!currentFile || !line.startsWith("+")) continue;
  const content = line.slice(1);
  if (/<(?:button|input|select|textarea|dialog)\b/.test(content)) {
    const entries = changedFiles.get(currentFile) ?? [];
    entries.push(content);
    changedFiles.set(currentFile, entries);
  }
}

for (const [file, addedLines] of changedFiles) {
  const source = fs.readFileSync(file, "utf8");
  for (const addedLine of addedLines) {
    const control = addedLine.match(/<(button|input|select|textarea|dialog)\b/);
    if (!control) continue;
    const sourceIndex = source.indexOf(addedLine);
    const openingTag = source.slice(sourceIndex, sourceIndex + 1200).split(">", 1)[0];
    if (
      !/\bclassName\s*=/.test(openingTag) &&
      !/\bdata-opensketch-primitive\s*=/.test(openingTag) &&
      !/\bdata-opensketch-canvas-extension\s*=/.test(openingTag)
    ) {
      errors.push(
        `${path.relative(root, file)} adds an unclassified ${control[1]}; use an approved class/primitive or document a canvas extension`
      );
    }
  }
}

if (errors.length) {
  process.stderr.write(`${errors.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("OpenSketch primitive and portal guardrails passed.\n");
}
