import { migrateProject, type PortableProject, type ProjectRecord } from "@opensketch/editor-core";

export function downloadProject(project: ProjectRecord): void {
  const portable = structuredClone(project) as PortableProject & { thumbnail?: string };
  delete portable.thumbnail;
  const blob = new Blob([JSON.stringify(portable, null, 2)], {
    type: "application/vnd.opensketch+json"
  });
  downloadBlob(blob, `${safeFilename(project.name)}.opensketch`);
}

export async function readProjectFile(file: File): Promise<ProjectRecord> {
  if (file.size > 100 * 1024 * 1024) {
    throw new Error("This project is larger than the 100 MB safety limit.");
  }
  const migrated = migrateProject(JSON.parse(await file.text()));
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
      .slice(0, 80) || "opensketch-figure"
  );
}
