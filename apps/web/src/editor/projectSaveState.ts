export type ProjectSavePhase = "saved" | "saving" | "error";

export type ProjectSaveFailureKind = "quota" | "unavailable" | "unknown";

export interface ProjectSaveErrorInfo {
  kind: ProjectSaveFailureKind;
  message: string;
  detail: string;
}

export type ProjectSaveState =
  { phase: "saved" } | { phase: "saving" } | { phase: "error"; error: ProjectSaveErrorInfo };

function errorProperty(reason: unknown, property: "name" | "message"): string {
  if (!reason || typeof reason !== "object") return "";
  const value = (reason as Record<string, unknown>)[property];
  return typeof value === "string" ? value : "";
}

function reasonName(reason: unknown): string {
  return errorProperty(reason, "name");
}

function reasonDetail(reason: unknown): string {
  const name = reasonName(reason);
  const message = errorProperty(reason, "message");
  if (name || message) {
    return `${name && name !== "Error" ? `${name}: ` : ""}${message || "The storage operation failed."}`;
  }
  if (typeof reason === "string" && reason.trim()) return reason.trim();
  try {
    const serialized = JSON.stringify(reason);
    if (serialized) return serialized;
  } catch {
    // Fall through to a stable diagnostic string for non-serializable reasons.
  }
  return String(reason || "The storage operation failed.");
}

function isQuotaFailure(reason: unknown, detail: string): boolean {
  const name = reasonName(reason);
  return (
    name === "QuotaExceededError" ||
    /quota|storage\s+(?:is\s+)?full|database\s+(?:is\s+)?full|disk\s+(?:is\s+)?full/i.test(detail)
  );
}

function isUnavailableFailure(reason: unknown, detail: string): boolean {
  const name = reasonName(reason);
  return (
    [
      "DatabaseClosedError",
      "InvalidStateError",
      "NotAllowedError",
      "SecurityError",
      "TransactionInactiveError",
      "UnknownError"
    ].includes(name) ||
    /blocked|closed|disabled|denied|indexeddb|permission|storage\s+(?:is\s+)?unavailable/i.test(
      detail
    )
  );
}

export function normalizeProjectSaveError(reason: unknown): ProjectSaveErrorInfo {
  const detail = reasonDetail(reason);
  const kind = isQuotaFailure(reason, detail)
    ? "quota"
    : isUnavailableFailure(reason, detail)
      ? "unavailable"
      : "unknown";
  const message =
    kind === "quota"
      ? "Your latest edits are not saved because browser storage is full. Export a recovery copy, free storage, then retry."
      : kind === "unavailable"
        ? "Your latest edits are not saved because browser storage is unavailable or blocked. Export a recovery copy, check storage permissions, then retry."
        : "Your latest edits could not be saved. Export a recovery copy, then retry.";
  return { kind, message, detail };
}

export function hasUnsavedProjectRevision(
  saveRevision: number,
  savedRevision: number,
  hasPendingSnapshot: boolean
): boolean {
  return hasPendingSnapshot || savedRevision < saveRevision;
}
