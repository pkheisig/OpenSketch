import {
  migrateProject,
  normalizeProjectMedia,
  PROJECT_STORAGE_LIMITS,
  type PortableProject,
  type ProjectRecord
} from "@workspace/editor-core";

interface WritableProjectFile {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
}

interface ProjectFileHandle {
  createWritable(): Promise<WritableProjectFile>;
}

interface ProjectDirectoryHandle {
  getFileHandle(name: string, options: { create: true }): Promise<ProjectFileHandle>;
}

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options: { mode: "readwrite" }) => Promise<ProjectDirectoryHandle>;
};

type ProjectLike = PortableProject | ProjectRecord;

function portableProject(project: ProjectLike): PortableProject {
  const media = normalizeProjectMedia(project.objects, project.uploads);
  const portable = {
    ...project,
    objects: media.objects,
    uploads: media.uploads
  } as PortableProject & {
    thumbnail?: string;
    folderId?: string;
    archivedAt?: string;
    revision?: number;
  };
  delete portable.thumbnail;
  delete portable.folderId;
  delete portable.archivedAt;
  delete portable.revision;
  return portable;
}

function serializedProject(project: ProjectLike): { value: string; bytes: number } {
  const value = JSON.stringify(portableProject(project), null, 2);
  return { value, bytes: new TextEncoder().encode(value).byteLength };
}

function assertSerializedProjectWithinBudget(bytes: number): void {
  if (bytes > PROJECT_STORAGE_LIMITS.maxPortableProjectBytes) {
    throw new Error(
      `This project is larger than the ${PROJECT_STORAGE_LIMITS.maxPortableProjectBytes / (1024 * 1024)} MiB portable-project limit.`
    );
  }
}

export function assertPortableProjectWithinBudget(project: ProjectLike): void {
  assertSerializedProjectWithinBudget(serializedProject(project).bytes);
}

export function serializedProjectBytes(project: ProjectLike): number {
  return serializedProject(project).bytes;
}

export function serializeProject(project: ProjectLike): string {
  const { value, bytes } = serializedProject(project);
  assertSerializedProjectWithinBudget(bytes);
  return value;
}

export function downloadProject(project: ProjectLike): void {
  const blob = new Blob([serializeProject(project)], {
    type: "application/vnd.OpenSketch+json"
  });
  downloadBlob(blob, `${safeFilename(project.name)}.OpenSketch`);
}

export function supportsProjectDirectory(): boolean {
  return typeof (window as DirectoryPickerWindow).showDirectoryPicker === "function";
}

export async function saveProjectToDirectory(project: ProjectLike): Promise<boolean> {
  const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
  if (!picker) {
    downloadProject(project);
    return false;
  }

  try {
    const directory = await picker({ mode: "readwrite" });
    const filename = `${safeFilename(project.name)}.OpenSketch`;
    const handle = await directory.getFileHandle(filename, { create: true });
    const writable = await handle.createWritable();
    await writable.write(
      new Blob([serializeProject(project)], {
        type: "application/vnd.OpenSketch+json"
      })
    );
    await writable.close();
    return true;
  } catch (reason) {
    if (reason instanceof DOMException && reason.name === "AbortError") return false;
    throw reason;
  }
}

function readFileText(file: File): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("The project file could not be read."));
    reader.readAsText(file);
  });
}

export async function readProjectFile(file: File): Promise<ProjectRecord> {
  if (file.size > PROJECT_STORAGE_LIMITS.maxPortableProjectBytes) {
    throw new Error("This project is larger than the 100 MiB portable-project limit.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFileText(file));
  } catch {
    throw new Error("The project file contains invalid JSON.");
  }
  const migrated = migrateProject(parsed);
  const imported: ProjectRecord = {
    ...migrated,
    id: crypto.randomUUID(),
    name: migrated.name,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    revision: 0
  };
  assertPortableProjectWithinBudget(imported);
  return imported;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFilename(value: string): string {
  return (
    value
      .trim()
      .replace(/[^a-z0-9._-]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "OpenSketch-figure"
  );
}
