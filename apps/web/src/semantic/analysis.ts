import { IText, Textbox, type Canvas } from "fabric";
import {
  inspectSemanticGeometry,
  isGroup,
  metadataOf,
  relationsForCanvas,
  type SemanticRelation
} from "./composition";
import { sceneObjectEntries } from "@/editor/sceneTree";
import type { Bounds } from "@/editor/geometry";

export const ANALYSIS_VERSION = "opensketch.analysis.v1" as const;
export type AnalysisProfile = "scientific-diagram" | "publication" | "presentation" | "cycle";
export type FindingCategory =
  "geometry" | "text" | "connectors" | "relations" | "scientific" | "style";
export type FindingSeverity = "error" | "warning" | "info";

export interface CompositionFinding {
  id: string;
  category: FindingCategory;
  severity: FindingSeverity;
  code: string;
  message: string;
  objectIds: string[];
  relationIds: string[];
  evidence: Record<string, number | string | boolean>;
  repairable: boolean;
  suggestedRepair?: string;
}

export interface AnalysisOptions {
  profile?: AnalysisProfile;
  categories?: FindingCategory[];
  maxFindings?: number;
  clearance?: number;
  padding?: number;
}

export interface CompositionAnalysis {
  version: typeof ANALYSIS_VERSION;
  profile: AnalysisProfile;
  sceneRevision: string;
  findings: CompositionFinding[];
  counts: Record<FindingSeverity, number>;
  metrics: { objects: number; relations: number; visibleObjects: number };
  truncated: boolean;
  skipped: string[];
  pass: boolean;
}

function overlap(a: Bounds, b: Bounds): boolean {
  return (
    a.left < b.left + b.width &&
    a.left + a.width > b.left &&
    a.top < b.top + b.height &&
    a.top + a.height > b.top
  );
}

function finding(
  category: FindingCategory,
  severity: FindingSeverity,
  code: string,
  message: string,
  objectIds: string[] = [],
  relationIds: string[] = [],
  evidence: Record<string, number | string | boolean> = {},
  repairable = false,
  suggestedRepair?: string
): CompositionFinding {
  const id = `${severity}:${category}:${code}:${[...objectIds].sort().join(",")}:${[...relationIds].sort().join(",")}`;
  return {
    id,
    category,
    severity,
    code,
    message,
    objectIds,
    relationIds,
    evidence,
    repairable,
    ...(suggestedRepair ? { suggestedRepair } : {})
  };
}

function relationAllowsOverlap(relations: SemanticRelation[], a: string, b: string): boolean {
  return relations.some(
    (relation) =>
      relation.allowedOverlap === true &&
      ((relation.sourceObjectId === a && relation.targetObjectId === b) ||
        (relation.sourceObjectId === b && relation.targetObjectId === a))
  );
}

function isEffectivelyVisible(path: readonly { visible?: boolean }[]): boolean {
  return path.every((object) => object.visible !== false);
}

export function analyzeComposition(
  canvas: Canvas,
  canvasSize: { width: number; height: number },
  sceneRevision: string,
  options: AnalysisOptions = {}
): CompositionAnalysis {
  const profile = options.profile ?? "scientific-diagram";
  const categories = options.categories ? new Set(options.categories) : undefined;
  const maxFindings = Math.max(1, Math.min(256, Math.floor(options.maxFindings ?? 128)));
  const padding = options.padding ?? 24;
  const clearance = options.clearance ?? 12;
  const allEntries = sceneObjectEntries(canvas).filter(({ object }) => object.objectId);
  const entries = allEntries.filter(({ object }) => !isGroup(object));
  const visibility = new Map(
    allEntries.map(({ object, path }) => [object.objectId!, isEffectivelyVisible(path)])
  );
  const relations = relationsForCanvas(canvas);
  const index = new Map(allEntries.map(({ object }) => [object.objectId!, object]));
  const findings: CompositionFinding[] = [];
  const add = (...args: Parameters<typeof finding>) => {
    if (!categories || categories.has(args[0])) findings.push(finding(...args));
  };
  entries.forEach(({ object, path }) => {
    const id = object.objectId!;
    const visible = isEffectivelyVisible(path);
    const geometry = inspectSemanticGeometry(object, clearance);
    const bounds = geometry.visualBounds;
    if (
      !Number.isFinite(bounds.left + bounds.top + bounds.width + bounds.height) ||
      bounds.width <= 0 ||
      bounds.height <= 0
    )
      add(
        "geometry",
        "error",
        "invalid_bounds",
        `Object "${id}" has non-finite or empty geometry.`,
        [id],
        [],
        {},
        true,
        "repair_layout"
      );
    if (
      bounds.left < padding ||
      bounds.top < padding ||
      bounds.left + bounds.width > canvasSize.width - padding ||
      bounds.top + bounds.height > canvasSize.height - padding
    )
      add(
        "geometry",
        "warning",
        "out_of_bounds",
        `Object "${id}" is outside the publication-safe canvas area.`,
        [id],
        [],
        { padding },
        true,
        "repair_layout"
      );
    const metadata = metadataOf(object);
    if (metadata?.semanticRole === "stage" && metadata.stageIndex === undefined)
      add(
        "scientific",
        profile === "cycle" ? "error" : "warning",
        "stage_index_missing",
        `Stage "${id}" has no explicit stage index.`,
        [id]
      );
    if ((object instanceof IText || object instanceof Textbox) && visible) {
      const lines = object.textLines.length;
      if (!Number.isFinite(object.width) || !Number.isFinite(object.height) || object.fontSize < 6)
        add(
          "text",
          "error",
          "invalid_text_metrics",
          `Text object "${id}" has invalid font metrics.`,
          [id],
          [],
          {},
          true,
          "fit_text"
        );
      if (
        object instanceof Textbox &&
        object.height > (object.lineHeight || 1) * (object.fontSize || 1) * lines * 1.8
      )
        add(
          "text",
          "warning",
          "text_overflow",
          `Text object "${id}" may overflow its bounded text box.`,
          [id],
          [],
          { lines },
          true,
          "fit_text"
        );
    }
    if (object.connector) {
      const endpoints = [object.connector.fromObjectId, object.connector.toObjectId];
      if (endpoints.some((endpoint) => !index.has(endpoint)))
        add(
          "connectors",
          "error",
          "stale_binding",
          `Connector "${id}" references a missing endpoint.`,
          [id],
          [],
          {},
          true,
          "repair_connectors"
        );
      if (
        metadata?.semanticRole === "main-flow-connector" &&
        endpoints.some(
          (endpoint) => metadataOf(index.get(endpoint)!)?.semanticRole === "stage-label"
        )
      )
        add(
          "connectors",
          "error",
          "label_scope",
          `Logical connector "${id}" targets a stage label instead of content.`,
          [id],
          [],
          {},
          true,
          "repair_connectors"
        );
    }
    if (object.freeConnectorGeometry && metadata?.semanticRole === "main-flow-connector")
      add(
        "connectors",
        "error",
        "free_logical_arc",
        `Logical connector "${id}" is not bound to semantic endpoints.`,
        [id],
        [],
        {},
        true,
        "create_bound_connector"
      );
  });
  for (let left = 0; left < entries.length; left += 1) {
    const a = entries[left].object;
    const aId = a.objectId!;
    if (!visibility.get(aId) || a.connector) continue;
    for (let right = left + 1; right < entries.length; right += 1) {
      const b = entries[right].object;
      const bId = b.objectId!;
      if (!visibility.get(bId) || b.connector || relationAllowsOverlap(relations, aId, bId))
        continue;
      if (
        overlap(
          inspectSemanticGeometry(a, clearance).layoutBounds,
          inspectSemanticGeometry(b, clearance).layoutBounds
        )
      )
        add(
          "geometry",
          "warning",
          "unexpected_overlap",
          `Objects "${aId}" and "${bId}" overlap without an allowed relation.`,
          [aId, bId],
          [],
          {},
          true,
          "repair_layout"
        );
    }
  }
  const allIds = new Set(entries.map(({ object }) => object.objectId!));
  relations.forEach((relation) => {
    if (
      !allIds.has(relation.sourceObjectId) ||
      !allIds.has(relation.targetObjectId) ||
      relation.mediatorObjectIds?.some((id) => !allIds.has(id))
    )
      add(
        "relations",
        "error",
        "stale_relation",
        `Relation "${relation.id}" references a missing object.`,
        [relation.sourceObjectId, relation.targetObjectId],
        [relation.id]
      );
    const source = index.get(relation.sourceObjectId);
    const target = index.get(relation.targetObjectId);
    if (
      visibility.get(relation.sourceObjectId) === false ||
      visibility.get(relation.targetObjectId) === false ||
      source?.opacity === 0 ||
      target?.opacity === 0
    )
      add(
        "relations",
        "warning",
        "hidden_relation_endpoint",
        `Relation "${relation.id}" has a hidden endpoint.`,
        [relation.sourceObjectId, relation.targetObjectId],
        [relation.id]
      );
  });
  if (profile === "cycle") {
    const stages = allEntries
      .filter(({ object }) => metadataOf(object)?.semanticRole === "stage")
      .map(({ object }) => metadataOf(object)?.stageIndex)
      .filter((value): value is number => value !== undefined)
      .sort((a, b) => a - b);
    stages.forEach((value, index) => {
      if (value !== index)
        add(
          "scientific",
          "error",
          "stage_index_gap",
          "Cycle stage indices must be contiguous from zero.",
          [],
          [],
          { expected: index, actual: value }
        );
    });
  }
  const severityOrder: Record<FindingSeverity, number> = { error: 0, warning: 1, info: 2 };
  findings.sort(
    (a, b) =>
      severityOrder[a.severity] - severityOrder[b.severity] ||
      a.category.localeCompare(b.category) ||
      a.id.localeCompare(b.id)
  );
  const counts = { error: 0, warning: 0, info: 0 };
  findings.forEach((item) => {
    counts[item.severity] += 1;
  });
  const truncated = findings.length > maxFindings;
  return {
    version: ANALYSIS_VERSION,
    profile,
    sceneRevision,
    findings: findings.slice(0, maxFindings),
    counts,
    metrics: {
      objects: entries.length,
      relations: relations.length,
      visibleObjects: entries.filter(({ object }) => visibility.get(object.objectId!) === true)
        .length
    },
    truncated,
    skipped: [],
    pass: counts.error === 0
  };
}

export function validateFigure(
  canvas: Canvas,
  canvasSize: { width: number; height: number },
  sceneRevision: string,
  profile: AnalysisProfile = "publication",
  options: Omit<AnalysisOptions, "profile"> = {}
): CompositionAnalysis {
  return analyzeComposition(canvas, canvasSize, sceneRevision, { ...options, profile });
}
