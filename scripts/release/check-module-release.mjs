/* global URL, console */

import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const packageJson = JSON.parse(await readFile(join(repositoryRoot, "apps/web/package.json"), "utf8"));
const releaseRoot = join(repositoryRoot, "dist/releases/opensketch", packageJson.version);
const moduleManifest = await readJson(join(releaseRoot, "module-manifest.json"));
const releaseAttestation = await readJson(join(releaseRoot, "release-attestation.json"));
const packageManifest = await readJson(join(releaseRoot, "package.json"));
const errors = [];

if (moduleManifest.schemaVersion !== 1) errors.push("module manifest schemaVersion must equal 1");
if (moduleManifest.id !== "opensketch") errors.push("module manifest id must be opensketch");
if (moduleManifest.version !== packageJson.version) errors.push("module version differs from package version");
if (!/^[0-9a-f]{40}$/.test(moduleManifest.sourceSha || "")) errors.push("sourceSha must be a 40-character SHA");
if (releaseAttestation.sourceSha !== moduleManifest.sourceSha) errors.push("attestation source SHA differs");
if (releaseAttestation.mutableRefsAllowed !== false) errors.push("mutable refs must be rejected");
for (const field of ["entry", "stylesheetEntry", "assetManifestEntry"]) {
  if (!isSafeReleasePath(moduleManifest[field])) errors.push(`${field} must be a safe relative release path`);
}
if (moduleManifest.editorCore?.packageName !== "@workspace/editor-core") {
  errors.push("editor-core package identity is missing");
}
if (!moduleManifest.editorCore?.version) errors.push("editor-core version is missing");
if (moduleManifest.lazyLoading?.fullAssetLibraryIsNotAppShell !== true) {
  errors.push("full asset library must remain outside the app shell");
}

for (const [path, expected] of Object.entries(moduleManifest.artifacts || {})) {
  const actual = await hash(join(releaseRoot, path));
  if (actual !== expected) errors.push(`${path} failed its declared SHA-256`);
}

const assetManifest = await readJson(join(releaseRoot, moduleManifest.assetManifestEntry));
if (!Array.isArray(assetManifest.families) || assetManifest.families.length === 0) {
  errors.push("asset manifest has no families");
}
if (packageManifest.exports?.["."] !== moduleManifest.entry) {
  errors.push("package main export must match the release entry");
}
if (packageManifest.peerDependencies?.react !== "^19.0.0") {
  errors.push("React must remain an external peer dependency");
}
if (packageManifest.types !== "./module/opensketch-module.d.ts") {
  errors.push("package must publish the module TypeScript declaration");
}
try {
  await stat(join(releaseRoot, "module/opensketch-module.d.ts"));
} catch {
  errors.push("module TypeScript declaration is missing");
}

const moduleFiles = moduleManifest.moduleFiles || [];
const moduleJavaScript = [];
for (const moduleFile of moduleFiles) {
  const modulePath = join(releaseRoot, "module", moduleFile);
  if (/(^|\/)(nih-bioart|scidraw|organism-library|bioicons)(\/|$)/.test(moduleFile)) {
    errors.push(`module bundle contains scientific asset payload: ${moduleFile}`);
  }
  try {
    await stat(modulePath);
    if (moduleFile.endsWith(".js")) moduleJavaScript.push(await readFile(modulePath, "utf8"));
  } catch {
    errors.push(`declared module file is missing: ${moduleFile}`);
  }
}
const moduleSource = moduleJavaScript.join("\n");
if (!/from\s+["']react(?:\/[^"']+)?["']/.test(moduleSource)) {
  errors.push("module bundle does not retain an external React import");
}
if (moduleSource.includes("virtual:pwa-register") || moduleSource.includes("registerSW")) {
  errors.push("module bundle must not own standalone PWA registration");
}

const checksumText = await readFile(join(releaseRoot, "SHA256SUMS"), "utf8");
for (const line of checksumText.trim().split("\n")) {
  const match = line.match(/^([0-9a-f]{64}) {2}(.+)$/);
  if (!match) {
    errors.push(`invalid checksum line: ${line}`);
    continue;
  }
  const actual = await hash(join(releaseRoot, match[2]));
  if (actual !== match[1]) errors.push(`checksum mismatch: ${match[2]}`);
}

const fixture = await readFile(join(repositoryRoot, "fixtures/module-consumer/consumer.tsx"), "utf8");
const importMap = await readJson(join(repositoryRoot, "fixtures/module-consumer/importmap.json"));
if (!fixture.includes("@opensketch/application-module")) errors.push("consumer fixture does not import the release package");
if (fixture.includes("apps/web") || fixture.includes("../../apps")) errors.push("consumer fixture imports workspace source");
if (!importMap.imports?.["@opensketch/application-module"]) errors.push("consumer fixture has no packaged module import map");

if (errors.length > 0) {
  throw new Error(`OpenSketch module release check failed:\n- ${errors.join("\n- ")}`);
}
console.log(`OpenSketch module release ${moduleManifest.version} passed integrity, lazy-loading, and packaged-consumer checks.`);

function isSafeReleasePath(value) {
  return typeof value === "string" && value.startsWith("./") && !value.includes("..") && !value.includes("\\");
}

async function hash(path) {
  await stat(path);
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}
