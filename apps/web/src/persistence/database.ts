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

export interface AssetTemplateRecord {
  id: string;
  name: string;
  object: Record<string, unknown>;
  thumbnail: string;
  createdAt: string;
  updatedAt: string;
  schemaVersion: 1;
}

export interface AssetTemplateMigrationRecord {
  id: string;
  schemaVersion: 1;
  completedAt: string;
}

export class OpenSketchDatabase extends Dexie {
  projects!: EntityTable<ProjectRecord, "id">;
  folders!: EntityTable<ProjectFolderRecord, "id">;
  imports!: EntityTable<ImportedMediaLibraryRecord, "id">;
  templates!: EntityTable<AssetTemplateRecord, "id">;
  templateMigrations!: EntityTable<AssetTemplateMigrationRecord, "id">;

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
    this.version(4).stores({
      projects: "id, updatedAt, name, archivedAt, folderId",
      folders: "id, updatedAt, name",
      imports: "id, updatedAt, name, mimeType, contentHash",
      templates: "id, updatedAt, name",
      templateMigrations: "id"
    });
  }
}

let database: OpenSketchDatabase | undefined;

/**
 * The standalone adapter owns the browser database. Keeping construction lazy
 * lets the reusable application module be imported by a host without opening
 * IndexedDB as an import-time side effect.
 */
export function getOpenSketchDatabase(): OpenSketchDatabase {
  database ??= new OpenSketchDatabase();
  return database;
}

/**
 * Compatibility surface for existing standalone tests and callers. Property
 * access is the first point at which the Dexie instance is created.
 */
export const db = new Proxy({} as OpenSketchDatabase, {
  get(_target, property) {
    const value = Reflect.get(getOpenSketchDatabase(), property, getOpenSketchDatabase());
    return typeof value === "function" ? value.bind(getOpenSketchDatabase()) : value;
  }
});
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
  const database = getOpenSketchDatabase();
  return database.imports.orderBy("updatedAt").reverse().toArray();
}

export async function getImportedMedia(
  id: string
): Promise<ImportedMediaLibraryRecord | undefined> {
  return getOpenSketchDatabase().imports.get(id);
}

export async function saveImportedMedia(
  media: ImportedMediaRecord,
  timestamp = new Date().toISOString()
): Promise<ImportedMediaLibraryRecord> {
  const database = getOpenSketchDatabase();
  const contentHash = await importedMediaHash(media);
  const matching = await database.imports.where("contentHash").equals(contentHash).first();
  const record: ImportedMediaLibraryRecord = matching
    ? { ...matching, name: media.name, updatedAt: timestamp }
    : {
        ...media,
        createdAt: timestamp,
        updatedAt: timestamp,
        contentHash
      };
  await database.imports.put(record);
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
  await getOpenSketchDatabase().imports.delete(id);
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
  const database = getOpenSketchDatabase();
  return database.projects.orderBy("updatedAt").reverse().toArray();
}

export async function listProjectFolders(): Promise<ProjectFolderRecord[]> {
  const database = getOpenSketchDatabase();
  return database.folders.orderBy("updatedAt").reverse().toArray();
}

export async function saveProject(project: ProjectRecord): Promise<void> {
  await getOpenSketchDatabase().projects.put(project);
}

export async function saveProjectThumbnail(
  projectId: string,
  projectRevision: string,
  thumbnail: string
): Promise<ProjectRecord | undefined> {
  const database = getOpenSketchDatabase();
  return database.transaction("rw", database.projects, async () => {
    const current = await database.projects.get(projectId);
    if (!current || current.updatedAt !== projectRevision) return current;
    const next = { ...current, thumbnail };
    await database.projects.put(next);
    return next;
  });
}

export async function createProjectFolder(name: string): Promise<ProjectFolderRecord> {
  const now = new Date().toISOString();
  const folder: ProjectFolderRecord = {
    id: crypto.randomUUID(),
    name,
    createdAt: now,
    updatedAt: now
  };
  await getOpenSketchDatabase().folders.put(folder);
  return folder;
}

export async function saveProjectFolder(folder: ProjectFolderRecord): Promise<void> {
  await getOpenSketchDatabase().folders.put(folder);
}

export async function moveProjectToFolder(
  project: ProjectRecord,
  folderId?: string
): Promise<void> {
  const database = getOpenSketchDatabase();
  const next = { ...project, folderId };
  if (!folderId) delete next.folderId;
  await database.projects.put(next);
  if (folderId) {
    const folder = await database.folders.get(folderId);
    if (folder) {
      await database.folders.put({ ...folder, updatedAt: new Date().toISOString() });
    }
  }
}

export async function deleteProjectFolder(folderId: string): Promise<void> {
  const database = getOpenSketchDatabase();
  await database.transaction("rw", database.projects, database.folders, async () => {
    const projects = await database.projects.where("folderId").equals(folderId).toArray();
    await Promise.all(
      projects.map((project) => {
        const next = { ...project };
        delete next.folderId;
        return database.projects.put(next);
      })
    );
    await database.folders.delete(folderId);
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
