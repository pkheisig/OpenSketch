/* global console, process */

import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { URL, fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const outputRoot = await mkdtemp(join(tmpdir(), "opensketch-deployment-"));

function runBuild(publicBase) {
  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", ["build"], {
      cwd: repositoryRoot,
      env: { ...process.env, VITE_PUBLIC_BASE: publicBase },
      stdio: "inherit"
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`Build failed for ${publicBase}: ${signal ?? code}`));
    });
  });
}

function assertIncludes(contents, expected, label) {
  if (!contents.includes(expected)) throw new Error(`${label} is missing ${expected}`);
}

async function inspectBuild(publicBase, directory) {
  const index = await readFile(join(repositoryRoot, "dist/index.html"), "utf8");
  const manifest = await readFile(join(repositoryRoot, "dist/manifest.webmanifest"), "utf8");
  const serviceWorker = await readFile(join(repositoryRoot, "dist/sw.js"), "utf8");
  const parsedManifest = JSON.parse(manifest);

  assertIncludes(index, `href="${publicBase}favicon.svg"`, `${publicBase} index`);
  if (parsedManifest.scope !== publicBase || parsedManifest.start_url !== publicBase) {
    throw new Error(`${publicBase} manifest does not use the normalized base.`);
  }
  assertIncludes(serviceWorker, `${publicBase}index.html`, `${publicBase} service worker`);
  if (publicBase === "/" && serviceWorker.includes("/OpenSketch/")) {
    throw new Error("Root service worker contains a stale /OpenSketch/ path.");
  }
  await cp(join(repositoryRoot, "dist"), directory, { recursive: true });
}

try {
  for (const [name, publicBase] of [
    ["pages", "/OpenSketch/"],
    ["root", "/"]
  ]) {
    await runBuild(publicBase);
    await inspectBuild(publicBase, join(outputRoot, name));
  }
  console.log("Deployment builds passed for /OpenSketch/ and /.");
} finally {
  await rm(outputRoot, { recursive: true, force: true });
}
