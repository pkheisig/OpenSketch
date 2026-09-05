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
const editorCorePackage = await readJson(join(repositoryRoot, "packages/editor-core/package.json"));
const reactPackage = await readJson(join(repositoryRoot, "apps/web/node_modules/react/package.json"));
const reactDomPackage = await readJson(join(repositoryRoot, "apps/web/node_modules/react-dom/package.json"));
const editorCoreSource = await readFile(join(repositoryRoot, "packages/editor-core/src/index.ts"), "utf8");
const formatSource = await readFile(join(repositoryRoot, "packages/editor-core/src/types.ts"), "utf8");
const hostServicesSource = await readFile(join(repositoryRoot, "apps/web/src/application/hostServices.ts"), "utf8");
const errors = [];
const sourceContracts = {
  version: sourceConstant(hostServicesSource, "OPENSKETCH_APPLICATION_VERSION"),
  application: sourceConstant(hostServicesSource, "OPENSKETCH_APPLICATION_CONTRACT_VERSION"),
  openSuite: sourceConstant(hostServicesSource, "OPENSKETCH_OPEN_SUITE_CONTRACT_VERSION"),
  react: sourceConstant(hostServicesSource, "OPENSKETCH_REACT_VERSION_RANGE"),
  reactDom: sourceConstant(hostServicesSource, "OPENSKETCH_REACT_DOM_VERSION_RANGE")
};

if (moduleManifest.schemaVersion !== 1) errors.push("module manifest schemaVersion must equal 1");
if (moduleManifest.id !== "opensketch") errors.push("module manifest id must be opensketch");
if (moduleManifest.version !== packageJson.version) errors.push("module version differs from package version");
if (sourceContracts.version !== packageJson.version) errors.push("runtime module version differs from package version");
if (!/^[0-9a-f]{40}$/.test(moduleManifest.sourceSha || "")) errors.push("sourceSha must be a 40-character SHA");
if (releaseAttestation.sourceSha !== moduleManifest.sourceSha) errors.push("attestation source SHA differs");
if (releaseAttestation.dirty !== false) errors.push("release attestation must record a clean source tree");
if (releaseAttestation.releaseArtifactsAreImmutable !== true) {
  errors.push("release artifacts must be attested as immutable");
}
if (releaseAttestation.mutableRefsAllowed !== false) errors.push("mutable refs must be rejected");
for (const field of ["entry", "stylesheetEntry", "assetManifestEntry"]) {
  if (!isSafeReleasePath(moduleManifest[field])) errors.push(`${field} must be a safe relative release path`);
}
if (moduleManifest.editorCore?.packageName !== "@workspace/editor-core") {
  errors.push("editor-core package identity is missing");
}
if (moduleManifest.editorCore?.version !== editorCorePackage.version) {
  errors.push("release editor-core version differs from package version");
}
if (moduleManifest.editorCore?.version !== sourceConstant(editorCoreSource, "EDITOR_CORE_VERSION")) {
  errors.push("release editor-core version differs from source version");
}
if (moduleManifest.editorCore?.projectFormatVersion !== Number(sourceConstant(formatSource, "OpenSketch_FORMAT_VERSION"))) {
  errors.push("release project format differs from editor-core source");
}
if (moduleManifest.applicationContractVersion !== sourceContracts.application) {
  errors.push("release application contract differs from source");
}
if (moduleManifest.openSuiteContractVersion !== sourceContracts.openSuite) {
  errors.push("release OpenSuite contract differs from source");
}
for (const [name, expected] of Object.entries({
  react: sourceContracts.react,
  "react-dom": sourceContracts.reactDom
})) {
  if (moduleManifest.peerDependencies?.[name] !== expected) {
    errors.push(`release ${name} peer range differs from source`);
  }
  if (moduleManifest.compatibility?.[name] !== expected) {
    errors.push(`release ${name} compatibility range differs from source`);
  }
}
if (moduleManifest.compatibility?.moduleContractVersion !== sourceContracts.application) {
  errors.push("release module contract differs from source");
}
if (moduleManifest.compatibility?.openSuiteContractVersion !== sourceContracts.openSuite) {
  errors.push("release compatibility OpenSuite contract differs from source");
}
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
for (const family of assetManifest.families || []) {
  for (const variant of family.variants || []) {
    for (const field of ["assetPath", "thumbnailPath"]) {
      if (typeof variant[field] !== "string" || variant[field].startsWith("/")) {
        errors.push(`release asset manifest contains a server-root-absolute ${field}`);
      }
    }
  }
}
if (packageManifest.exports?.["."] !== moduleManifest.entry) {
  errors.push("package main export must match the release entry");
}
for (const [name, expected] of Object.entries({
  react: sourceContracts.react,
  "react-dom": sourceContracts.reactDom
})) {
  if (packageManifest.peerDependencies?.[name] !== expected) {
    errors.push(`${name} must remain an external peer dependency`);
  }
}
const sbom = await readJson(join(releaseRoot, "sbom.cdx.json"));
if (sbom.bomFormat !== "CycloneDX" || sbom.specVersion !== "1.5") {
  errors.push("release SBOM must be CycloneDX 1.5");
}
for (const name of ["@workspace/editor-core", "react", "react-dom"]) {
  if (!sbom.components?.some((component) => component.name === name)) {
    errors.push(`release SBOM is missing ${name}`);
  }
}
for (const [name, expected] of Object.entries({
  react: reactPackage.version,
  "react-dom": reactDomPackage.version
})) {
  const component = sbom.components?.find((candidate) => candidate.name === name);
  if (component?.version !== expected || !/^\d+\.\d+\.\d+(?:[-+].*)?$/.test(component?.version || "")) {
    errors.push(`release SBOM must contain the resolved ${name} version`);
  }
}
if (packageManifest.types !== "./module/opensketch-module.d.ts") {
  errors.push("package must publish the module TypeScript declaration");
}
try {
  await stat(join(releaseRoot, "module/opensketch-module.d.ts"));
} catch {
  errors.push("module TypeScript declaration is missing");
}
const moduleTypes = await readFile(join(releaseRoot, "module/opensketch-module.d.ts"), "utf8");
for (const service of [
  'export type CanvasUnit = "px" | "mm" | "in";',
  "export interface CanvasSettings {",
  "canvas: CanvasSettings;",
  "projects: ProjectRepository;",
  "importedMedia: ImportedMediaRepository;",
  "templates: AssetTemplateRepository;",
  "files: ProjectFileService;",
  "exports: ExportDeliveryService;",
  "assets: AssetService;",
  "preferences: PreferenceService;",
  "navigation: NavigationService;",
  "dialogs: DialogService;",
  "clipboard: ClipboardService;",
  "pwa: PwaService;",
  "fonts: FontService;",
  "clock: ClockService;"
]) {
  if (!moduleTypes.includes(service)) errors.push(`published host-services declaration is missing ${service}`);
}

const moduleFiles = moduleManifest.moduleFiles || [];
const moduleJavaScript = [];
for (const moduleFile of moduleFiles) {
  const modulePath = join(releaseRoot, "module", moduleFile);
  if (/(^|\/)(nih-bioart|scidraw|organism-library|bioicons)(?:-|\/|$)/.test(moduleFile)) {
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
const externalReactSpecifiers = new Set();
for (const match of moduleSource.matchAll(/\bfrom\s+["']((?:react|react-dom)(?:\/[^"']+)?)['"]/g)) {
  externalReactSpecifiers.add(match[1]);
}
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
if (/\bcreateRoot\s*\(|\bStrictMode\b/.test(fixture)) errors.push("consumer fixture must let the module host own the mount root");
if (!importMap.imports?.["@opensketch/application-module"]) errors.push("consumer fixture has no packaged module import map");
for (const specifier of externalReactSpecifiers) {
  if (!importMap.imports?.[specifier]) errors.push(`consumer import map is missing ${specifier}`);
}

if (errors.length > 0) {
  throw new Error(`OpenSketch module release check failed:\n- ${errors.join("\n- ")}`);
}
console.log(`OpenSketch module release ${moduleManifest.version} passed integrity, lazy-loading, and packaged-consumer checks.`);

function isSafeReleasePath(value) {
  return typeof value === "string" && value.startsWith("./") && !value.includes("..") && !value.includes("\\");
}

function sourceConstant(source, name) {
  const match = source.match(new RegExp(`export const ${name} = ([^;]+);`));
  if (!match) return "";
  const value = match[1].trim().replace(/\s+as const$/, "");
  return value.replace(/^(["'])(.*)\1$/, "$2");
}

async function hash(path) {
  await stat(path);
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}
