import Dexie, { type EntityTable } from "dexie";
import {
  OPENSKETCH_FORMAT_VERSION,
  DEFAULT_CANVAS,
  type ProjectRecord
} from "@opensketch/editor-core";

class OpenSketchDatabase extends Dexie {
  projects!: EntityTable<ProjectRecord, "id">;

  constructor() {
    super("opensketch");
    this.version(1).stores({
      projects: "id, updatedAt, name"
    });
  }
}

export const db = new OpenSketchDatabase();

export function createProject(name = "Untitled figure"): ProjectRecord {
  const now = new Date().toISOString();
  return {
    format: "opensketch",
    formatVersion: OPENSKETCH_FORMAT_VERSION,
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

export async function saveProject(project: ProjectRecord): Promise<void> {
  await db.projects.put(project);
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
  await saveProject(duplicate);
  return duplicate;
}
