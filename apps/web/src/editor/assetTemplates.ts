import { db, type AssetTemplateRecord } from "@/persistence/database";

export const ASSET_TEMPLATES_STORAGE_KEY = "OpenSketch:templates";
export const ASSET_TEMPLATES_CHANGED_EVENT = "opensketch:templates-changed";
export const ASSET_TEMPLATES_ERROR_EVENT = "opensketch:templates-error";
export const TEMPLATE_DRAG_TYPE = "application/x-opensketch-template";
const ASSET_TEMPLATE_SCHEMA_VERSION = 1 as const;
const LEGACY_MIGRATION_ID = "asset-templates-local-storage-v1";

export type AssetTemplate = AssetTemplateRecord;

export class AssetTemplateStorageError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AssetTemplateStorageError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isAssetTemplate(value: unknown): value is AssetTemplate {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.name === "string" &&
    value.name.length > 0 &&
    isRecord(value.object) &&
    typeof value.thumbnail === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    value.schemaVersion === ASSET_TEMPLATE_SCHEMA_VERSION
  );
}

function normalizeAssetTemplate(value: unknown): AssetTemplate | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "string" ||
    value.id.length === 0 ||
    typeof value.name !== "string" ||
    value.name.trim().length === 0 ||
    !isRecord(value.object) ||
    typeof value.thumbnail !== "string" ||
    typeof value.createdAt !== "string" ||
    value.createdAt.length === 0
  ) {
    return null;
  }

  const updatedAt =
    typeof value.updatedAt === "string" && value.updatedAt.length > 0
      ? value.updatedAt
      : value.createdAt;
  return {
    id: value.id,
    name: value.name,
    object: value.object,
    thumbnail: value.thumbnail,
    createdAt: value.createdAt,
    updatedAt,
    schemaVersion: ASSET_TEMPLATE_SCHEMA_VERSION
  };
}

function notifyTemplatesChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(ASSET_TEMPLATES_CHANGED_EVENT));
  }
}

function notifyTemplatesError(error: AssetTemplateStorageError): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(ASSET_TEMPLATES_ERROR_EVENT, {
        detail: { message: error.message }
      })
    );
  }
}

function storageFailure(operation: string, reason: unknown): AssetTemplateStorageError {
  if (reason instanceof AssetTemplateStorageError) return reason;
  const errorName = reason instanceof Error ? reason.name : "";
  if (errorName === "QuotaExceededError") {
    return new AssetTemplateStorageError(
      `Could not ${operation} saved templates because browser storage is full. Export important projects and free browser storage before retrying.`,
      { cause: reason }
    );
  }
  return new AssetTemplateStorageError(
    `Could not ${operation} saved templates because browser storage is unavailable. Check browser storage permissions and retry.`,
    { cause: reason }
  );
}

function readLegacyTemplates(): { raw: string | null; templates: AssetTemplate[] } {
  if (typeof localStorage === "undefined") return { raw: null, templates: [] };
  let raw: string | null;
  try {
    raw = localStorage.getItem(ASSET_TEMPLATES_STORAGE_KEY);
  } catch (reason) {
    throw new AssetTemplateStorageError(
      "Could not migrate saved templates because browser storage is unavailable. Check browser storage permissions and retry.",
      { cause: reason }
    );
  }
  if (raw === null) return { raw, templates: [] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (reason) {
    throw new AssetTemplateStorageError(
      "Could not migrate saved templates because the legacy template data is invalid JSON. Export or remove the legacy template entry, then retry.",
      { cause: reason }
    );
  }
  const templates = Array.isArray(parsed)
    ? parsed
        .map(normalizeAssetTemplate)
        .filter((template): template is AssetTemplate => Boolean(template))
    : [];
  return { raw, templates };
}

let migrationPromise: Promise<void> | null = null;

async function migrateLegacyTemplates(): Promise<void> {
  const migration = await db.templateMigrations.get(LEGACY_MIGRATION_ID);
  if (migration) return;

  const legacy = readLegacyTemplates();
  await db.transaction("rw", db.templates, db.templateMigrations, async () => {
    const currentMigration = await db.templateMigrations.get(LEGACY_MIGRATION_ID);
    if (currentMigration) return;

    const existing = await db.templates.toArray();
    const byId = new Map(existing.map((template) => [template.id, template]));
    for (const template of legacy.templates) {
      if (!byId.has(template.id)) byId.set(template.id, template);
    }
    const records = [...byId.values()];
    if (records.length > 0) await db.templates.bulkPut(records);

    const persisted = await db.templates.bulkGet(records.map((template) => template.id));
    if (
      persisted.length !== records.length ||
      persisted.some(
        (template, index) =>
          !template || JSON.stringify(template) !== JSON.stringify(records[index])
      )
    ) {
      throw new AssetTemplateStorageError(
        "Could not verify the migrated templates. The legacy template data was kept; retry when browser storage is available."
      );
    }
    await db.templateMigrations.put({
      id: LEGACY_MIGRATION_ID,
      schemaVersion: ASSET_TEMPLATE_SCHEMA_VERSION,
      completedAt: new Date().toISOString()
    });
  });

  if (legacy.raw !== null) {
    try {
      localStorage.removeItem(ASSET_TEMPLATES_STORAGE_KEY);
    } catch {
      // The database marker keeps the migration one-time even if legacy cleanup is blocked.
    }
  }
}

function ensureTemplateStorage(): Promise<void> {
  if (migrationPromise) return migrationPromise;
  const pending = migrateLegacyTemplates();
  const tracked = pending.finally(() => {
    if (migrationPromise === tracked) migrationPromise = null;
  });
  migrationPromise = tracked;
  return tracked;
}

function sortTemplates(templates: AssetTemplate[]): AssetTemplate[] {
  return templates
    .filter(isAssetTemplate)
    .sort(
      (left, right) =>
        right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id)
    );
}

export async function loadAssetTemplates(): Promise<AssetTemplate[]> {
  try {
    await ensureTemplateStorage();
    return sortTemplates(await db.templates.toArray());
  } catch (reason) {
    const error = storageFailure("load", reason);
    notifyTemplatesError(error);
    throw error;
  }
}

export async function getAssetTemplate(id: string): Promise<AssetTemplate | undefined> {
  try {
    await ensureTemplateStorage();
    const template = await db.templates.get(id);
    return template && isAssetTemplate(template) ? template : undefined;
  } catch (reason) {
    const error = storageFailure("load", reason);
    notifyTemplatesError(error);
    throw error;
  }
}

export async function saveAssetTemplate(template: AssetTemplate): Promise<AssetTemplate> {
  const normalized = normalizeAssetTemplate(template);
  if (!normalized) {
    const error = new AssetTemplateStorageError(
      "Could not save the template because its data is invalid."
    );
    notifyTemplatesError(error);
    throw error;
  }
  const record: AssetTemplate = {
    ...normalized,
    updatedAt: new Date().toISOString()
  };
  try {
    await ensureTemplateStorage();
    await db.transaction("rw", db.templates, async () => {
      await db.templates.put(record);
      const persisted = await db.templates.get(record.id);
      if (!persisted || JSON.stringify(persisted) !== JSON.stringify(record)) {
        throw new AssetTemplateStorageError(
          "Could not verify the saved template. The previous durable template was kept; retry when browser storage is available."
        );
      }
    });
  } catch (reason) {
    const error = storageFailure("save", reason);
    notifyTemplatesError(error);
    throw error;
  }
  notifyTemplatesChanged();
  return record;
}

export async function deleteAssetTemplate(id: string): Promise<void> {
  if (!id) {
    const error = new AssetTemplateStorageError(
      "Could not delete the template because its ID is missing."
    );
    notifyTemplatesError(error);
    throw error;
  }
  try {
    await ensureTemplateStorage();
    await db.transaction("rw", db.templates, async () => {
      await db.templates.delete(id);
      if (await db.templates.get(id)) {
        throw new AssetTemplateStorageError(
          "Could not verify template deletion. The durable template was kept; retry when browser storage is available."
        );
      }
    });
  } catch (reason) {
    const error = storageFailure("delete", reason);
    notifyTemplatesError(error);
    throw error;
  }
  notifyTemplatesChanged();
}

export function setTemplateDragPayload(dataTransfer: DataTransfer, templateId: string): void {
  dataTransfer.effectAllowed = "copy";
  dataTransfer.setData(TEMPLATE_DRAG_TYPE, templateId);
}
