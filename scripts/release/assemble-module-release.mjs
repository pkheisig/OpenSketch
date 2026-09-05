/* global URL, console, process */

import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const distRoot = join(repositoryRoot, "dist");
const moduleBuild = join(distRoot, "module");
const pwaBuild = join(distRoot, "release-pwa");
const appPackage = JSON.parse(await readFile(join(repositoryRoot, "apps/web/package.json"), "utf8"));
const editorCorePackage = JSON.parse(
  await readFile(join(repositoryRoot, "packages/editor-core/package.json"), "utf8")
);
const reactPackage = JSON.parse(
  await readFile(join(repositoryRoot, "apps/web/node_modules/react/package.json"), "utf8")
);
const reactDomPackage = JSON.parse(
  await readFile(join(repositoryRoot, "apps/web/node_modules/react-dom/package.json"), "utf8")
);
const version = appPackage.version;
const sourceSha = runGit(["rev-parse", "HEAD"]);
const editorCoreSource = await readFile(
  join(repositoryRoot, "packages/editor-core/src/index.ts"),
  "utf8"
);
const formatSource = await readFile(join(repositoryRoot, "packages/editor-core/src/types.ts"), "utf8");
const hostServicesSource = await readFile(
  join(repositoryRoot, "apps/web/src/application/hostServices.ts"),
  "utf8"
);
const editorCoreVersion = sourceConstant(editorCoreSource, "EDITOR_CORE_VERSION");
const projectFormatVersion = Number(sourceConstant(formatSource, "OpenSketch_FORMAT_VERSION"));
const applicationContractVersion = sourceConstant(
  hostServicesSource,
  "OPENSKETCH_APPLICATION_CONTRACT_VERSION"
);
const openSuiteContractVersion = sourceConstant(
  hostServicesSource,
  "OPENSKETCH_OPEN_SUITE_CONTRACT_VERSION"
);
const reactVersionRange = sourceConstant(hostServicesSource, "OPENSKETCH_REACT_VERSION_RANGE");
const reactDomVersionRange = sourceConstant(
  hostServicesSource,
  "OPENSKETCH_REACT_DOM_VERSION_RANGE"
);
const sourceStatus = runGit(["status", "--porcelain", "--untracked-files=all"]);
const dirty = !isCleanGit(sourceStatus);
const sourceStatusSha256 = hashText(sourceStatus);

if (editorCoreVersion !== editorCorePackage.version) {
  throw new Error("editor-core package and source versions differ.");
}
if (!Number.isInteger(projectFormatVersion)) throw new Error("The editor-core project format is invalid.");

if (!/^[0-9a-f]{40}$/.test(sourceSha)) throw new Error("The release source SHA is invalid.");
if (!process.env.OPENSKETCH_ALLOW_DIRTY_RELEASE && dirty) {
  throw new Error("Refusing to assemble a release from a dirty worktree.");
}

for (const required of [moduleBuild, pwaBuild]) {
  if (!(await exists(required))) throw new Error(`Missing build output: ${required}`);
}

const releaseRoot = join(distRoot, "releases", "opensketch", version);
await rm(releaseRoot, { recursive: true, force: true });
await mkdir(releaseRoot, { recursive: true });
await cp(moduleBuild, join(releaseRoot, "module"), { recursive: true });
await cp(pwaBuild, join(releaseRoot, "pwa"), { recursive: true });
await cp(join(repositoryRoot, "apps/web/public/assets"), join(releaseRoot, "assets"), {
  recursive: true
});
await cp(
  join(repositoryRoot, "apps/web/public/THIRD_PARTY_NOTICES.txt"),
  join(releaseRoot, "THIRD_PARTY_NOTICES.txt")
);

const assetManifest = join(releaseRoot, "assets/manifest.json");
const manifestResult = spawnSync(
  "pnpm",
  ["exec", "tsx", "scripts/release/write-asset-manifest.ts", assetManifest],
  { cwd: repositoryRoot, stdio: "inherit" }
);
if (manifestResult.status !== 0) throw new Error("Could not assemble the versioned asset manifest.");
const typesResult = spawnSync(
  "node",
  ["scripts/release/write-module-types.mjs", join(releaseRoot, "module/opensketch-module.d.ts")],
  { cwd: repositoryRoot, stdio: "inherit" }
);
if (typesResult.status !== 0) throw new Error("Could not assemble TypeScript declarations.");

const moduleEntry = `module/opensketch-module.js`;
const moduleStylesheet = `module/opensketch-module.css`;
const assetManifestPath = `assets/manifest.json`;
const sbomPath = "sbom.cdx.json";
const moduleFiles = await filesUnder(join(releaseRoot, "module"));
const peerDependencies = {
  react: reactVersionRange,
  "react-dom": reactDomVersionRange
};
const sbom = {
  bomFormat: "CycloneDX",
  specVersion: "1.5",
  version: 1,
  metadata: {
    component: {
      type: "application",
      name: "@opensketch/application-module",
      version
    }
  },
  components: [
    { type: "library", name: "@workspace/editor-core", version: editorCoreVersion },
    { type: "library", name: "react", version: reactPackage.version, scope: "required" },
    { type: "library", name: "react-dom", version: reactDomPackage.version, scope: "required" }
  ]
};
await writeJson(join(releaseRoot, sbomPath), sbom);

const artifactFiles = [
  moduleEntry,
  moduleStylesheet,
  assetManifestPath,
  sbomPath,
  "THIRD_PARTY_NOTICES.txt"
];
const artifactHashes = {};
for (const file of artifactFiles) artifactHashes[file] = await sha256(join(releaseRoot, file));

const moduleManifest = {
  schemaVersion: 1,
  id: "opensketch",
  displayName: "OpenSketch",
  version,
  sourceSha,
  applicationContractVersion,
  openSuiteContractVersion,
  entry: `./${moduleEntry}`,
  stylesheetEntry: `./${moduleStylesheet}`,
  assetManifestEntry: `./${assetManifestPath}`,
  editorCore: {
    packageName: "@workspace/editor-core",
    version: editorCoreVersion,
    projectFormatVersion
  },
  peerDependencies,
  compatibility: {
    projectFormatVersion,
    moduleContractVersion: applicationContractVersion,
    openSuiteContractVersion,
    react: reactVersionRange,
    "react-dom": reactDomVersionRange
  },
  lazyLoading: {
    moduleEntry: `./${moduleEntry}`,
    scientificAssetPayload: `./${assetManifestPath}`,
    fullAssetLibraryIsNotAppShell: true
  },
  moduleFiles,
  artifacts: artifactHashes
};
await writeJson(join(releaseRoot, "module-manifest.json"), moduleManifest);

const packageManifest = {
  name: "@opensketch/application-module",
  version,
  description: "Versioned OpenSketch application module for qualified hosts.",
  type: "module",
  license: "AGPL-3.0-only",
  main: `./${moduleEntry}`,
  types: "./module/opensketch-module.d.ts",
  exports: {
    ".": `./${moduleEntry}`,
    "./manifest": "./module-manifest.json",
    "./style.css": `./${moduleStylesheet}`,
    "./assets/manifest.json": `./${assetManifestPath}`
  },
  peerDependencies: moduleManifest.peerDependencies,
  files: [
    "module",
    "assets",
    "pwa",
    "module-manifest.json",
    "sbom.cdx.json",
    "THIRD_PARTY_NOTICES.txt"
  ]
};
await writeJson(join(releaseRoot, "package.json"), packageManifest);

const moduleManifestSha256 = await sha256(join(releaseRoot, "module-manifest.json"));
await writeJson(join(releaseRoot, "release-attestation.json"), {
  schemaVersion: 1,
  moduleId: "opensketch",
  version,
  sourceSha,
  moduleManifestSha256,
  editorCoreVersion,
  projectFormatVersion,
  dirty,
  sourceStatusSha256,
  releaseArtifactsAreImmutable: !dirty,
  mutableRefsAllowed: false,
  generatedBy: "scripts/release/assemble-module-release.mjs"
});

const allFiles = await filesUnder(releaseRoot);
const checksumLines = [];
for (const file of allFiles.filter((value) => value !== "SHA256SUMS")) {
  checksumLines.push(`${await sha256(join(releaseRoot, file))}  ${file}`);
}
checksumLines.sort((left, right) => left.localeCompare(right));
await writeFile(join(releaseRoot, "SHA256SUMS"), `${checksumLines.join("\n")}\n`, "utf8");
console.log(`Assembled OpenSketch ${version} release at ${relative(repositoryRoot, releaseRoot)}`);

function runGit(args) {
  const result = spawnSync("git", args, { cwd: repositoryRoot, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || `git ${args.join(" ")} failed`);
  return result.stdout.trim();
}

function isCleanGit(status = runGit(["status", "--porcelain", "--untracked-files=all"])) {
  const result = spawnSync("git", ["diff", "--quiet"], { cwd: repositoryRoot });
  const cached = spawnSync("git", ["diff", "--cached", "--quiet"], { cwd: repositoryRoot });
  return result.status === 0 && cached.status === 0 && !status.trim();
}

function sourceConstant(source, name) {
  const match = source.match(new RegExp(`export const ${name} = ([^;]+);`));
  if (!match) throw new Error(`Could not read ${name} from editor-core source.`);
  const value = match[1].trim().replace(/\s+as const$/, "");
  return value.replace(/^(["'])(.*)\1$/, "$2");
}

function hashText(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function exists(path) {
  try {
    await readdir(path);
    return true;
  } catch {
    return false;
  }
}

async function filesUnder(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesUnder(fullPath, relativePath)));
    else if (entry.isFile()) files.push(relativePath);
  }
  return files;
}

async function sha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
