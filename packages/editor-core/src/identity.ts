type JsonRecord = Record<string, unknown>;

interface IdentityNode {
  record: JsonRecord;
  path: string;
  root: string;
  ancestors: IdentityNode[];
  originalId?: string;
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
}

export function repairProjectIdentity(input: unknown): ProjectIdentityRepair {
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
  nodes.forEach((node) => {
    if (!node.originalId) return;
    candidatesById.set(node.originalId, [...(candidatesById.get(node.originalId) ?? []), node]);
  });

  const usedIds = new Set(candidatesById.keys());
  const duplicateOrdinals = new Map<string, number>();
  const warnings: string[] = [];
  nodes.forEach((node) => {
    if (!node.originalId) return;
    const candidates = candidatesById.get(node.originalId)!;
    const occurrence = candidates.indexOf(node);
    if (occurrence === 0) {
      node.repairedId = node.originalId;
      return;
    }
    const ordinal = (duplicateOrdinals.get(node.originalId) ?? 0) + 1;
    duplicateOrdinals.set(node.originalId, ordinal);
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
