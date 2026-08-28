import Dexie, { type EntityTable } from "dexie";
import {
  compactProjectScene,
  OpenSketch_FORMAT_VERSION,
  referencedUploadIds,
  DEFAULT_CANVAS,
  type ImportedMediaRecord,
  type ProjectFolderRecord,
  type ProjectRecord
} from "@workspace/editor-core";
import { serializeProject } from "@/persistence/portable";

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
    this.version(4)
      .stores({
        projects: "id, updatedAt, name, archivedAt, folderId",
        folders: "id, updatedAt, name",
        imports: "id, updatedAt, name, mimeType, contentHash"
      })
      .upgrade((transaction) =>
        transaction
          .table("projects")
          .toCollection()
          .modify((project) => {
            if (!Number.isSafeInteger(project.revision) || project.revision < 0) {
              project.revision = 0;
            }
          })
      );
  }
}

export const db = new OpenSketchDatabase();
export const IMPORT_LIBRARY_CHANGED_EVENT = "OpenSketch:import-library-changed";
export const PROJECT_CHANGED_EVENT = "OpenSketch:project-changed";
const PROJECT_CHANGED_CHANNEL = "OpenSketch:project-changed";
const PROJECT_CHANGED_STORAGE_KEY = "OpenSketch:project-change";
const INITIAL_PROJECT_REVISION = 0;

export interface ProjectChangeNotice {
  projectId: string;
  revision: number;
  sourceId: string;
  deleted?: boolean;
}

export type ProjectSaveResult =
  { status: "saved"; project: ProjectRecord } | { status: "conflict"; current?: ProjectRecord };

export type ProjectDeleteResult =
  { status: "deleted" } | { status: "conflict"; current?: ProjectRecord };

let sourceId: string | undefined;
let publishChannel: BroadcastChannel | undefined;

function localSourceId(): string {
  sourceId ??= crypto.randomUUID();
  return sourceId;
}

function normalizedRevision(value: unknown): number {
  return Number.isSafeInteger(value) && typeof value === "number" && value >= 0
    ? value
    : INITIAL_PROJECT_REVISION;
}

function normalizeProjectRecord(project: ProjectRecord): ProjectRecord {
  return { ...project, revision: normalizedRevision(project.revision) };
}

function noticeFromUnknown(value: unknown): ProjectChangeNotice | undefined {
  if (!value || typeof value !== "object") return undefined;
  const notice = value as Partial<ProjectChangeNotice>;
  if (
    typeof notice.projectId !== "string" ||
    !notice.projectId ||
    typeof notice.sourceId !== "string" ||
    !notice.sourceId ||
    !Number.isSafeInteger(notice.revision) ||
    typeof notice.revision !== "number" ||
    notice.revision < 0
  ) {
    return undefined;
  }
  return {
    projectId: notice.projectId,
    revision: notice.revision,
    sourceId: notice.sourceId,
    ...(notice.deleted ? { deleted: true } : {})
  };
}

function publishProjectChange(notice: ProjectChangeNotice): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PROJECT_CHANGED_EVENT, { detail: notice }));
  try {
    window.localStorage.setItem(PROJECT_CHANGED_STORAGE_KEY, JSON.stringify(notice));
  } catch {
    // BroadcastChannel remains available when localStorage is blocked or full.
  }
  try {
    publishChannel ??= new BroadcastChannel(PROJECT_CHANGED_CHANNEL);
    publishChannel.postMessage(notice);
  } catch {
    // The DOM event and storage event cover browsers without BroadcastChannel.
  }
}

export function subscribeProjectChanges(
  listener: (notice: ProjectChangeNotice) => void
): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handle = (value: unknown) => {
    const notice = noticeFromUnknown(value);
    if (!notice || notice.sourceId === localSourceId()) return;
    listener(notice);
  };
  const onEvent = (event: Event) => handle((event as CustomEvent).detail);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== PROJECT_CHANGED_STORAGE_KEY || !event.newValue) return;
    try {
      handle(JSON.parse(event.newValue));
    } catch {
      // Ignore malformed coordination data; the durable project remains authoritative.
    }
  };
  window.addEventListener(PROJECT_CHANGED_EVENT, onEvent);
  window.addEventListener("storage", onStorage);

  let channel: BroadcastChannel | undefined;
  try {
    channel = new BroadcastChannel(PROJECT_CHANGED_CHANNEL);
    channel.addEventListener("message", (event) => handle(event.data));
  } catch {
    // Older browsers still receive the storage-event fallback.
  }
  return () => {
    window.removeEventListener(PROJECT_CHANGED_EVENT, onEvent);
    window.removeEventListener("storage", onStorage);
    channel?.close();
  };
}

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
    revision: INITIAL_PROJECT_REVISION,
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
  const projects = await db.projects.orderBy("updatedAt").reverse().toArray();
  return projects.map(normalizeProjectRecord);
}

export async function getProject(projectId: string): Promise<ProjectRecord | undefined> {
  const project = await db.projects.get(projectId);
  return project ? normalizeProjectRecord(project) : undefined;
}

export async function listProjectFolders(): Promise<ProjectFolderRecord[]> {
  return db.folders.orderBy("updatedAt").reverse().toArray();
}

export async function saveProject(project: ProjectRecord): Promise<ProjectSaveResult> {
  const candidate = normalizeProjectRecord(project);
  const referenced = referencedUploadIds(candidate.objects, candidate.uploads);
  const uploads = candidate.uploads.filter((upload) => referenced.has(upload.id));
  const prepared: ProjectRecord = {
    ...candidate,
    objects: compactProjectScene(candidate.objects, uploads),
    uploads
  };

  const result = await db.transaction("rw", db.projects, async () => {
    const stored = await db.projects.get(prepared.id);
    const current = stored ? normalizeProjectRecord(stored) : undefined;
    if (current && current.revision !== prepared.revision) {
      return { status: "conflict", current } as const;
    }
    if (!current && prepared.revision !== INITIAL_PROJECT_REVISION) {
      return { status: "conflict" } as const;
    }
    if (current && current.revision >= Number.MAX_SAFE_INTEGER) {
      throw new Error("This project has reached its maximum local revision.");
    }
    const next: ProjectRecord = {
      ...prepared,
      revision: current ? current.revision + 1 : 1,
      updatedAt: new Date().toISOString()
    };
    // Validate the exact portable representation that will be stored before
    // touching IndexedDB. This keeps local state and exports under one budget.
    serializeProject(next);
    await db.projects.put(next);
    return { status: "saved", project: next } as const;
  });
  if (result.status === "saved") {
    publishProjectChange({
      projectId: result.project.id,
      revision: result.project.revision,
      sourceId: localSourceId()
    });
  }
  return result;
}

export async function saveProjectThumbnail(
  projectId: string,
  projectRevision: number,
  thumbnail: string
): Promise<ProjectRecord | undefined> {
  return db.transaction("rw", db.projects, async () => {
    const current = await db.projects.get(projectId);
    const normalized = current ? normalizeProjectRecord(current) : undefined;
    if (!normalized || normalized.revision !== projectRevision) return normalized;
    const next = { ...normalized, thumbnail };
    await db.projects.put(next);
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
  await db.folders.put(folder);
  return folder;
}

export async function saveProjectFolder(folder: ProjectFolderRecord): Promise<void> {
  await db.folders.put(folder);
}

export async function moveProjectToFolder(
  project: ProjectRecord,
  folderId?: string
): Promise<ProjectSaveResult> {
  const next = { ...project, folderId };
  if (!folderId) delete next.folderId;
  const result = await saveProject(next);
  if (result.status === "conflict") return result;
  if (folderId) {
    const folder = await db.folders.get(folderId);
    if (folder) {
      await db.folders.put({ ...folder, updatedAt: new Date().toISOString() });
    }
  }
  return result;
}

export async function deleteProjectFolder(folderId: string): Promise<void> {
  const changed: ProjectRecord[] = [];
  await db.transaction("rw", db.projects, db.folders, async () => {
    const projects = await db.projects.where("folderId").equals(folderId).toArray();
    for (const project of projects) {
      const normalized = normalizeProjectRecord(project);
      const next = { ...normalized };
      delete next.folderId;
      next.revision += 1;
      next.updatedAt = new Date().toISOString();
      await db.projects.put(next);
      changed.push(next);
    }
    await db.folders.delete(folderId);
  });
  changed.forEach((project) =>
    publishProjectChange({
      projectId: project.id,
      revision: project.revision,
      sourceId: localSourceId()
    })
  );
}

export async function deleteProject(
  project: Pick<ProjectRecord, "id" | "revision">
): Promise<ProjectDeleteResult> {
  const result = await db.transaction("rw", db.projects, async () => {
    const current = await db.projects.get(project.id);
    const normalized = current ? normalizeProjectRecord(current) : undefined;
    if (!normalized || normalized.revision !== normalizedRevision(project.revision)) {
      return { status: "conflict", current: normalized } as const;
    }
    await db.projects.delete(project.id);
    return { status: "deleted", revision: normalized.revision + 1 } as const;
  });
  if (result.status === "conflict") return result;
  publishProjectChange({
    projectId: project.id,
    revision: result.revision,
    sourceId: localSourceId(),
    deleted: true
  });
  return { status: "deleted" };
}

export async function duplicateProject(project: ProjectRecord): Promise<ProjectRecord> {
  const now = new Date().toISOString();
  const duplicate: ProjectRecord = {
    ...structuredClone(project),
    id: crypto.randomUUID(),
    name: `${project.name} copy`,
    revision: INITIAL_PROJECT_REVISION,
    createdAt: now,
    updatedAt: now
  };
  delete duplicate.archivedAt;
  const result = await saveProject(duplicate);
  if (result.status === "conflict") {
    throw new Error("The project copy could not be created.");
  }
  return result.project;
}
