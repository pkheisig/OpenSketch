import { IText, Path, Point, Textbox, util, type Canvas, type FabricObject } from "fabric";
import {
  inspectSemanticGeometry,
  isGroup,
  metadataOf,
  normalizeRelation,
  perimeterPointForAnchor,
  relationsForCanvas,
  type SemanticRelation
} from "./composition";
import { SEMANTIC_TEXT_COLOR, stylePreset } from "./compound";
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
  metrics: {
    objects: number;
    relations: number;
    visibleObjects: number;
    minTextPointSize: number | null;
    minStageGap: number | null;
    connectorCrossingCount: number;
    maxArrowheadPenetration: number;
    maxEndpointGap: number;
    maxAnnotationLeaderLength: number;
    occupiedAreaRatio: number;
    outwardLabelViolationCount: number;
    failedRelationGeometryCount: number;
  };
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

function boundsGap(a: Bounds, b: Bounds): number {
  const dx = Math.max(a.left - (b.left + b.width), b.left - (a.left + a.width), 0);
  const dy = Math.max(a.top - (b.top + b.height), b.top - (a.top + a.height), 0);
  return Math.hypot(dx, dy);
}

function boundsOverlapDepth(a: Bounds, b: Bounds): number {
  const width = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
  const height = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
  return width > 0 && height > 0 ? Math.min(width, height) : 0;
}

function connectorCenterlineEndpoints(
  object: FabricObject
): [{ x: number; y: number }, { x: number; y: number }] | undefined {
  if (!isGroup(object)) return undefined;
  const centerline = object.getObjects().find((candidate) => candidate instanceof Path);
  if (!(centerline instanceof Path)) return undefined;
  const commands = centerline.path.filter(
    (command) => command.length >= 3 && String(command[0]).toUpperCase() !== "Z"
  );
  const first = commands[0];
  const last = commands.at(-1);
  if (!first || !last) return undefined;
  const offset = centerline.pathOffset ?? new Point(0, 0);
  const localPoint = (command: (typeof centerline.path)[number], end: boolean) => {
    const index = end ? command.length - 2 : 1;
    const x = Number(command[index]);
    const y = Number(command[index + 1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
    return util.transformPoint(
      new Point(x - offset.x, y - offset.y),
      centerline.calcTransformMatrix()
    );
  };
  const from = localPoint(first, false);
  const to = localPoint(last, true);
  return from && to ? [from, to] : undefined;
}

function segmentsIntersect(
  first: [{ x: number; y: number }, { x: number; y: number }],
  second: [{ x: number; y: number }, { x: number; y: number }]
): boolean {
  const cross = (
    a: { x: number; y: number },
    b: { x: number; y: number },
    c: { x: number; y: number }
  ) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const firstA = cross(first[0], first[1], second[0]);
  const firstB = cross(first[0], first[1], second[1]);
  const secondA = cross(second[0], second[1], first[0]);
  const secondB = cross(second[0], second[1], first[1]);
  return firstA > 0 !== firstB > 0 && secondA > 0 !== secondB > 0;
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

function relationAllowsOverlap(
  relations: SemanticRelation[],
  leftIds: readonly string[],
  rightIds: readonly string[]
): boolean {
  return relations.some((relation) => {
    if (!relation.allowedOverlap) return false;
    const participantIds = [
      relation.sourceObjectId,
      relation.targetObjectId,
      ...(relation.mediatorObjectIds ?? [])
    ];
    return participantIds.some(
      (leftId) =>
        leftIds.includes(leftId) &&
        participantIds.some((rightId) => rightIds.includes(rightId) && rightId !== leftId)
    );
  });
}

function isEffectivelyVisible(path: readonly { visible?: boolean; opacity?: number }[]): boolean {
  return path.every((object) => object.visible !== false && (object.opacity ?? 1) > 0);
}

function hasVisibleInk(object: FabricObject, path: readonly FabricObject[]): boolean {
  if (!isEffectivelyVisible(path)) return false;
  if (!isGroup(object)) return true;
  return object.getObjects().some((child) => hasVisibleInk(child, [...path, child]));
}

function sharesParticleField(
  left: { path: readonly FabricObject[] },
  right: { path: readonly FabricObject[] }
): boolean {
  return left.path.some(
    (object) => metadataOf(object)?.semanticRole === "particle-field" && right.path.includes(object)
  );
}

function sharesLabelGroup(
  left: { path: readonly FabricObject[] },
  right: { path: readonly FabricObject[] }
): boolean {
  return left.path.some(
    (object) => metadataOf(object)?.semanticRole === "stage-label" && right.path.includes(object)
  );
}

function sharesSemanticContainer(
  left: { path: readonly FabricObject[] },
  right: { path: readonly FabricObject[] },
  role: string
): boolean {
  return left.path.some(
    (object) => metadataOf(object)?.semanticRole === role && right.path.includes(object)
  );
}

function metadataAllowsOverlap(
  left: { path: readonly FabricObject[] },
  right: { path: readonly FabricObject[] }
): boolean {
  const leftIds = new Set(left.path.map((object) => object.objectId).filter(Boolean));
  const rightIds = new Set(right.path.map((object) => object.objectId).filter(Boolean));
  return (
    left.path.some((object) =>
      metadataOf(object)?.allowedOverlapObjectIds?.some((id) => rightIds.has(id))
    ) ||
    right.path.some((object) =>
      metadataOf(object)?.allowedOverlapObjectIds?.some((id) => leftIds.has(id))
    )
  );
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
  const padding =
    options.padding ?? (profile === "publication" ? 48 : profile === "presentation" ? 12 : 24);
  const clearance = options.clearance ?? (profile === "publication" ? 16 : 12);
  const allEntries = sceneObjectEntries(canvas).filter(({ object }) => object.objectId);
  const entries = allEntries.filter(
    ({ object, path }) =>
      (!isGroup(object) || Boolean(object.familyId)) &&
      !path.slice(0, -1).some((ancestor) => Boolean(ancestor.familyId)) &&
      !path.some((ancestor) => Boolean(ancestor.connector || ancestor.freeConnectorGeometry))
  );
  const visibility = new Map(
    allEntries.map(({ object, path }) => [object.objectId!, hasVisibleInk(object, path)])
  );
  const relations = relationsForCanvas(canvas);
  const index = new Map(allEntries.map(({ object }) => [object.objectId!, object]));
  const layoutBounds = new Map<string, Bounds>();
  const findings: CompositionFinding[] = [];
  const skipped: string[] = [];
  const hardGeometryProfile = profile === "publication" || profile === "cycle";
  const minTextPointSize = hardGeometryProfile ? 8 : 6;
  let observedMinTextPointSize: number | null = null;
  let observedMinStageGap: number | null = null;
  let maxEndpointGap = 0;
  let maxArrowheadPenetration = 0;
  let maxAnnotationLeaderLength = 0;
  let outwardLabelViolationCount = 0;
  let failedRelationGeometryCount = 0;
  const add = (...args: Parameters<typeof finding>) => {
    if (!categories || categories.has(args[0])) findings.push(finding(...args));
  };
  allEntries.forEach(({ object }) => {
    let malformedCount = 0;
    const malformedRelationIds: string[] = [];
    (object.semanticRelations ?? []).forEach((relation) => {
      try {
        normalizeRelation(relation);
      } catch {
        malformedCount += 1;
        const id =
          typeof (relation as { id?: unknown }).id === "string"
            ? (relation as { id: string }).id
            : undefined;
        if (id) malformedRelationIds.push(id);
      }
    });
    if (malformedCount > 0)
      add(
        "relations",
        "error",
        "invalid_relation",
        `Object "${object.objectId!}" contains malformed semantic relation records.`,
        [object.objectId!],
        malformedRelationIds,
        { count: malformedCount }
      );
  });
  entries.forEach(({ object, path }) => {
    const id = object.objectId!;
    const visible = isEffectivelyVisible(path);
    const geometry = inspectSemanticGeometry(object, clearance);
    const bounds = geometry.visualBounds;
    layoutBounds.set(id, geometry.layoutBounds);
    if (
      visible &&
      (!geometry.evaluable ||
        !Number.isFinite(bounds.left + bounds.top + bounds.width + bounds.height) ||
        bounds.width <= 0 ||
        bounds.height <= 0)
    )
      add(
        "geometry",
        "error",
        "invalid_bounds",
        `Object "${id}" has non-finite, empty, or unevaluable visual geometry.`,
        [id],
        [],
        {},
        true,
        "repair_layout"
      );
    if (
      visible &&
      (bounds.left < padding ||
        bounds.top < padding ||
        bounds.left + bounds.width > canvasSize.width - padding ||
        bounds.top + bounds.height > canvasSize.height - padding)
    )
      add(
        "geometry",
        hardGeometryProfile ? "error" : "warning",
        "out_of_bounds",
        `Object "${id}" is outside the publication-safe canvas area.`,
        [id],
        [],
        { padding },
        true,
        "repair_layout"
      );
    if ((object instanceof IText || object instanceof Textbox) && visible) {
      const lines = object.textLines.length;
      const physicalPointSize = (object.fontSize * 72) / 96;
      observedMinTextPointSize =
        observedMinTextPointSize === null
          ? physicalPointSize
          : Math.min(observedMinTextPointSize, physicalPointSize);
      if (physicalPointSize < minTextPointSize)
        add(
          "text",
          hardGeometryProfile ? "error" : "warning",
          "text_below_minimum_size",
          `Text object "${id}" is below the ${minTextPointSize}pt profile minimum.`,
          [id],
          [],
          { minimumPointSize: minTextPointSize, measuredPointSize: physicalPointSize },
          true,
          "fit_text"
        );
      if (inspectSemanticGeometry(object, clearance).textMetrics?.fontReady === false)
        add(
          "text",
          "error",
          "font_metrics_unavailable",
          `Text object "${id}" cannot be measured because its font is not ready.`,
          [id],
          [],
          {},
          true,
          "fit_text"
        );
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
    const stylePath = path.some(
      (ancestor) => metadataOf(ancestor)?.semanticRole === "stage-content"
    )
      ? path.slice(
          path.findIndex((ancestor) => metadataOf(ancestor)?.semanticRole === "stage-content") + 1
        )
      : path;
    const styledRole = [...stylePath]
      .reverse()
      .map((ancestor) => metadataOf(ancestor)?.semanticRole)
      .find((role) => Boolean(role && stylePreset(role)));
    const expectedStyle = styledRole ? stylePreset(styledRole) : undefined;
    const protectedAsset = path.some((ancestor) => Boolean(ancestor.familyId));
    if (expectedStyle && !object.familyId && !protectedAsset) {
      const expectedFill =
        object instanceof IText || object instanceof Textbox
          ? (expectedStyle.textFill ?? SEMANTIC_TEXT_COLOR)
          : expectedStyle.fill;
      const mismatches = [
        object.fill !== expectedFill ? "fill" : undefined,
        ...(object instanceof IText || object instanceof Textbox
          ? [
              object.fontSize !== expectedStyle.fontSize ? "fontSize" : undefined,
              object.fontWeight !== expectedStyle.fontWeight ? "fontWeight" : undefined
            ]
          : [
              object.stroke !== expectedStyle.stroke ? "stroke" : undefined,
              object.strokeWidth !== expectedStyle.strokeWidth ? "strokeWidth" : undefined
            ])
      ].filter((value): value is string => Boolean(value));
      if (mismatches.length > 0)
        add(
          "style",
          "warning",
          "style_mismatch",
          `Object "${id}" does not match the ${styledRole} semantic style preset.`,
          [id],
          [],
          { fields: mismatches.join(","), role: styledRole ?? "unknown" },
          true,
          "normalize_styles"
        );
    }
  });
  allEntries
    .filter(({ object }) => object.connector || object.freeConnectorGeometry)
    .forEach(({ object }) => {
      const id = object.objectId!;
      const metadata = metadataOf(object);
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
          endpoints.some((endpoint) => {
            const target = index.get(endpoint);
            return Boolean(target && metadataOf(target)?.semanticRole === "stage-label");
          })
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
      if (
        object.freeConnectorGeometry &&
        !object.connector &&
        metadata?.semanticRole === "main-flow-connector"
      )
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
  allEntries
    .filter(({ object }) => metadataOf(object)?.semanticRole === "stage")
    .forEach(({ object }) => {
      if (metadataOf(object)?.stageIndex === undefined)
        add(
          "scientific",
          profile === "cycle" ? "error" : "warning",
          "stage_index_missing",
          `Stage "${object.objectId!}" has no explicit stage index.`,
          [object.objectId!]
        );
    });
  const MAX_OVERLAP_PAIRS = 100_000;
  let overlapPairs = 0;
  let overlapBudgetExceeded = false;
  if (!categories || categories.has("geometry"))
    for (let left = 0; left < entries.length; left += 1) {
      const leftEntry = entries[left];
      const a = leftEntry.object;
      const aId = a.objectId!;
      if (!visibility.get(aId) || a.connector) continue;
      for (let right = left + 1; right < entries.length; right += 1) {
        const rightEntry = entries[right];
        const b = rightEntry.object;
        const bId = b.objectId!;
        if (
          !visibility.get(bId) ||
          b.connector ||
          sharesLabelGroup(leftEntry, rightEntry) ||
          sharesParticleField(leftEntry, rightEntry) ||
          sharesSemanticContainer(leftEntry, rightEntry, "stage-content") ||
          sharesSemanticContainer(leftEntry, rightEntry, "hub") ||
          metadataAllowsOverlap(leftEntry, rightEntry) ||
          relationAllowsOverlap(
            relations,
            [aId, ...leftEntry.path.map((object) => object.objectId!).filter(Boolean)],
            [bId, ...rightEntry.path.map((object) => object.objectId!).filter(Boolean)]
          )
        )
          continue;
        overlapPairs += 1;
        if (overlapPairs > MAX_OVERLAP_PAIRS) {
          overlapBudgetExceeded = true;
          break;
        }
        if (overlap(layoutBounds.get(aId)!, layoutBounds.get(bId)!))
          add(
            "geometry",
            hardGeometryProfile ? "error" : "warning",
            "unexpected_overlap",
            `Objects "${aId}" and "${bId}" overlap without an allowed relation.`,
            [aId, bId],
            [],
            {},
            true,
            "repair_layout"
          );
      }
      if (overlapBudgetExceeded) break;
    }
  if (overlapBudgetExceeded) skipped.push("overlap-pair-budget");
  const allIds = new Set(allEntries.map(({ object }) => object.objectId!));
  const relationIds = new Set(relations.map((relation) => relation.id));
  allEntries.forEach(({ object }) => {
    const danglingRelationIds = (metadataOf(object)?.relationIds ?? []).filter(
      (relationId) => !relationIds.has(relationId)
    );
    if (danglingRelationIds.length > 0)
      add(
        "relations",
        "error",
        "stale_relation",
        `Object "${object.objectId!}" references missing relation metadata.`,
        [object.objectId!],
        danglingRelationIds
      );
  });
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
    if (
      source &&
      target &&
      visibility.get(relation.sourceObjectId) &&
      visibility.get(relation.targetObjectId)
    ) {
      const sourceBounds = inspectSemanticGeometry(source, clearance).visualBounds;
      const targetBounds = inspectSemanticGeometry(target, clearance).visualBounds;
      const gap = boundsGap(sourceBounds, targetBounds);
      if ((relation.kind === "contacts" || relation.kind === "binds") && gap > clearance) {
        failedRelationGeometryCount += 1;
        add(
          "scientific",
          hardGeometryProfile ? "error" : "warning",
          "relation_geometry_gap",
          `Relation "${relation.id}" has no visible participant interface within tolerance.`,
          [relation.sourceObjectId, relation.targetObjectId],
          [relation.id],
          { gap, tolerance: clearance },
          true,
          "compose_interaction"
        );
      }
      if (relation.kind === "crosses" && !overlap(sourceBounds, targetBounds)) {
        failedRelationGeometryCount += 1;
        add(
          "scientific",
          "error",
          "crossing_geometry_missing",
          `Relation "${relation.id}" declares a crossing without visible boundary overlap.`,
          [relation.sourceObjectId, relation.targetObjectId],
          [relation.id],
          { gap },
          true,
          "compose_interaction"
        );
      }
      if (relation.kind === "emits" && metadataOf(target)?.semanticRole === "particle-field") {
        const tolerance = Math.max(80, clearance * 4);
        if (gap > tolerance) {
          failedRelationGeometryCount += 1;
          add(
            "scientific",
            hardGeometryProfile ? "error" : "warning",
            "emission_geometry_missing",
            `Particle field "${relation.targetObjectId}" is not associated with its source.`,
            [relation.sourceObjectId, relation.targetObjectId],
            [relation.id],
            { gap, tolerance },
            true,
            "create_particle_field"
          );
        }
      }
    }
  });
  if (profile === "cycle") {
    const stages = allEntries
      .filter(({ object }) => metadataOf(object)?.semanticRole === "stage")
      .map(({ object }) => ({ object, stageIndex: metadataOf(object)?.stageIndex }))
      .filter(
        (entry): entry is { object: FabricObject; stageIndex: number } =>
          entry.stageIndex !== undefined
      )
      .sort((a, b) => a.stageIndex - b.stageIndex);
    const expectedStart =
      stages.some(({ stageIndex }) => stageIndex === 1) &&
      stages.every(({ stageIndex }) => stageIndex >= 1)
        ? 1
        : 0;
    stages.forEach(({ object, stageIndex }, index) => {
      if (stageIndex !== expectedStart + index)
        add(
          "scientific",
          "error",
          "stage_index_gap",
          `Cycle stage indices must be contiguous from ${expectedStart}.`,
          [object.objectId!],
          [],
          { expected: expectedStart + index, actual: stageIndex }
        );
    });
    const contentByStageId = new Map<string, FabricObject | undefined>();
    stages.forEach(({ object }) => {
      const metadata = metadataOf(object);
      const constraint = metadata?.layoutConstraint;
      contentByStageId.set(
        object.objectId!,
        constraint
          ? index.get(constraint.contentObjectId)
          : allEntries.find(
              ({ object: candidate, path }) =>
                metadataOf(candidate)?.semanticRole === "stage-content" &&
                metadataOf(candidate)?.stageId === metadata?.stageId &&
                path.includes(object)
            )?.object
      );
    });
    const stageContentIds = new Set(
      [...contentByStageId.values()]
        .map((object) => object?.objectId)
        .filter((id): id is string => Boolean(id))
    );
    const flowRelations = relations.filter(
      (relation) =>
        relation.kind === "flow_to" &&
        stageContentIds.has(relation.sourceObjectId) &&
        stageContentIds.has(relation.targetObjectId)
    );
    if (stages.length > 0 && flowRelations.length !== stages.length)
      add(
        "connectors",
        "error",
        "cycle_transition_count",
        "A closed cycle requires exactly one semantic transition per stage.",
        stages.map(({ object }) => object.objectId!),
        flowRelations.map((relation) => relation.id),
        { expected: stages.length, actual: flowRelations.length },
        true,
        "connect_sequence"
      );
    stages.forEach(({ object }) => {
      const content = contentByStageId.get(object.objectId!);
      const constraint = metadataOf(object)?.layoutConstraint;
      const incoming = flowRelations.filter(
        (relation) => relation.targetObjectId === content?.objectId
      );
      const outgoing = flowRelations.filter(
        (relation) => relation.sourceObjectId === content?.objectId
      );
      if (incoming.length !== 1 || outgoing.length !== 1)
        add(
          "connectors",
          "error",
          "cycle_stage_binding",
          `Stage "${object.objectId!}" lacks one incoming and one outgoing content-bound transition.`,
          [object.objectId!],
          [...incoming, ...outgoing].map((relation) => relation.id),
          { incoming: incoming.length, outgoing: outgoing.length },
          true,
          "connect_sequence"
        );
      if (constraint && content && index.has(constraint.labelObjectId)) {
        const label = index.get(constraint.labelObjectId)!;
        const contentCenter = inspectSemanticGeometry(content).center;
        const labelCenter = inspectSemanticGeometry(label).center;
        const outward = {
          x: contentCenter.x - constraint.referenceCenter.x,
          y: contentCenter.y - constraint.referenceCenter.y
        };
        const labelVector = {
          x: labelCenter.x - contentCenter.x,
          y: labelCenter.y - contentCenter.y
        };
        if (
          constraint.placement === "outward" &&
          outward.x * labelVector.x + outward.y * labelVector.y <= 0
        ) {
          outwardLabelViolationCount += 1;
          add(
            "scientific",
            "error",
            "label_not_outward",
            `Stage label "${label.objectId!}" is not outward from the layout reference.`,
            [object.objectId!, content.objectId!, label.objectId!],
            [],
            {},
            true,
            "compose_labeled_group"
          );
        }
      }
    });
  }
  const mainConnectors = allEntries.filter(
    ({ object }) =>
      Boolean(object.connector) && metadataOf(object)?.semanticRole === "main-flow-connector"
  );
  const connectorPairs = new Set<string>();
  mainConnectors.forEach(({ object: connector }) => {
    const binding = connector.connector;
    if (!binding) return;
    if (!isGroup(connector)) return;
    const source = index.get(binding.fromObjectId);
    const target = index.get(binding.toObjectId);
    if (!source || !target) return;
    const sourceGeometry = inspectSemanticGeometry(source, clearance);
    const targetGeometry = inspectSemanticGeometry(target, clearance);
    const sourcePort = perimeterPointForAnchor(sourceGeometry, binding.fromAnchor);
    const targetPort = perimeterPointForAnchor(targetGeometry, binding.toAnchor);
    const actualEndpoints = connectorCenterlineEndpoints(connector);
    if (sourcePort && targetPort && actualEndpoints)
      maxEndpointGap = Math.max(
        maxEndpointGap,
        Math.max(
          Math.hypot(actualEndpoints[0].x - sourcePort.x, actualEndpoints[0].y - sourcePort.y),
          Math.hypot(actualEndpoints[1].x - targetPort.x, actualEndpoints[1].y - targetPort.y)
        )
      );
    const arrowheadKinds = [binding.startArrowhead, binding.endArrowhead];
    let childIndex = 1;
    arrowheadKinds.forEach((kind, index) => {
      if (kind === "none") return;
      const arrowhead = connector.getObjects()[childIndex];
      childIndex += 1;
      const endpointGeometry = index === 0 ? sourceGeometry : targetGeometry;
      if (!arrowhead) return;
      const boundsPenetration = boundsOverlapDepth(
        inspectSemanticGeometry(arrowhead).visualBounds,
        endpointGeometry.visualBounds
      );
      const intentionalExtent =
        Math.max(
          inspectSemanticGeometry(arrowhead).visualBounds.width,
          inspectSemanticGeometry(arrowhead).visualBounds.height
        ) / 2;
      const penetration = Math.max(0, boundsPenetration - intentionalExtent);
      maxArrowheadPenetration = Math.max(maxArrowheadPenetration, penetration);
      const tolerance = Math.max(1, connector.strokeWidth ?? 2);
      if (penetration > tolerance)
        add(
          "connectors",
          hardGeometryProfile ? "error" : "warning",
          "arrowhead_penetration",
          `Connector "${connector.objectId!}" penetrates its endpoint artwork with an arrowhead.`,
          [connector.objectId!, index === 0 ? binding.fromObjectId : binding.toObjectId],
          [],
          { penetration, tolerance },
          true,
          "repair_connectors"
        );
    });
    if (profile === "cycle" && !connector.semanticConnector?.routeContext)
      add(
        "connectors",
        "error",
        "cycle_route_context_missing",
        `Cycle connector "${connector.objectId!}" has no shared route context.`,
        [connector.objectId!],
        [],
        {},
        true,
        "connect_sequence"
      );
    mainConnectors.forEach(({ object: other }) => {
      if (other === connector || !other.connector) return;
      const pair = [connector.objectId!, other.objectId!].sort().join(":");
      if (connectorPairs.has(pair)) return;
      connectorPairs.add(pair);
      if (
        binding.fromObjectId === other.connector.fromObjectId ||
        binding.fromObjectId === other.connector.toObjectId ||
        binding.toObjectId === other.connector.fromObjectId ||
        binding.toObjectId === other.connector.toObjectId
      )
        return;
      const otherSource = index.get(other.connector.fromObjectId);
      const otherTarget = index.get(other.connector.toObjectId);
      if (!otherSource || !otherTarget) return;
      const first: [{ x: number; y: number }, { x: number; y: number }] = [
        sourceGeometry.center,
        targetGeometry.center
      ];
      const second: [{ x: number; y: number }, { x: number; y: number }] = [
        inspectSemanticGeometry(otherSource).center,
        inspectSemanticGeometry(otherTarget).center
      ];
      if (segmentsIntersect(first, second))
        add(
          "connectors",
          "error",
          "connector_crossing",
          `Main-flow connectors "${connector.objectId!}" and "${other.objectId!}" cross.`,
          [connector.objectId!, other.objectId!],
          [],
          {},
          true,
          "repair_connectors"
        );
    });
  });
  const stageEntries = allEntries.filter(
    ({ object }) => metadataOf(object)?.semanticRole === "stage"
  );
  for (let left = 0; left < stageEntries.length; left += 1) {
    for (let right = left + 1; right < stageEntries.length; right += 1) {
      const gap = boundsGap(
        inspectSemanticGeometry(stageEntries[left].object).visualBounds,
        inspectSemanticGeometry(stageEntries[right].object).visualBounds
      );
      observedMinStageGap = observedMinStageGap === null ? gap : Math.min(observedMinStageGap, gap);
    }
  }
  allEntries
    .filter(({ object }) => metadataOf(object)?.semanticRole === "annotation-leader")
    .forEach(({ object }) => {
      const binding = object.connector;
      if (!binding) return;
      const source = index.get(binding.fromObjectId);
      const target = index.get(binding.toObjectId);
      if (!source || !target) return;
      const sourceCenter = inspectSemanticGeometry(source).center;
      const targetCenter = inspectSemanticGeometry(target).center;
      const length = Math.hypot(targetCenter.x - sourceCenter.x, targetCenter.y - sourceCenter.y);
      maxAnnotationLeaderLength = Math.max(maxAnnotationLeaderLength, length);
      const limit = Math.max(300, Math.hypot(canvasSize.width, canvasSize.height) * 0.45);
      if (length > limit)
        add(
          "connectors",
          hardGeometryProfile ? "error" : "warning",
          "annotation_leader_too_long",
          `Annotation leader "${object.objectId!}" is longer than the bounded local-callout limit.`,
          [object.objectId!, binding.fromObjectId, binding.toObjectId],
          [],
          { length, limit },
          true,
          "create_annotation"
        );
    });
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
  const truncated = findings.length > maxFindings || overlapBudgetExceeded;
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
        .length,
      minTextPointSize: observedMinTextPointSize,
      minStageGap: observedMinStageGap,
      connectorCrossingCount: findings.filter((item) => item.code === "connector_crossing").length,
      maxArrowheadPenetration,
      maxEndpointGap,
      maxAnnotationLeaderLength,
      occupiedAreaRatio:
        entries.reduce((sum, { object }) => sum + inspectSemanticGeometry(object).area, 0) /
        Math.max(1, canvasSize.width * canvasSize.height),
      outwardLabelViolationCount,
      failedRelationGeometryCount
    },
    truncated,
    skipped,
    pass:
      counts.error === 0 && (!hardGeometryProfile || (counts.warning === 0 && skipped.length === 0))
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
