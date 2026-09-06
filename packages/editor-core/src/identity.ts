import { PORTABLE_SCENE_LIMITS } from "./sceneLimits";

type JsonRecord = Record<string, unknown>;

interface IdentityNode {
  record: JsonRecord;
  path: string;
  root: string;
  ancestors: IdentityNode[];
  originalId?: string;
  duplicateOccurrence?: number;
  repairedId?: string;
}

export interface ProjectIdentityRepair {
  project: unknown;
  repaired: boolean;
  warnings: string[];
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stableHash(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function remintedId(
  originalId: string,
  path: string,
  duplicateOrdinal: number,
  usedIds: Set<string>
): string {
  let salt = 0;
  while (true) {
    const suffix = salt === 0 ? "" : `-${salt}`;
    const candidate = `legacy-${stableHash(`${originalId}\0${path}\0${duplicateOrdinal}\0${salt}`)}-${duplicateOrdinal}${suffix}`;
    if (!usedIds.has(candidate)) return candidate;
    salt += 1;
  }
}

function collectNodes(scene: JsonRecord): IdentityNode[] {
  const nodes: IdentityNode[] = [];
  const walk = (value: unknown, path: string, root: string, ancestors: IdentityNode[]): void => {
    if (!isRecord(value)) return;
    const node: IdentityNode = {
      record: value,
      path,
      root,
      ancestors,
      originalId: typeof value.objectId === "string" ? value.objectId : undefined
    };
    nodes.push(node);
    const nextAncestors = [...ancestors, node];
    if (Array.isArray(value.objects)) {
      value.objects.forEach((child, index) =>
        walk(child, `${path}.objects[${index}]`, root, nextAncestors)
      );
    }
    if (isRecord(value.clipPath)) walk(value.clipPath, `${path}.clipPath`, root, nextAncestors);
    if (isRecord(value.path) && typeof value.path.type === "string") {
      walk(value.path, `${path}.path`, root, nextAncestors);
    }
  };

  if (Array.isArray(scene.objects)) {
    scene.objects.forEach((object, index) => {
      const root = `scene.objects[${index}]`;
      walk(object, root, root, []);
    });
  }
  for (const key of ["backgroundImage", "overlayImage", "clipPath"]) {
    const root = `scene.${key}`;
    if (isRecord(scene[key])) walk(scene[key], root, root, []);
  }
  return nodes;
}

function isWithin(candidate: IdentityNode, scope: IdentityNode): boolean {
  return candidate === scope || candidate.ancestors.includes(scope);
}

/**
 * Bound the only recursive walk in this repair phase before cloning or
 * collecting duplicate-ID buckets from untrusted project data.
 */
function assertSceneBounds(input: unknown): void {
  if (!isRecord(input) || !isRecord(input.objects)) return;
  const scene = input.objects;
  if (!Array.isArray(scene.objects)) return;

  let objectCount = 0;
  const walk = (value: unknown, path: string, depth: number): void => {
    if (!isRecord(value)) return;
    if (depth > PORTABLE_SCENE_LIMITS.maxSceneDepth) {
      throw new Error(`The project ${path} exceeds the scene nesting limit.`);
    }
    objectCount += 1;
    if (objectCount > PORTABLE_SCENE_LIMITS.maxSceneObjects) {
      throw new Error("The project scene contains too many objects.");
    }
    if (Array.isArray(value.objects)) {
      value.objects.forEach((child, index) => walk(child, `${path}.objects[${index}]`, depth + 1));
    }
    if (isRecord(value.clipPath)) walk(value.clipPath, `${path}.clipPath`, depth + 1);
    if (isRecord(value.path) && typeof value.path.type === "string") {
      walk(value.path, `${path}.path`, depth + 1);
    }
  };

  scene.objects.forEach((object, index) => walk(object, `scene.objects[${index}]`, 1));
  for (const key of ["backgroundImage", "overlayImage", "clipPath"]) {
    if (isRecord(scene[key])) walk(scene[key], `scene.${key}`, 1);
  }
}

function rewriteBinding(
  value: unknown,
  owner: IdentityNode,
  path: string,
  candidatesById: Map<string, IdentityNode[]>,
  warnings: string[],
  warningKeys: Set<string>
): void {
  if (!isRecord(value)) return;
  for (const key of ["fromObjectId", "toObjectId"]) {
    const originalId = value[key];
    if (typeof originalId !== "string" || originalId.length === 0) continue;
    const candidates = candidatesById.get(originalId);
    if (!candidates || candidates.length === 0) continue;
    let chosen: IdentityNode | undefined;
    if (candidates.length === 1) {
      chosen = candidates[0];
    } else {
      for (let index = owner.ancestors.length - 1; index >= 0; index -= 1) {
        const scoped = candidates.filter((candidate) =>
          isWithin(candidate, owner.ancestors[index])
        );
        if (scoped.length === 1) {
          chosen = scoped[0];
          break;
        }
      }
      if (!chosen) {
        const sameRoot = candidates.filter((candidate) => candidate.root === owner.root);
        if (sameRoot.length === 1) chosen = sameRoot[0];
      }
    }
    if (!chosen) {
      chosen = candidates[0];
      const warningKey = `${path}.${key}:${originalId}`;
      if (!warningKeys.has(warningKey)) {
        warningKeys.add(warningKey);
        warnings.push(
          `Ambiguous connector reference ${path}.${key} for duplicate object ID "${originalId}"; kept the first scene occurrence.`
        );
      }
    }
    value[key] = chosen.repairedId ?? chosen.originalId ?? originalId;
  }
}

function rewriteStyleSnapshot(
  value: unknown,
  owner: IdentityNode,
  path: string,
  candidatesById: Map<string, IdentityNode[]>,
  warnings: string[],
  warningKeys: Set<string>
): void {
  if (!isRecord(value)) return;
  if (value.connector) {
    rewriteBinding(
      value.connector,
      owner,
      `${path}.connector`,
      candidatesById,
      warnings,
      warningKeys
    );
  }
  if (Array.isArray(value.children)) {
    value.children.forEach((child, index) =>
      rewriteStyleSnapshot(
        child,
        owner,
        `${path}.children[${index}]`,
        candidatesById,
        warnings,
        warningKeys
      )
    );
  }
}

function rewriteRecognizedGroups(
  value: unknown,
  owner: IdentityNode,
  path: string,
  candidatesById: Map<string, IdentityNode[]>,
  warnings: string[],
  warningKeys: Set<string>
): void {
  if (!Array.isArray(value)) return;
  value.forEach((group, index) => {
    if (!isRecord(group)) return;
    if (Array.isArray(group.memberObjectIds)) {
      group.memberObjectIds = group.memberObjectIds.map((memberId, memberIndex) => {
        if (typeof memberId !== "string" || memberId.length === 0) return memberId;
        const holder: JsonRecord = { fromObjectId: memberId };
        rewriteBinding(
          holder,
          owner,
          `${path}[${index}].memberObjectIds[${memberIndex}]`,
          candidatesById,
          warnings,
          warningKeys
        );
        return holder.fromObjectId;
      });
    }
    if (isRecord(group.properties)) {
      rewriteMetadata(
        group.properties,
        owner,
        `${path}[${index}].properties`,
        candidatesById,
        warnings,
        warningKeys
      );
    }
  });
}

function rewriteMetadata(
  value: JsonRecord,
  owner: IdentityNode,
  path: string,
  candidatesById: Map<string, IdentityNode[]>,
  warnings: string[],
  warningKeys: Set<string>
): void {
  if (value.connector) {
    rewriteBinding(
      value.connector,
      owner,
      `${path}.connector`,
      candidatesById,
      warnings,
      warningKeys
    );
  }
  if (value.freeConnectorBinding) {
    rewriteBinding(
      value.freeConnectorBinding,
      owner,
      `${path}.freeConnectorBinding`,
      candidatesById,
      warnings,
      warningKeys
    );
  }
  if (value.recognizedGroups) {
    rewriteRecognizedGroups(
      value.recognizedGroups,
      owner,
      `${path}.recognizedGroups`,
      candidatesById,
      warnings,
      warningKeys
    );
  }
  if (value.defaultElementStyle) {
    rewriteStyleSnapshot(
      value.defaultElementStyle,
      owner,
      `${path}.defaultElementStyle`,
      candidatesById,
      warnings,
      warningKeys
    );
  }
  if (isRecord(value.semanticMetadata)) {
    const metadata = value.semanticMetadata;
    if (Array.isArray(metadata.allowedOverlapObjectIds)) {
      metadata.allowedOverlapObjectIds = metadata.allowedOverlapObjectIds.map((id) => {
        const holder: JsonRecord = { fromObjectId: id };
        rewriteBinding(
          holder,
          owner,
          `${path}.semanticMetadata.allowedOverlapObjectIds`,
          candidatesById,
          warnings,
          warningKeys
        );
        return holder.fromObjectId;
      });
    }
    if (isRecord(metadata.layoutConstraint)) {
      const constraint = metadata.layoutConstraint;
      for (const key of ["contentObjectId", "labelObjectId"]) {
        const holder: JsonRecord = { fromObjectId: constraint[key] };
        rewriteBinding(
          holder,
          owner,
          `${path}.semanticMetadata.layoutConstraint.${key}`,
          candidatesById,
          warnings,
          warningKeys
        );
        constraint[key] = holder.fromObjectId;
      }
    }
  }
  if (Array.isArray(value.semanticRelations)) {
    value.semanticRelations = value.semanticRelations.map((relation) => {
      if (!isRecord(relation)) return relation;
      const next = { ...relation };
      for (const key of ["sourceObjectId", "targetObjectId"]) {
        const holder: JsonRecord = { fromObjectId: next[key] };
        rewriteBinding(
          holder,
          owner,
          `${path}.semanticRelations.${key}`,
          candidatesById,
          warnings,
          warningKeys
        );
        next[key] = holder.fromObjectId;
      }
      if (Array.isArray(next.mediatorObjectIds)) {
        next.mediatorObjectIds = next.mediatorObjectIds.map((id) => {
          const holder: JsonRecord = { fromObjectId: id };
          rewriteBinding(
            holder,
            owner,
            `${path}.semanticRelations.mediatorObjectIds`,
            candidatesById,
            warnings,
            warningKeys
          );
          return holder.fromObjectId;
        });
      }
      return next;
    });
  }
}

function remapRecognizedGroupIdentity(value: unknown, ids: Map<string, string>): void {
  if (!Array.isArray(value)) return;
  value.forEach((group) => {
    if (!isRecord(group)) return;
    if (typeof group.objectId === "string")
      group.objectId = ids.get(group.objectId) ?? group.objectId;
    remapRecognizedGroupIdentity(
      group.properties && isRecord(group.properties)
        ? group.properties.recognizedGroups
        : undefined,
      ids
    );
  });
}

export function repairProjectIdentity(input: unknown): ProjectIdentityRepair {
  assertSceneBounds(input);
  let project: unknown;
  try {
    project = structuredClone(input);
  } catch {
    return { project: input, repaired: false, warnings: [] };
  }
  if (!isRecord(project) || !isRecord(project.objects)) {
    return { project, repaired: false, warnings: [] };
  }

  const nodes = collectNodes(project.objects);
  const candidatesById = new Map<string, IdentityNode[]>();
  const occurrencesById = new Map<string, number>();
  nodes.forEach((node) => {
    if (!node.originalId) return;
    const occurrence = occurrencesById.get(node.originalId) ?? 0;
    node.duplicateOccurrence = occurrence;
    occurrencesById.set(node.originalId, occurrence + 1);
    const candidates = candidatesById.get(node.originalId);
    if (candidates) candidates.push(node);
    else candidatesById.set(node.originalId, [node]);
  });

  const usedIds = new Set(candidatesById.keys());
  const warnings: string[] = [];
  nodes.forEach((node) => {
    if (!node.originalId) return;
    const occurrence = node.duplicateOccurrence ?? 0;
    if (occurrence === 0) {
      node.repairedId = node.originalId;
      return;
    }
    const ordinal = occurrence;
    node.repairedId = remintedId(node.originalId, node.path, ordinal, usedIds);
    usedIds.add(node.repairedId);
    warnings.push(
      `Repaired duplicate scene object ID "${node.originalId}" at ${node.path} as "${node.repairedId}".`
    );
  });

  if (warnings.length === 0) return { project, repaired: false, warnings: [] };

  const warningKeys = new Set<string>();
  nodes.forEach((node) => {
    rewriteMetadata(node.record, node, node.path, candidatesById, warnings, warningKeys);
  });
  nodes.forEach((node) => {
    if (node.repairedId) node.record.objectId = node.repairedId;
  });
  return { project, repaired: true, warnings };
}

/**
 * Clone a validated portable scene for a template instance. Every scene
 * object receives a new identity while connector, semantic, and recognition
 * references remain attached to the corresponding cloned object.
 */
export function remintProjectIdentity(input: unknown): unknown {
  assertSceneBounds(input);
  const project = structuredClone(input);
  if (!isRecord(project) || !isRecord(project.objects)) return project;

  const nodes = collectNodes(project.objects);
  const candidatesById = new Map<string, IdentityNode[]>();
  nodes.forEach((node) => {
    if (!node.originalId) return;
    const candidates = candidatesById.get(node.originalId);
    if (candidates) candidates.push(node);
    else candidatesById.set(node.originalId, [node]);
  });
  for (const [originalId, candidates] of candidatesById) {
    if (candidates.length > 1) {
      throw new Error(`Cannot instantiate a template with duplicate object ID "${originalId}".`);
    }
  }

  const usedIds = new Set<string>();
  const freshId = (): string => {
    let id = crypto.randomUUID();
    while (usedIds.has(id)) id = crypto.randomUUID();
    usedIds.add(id);
    return id;
  };
  const recognitionIds = new Map<string, string>();
  const collectRecognitionIds = (value: unknown): void => {
    if (!Array.isArray(value)) return;
    value.forEach((group) => {
      if (!isRecord(group)) return;
      if (typeof group.objectId === "string" && !recognitionIds.has(group.objectId)) {
        recognitionIds.set(group.objectId, freshId());
      }
      if (isRecord(group.properties)) collectRecognitionIds(group.properties.recognizedGroups);
    });
  };
  nodes.forEach((node) => {
    node.repairedId = freshId();
    collectRecognitionIds(node.record.recognizedGroups);
  });
  nodes.forEach((node) => {
    if (node.repairedId) node.record.objectId = node.repairedId;
    rewriteMetadata(node.record, node, node.path, candidatesById, [], new Set());
    remapRecognizedGroupIdentity(node.record.recognizedGroups, recognitionIds);
  });
  return project;
}
