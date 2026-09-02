/* eslint-disable no-undef */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesIn(path)));
    else if (/\.(?:js|css|html)$/.test(entry.name)) files.push(path);
  }
  return files;
}

const files = await filesIn(fileURLToPath(new URL("../dist", import.meta.url)));
const output = (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");
if (!output.includes("modelContext") || !output.includes("registerTool")) {
  throw new Error("The production bundle does not contain the real WebMCP registration path.");
}
if (output.includes("__OPENSKETCH_SEMANTIC__")) {
  throw new Error(
    "The development-only OpenSketch semantic introspection global shipped in production."
  );
}
console.log(`WebMCP production guard passed (${files.length} bundle files).`);
