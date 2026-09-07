import type { InterchangeFidelityReport } from "@workspace/editor-core";

function statusLabel(status: InterchangeFidelityReport["status"]): string {
  if (status === "appearance-snapshot") return "Imported as an appearance snapshot";
  if (status === "editable-with-losses") return "Imported with fidelity losses";
  if (status === "unsupported/refused") return "Import was refused";
  return "Imported with native editability";
}

export function fidelityFindingCount(report?: InterchangeFidelityReport): number {
  return report?.diagnostics.filter((diagnostic) => diagnostic.severity !== "info").length ?? 0;
}

export function fidelityNotice(report?: InterchangeFidelityReport): string | undefined {
  if (!report) return undefined;
  const findings = fidelityFindingCount(report);
  if (report.status === "native-editable" && findings === 0) return undefined;
  const findingText =
    findings === 0 ? "" : `; ${findings} fidelity finding${findings === 1 ? "" : "s"} to review`;
  return `${statusLabel(report.status)}${findingText}.`;
}

export function fidelityBadge(report?: InterchangeFidelityReport): string | undefined {
  if (!report || report.status === "native-editable") return undefined;
  const findings = fidelityFindingCount(report);
  return findings > 0
    ? `Review ${findings} fidelity finding${findings === 1 ? "" : "s"}`
    : statusLabel(report.status);
}

export function fidelityTooltip(report?: InterchangeFidelityReport): string | undefined {
  if (!report) return undefined;
  const diagnostics = report.diagnostics
    .filter((diagnostic) => diagnostic.severity !== "info")
    .map((diagnostic) => diagnostic.message);
  return diagnostics.length > 0 ? diagnostics.join(" ") : fidelityNotice(report);
}
