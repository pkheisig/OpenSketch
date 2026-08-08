export const ASSET_TEMPLATES_STORAGE_KEY = "OpenSketch:templates";
export const ASSET_TEMPLATES_CHANGED_EVENT = "opensketch:templates-changed";
export const TEMPLATE_DRAG_TYPE = "application/x-opensketch-template";

export interface AssetTemplate {
  id: string;
  name: string;
  object: Record<string, unknown>;
  thumbnail: string;
  createdAt: string;
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
    typeof value.createdAt === "string"
  );
}

export function loadAssetTemplates(): AssetTemplate[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(ASSET_TEMPLATES_STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isAssetTemplate) : [];
  } catch {
    return [];
  }
}

function notifyTemplatesChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(ASSET_TEMPLATES_CHANGED_EVENT));
  }
}

export function saveAssetTemplate(template: AssetTemplate): void {
  try {
    const templates = loadAssetTemplates().filter((item) => item.id !== template.id);
    localStorage.setItem(ASSET_TEMPLATES_STORAGE_KEY, JSON.stringify([template, ...templates]));
  } catch {
    // Keep the current session usable when browser storage is unavailable or full.
  }
  notifyTemplatesChanged();
}

export function deleteAssetTemplate(id: string): void {
  try {
    localStorage.setItem(
      ASSET_TEMPLATES_STORAGE_KEY,
      JSON.stringify(loadAssetTemplates().filter((template) => template.id !== id))
    );
  } catch {
    // Keep the current session usable when browser storage is unavailable or full.
  }
  notifyTemplatesChanged();
}

export function setTemplateDragPayload(dataTransfer: DataTransfer, templateId: string): void {
  dataTransfer.effectAllowed = "copy";
  dataTransfer.setData(TEMPLATE_DRAG_TYPE, templateId);
}
