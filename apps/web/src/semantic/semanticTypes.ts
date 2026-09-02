export const SEMANTIC_RUNTIME_VERSION = "opensketch.semantic.v1" as const;

export type SemanticRisk =
  "read_only" | "reversible_mutation" | "sensitive_or_destructive" | "side_effect";

export type SemanticConfirmation = "none" | "explicit";

export interface JsonSchema {
  type?: string;
  title?: string;
  description?: string;
  enum?: readonly unknown[];
  required?: readonly string[];
  additionalProperties?: boolean;
  minItems?: number;
  maxItems?: number;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  integer?: boolean;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  oneOf?: readonly JsonSchema[];
}

export interface SemanticCommandDefinition {
  name: string;
  title: string;
  description: string;
  version: typeof SEMANTIC_RUNTIME_VERSION;
  risk: SemanticRisk;
  confirmation: SemanticConfirmation;
  retryable: boolean;
  idempotent: boolean;
  cancellable: boolean;
  requires: readonly ("project" | "canvas")[];
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}

export interface SemanticBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface SemanticPoint {
  x: number;
  y: number;
}

export interface SemanticStyleSummary {
  fill?: string;
  stroke?: string;
  opacity?: number;
  strokeWidth?: number;
  strokeLineCap?: string;
  strokeDashArray?: number[] | null;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string | number;
  fontStyle?: string;
  textAlign?: string;
}

export interface SemanticObjectDescriptor {
  objectId: string;
  type: string;
  name?: string;
  text?: string;
  parentObjectId?: string;
  depth: number;
  pathObjectIds: string[];
  bounds: SemanticBounds;
  position: SemanticPoint;
  rotation: number;
  scale: SemanticPoint;
  visible: boolean;
  selectable: boolean;
  style: SemanticStyleSummary;
  asset?: {
    familyId?: string;
    variantId?: string;
    provenance?: Record<string, string>;
  };
  connector?: {
    fromObjectId: string;
    fromAnchor: string;
    toObjectId: string;
    toAnchor: string;
    startArrowhead: string;
    endArrowhead: string;
    lineStyle: string;
    routing?: string;
    pathShape?: string;
  };
  freeConnector?: {
    from: SemanticPoint;
    to: SemanticPoint;
  };
  children?: string[];
}

export interface SemanticSceneSnapshot {
  runtimeVersion: typeof SEMANTIC_RUNTIME_VERSION;
  projectId: string;
  canvasReady: boolean;
  canvas?: {
    width: number;
    height: number;
    unit: string;
    dpi: number;
    background: string;
    transparent: boolean;
  };
  selectionObjectIds: string[];
  objects: SemanticObjectDescriptor[];
  truncated: boolean;
  warnings: string[];
}

export interface SemanticAdapterResult {
  data?: unknown;
  changedObjectIds?: string[];
  warnings?: string[];
}

export interface SemanticEditorAdapter {
  getProjectId(): string;
  isCanvasReady(): boolean;
  getCanvasSettings(): SemanticSceneSnapshot["canvas"];
  getSelectionObjectIds(): string[];
  inspectScene(options: { maxObjects: number; maxDepth: number }): SemanticSceneSnapshot;
  inspectObject(objectId: string): SemanticObjectDescriptor | undefined;
  searchAssets(options: { query: string; category?: string; limit: number }): Promise<unknown>;
  inspectAsset(options: { familyId: string; variantId?: string }): Promise<unknown>;
  inspectProvenance(): unknown;
  execute(command: string, input: Record<string, unknown>): Promise<SemanticAdapterResult>;
  runTransaction<T>(operation: () => Promise<T>): Promise<T>;
}

export interface SemanticCommandSuccess<T = unknown> {
  ok: true;
  runtimeVersion: typeof SEMANTIC_RUNTIME_VERSION;
  data?: T;
  changedObjectIds: string[];
  warnings: string[];
}

export interface SemanticCommandFailure {
  ok: false;
  runtimeVersion: typeof SEMANTIC_RUNTIME_VERSION;
  error: {
    code: string;
    message: string;
  };
  changedObjectIds: string[];
  warnings: string[];
}

export type SemanticCommandResult<T = unknown> = SemanticCommandSuccess<T> | SemanticCommandFailure;
