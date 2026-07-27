import { migrateProject, type PortableProject, type ProjectRecord } from "@workspace/editor-core";

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

export function serializeProject(project: ProjectRecord): string {
  const portable = structuredClone(project) as PortableProject & {
    thumbnail?: string;
    folderId?: string;
    archivedAt?: string;
  };
  delete portable.thumbnail;
  delete portable.folderId;
  delete portable.archivedAt;
  return JSON.stringify(portable, null, 2);
}

export function downloadProject(project: ProjectRecord): void {
  const blob = new Blob([serializeProject(project)], {
    type: "application/vnd.OpenSketch+json"
  });
  downloadBlob(blob, `${safeFilename(project.name)}.OpenSketch`);
}

export function supportsProjectDirectory(): boolean {
  return typeof (window as DirectoryPickerWindow).showDirectoryPicker === "function";
}

export async function saveProjectToDirectory(project: ProjectRecord): Promise<boolean> {
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
  if (file.size > 100 * 1024 * 1024) {
    throw new Error("This project is larger than the 100 MB safety limit.");
  }
  const migrated = migrateProject(JSON.parse(await readFileText(file)));
  return {
    ...migrated,
    id: crypto.randomUUID(),
    name: migrated.name,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
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
