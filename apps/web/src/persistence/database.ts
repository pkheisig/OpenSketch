import Dexie, { type EntityTable } from "dexie";
import {
  OpenSketch_FORMAT_VERSION,
  DEFAULT_CANVAS,
  type ImportedMediaRecord,
  type ProjectFolderRecord,
  type ProjectRecord
} from "@workspace/editor-core";

export interface ImportedMediaLibraryRecord extends ImportedMediaRecord {
  createdAt: string;
  updatedAt: string;
  contentHash: string;
}

class OpenSketchDatabase extends Dexie {
  projects!: EntityTable<ProjectRecord, "id">;
  folders!: EntityTable<ProjectFolderRecord, "id">;
  imports!: EntityTable<ImportedMediaLibraryRecord, "id">;

  constructor() {
    super("OpenSketch");
    this.version(1).stores({
      projects: "id, updatedAt, name"
    });
    this.version(2).stores({
      projects: "id, updatedAt, name, archivedAt, folderId",
      folders: "id, updatedAt, name"
    });
    this.version(3).stores({
      projects: "id, updatedAt, name, archivedAt, folderId",
      folders: "id, updatedAt, name",
      imports: "id, updatedAt, name, mimeType, contentHash"
    });
  }
}

export const db = new OpenSketchDatabase();
export const IMPORT_LIBRARY_CHANGED_EVENT = "OpenSketch:import-library-changed";

async function importedMediaHash(media: ImportedMediaRecord): Promise<string> {
  const bytes = new TextEncoder().encode(`${media.mimeType}\0${media.dataUrl}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function notifyImportLibraryChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(IMPORT_LIBRARY_CHANGED_EVENT));
  }
}

export async function listImportedMedia(): Promise<ImportedMediaLibraryRecord[]> {
  return db.imports.orderBy("updatedAt").reverse().toArray();
}

export async function getImportedMedia(
  id: string
): Promise<ImportedMediaLibraryRecord | undefined> {
  return db.imports.get(id);
}

export async function saveImportedMedia(
  media: ImportedMediaRecord,
  timestamp = new Date().toISOString()
): Promise<ImportedMediaLibraryRecord> {
  const contentHash = await importedMediaHash(media);
  const matching = await db.imports.where("contentHash").equals(contentHash).first();
  const record: ImportedMediaLibraryRecord = matching
    ? { ...matching, name: media.name, updatedAt: timestamp }
    : {
        ...media,
        createdAt: timestamp,
        updatedAt: timestamp,
        contentHash
      };
  await db.imports.put(record);
  notifyImportLibraryChanged();
  return record;
}

export async function rememberProjectImports(
  imports: ImportedMediaRecord[],
  timestamp: string
): Promise<void> {
  for (const media of imports) {
    await saveImportedMedia(media, timestamp);
  }
}

export async function deleteImportedMedia(id: string): Promise<void> {
  await db.imports.delete(id);
  notifyImportLibraryChanged();
}

export function createProject(name = "Untitled figure"): ProjectRecord {
  const now = new Date().toISOString();
  return {
    format: "OpenSketch",
    formatVersion: OpenSketch_FORMAT_VERSION,
    id: crypto.randomUUID(),
    name,
    version: 1,
    createdAt: now,
    updatedAt: now,
    canvas: { ...DEFAULT_CANVAS },
    objects: { version: "7.0.0", objects: [] },
    uploads: [],
    usedAssetIds: []
  };
}

export async function listProjects(): Promise<ProjectRecord[]> {
  return db.projects.orderBy("updatedAt").reverse().toArray();
}

export async function listProjectFolders(): Promise<ProjectFolderRecord[]> {
  return db.folders.orderBy("updatedAt").reverse().toArray();
}

export async function saveProject(project: ProjectRecord): Promise<void> {
  await db.projects.put(project);
}

export async function createProjectFolder(name: string): Promise<ProjectFolderRecord> {
  const now = new Date().toISOString();
  const folder: ProjectFolderRecord = {
    id: crypto.randomUUID(),
    name,
    createdAt: now,
    updatedAt: now
  };
  await db.folders.put(folder);
  return folder;
}

export async function saveProjectFolder(folder: ProjectFolderRecord): Promise<void> {
  await db.folders.put(folder);
}

export async function moveProjectToFolder(
  project: ProjectRecord,
  folderId?: string
): Promise<void> {
  const next = { ...project, folderId };
  if (!folderId) delete next.folderId;
  await db.projects.put(next);
  if (folderId) {
    const folder = await db.folders.get(folderId);
    if (folder) {
      await db.folders.put({ ...folder, updatedAt: new Date().toISOString() });
    }
  }
}

export async function deleteProjectFolder(folderId: string): Promise<void> {
  await db.transaction("rw", db.projects, db.folders, async () => {
    const projects = await db.projects.where("folderId").equals(folderId).toArray();
    await Promise.all(
      projects.map((project) => {
        const next = { ...project };
        delete next.folderId;
        return db.projects.put(next);
      })
    );
    await db.folders.delete(folderId);
  });
}

export async function duplicateProject(project: ProjectRecord): Promise<ProjectRecord> {
  const now = new Date().toISOString();
  const duplicate: ProjectRecord = {
    ...structuredClone(project),
    id: crypto.randomUUID(),
    name: `${project.name} copy`,
    createdAt: now,
    updatedAt: now
  };
  delete duplicate.archivedAt;
  await saveProject(duplicate);
  return duplicate;
}
