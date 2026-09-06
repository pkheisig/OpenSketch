import Dexie, { type EntityTable } from "dexie";
import {
  compactProjectScene,
  isProjectKind,
  migrateProject,
  remintProjectIdentity,
  OpenSketch_FORMAT_VERSION,
  referencedUploadIds,
  resolveProjectDefaults,
  type ImportedMediaRecord,
  type ProjectCreationOptions,
  type ProjectFolderRecord,
  type ProjectRecord,
  type ProjectTemplateRecord
} from "@workspace/editor-core";
import { serializeProject } from "@/persistence/portable";

export interface ImportedMediaLibraryRecord extends ImportedMediaRecord {
  createdAt: string;
  updatedAt: string;
  contentHash: string;
}

export interface ImportedMediaSaveResult {
  record: ImportedMediaLibraryRecord;
  created: boolean;
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

export interface ProjectTemplateMigrationRecord {
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
  projectTemplates!: EntityTable<ProjectTemplateRecord, "id">;
  projectTemplateMigrations!: EntityTable<ProjectTemplateMigrationRecord, "id">;

  constructor(databaseName = "OpenSketch") {
    super(databaseName);
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
    this.version(5)
      .stores({
        projects: "id, updatedAt, name, archivedAt, folderId",
        folders: "id, updatedAt, name",
        imports: "id, updatedAt, name, mimeType, contentHash",
        templates: "id, updatedAt, name",
        templateMigrations: "id"
      })
      .upgrade((transaction) =>
        transaction
          .table("projects")
          .toCollection()
          .modify((project) => {
            if (!Number.isSafeInteger(project.revision) || project.revision < 0)
              project.revision = 0;
          })
      );
    this.version(6)
      .stores({
        projects: "id, updatedAt, name, archivedAt, folderId",
        folders: "id, updatedAt, name",
        imports: "id, updatedAt, name, mimeType, contentHash",
        templates: "id, updatedAt, name",
        templateMigrations: "id",
        projectTemplates: "id, updatedAt, name, kind",
        projectTemplateMigrations: "id"
      })
      .upgrade((transaction) =>
        transaction
          .table("projects")
          .toCollection()
          .modify((project) => {
            if (project.formatVersion === 1) {
              project.formatVersion = OpenSketch_FORMAT_VERSION;
              project.kind = "diagram";
            }
          })
      );
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

type StoredProject = ProjectRecord & { revision: number };

export type ProjectSaveResult =
  { status: "saved"; project: StoredProject } | { status: "conflict"; current?: ProjectRecord };

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

function normalizeProjectRecord(project: ProjectRecord): StoredProject {
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
  return (await saveImportedMediaWithStatus(media, timestamp)).record;
}

export async function saveImportedMediaWithStatus(
  media: ImportedMediaRecord,
  timestamp = new Date().toISOString()
): Promise<ImportedMediaSaveResult> {
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
  return { record, created: !matching };
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

export function createProject(name?: string, options: ProjectCreationOptions = {}): ProjectRecord {
  if (options.kind && options.template && options.kind !== options.template.kind) {
    throw new Error("The project template does not match the selected project mode.");
  }
  const kind = options.kind ?? options.template?.kind ?? "diagram";
  if (!isProjectKind(kind)) throw new Error("The project kind is unsupported.");
  const defaults = resolveProjectDefaults(kind);
  const now = new Date().toISOString();
  const template = options.template;
  let objects: Record<string, unknown> = { version: "7.0.0", objects: [] };
  let uploads: ImportedMediaRecord[] = [];
  let usedAssetIds: string[] = [];
  let canvas = defaults.canvas;
  if (template) {
    const snapshot = migrateProject(template.project);
    if (snapshot.kind !== kind || template.kind !== kind) {
      throw new Error("The project template does not match the selected project mode.");
    }
    const reminted = remintProjectIdentity(snapshot) as typeof snapshot;
    objects = reminted.objects;
    uploads = structuredClone(reminted.uploads);
    usedAssetIds = structuredClone(reminted.usedAssetIds);
    canvas = structuredClone(reminted.canvas);
  }
  return {
    format: "OpenSketch",
    formatVersion: OpenSketch_FORMAT_VERSION,
    id: crypto.randomUUID(),
    name: name ?? (template?.name || defaults.name),
    revision: INITIAL_PROJECT_REVISION,
    version: 1,
    kind,
    createdAt: now,
    updatedAt: now,
    canvas,
    objects,
    uploads,
    usedAssetIds,
    ...(template?.project.description === undefined
      ? {}
      : { description: template.project.description })
  };
}

function normalizeProjectTemplate(template: ProjectTemplateRecord): ProjectTemplateRecord {
  if (
    !template ||
    template.schemaVersion !== 1 ||
    typeof template.id !== "string" ||
    template.id.length === 0 ||
    typeof template.name !== "string" ||
    template.name.length === 0 ||
    typeof template.createdAt !== "string" ||
    template.createdAt.length === 0 ||
    typeof template.updatedAt !== "string" ||
    template.updatedAt.length === 0
  ) {
    throw new Error("The project template record is incomplete.");
  }
  if (!isProjectKind(template.kind)) throw new Error("The project template kind is unsupported.");
  const project = migrateProject(template.project);
  if (project.kind !== template.kind) {
    throw new Error("The project template kind does not match its project snapshot.");
  }
  return {
    ...structuredClone(template),
    project,
    schemaVersion: 1
  };
}

export async function listProjectTemplates(): Promise<ProjectTemplateRecord[]> {
  const templates = await getOpenSketchDatabase()
    .projectTemplates.orderBy("updatedAt")
    .reverse()
    .toArray();
  const normalized: ProjectTemplateRecord[] = [];
  for (const template of templates) {
    try {
      normalized.push(normalizeProjectTemplate(template));
    } catch {
      // A single corrupt or newer template must not hide the valid project library.
    }
  }
  return normalized;
}

export async function getProjectTemplate(id: string): Promise<ProjectTemplateRecord | undefined> {
  const template = await getOpenSketchDatabase().projectTemplates.get(id);
  return template ? normalizeProjectTemplate(template) : undefined;
}

export async function saveProjectTemplate(
  template: ProjectTemplateRecord
): Promise<ProjectTemplateRecord> {
  const normalized = normalizeProjectTemplate(template);
  const now = new Date().toISOString();
  const next = { ...normalized, updatedAt: normalized.updatedAt || now };
  await getOpenSketchDatabase().transaction(
    "rw",
    getOpenSketchDatabase().projectTemplates,
    getOpenSketchDatabase().projectTemplateMigrations,
    async () => {
      await getOpenSketchDatabase().projectTemplates.put(next);
      await getOpenSketchDatabase().projectTemplateMigrations.put({
        id: next.id,
        schemaVersion: 1,
        completedAt: now
      });
    }
  );
  return next;
}

export async function deleteProjectTemplate(id: string): Promise<void> {
  await getOpenSketchDatabase().transaction(
    "rw",
    getOpenSketchDatabase().projectTemplates,
    getOpenSketchDatabase().projectTemplateMigrations,
    async () => {
      await getOpenSketchDatabase().projectTemplates.delete(id);
      await getOpenSketchDatabase().projectTemplateMigrations.delete(id);
    }
  );
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
  const database = getOpenSketchDatabase();
  return database.folders.orderBy("updatedAt").reverse().toArray();
}

export async function saveProject(project: ProjectRecord): Promise<ProjectSaveResult> {
  const candidate = normalizeProjectRecord(project);
  const referenced = referencedUploadIds(candidate.objects, candidate.uploads);
  const uploads = candidate.uploads.filter((upload) => referenced.has(upload.id));
  const prepared: StoredProject = {
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
    const next: StoredProject = {
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
  await getOpenSketchDatabase().folders.put(folder);
  return folder;
}

export async function saveProjectFolder(folder: ProjectFolderRecord): Promise<void> {
  await getOpenSketchDatabase().folders.put(folder);
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
    const database = getOpenSketchDatabase();
    const folder = await database.folders.get(folderId);
    if (folder) {
      await database.folders.put({ ...folder, updatedAt: new Date().toISOString() });
    }
  }
  return result;
}

export async function deleteProjectFolder(folderId: string): Promise<void> {
  const changed: StoredProject[] = [];
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
