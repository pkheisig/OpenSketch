export const LAYOUT_DOCUMENT_VERSION = 1 as const;

export const LAYOUT_FLOWS = ["free", "horizontal", "vertical", "grid"] as const;
export type LayoutFlow = (typeof LAYOUT_FLOWS)[number];

export const LAYOUT_SIZING = ["fixed", "fill", "preserve-aspect", "content-sized"] as const;
export type LayoutSizing = (typeof LAYOUT_SIZING)[number];

export const LAYOUT_ALIGNMENTS = ["start", "center", "end", "stretch"] as const;
export type LayoutAlignment = (typeof LAYOUT_ALIGNMENTS)[number];

export const LAYOUT_OVERFLOW_POLICIES = ["visible", "reject"] as const;
export type LayoutOverflowPolicy = (typeof LAYOUT_OVERFLOW_POLICIES)[number];

export const LAYOUT_TRACK_TYPES = ["fixed", "flex"] as const;
export type LayoutTrackType = (typeof LAYOUT_TRACK_TYPES)[number];

export const LAYOUT_LIMITS = {
  maxFrames: 256,
  maxChildrenPerFrame: 500,
  maxTracksPerAxis: 64,
  maxRoleLength: 120,
  maxFrameIdLength: 128,
  maxSerializedBytes: 2 * 1024 * 1024,
  maxCoordinate: 1_000_000,
  maxGap: 100_000,
  maxPadding: 100_000
} as const;

export interface LayoutBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface LayoutPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface LayoutGap {
  horizontal: number;
  vertical: number;
}

export interface LayoutTrack {
  type: LayoutTrackType;
  value: number;
}

export interface LayoutCellSpec {
  objectId: string;
  sizing: LayoutSizing;
  role?: string;
  width?: number;
  height?: number;
  row?: number;
  column?: number;
  rowSpan?: number;
  columnSpan?: number;
  horizontalAlign?: LayoutAlignment;
  verticalAlign?: LayoutAlignment;
}

export interface LayoutFrame {
  id: string;
  bounds: LayoutBounds;
  flow: LayoutFlow;
  padding: LayoutPadding;
  gap: LayoutGap;
  overflow: LayoutOverflowPolicy;
  children: LayoutCellSpec[];
  tracks?: {
    rows: LayoutTrack[];
    columns: LayoutTrack[];
  };
  role?: string;
  /** Optional non-layout scene container used to reject nested ownership. */
  containerObjectId?: string;
}

export interface LayoutDocument {
  version: typeof LAYOUT_DOCUMENT_VERSION;
  frames: LayoutFrame[];
}

export interface LayoutChildGeometry {
  objectId: string;
  bounds: LayoutBounds;
}

export interface LayoutDiagnostic {
  code: "FRAME_OVERFLOW" | "INVALID_CELL";
  frameId: string;
  objectId?: string;
  message: string;
}

export interface LayoutResolvedChild {
  objectId: string;
  bounds: LayoutBounds;
}

export interface LayoutResolution {
  frameId: string;
  children: LayoutResolvedChild[];
  diagnostics: LayoutDiagnostic[];
}

export interface LayoutValidationContext {
  objectIds?: Iterable<string>;
  parentByObjectId?: ReadonlyMap<string, string | undefined>;
}

export interface CreateLayoutFrameInput {
  frameId: string;
  bounds: LayoutBounds;
  flow: LayoutFlow;
  padding?: number | Partial<LayoutPadding>;
  gap?: number | Partial<LayoutGap>;
  overflow?: LayoutOverflowPolicy;
  children: LayoutCellSpec[];
  tracks?: {
    rows: LayoutTrack[];
    columns: LayoutTrack[];
  };
  role?: string;
  containerObjectId?: string;
}

export class LayoutValidationError extends Error {
  readonly code = "INVALID_LAYOUT" as const;

  constructor(message: string) {
    super(message);
    this.name = "LayoutValidationError";
  }
}

export class LayoutResolutionError extends Error {
  readonly code = "LAYOUT_RESOLUTION_FAILED" as const;
  readonly diagnostics: readonly LayoutDiagnostic[];

  constructor(message: string, diagnostics: readonly LayoutDiagnostic[] = []) {
    super(message);
    this.name = "LayoutResolutionError";
    this.diagnostics = diagnostics;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const finite = (value: unknown, path: string, minimum?: number, maximum?: number): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new LayoutValidationError(`${path} must be a finite number.`);
  }
  if (minimum !== undefined && value < minimum) {
    throw new LayoutValidationError(`${path} must be at least ${minimum}.`);
  }
  if (maximum !== undefined && value > maximum) {
    throw new LayoutValidationError(`${path} must be at most ${maximum}.`);
  }
  return value;
};

const boundedString = (value: unknown, path: string, maximum: number): string => {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum) {
    throw new LayoutValidationError(
      `${path} must be a non-empty string of at most ${maximum} characters.`
    );
  }
  return value;
};

function bounds(value: unknown, path: string): LayoutBounds {
  if (!isRecord(value)) throw new LayoutValidationError(`${path} must be an object.`);
  return {
    left: finite(
      value.left,
      `${path}.left`,
      -LAYOUT_LIMITS.maxCoordinate,
      LAYOUT_LIMITS.maxCoordinate
    ),
    top: finite(
      value.top,
      `${path}.top`,
      -LAYOUT_LIMITS.maxCoordinate,
      LAYOUT_LIMITS.maxCoordinate
    ),
    width: finite(value.width, `${path}.width`, 0.000001, LAYOUT_LIMITS.maxCoordinate),
    height: finite(value.height, `${path}.height`, 0.000001, LAYOUT_LIMITS.maxCoordinate)
  };
}

function padding(value: unknown, path: string): LayoutPadding {
  if (typeof value === "number") {
    const all = finite(value, path, 0, LAYOUT_LIMITS.maxPadding);
    return { top: all, right: all, bottom: all, left: all };
  }
  if (!isRecord(value)) throw new LayoutValidationError(`${path} must be a number or object.`);
  return {
    top: finite(value.top, `${path}.top`, 0, LAYOUT_LIMITS.maxPadding),
    right: finite(value.right, `${path}.right`, 0, LAYOUT_LIMITS.maxPadding),
    bottom: finite(value.bottom, `${path}.bottom`, 0, LAYOUT_LIMITS.maxPadding),
    left: finite(value.left, `${path}.left`, 0, LAYOUT_LIMITS.maxPadding)
  };
}

function gap(value: unknown, path: string): LayoutGap {
  if (typeof value === "number") {
    const all = finite(value, path, 0, LAYOUT_LIMITS.maxGap);
    return { horizontal: all, vertical: all };
  }
  if (!isRecord(value)) throw new LayoutValidationError(`${path} must be a number or object.`);
  return {
    horizontal: finite(value.horizontal, `${path}.horizontal`, 0, LAYOUT_LIMITS.maxGap),
    vertical: finite(value.vertical, `${path}.vertical`, 0, LAYOUT_LIMITS.maxGap)
  };
}

function normalizedTrack(value: unknown, path: string): LayoutTrack {
  if (!isRecord(value) || !LAYOUT_TRACK_TYPES.includes(value.type as LayoutTrackType)) {
    throw new LayoutValidationError(`${path}.type is unsupported.`);
  }
  return {
    type: value.type as LayoutTrackType,
    value: finite(value.value, `${path}.value`, 0.000001, LAYOUT_LIMITS.maxCoordinate)
  };
}

function normalizedChild(value: unknown, path: string): LayoutCellSpec {
  if (!isRecord(value)) throw new LayoutValidationError(`${path} must be an object.`);
  const sizing = value.sizing ?? "content-sized";
  if (!LAYOUT_SIZING.includes(sizing as LayoutSizing)) {
    throw new LayoutValidationError(`${path}.sizing is unsupported.`);
  }
  const result: LayoutCellSpec = {
    objectId: boundedString(value.objectId, `${path}.objectId`, LAYOUT_LIMITS.maxFrameIdLength),
    sizing: sizing as LayoutSizing
  };
  for (const key of ["row", "column", "rowSpan", "columnSpan"] as const) {
    if (value[key] !== undefined) {
      const minimum = key.endsWith("Span") ? 1 : 0;
      result[key] = Math.floor(
        finite(value[key], `${path}.${key}`, minimum, LAYOUT_LIMITS.maxTracksPerAxis)
      );
    }
  }
  for (const key of ["horizontalAlign", "verticalAlign"] as const) {
    if (value[key] !== undefined) {
      if (!LAYOUT_ALIGNMENTS.includes(value[key] as LayoutAlignment)) {
        throw new LayoutValidationError(`${path}.${key} is unsupported.`);
      }
      result[key] = value[key] as LayoutAlignment;
    }
  }
  for (const key of ["width", "height"] as const) {
    if (value[key] !== undefined) {
      result[key] = finite(value[key], `${path}.${key}`, 0, LAYOUT_LIMITS.maxCoordinate);
    }
  }
  if (value.role !== undefined)
    result.role = boundedString(value.role, `${path}.role`, LAYOUT_LIMITS.maxRoleLength);
  return result;
}

function normalizedFrame(value: unknown, path: string): LayoutFrame {
  if (!isRecord(value)) throw new LayoutValidationError(`${path} must be an object.`);
  if (!LAYOUT_FLOWS.includes(value.flow as LayoutFlow)) {
    throw new LayoutValidationError(`${path}.flow is unsupported.`);
  }
  const childrenValue = value.children;
  if (!Array.isArray(childrenValue) || childrenValue.length > LAYOUT_LIMITS.maxChildrenPerFrame) {
    throw new LayoutValidationError(`${path}.children is invalid or exceeds the resource limit.`);
  }
  const children = childrenValue.map((child, index) =>
    normalizedChild(child, `${path}.children[${index}]`)
  );
  const ids = new Set<string>();
  children.forEach((child, index) => {
    if (ids.has(child.objectId)) {
      throw new LayoutValidationError(`${path}.children[${index}].objectId is duplicated.`);
    }
    ids.add(child.objectId);
  });
  const normalized: LayoutFrame = {
    id: boundedString(value.id, `${path}.id`, LAYOUT_LIMITS.maxFrameIdLength),
    bounds: bounds(value.bounds, `${path}.bounds`),
    flow: value.flow as LayoutFlow,
    padding: padding(value.padding ?? 0, `${path}.padding`),
    gap: gap(value.gap ?? 0, `${path}.gap`),
    overflow: value.overflow === undefined ? "visible" : (value.overflow as LayoutOverflowPolicy),
    children
  };
  if (!LAYOUT_OVERFLOW_POLICIES.includes(normalized.overflow)) {
    throw new LayoutValidationError(`${path}.overflow is unsupported.`);
  }
  if (value.role !== undefined)
    normalized.role = boundedString(value.role, `${path}.role`, LAYOUT_LIMITS.maxRoleLength);
  if (value.containerObjectId !== undefined)
    normalized.containerObjectId = boundedString(
      value.containerObjectId,
      `${path}.containerObjectId`,
      LAYOUT_LIMITS.maxFrameIdLength
    );
  if (value.tracks !== undefined) {
    if (
      !isRecord(value.tracks) ||
      !Array.isArray(value.tracks.rows) ||
      !Array.isArray(value.tracks.columns)
    ) {
      throw new LayoutValidationError(`${path}.tracks is invalid.`);
    }
    if (
      value.tracks.rows.length === 0 ||
      value.tracks.columns.length === 0 ||
      value.tracks.rows.length > LAYOUT_LIMITS.maxTracksPerAxis ||
      value.tracks.columns.length > LAYOUT_LIMITS.maxTracksPerAxis
    ) {
      throw new LayoutValidationError(`${path}.tracks exceeds the resource limit.`);
    }
    normalized.tracks = {
      rows: value.tracks.rows.map((track, index) =>
        normalizedTrack(track, `${path}.tracks.rows[${index}]`)
      ),
      columns: value.tracks.columns.map((track, index) =>
        normalizedTrack(track, `${path}.tracks.columns[${index}]`)
      )
    };
  }
  if (normalized.flow === "grid" && !normalized.tracks) {
    const columns = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, children.length))));
    const rows = Math.max(1, Math.ceil(children.length / columns));
    normalized.tracks = {
      rows: Array.from({ length: rows }, () => ({ type: "flex", value: 1 })),
      columns: Array.from({ length: columns }, () => ({ type: "flex", value: 1 }))
    };
  }
  return normalized;
}

export function createLayoutDocument(): LayoutDocument {
  return { version: LAYOUT_DOCUMENT_VERSION, frames: [] };
}

export function validateLayoutDocument(
  value: unknown,
  context: LayoutValidationContext = {}
): LayoutDocument {
  if (
    !isRecord(value) ||
    value.version !== LAYOUT_DOCUMENT_VERSION ||
    !Array.isArray(value.frames)
  ) {
    throw new LayoutValidationError("layout must be a versioned layout document.");
  }
  if (value.frames.length > LAYOUT_LIMITS.maxFrames) {
    throw new LayoutValidationError("layout contains too many frames.");
  }
  const document: LayoutDocument = {
    version: LAYOUT_DOCUMENT_VERSION,
    frames: value.frames.map((frame, index) => normalizedFrame(frame, `layout.frames[${index}]`))
  };
  const frameIds = new Set<string>();
  const objectIds = context.objectIds ? new Set(context.objectIds) : undefined;
  for (const frame of document.frames) {
    if (frameIds.has(frame.id))
      throw new LayoutValidationError(`layout frame "${frame.id}" is duplicated.`);
    frameIds.add(frame.id);
    if (frame.containerObjectId && objectIds && !objectIds.has(frame.containerObjectId)) {
      throw new LayoutValidationError(
        `layout frame "${frame.id}" references an unknown container object.`
      );
    }
    for (const child of frame.children) {
      if (objectIds && !objectIds.has(child.objectId)) {
        throw new LayoutValidationError(
          `layout frame "${frame.id}" references unknown object "${child.objectId}".`
        );
      }
      if (frame.containerObjectId === child.objectId) {
        throw new LayoutValidationError(
          `layout frame "${frame.id}" cannot contain its own container object.`
        );
      }
      if (frame.containerObjectId && context.parentByObjectId) {
        let parent = context.parentByObjectId.get(child.objectId);
        while (parent) {
          if (parent === frame.containerObjectId) {
            throw new LayoutValidationError(
              `layout frame "${frame.id}" cannot contain descendant object "${child.objectId}" of its container.`
            );
          }
          parent = context.parentByObjectId.get(parent);
        }
      }
    }
    if (context.parentByObjectId) {
      for (let left = 0; left < frame.children.length; left += 1) {
        for (let right = left + 1; right < frame.children.length; right += 1) {
          if (
            isAncestor(
              frame.children[left]!.objectId,
              frame.children[right]!.objectId,
              context.parentByObjectId
            ) ||
            isAncestor(
              frame.children[right]!.objectId,
              frame.children[left]!.objectId,
              context.parentByObjectId
            )
          ) {
            throw new LayoutValidationError(
              `layout frame "${frame.id}" cannot contain ancestor and descendant objects together.`
            );
          }
        }
      }
    }
  }
  const ownerByObjectId = new Map<string, string>();
  for (const frame of document.frames) {
    for (const child of frame.children) {
      const owner = ownerByObjectId.get(child.objectId);
      if (owner && owner !== frame.id) {
        throw new LayoutValidationError(
          `object "${child.objectId}" is owned by multiple layout frames ("${owner}" and "${frame.id}").`
        );
      }
      ownerByObjectId.set(child.objectId, frame.id);
    }
  }
  const bytes = JSON.stringify(document).length * 2;
  if (bytes > LAYOUT_LIMITS.maxSerializedBytes) {
    throw new LayoutValidationError("layout exceeds the serialized resource limit.");
  }
  return document;
}

function isAncestor(
  ancestorId: string,
  descendantId: string,
  parentByObjectId: ReadonlyMap<string, string | undefined>
): boolean {
  let parent = parentByObjectId.get(descendantId);
  while (parent) {
    if (parent === ancestorId) return true;
    parent = parentByObjectId.get(parent);
  }
  return false;
}

export function createLayoutFrame(
  document: LayoutDocument,
  input: CreateLayoutFrameInput
): LayoutDocument {
  const next = structuredClone(document);
  if (next.frames.some((frame) => frame.id === input.frameId)) {
    throw new LayoutValidationError(`layout frame "${input.frameId}" already exists.`);
  }
  next.frames.push(
    normalizedFrame(
      {
        id: input.frameId,
        bounds: input.bounds,
        flow: input.flow,
        padding: input.padding,
        gap: input.gap,
        overflow: input.overflow,
        children: input.children,
        tracks: input.tracks,
        role: input.role,
        containerObjectId: input.containerObjectId
      },
      `layout.frames[${next.frames.length}]`
    )
  );
  return validateLayoutDocument(next);
}

export function removeLayoutFrame(document: LayoutDocument, frameId: string): LayoutDocument {
  const next = structuredClone(document);
  const before = next.frames.length;
  next.frames = next.frames.filter((frame) => frame.id !== frameId);
  if (next.frames.length === before)
    throw new LayoutValidationError(`layout frame "${frameId}" does not exist.`);
  return validateLayoutDocument(next);
}

export function updateLayoutFrame(
  document: LayoutDocument,
  frameId: string,
  patch: Partial<Omit<LayoutFrame, "id">>
): LayoutDocument {
  const next = structuredClone(document);
  const frame = next.frames.find((candidate) => candidate.id === frameId);
  if (!frame) throw new LayoutValidationError(`layout frame "${frameId}" does not exist.`);
  Object.assign(frame, patch);
  return validateLayoutDocument(next);
}

export function insertLayoutChild(
  document: LayoutDocument,
  frameId: string,
  child: LayoutCellSpec,
  index?: number
): LayoutDocument {
  const next = structuredClone(document);
  const frame = next.frames.find((candidate) => candidate.id === frameId);
  if (!frame) throw new LayoutValidationError(`layout frame "${frameId}" does not exist.`);
  if (frame.children.some((candidate) => candidate.objectId === child.objectId)) {
    throw new LayoutValidationError(
      `object "${child.objectId}" is already in layout frame "${frameId}".`
    );
  }
  const position =
    index === undefined
      ? frame.children.length
      : Math.max(0, Math.min(frame.children.length, Math.floor(index)));
  frame.children.splice(position, 0, structuredClone(child));
  return validateLayoutDocument(next);
}

export function removeLayoutChild(
  document: LayoutDocument,
  frameId: string,
  objectId: string
): LayoutDocument {
  const next = structuredClone(document);
  const frame = next.frames.find((candidate) => candidate.id === frameId);
  if (!frame) throw new LayoutValidationError(`layout frame "${frameId}" does not exist.`);
  const before = frame.children.length;
  frame.children = frame.children.filter((child) => child.objectId !== objectId);
  if (frame.children.length === before)
    throw new LayoutValidationError(`object "${objectId}" is not in layout frame "${frameId}".`);
  return validateLayoutDocument(next);
}

function innerBounds(frame: LayoutFrame): LayoutBounds {
  return {
    left: frame.bounds.left + frame.padding.left,
    top: frame.bounds.top + frame.padding.top,
    width: Math.max(0, frame.bounds.width - frame.padding.left - frame.padding.right),
    height: Math.max(0, frame.bounds.height - frame.padding.top - frame.padding.bottom)
  };
}

function normalizedGeometry(value: LayoutChildGeometry, path: string): LayoutChildGeometry {
  return {
    objectId: boundedString(value.objectId, `${path}.objectId`, LAYOUT_LIMITS.maxFrameIdLength),
    bounds: (() => {
      if (!isRecord(value.bounds))
        throw new LayoutResolutionError(`${path}.bounds must be an object.`);
      return {
        left: finite(
          value.bounds.left,
          `${path}.bounds.left`,
          -LAYOUT_LIMITS.maxCoordinate,
          LAYOUT_LIMITS.maxCoordinate
        ),
        top: finite(
          value.bounds.top,
          `${path}.bounds.top`,
          -LAYOUT_LIMITS.maxCoordinate,
          LAYOUT_LIMITS.maxCoordinate
        ),
        width: finite(value.bounds.width, `${path}.bounds.width`, 0, LAYOUT_LIMITS.maxCoordinate),
        height: finite(value.bounds.height, `${path}.bounds.height`, 0, LAYOUT_LIMITS.maxCoordinate)
      };
    })()
  };
}

function placeWithin(
  cell: LayoutBounds,
  width: number,
  height: number,
  horizontalAlign: LayoutAlignment,
  verticalAlign: LayoutAlignment
): LayoutBounds {
  const resolvedWidth = horizontalAlign === "stretch" ? cell.width : width;
  const resolvedHeight = verticalAlign === "stretch" ? cell.height : height;
  const x =
    horizontalAlign === "start"
      ? cell.left
      : horizontalAlign === "end"
        ? cell.left + cell.width - resolvedWidth
        : cell.left + (cell.width - resolvedWidth) / 2;
  const y =
    verticalAlign === "start"
      ? cell.top
      : verticalAlign === "end"
        ? cell.top + cell.height - resolvedHeight
        : cell.top + (cell.height - resolvedHeight) / 2;
  return { left: x, top: y, width: resolvedWidth, height: resolvedHeight };
}

function resolveChildBounds(
  spec: LayoutCellSpec,
  current: LayoutBounds,
  cell: LayoutBounds,
  defaultHorizontal: LayoutAlignment = "center",
  defaultVertical: LayoutAlignment = "center"
): LayoutBounds {
  const horizontalAlign = spec.horizontalAlign ?? defaultHorizontal;
  const verticalAlign = spec.verticalAlign ?? defaultVertical;
  if (spec.sizing === "fill") return { ...cell };
  if (spec.sizing === "preserve-aspect") {
    const scale =
      current.width > 0 && current.height > 0
        ? Math.min(cell.width / current.width, cell.height / current.height)
        : 0;
    return placeWithin(
      cell,
      current.width * Math.max(0, scale),
      current.height * Math.max(0, scale),
      horizontalAlign,
      verticalAlign
    );
  }
  return placeWithin(
    cell,
    spec.sizing === "fixed" ? (spec.width ?? current.width) : current.width,
    spec.sizing === "fixed" ? (spec.height ?? current.height) : current.height,
    horizontalAlign,
    verticalAlign
  );
}

function overflowDiagnostic(frame: LayoutFrame, amount: number): LayoutDiagnostic {
  return {
    code: "FRAME_OVERFLOW",
    frameId: frame.id,
    message: `Layout frame "${frame.id}" requires ${amount.toFixed(3)} more document units than its available track space.`
  };
}

function childOverflowDiagnostics(
  frame: LayoutFrame,
  children: readonly LayoutResolvedChild[]
): LayoutDiagnostic[] {
  const inner = innerBounds(frame);
  return children.flatMap((child) => {
    const right = child.bounds.left + child.bounds.width;
    const bottom = child.bounds.top + child.bounds.height;
    const overflow = Math.max(
      0,
      inner.left - child.bounds.left,
      inner.top - child.bounds.top,
      right - (inner.left + inner.width),
      bottom - (inner.top + inner.height)
    );
    return overflow > 0
      ? [
          {
            code: "FRAME_OVERFLOW" as const,
            frameId: frame.id,
            objectId: child.objectId,
            message: `Object "${child.objectId}" exceeds the content bounds of layout frame "${frame.id}" by ${overflow.toFixed(3)} document units.`
          }
        ]
      : [];
  });
}

function trackSizes(
  tracks: LayoutTrack[],
  available: number,
  gapSize: number
): { sizes: number[]; overflow: number } {
  const gapTotal = gapSize * Math.max(0, tracks.length - 1);
  const fixed = tracks
    .filter((track) => track.type === "fixed")
    .reduce((sum, track) => sum + track.value, 0);
  const flex = tracks
    .filter((track) => track.type === "flex")
    .reduce((sum, track) => sum + track.value, 0);
  const remaining = available - gapTotal - fixed;
  const flexUnit = flex > 0 ? Math.max(0, remaining) / flex : 0;
  const sizes = tracks.map((track) =>
    track.type === "fixed" ? track.value : track.value * flexUnit
  );
  return { sizes, overflow: Math.max(0, -remaining) };
}

function starts(sizes: readonly number[], start: number, gapSize: number): number[] {
  const positions: number[] = [];
  let cursor = start;
  sizes.forEach((size) => {
    positions.push(cursor);
    cursor += size + gapSize;
  });
  return positions;
}

function resolveHorizontal(
  frame: LayoutFrame,
  children: readonly LayoutChildGeometry[]
): LayoutResolution {
  const inner = innerBounds(frame);
  const available = inner.width - frame.gap.horizontal * Math.max(0, children.length - 1);
  const fixed = children.reduce((sum, child, index) => {
    const spec = frame.children[index]!;
    return spec.sizing === "fill"
      ? sum
      : sum + (spec.sizing === "fixed" ? (spec.width ?? child.bounds.width) : child.bounds.width);
  }, 0);
  const fillCount = frame.children.filter((child) => child.sizing === "fill").length;
  const fillWidth = fillCount > 0 ? Math.max(0, available - fixed) / fillCount : 0;
  const required = fixed + fillWidth * fillCount;
  const diagnostics = required > available ? [overflowDiagnostic(frame, required - available)] : [];
  let cursor = inner.left;
  const resolved = children.map((child, index) => {
    const spec = frame.children[index]!;
    const width =
      spec.sizing === "fill"
        ? fillWidth
        : spec.sizing === "fixed"
          ? (spec.width ?? child.bounds.width)
          : child.bounds.width;
    const result = resolveChildBounds(
      spec,
      child.bounds,
      { left: cursor, top: inner.top, width, height: inner.height },
      "start",
      spec.sizing === "fill" ? "stretch" : "center"
    );
    cursor += width + frame.gap.horizontal;
    return { objectId: child.objectId, bounds: result };
  });
  return {
    frameId: frame.id,
    children: resolved,
    diagnostics: [...diagnostics, ...childOverflowDiagnostics(frame, resolved)]
  };
}

function resolveVertical(
  frame: LayoutFrame,
  children: readonly LayoutChildGeometry[]
): LayoutResolution {
  const inner = innerBounds(frame);
  const available = inner.height - frame.gap.vertical * Math.max(0, children.length - 1);
  const fixed = children.reduce((sum, child, index) => {
    const spec = frame.children[index]!;
    return spec.sizing === "fill"
      ? sum
      : sum +
          (spec.sizing === "fixed" ? (spec.height ?? child.bounds.height) : child.bounds.height);
  }, 0);
  const fillCount = frame.children.filter((child) => child.sizing === "fill").length;
  const fillHeight = fillCount > 0 ? Math.max(0, available - fixed) / fillCount : 0;
  const required = fixed + fillHeight * fillCount;
  const diagnostics = required > available ? [overflowDiagnostic(frame, required - available)] : [];
  let cursor = inner.top;
  const resolved = children.map((child, index) => {
    const spec = frame.children[index]!;
    const height =
      spec.sizing === "fill"
        ? fillHeight
        : spec.sizing === "fixed"
          ? (spec.height ?? child.bounds.height)
          : child.bounds.height;
    const result = resolveChildBounds(
      spec,
      child.bounds,
      { left: inner.left, top: cursor, width: inner.width, height },
      spec.sizing === "fill" ? "stretch" : "center",
      "start"
    );
    cursor += height + frame.gap.vertical;
    return { objectId: child.objectId, bounds: result };
  });
  return {
    frameId: frame.id,
    children: resolved,
    diagnostics: [...diagnostics, ...childOverflowDiagnostics(frame, resolved)]
  };
}

function resolveGrid(
  frame: LayoutFrame,
  children: readonly LayoutChildGeometry[]
): LayoutResolution {
  const inner = innerBounds(frame);
  const tracks = frame.tracks!;
  const rowTrack = trackSizes(tracks.rows, inner.height, frame.gap.vertical);
  const columnTrack = trackSizes(tracks.columns, inner.width, frame.gap.horizontal);
  const rowStarts = starts(rowTrack.sizes, inner.top, frame.gap.vertical);
  const columnStarts = starts(columnTrack.sizes, inner.left, frame.gap.horizontal);
  const diagnostics: LayoutDiagnostic[] = [];
  if (rowTrack.overflow > 0) diagnostics.push(overflowDiagnostic(frame, rowTrack.overflow));
  if (columnTrack.overflow > 0) diagnostics.push(overflowDiagnostic(frame, columnTrack.overflow));
  const occupiedCells = new Map<string, string>();
  const resolved = children.map((child, index) => {
    const spec = frame.children[index]!;
    const row = spec.row ?? Math.floor(index / tracks.columns.length);
    const column = spec.column ?? index % tracks.columns.length;
    const rowSpan = spec.rowSpan ?? 1;
    const columnSpan = spec.columnSpan ?? 1;
    if (row + rowSpan > tracks.rows.length || column + columnSpan > tracks.columns.length) {
      const diagnostic: LayoutDiagnostic = {
        code: "INVALID_CELL",
        frameId: frame.id,
        objectId: child.objectId,
        message: `Object "${child.objectId}" is outside the declared grid tracks.`
      };
      diagnostics.push(diagnostic);
      return { objectId: child.objectId, bounds: child.bounds };
    }
    for (let rowOffset = 0; rowOffset < rowSpan; rowOffset += 1) {
      for (let columnOffset = 0; columnOffset < columnSpan; columnOffset += 1) {
        const cellKey = `${row + rowOffset}:${column + columnOffset}`;
        const previousObjectId = occupiedCells.get(cellKey);
        if (previousObjectId) {
          diagnostics.push({
            code: "INVALID_CELL",
            frameId: frame.id,
            objectId: child.objectId,
            message: `Objects "${previousObjectId}" and "${child.objectId}" overlap grid cell ${cellKey}.`
          });
        }
        occupiedCells.set(cellKey, child.objectId);
      }
    }
    const width =
      columnTrack.sizes.slice(column, column + columnSpan).reduce((sum, value) => sum + value, 0) +
      frame.gap.horizontal * Math.max(0, columnSpan - 1);
    const height =
      rowTrack.sizes.slice(row, row + rowSpan).reduce((sum, value) => sum + value, 0) +
      frame.gap.vertical * Math.max(0, rowSpan - 1);
    return {
      objectId: child.objectId,
      bounds: resolveChildBounds(
        spec,
        child.bounds,
        { left: columnStarts[column]!, top: rowStarts[row]!, width, height },
        "center",
        "center"
      )
    };
  });
  return {
    frameId: frame.id,
    children: resolved,
    diagnostics: [...diagnostics, ...childOverflowDiagnostics(frame, resolved)]
  };
}

export function layoutFrame(
  frame: LayoutFrame,
  childGeometries: readonly LayoutChildGeometry[]
): LayoutResolution {
  const normalized = normalizedFrame(frame, `layout.frame.${frame.id}`);
  const normalizedChildren = childGeometries.map((child, index) =>
    normalizedGeometry(child, `layout.frame.${frame.id}.children[${index}]`)
  );
  if (normalized.children.length !== normalizedChildren.length) {
    throw new LayoutResolutionError(
      `Layout frame "${normalized.id}" expects ${normalized.children.length} children but received ${childGeometries.length}.`
    );
  }
  const expected = normalized.children.map((child) => child.objectId);
  const actual = normalizedChildren.map((child) => child.objectId);
  if (expected.some((id, index) => id !== actual[index])) {
    throw new LayoutResolutionError(
      `Layout frame "${normalized.id}" child order does not match the persisted layout.`
    );
  }
  const result =
    normalized.flow === "horizontal"
      ? resolveHorizontal(normalized, normalizedChildren)
      : normalized.flow === "vertical"
        ? resolveVertical(normalized, normalizedChildren)
        : normalized.flow === "grid"
          ? resolveGrid(normalized, normalizedChildren)
          : {
              frameId: normalized.id,
              children: normalizedChildren.map((child) => ({
                objectId: child.objectId,
                bounds: { ...child.bounds }
              })),
              diagnostics: []
            };
  if (normalized.flow === "free") {
    result.diagnostics.push(...childOverflowDiagnostics(normalized, result.children));
  }
  if (normalized.overflow === "reject" && result.diagnostics.length > 0) {
    throw new LayoutResolutionError(
      `Layout frame "${normalized.id}" cannot resolve without clipping or invalid cells (overflow diagnostics present).`,
      result.diagnostics
    );
  }
  return result;
}
