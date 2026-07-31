import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AssetFamily, AssetLicense } from "../../packages/editor-core/src/types";
import { categoryForBioIconsAsset } from "./open-taxonomy";
import { fetchWithRetry, mapLimit, sha256 } from "./io";
import { storeOpenAsset } from "./open-asset-storage";
import { ROOT } from "./paths";

export const BIOICONS_COMMIT = "d29e766ea7580b8063c4f47b29e872db40a4d979";
const BIOICONS_ARCHIVE_URL = `https://codeload.github.com/duerrsimon/bioicons/tar.gz/${BIOICONS_COMMIT}`;
const BIOICONS_ASSET_DIR = path.join(ROOT, "apps/web/public/assets/bioicons");
const BIOICONS_THUMB_DIR = path.join(ROOT, "apps/web/public/assets/bioicons-thumbnails");
const BIOICONS_NOTICES = path.join(ROOT, "apps/web/public/assets/BIOICONS-NOTICES.txt");

const LICENSES: Record<string, { license: AssetLicense; url: string; label: string }> = {
  "cc-0": {
    license: "CC0-1.0",
    url: "https://creativecommons.org/publicdomain/zero/1.0/",
    label: "CC0 1.0"
  },
  "cc-by-3.0": {
    license: "CC-BY-3.0",
    url: "https://creativecommons.org/licenses/by/3.0/",
    label: "CC BY 3.0"
  },
  "cc-by-4.0": {
    license: "CC-BY-4.0",
    url: "https://creativecommons.org/licenses/by/4.0/",
    label: "CC BY 4.0"
  },
  "cc-by-sa-3.0": {
    license: "CC-BY-SA-3.0",
    url: "https://creativecommons.org/licenses/by-sa/3.0/",
    label: "CC BY-SA 3.0"
  },
  "cc-by-sa-4.0": {
    license: "CC-BY-SA-4.0",
    url: "https://creativecommons.org/licenses/by-sa/4.0/",
    label: "CC BY-SA 4.0"
  },
  mit: {
    license: "MIT",
    url: "https://opensource.org/license/mit",
    label: "MIT"
  },
  bsd: {
    license: "BSD-3-Clause",
    url: "https://opensource.org/license/bsd-3-clause",
    label: "BSD 3-Clause"
  }
};

const ATTRIBUTION_OVERRIDES: Record<
  string,
  { authorDirectory: string; sourceCategory: string; filename: string }
> = {
  "cc-by-4.0/General_items/scientific-article.svg": {
    authorDirectory: "Geomicrobio",
    sourceCategory: "General_items",
    filename: "scientific-article.svg"
  }
};

export interface BioIconsImportFailure {
  source: string;
  title: string;
  error: string;
}

export interface BioIconsImportResult {
  families: AssetFamily[];
  failures: BioIconsImportFailure[];
  commit: string;
  discoveredSvgFiles: number;
  excludedWithoutAttribution: number;
}

interface BioIconsFile {
  absolutePath: string;
  relativePath: string;
  licenseDirectory: string;
  sourceCategory: string;
  authorDirectory: string;
  filename: string;
}

const MIT_LICENSE = `MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

const BSD_LICENSE = `BSD 3-Clause License

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice,
   this list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.
3. Neither the name of the copyright holder nor the names of its contributors
   may be used to endorse or promote products derived from this software
   without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
POSSIBILITY OF SUCH DAMAGE.`;

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String(error.message);
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function titleFromFilename(filename: string): string {
  return filename
    .replace(/(?:\.drawio)?\.svg$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function humanize(value: string): string {
  return value.replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

function legacyNumericId(key: string): number {
  return 2_000_000_000 + Number.parseInt(sha256(key).slice(0, 7), 16);
}

async function collectSvgFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return collectSvgFiles(entryPath);
      return entry.isFile() && entry.name.toLowerCase().endsWith(".svg") ? [entryPath] : [];
    })
  );
  return nested.flat();
}

function describeBioIconsFile(iconsRoot: string, absolutePath: string): BioIconsFile | null {
  const relativePath = path.relative(iconsRoot, absolutePath).split(path.sep).join("/");
  const segments = relativePath.split("/");
  const attributionOverride = ATTRIBUTION_OVERRIDES[relativePath];
  if (attributionOverride && LICENSES[segments[0]]) {
    return {
      absolutePath,
      relativePath,
      licenseDirectory: segments[0],
      ...attributionOverride
    };
  }
  if (segments.length !== 4 || !LICENSES[segments[0]]) return null;
  return {
    absolutePath,
    relativePath,
    licenseDirectory: segments[0],
    sourceCategory: segments[1],
    authorDirectory: segments[2],
    filename: segments[3]
  };
}

async function writeBioIconsNotices(files: BioIconsFile[]): Promise<void> {
  const authors = (license: string) =>
    [
      ...new Set(
        files
          .filter((file) => file.licenseDirectory === license)
          .map((file) => humanize(file.authorDirectory))
      )
    ].sort((a, b) => a.localeCompare(b));
  const copyrightLines = (license: string) =>
    authors(license)
      .map((author) => `Copyright 2020 ${author}`)
      .join("\n");
  const text = `BioIcons third-party artwork notices
=======================================

Catalog: https://bioicons.com/
Source: https://github.com/duerrsimon/bioicons
Pinned commit: ${BIOICONS_COMMIT}

Each SVG retains the license encoded in its source path and recorded in
OpenSketch's generated asset manifest. The source path, author, license name,
license URL, and modification notice are embedded in figure provenance when
an asset is used. The legacy scientific-article.svg path omits its author
segment; its Geomicrobio attribution is resolved from the BioIcons submission
record and authors.json registry.

Creative Commons licenses represented in this bundle:
- CC0 1.0: https://creativecommons.org/publicdomain/zero/1.0/
- CC BY 3.0: https://creativecommons.org/licenses/by/3.0/
- CC BY 4.0: https://creativecommons.org/licenses/by/4.0/
- CC BY-SA 3.0: https://creativecommons.org/licenses/by-sa/3.0/
- CC BY-SA 4.0: https://creativecommons.org/licenses/by-sa/4.0/

MIT-licensed BioIcons authors
-----------------------------
${copyrightLines("mit")}

${MIT_LICENSE}

BSD-3-Clause-licensed BioIcons authors
--------------------------------------
${copyrightLines("bsd")}

${BSD_LICENSE}
`;
  await writeFile(BIOICONS_NOTICES, text, "utf8");
}

export async function writeBioIconsNoticesForRepository(repositoryRoot: string): Promise<void> {
  const iconsRoot = path.join(repositoryRoot, "static/icons");
  const files = (await collectSvgFiles(iconsRoot)).flatMap(
    (absolutePath) => describeBioIconsFile(iconsRoot, absolutePath) ?? []
  );
  await writeBioIconsNotices(files);
}

async function unpackBioIcons(): Promise<{ temporaryDirectory: string; repositoryRoot: string }> {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "opensketch-bioicons-"));
  const archivePath = path.join(temporaryDirectory, "bioicons.tar.gz");
  const response = await fetchWithRetry(
    BIOICONS_ARCHIVE_URL,
    { signal: AbortSignal.timeout(180_000) },
    3
  );
  await writeFile(archivePath, Buffer.from(await response.arrayBuffer()));
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  await promisify(execFile)("tar", ["-xzf", archivePath, "-C", temporaryDirectory], {
    timeout: 180_000
  });
  const repositoryRoot = path.join(temporaryDirectory, `bioicons-${BIOICONS_COMMIT}`);
  if (!(await stat(repositoryRoot)).isDirectory()) {
    throw new Error("BioIcons archive did not contain the expected repository root.");
  }
  return { temporaryDirectory, repositoryRoot };
}

export async function importBioIcons(sourceRepository?: string): Promise<BioIconsImportResult> {
  const unpacked = sourceRepository ? null : await unpackBioIcons();
  const repositoryRoot = sourceRepository ?? unpacked?.repositoryRoot;
  if (!repositoryRoot) throw new Error("BioIcons source repository is unavailable.");
  try {
    const iconsRoot = path.join(repositoryRoot, "static/icons");
    const authors = JSON.parse(
      await readFile(path.join(iconsRoot, "authors.json"), "utf8")
    ) as Record<string, string>;
    const authorsByKey = new Map(
      Object.entries(authors).map(([name, url]) => [
        name.toLowerCase().replace(/[_\s]+/g, " "),
        { name, url }
      ])
    );
    const allFiles = await collectSvgFiles(iconsRoot);
    const files: BioIconsFile[] = [];
    let excludedWithoutAttribution = 0;
    for (const absolutePath of allFiles) {
      const file = describeBioIconsFile(iconsRoot, absolutePath);
      if (!file) {
        excludedWithoutAttribution += 1;
        continue;
      }
      files.push(file);
    }
    await writeBioIconsNotices(files);

    await Promise.all(
      [BIOICONS_ASSET_DIR, BIOICONS_THUMB_DIR].map(async (directory) => {
        await rm(directory, { recursive: true, force: true });
        await mkdir(directory, { recursive: true });
      })
    );
    const importFile = async (file: BioIconsFile): Promise<AssetFamily> => {
      const title = titleFromFilename(file.filename);
      const licenseMetadata = LICENSES[file.licenseDirectory];
      const authorKey = humanize(file.authorDirectory).toLowerCase().replace(/\s+/g, " ");
      const authorMetadata = authorsByKey.get(authorKey);
      const author = authorMetadata?.name ?? humanize(file.authorDirectory);
      if (!author) throw new Error("The SVG has no attributable author.");
      const familyId = `bioicons-${slugify(title)}-${sha256(file.relativePath).slice(0, 8)}`;
      const source = await readFile(file.absolutePath, "utf8");
      if (!source.trim()) throw new Error("The upstream SVG file is empty.");
      const stored = await storeOpenAsset(source, familyId, BIOICONS_ASSET_DIR, BIOICONS_THUMB_DIR);
      const sourceCategory = humanize(file.sourceCategory);
      const category = categoryForBioIconsAsset({
        name: title,
        sourceCategory: file.sourceCategory
      });
      const sourcePage = `https://github.com/duerrsimon/bioicons/blob/${BIOICONS_COMMIT}/static/icons/${file.relativePath
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`;
      const authorReference = authorMetadata?.url ? ` (${authorMetadata.url})` : "";
      const changed = licenseMetadata.license.startsWith("CC-BY")
        ? "; adapted for secure offline delivery by OpenSketch"
        : "";
      return {
        familyId,
        bioartEntryId: legacyNumericId(file.relativePath),
        title,
        description: `Editable ${sourceCategory.toLowerCase()} illustration from BioIcons.`,
        category,
        keywords: [
          title,
          sourceCategory,
          category,
          author,
          "BioIcons",
          ...(author.toLowerCase() === "servier" ? ["Servier Medical Art"] : [])
        ],
        author,
        credit: `"${title}" by ${author}${authorReference}; BioIcons; ${licenseMetadata.label}${changed}`,
        license: licenseMetadata.license,
        licenseUrl: licenseMetadata.url,
        sourceName:
          author.toLowerCase() === "servier" ? "BioIcons / Servier Medical Art" : "BioIcons",
        sourcePage,
        defaultVariantId: familyId,
        variants: [{ id: familyId, ...stored }]
      } satisfies AssetFamily;
    };
    const attempts = await mapLimit(
      files.sort((a, b) => a.relativePath.localeCompare(b.relativePath)),
      12,
      async (file) => {
        try {
          return { file, family: await importFile(file), error: null };
        } catch (error) {
          return { file, family: null, error };
        }
      }
    );
    const imported: AssetFamily[] = [];
    const failures: BioIconsImportFailure[] = [];
    for (const attempt of attempts) {
      if (attempt.family) {
        imported.push(attempt.family);
        continue;
      }
      try {
        imported.push(await importFile(attempt.file));
      } catch (retryError) {
        failures.push({
          source: "BioIcons",
          title: titleFromFilename(attempt.file.filename),
          error: errorMessage(retryError)
        });
      }
    }
    return {
      families: imported,
      failures,
      commit: BIOICONS_COMMIT,
      discoveredSvgFiles: allFiles.length,
      excludedWithoutAttribution
    };
  } finally {
    if (unpacked) await rm(unpacked.temporaryDirectory, { recursive: true, force: true });
  }
}
