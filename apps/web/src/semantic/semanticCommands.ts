import type { ShapeKind, TextKind } from "@/editor/creation";
import {
  SEMANTIC_RUNTIME_VERSION,
  type JsonSchema,
  type SemanticCommandDefinition
} from "./semanticTypes";

export const SHAPE_KINDS = [
  "rectangle",
  "rounded-rectangle",
  "ellipse",
  "circle",
  "pill",
  "donut",
  "triangle",
  "right-triangle",
  "pentagon",
  "polygon",
  "octagon",
  "diamond",
  "trapezoid",
  "parallelogram",
  "line",
  "curved-line",
  "arrow",
  "double-arrow",
  "curved-arrow",
  "bracket",
  "callout",
  "membrane"
] as const satisfies readonly ShapeKind[];

export const TEXT_KINDS = ["point", "box"] as const satisfies readonly TextKind[];
export const CONNECTOR_KINDS = [
  "line",
  "curved-line",
  "arrow",
  "double-arrow",
  "curved-arrow"
] as const;
export const ALIGN_AXES = ["left", "center", "right", "top", "middle", "bottom"] as const;
export const ARRANGE_ACTIONS = ["front", "forward", "backward", "back"] as const;
export const PROPERTY_KEYS = [
  "left",
  "top",
  "angle",
  "scaleX",
  "scaleY",
  "width",
  "height",
  "opacity",
  "fill",
  "stroke",
  "strokeWidth",
  "strokeDashArray",
  "strokeLineCap",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "textAlign",
  "charSpacing",
  "lineHeight",
  "underline",
  "linethrough",
  "overline",
  "flipX",
  "flipY"
] as const;

export const MUTATION_COMMAND_NAMES = [
  "set_selection",
  "create_text",
  "create_shape",
  "create_connector",
  "move_objects",
  "rotate_objects",
  "scale_objects",
  "flip_objects",
  "set_object_properties",
  "set_asset_color_preset",
  "arrange_objects",
  "align_objects",
  "distribute_objects",
  "duplicate_objects",
  "delete_objects",
  "group_objects",
  "ungroup_objects",
  "undo",
  "redo"
] as const;

const number = (minimum?: number, maximum?: number): JsonSchema => ({
  type: "number",
  ...(minimum === undefined ? {} : { minimum }),
  ...(maximum === undefined ? {} : { maximum })
});

const point = (): JsonSchema => ({
  type: "object",
  properties: { x: number(), y: number() },
  required: ["x", "y"],
  additionalProperties: false
});

const objectId = (): JsonSchema => ({ type: "string", minLength: 1, maxLength: 200 });
const objectIds = (minItems = 1): JsonSchema => ({
  type: "array",
  minItems,
  maxItems: 200,
  items: objectId()
});
const emptyObject = (): JsonSchema => ({
  type: "object",
  properties: {},
  additionalProperties: false
});
const output = (properties: Record<string, JsonSchema> = {}): JsonSchema => ({
  type: "object",
  properties,
  additionalProperties: false
});
const changedOutput = output({
  objectId: objectId(),
  objectIds: objectIds()
});

const propertySchemas: Record<string, JsonSchema> = {
  left: number(-100000, 100000),
  top: number(-100000, 100000),
  angle: number(-3600, 3600),
  scaleX: number(0.01, 100),
  scaleY: number(0.01, 100),
  width: number(0.01, 100000),
  height: number(0.01, 100000),
  opacity: number(0, 1),
  fill: { type: "string", maxLength: 200 },
  stroke: { type: "string", maxLength: 200 },
  strokeWidth: number(0, 1000),
  strokeDashArray: {
    oneOf: [{ type: "null" }, { type: "array", maxItems: 64, items: number(0, 10000) }]
  },
  strokeLineCap: { type: "string", enum: ["butt", "round"] },
  fontFamily: { type: "string", maxLength: 200 },
  fontSize: number(6, 400),
  fontWeight: number(100, 900),
  fontStyle: { type: "string", enum: ["normal", "italic"] },
  textAlign: { type: "string", enum: ["left", "center", "right", "justify"] },
  charSpacing: number(-1000, 10000),
  lineHeight: number(0.1, 20),
  underline: { type: "boolean" },
  linethrough: { type: "boolean" },
  overline: { type: "boolean" },
  flipX: { type: "boolean" },
  flipY: { type: "boolean" }
};

const propertiesSchema: JsonSchema = {
  type: "object",
  properties: propertySchemas,
  additionalProperties: false
};

const definitions: SemanticCommandDefinition[] = [
  {
    name: "inspect_scene",
    title: "Inspect scene",
    description:
      "Return a bounded, JSON-safe snapshot of the current project canvas and hierarchy.",
    version: SEMANTIC_RUNTIME_VERSION,
    risk: "read_only",
    confirmation: "none",
    retryable: true,
    idempotent: true,
    cancellable: false,
    requires: ["project"],
    inputSchema: {
      type: "object",
      properties: {
        maxObjects: number(1, 500),
        maxDepth: number(0, 12)
      },
      additionalProperties: false
    },
    outputSchema: output({
      projectId: objectId(),
      runtimeVersion: { type: "string" },
      canvasReady: { type: "boolean" },
      canvas: { type: "object" },
      selectionObjectIds: { type: "array", maxItems: 200, items: objectId() },
      objects: { type: "array", maxItems: 500 },
      truncated: { type: "boolean" },
      warnings: { type: "array", maxItems: 32, items: { type: "string" } }
    })
  },
  {
    name: "inspect_object",
    title: "Inspect object",
    description: "Inspect one scene object by its stable OpenSketch object ID.",
    version: SEMANTIC_RUNTIME_VERSION,
    risk: "read_only",
    confirmation: "none",
    retryable: true,
    idempotent: true,
    cancellable: false,
    requires: ["project"],
    inputSchema: output({ objectId: objectId() }),
    outputSchema: output({ object: { type: "object" } })
  },
  {
    name: "inspect_selection",
    title: "Inspect selection",
    description: "Inspect the current human selection without changing it.",
    version: SEMANTIC_RUNTIME_VERSION,
    risk: "read_only",
    confirmation: "none",
    retryable: true,
    idempotent: true,
    cancellable: false,
    requires: ["project"],
    inputSchema: emptyObject(),
    outputSchema: output({
      objectIds: objectIds(0),
      objects: { type: "array", maxItems: 200 }
    })
  },
  {
    name: "set_selection",
    title: "Set selection",
    description: "Explicitly set the visible canvas selection to stable object IDs.",
    version: SEMANTIC_RUNTIME_VERSION,
    risk: "reversible_mutation",
    confirmation: "none",
    retryable: true,
    idempotent: true,
    cancellable: false,
    requires: ["project", "canvas"],
    inputSchema: {
      type: "object",
      properties: { objectIds: objectIds(0) },
      required: ["objectIds"],
      additionalProperties: false
    },
    outputSchema: output({ objectIds: objectIds(0) })
  },
  {
    name: "create_text",
    title: "Create text",
    description: "Create a point or box text object through the normal editor creation pathway.",
    version: SEMANTIC_RUNTIME_VERSION,
    risk: "reversible_mutation",
    confirmation: "none",
    retryable: false,
    idempotent: false,
    cancellable: false,
    requires: ["project", "canvas"],
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: TEXT_KINDS },
        text: { type: "string", minLength: 1, maxLength: 4000 },
        x: number(),
        y: number(),
        fontSize: number(6, 400),
        fontWeight: number(100, 900)
      },
      required: ["kind"],
      additionalProperties: false
    },
    outputSchema: changedOutput
  },
  {
    name: "create_shape",
    title: "Create shape",
    description: "Create one existing OpenSketch shape kind without DOM or raw Fabric access.",
    version: SEMANTIC_RUNTIME_VERSION,
    risk: "reversible_mutation",
    confirmation: "none",
    retryable: false,
    idempotent: false,
    cancellable: false,
    requires: ["project", "canvas"],
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: SHAPE_KINDS },
        x: number(),
        y: number()
      },
      required: ["kind"],
      additionalProperties: false
    },
    outputSchema: changedOutput
  },
  {
    name: "create_connector",
    title: "Create connector",
    description: "Create a free connector or a connector bound to two exact scene object IDs.",
    version: SEMANTIC_RUNTIME_VERSION,
    risk: "reversible_mutation",
    confirmation: "none",
    retryable: false,
    idempotent: false,
    cancellable: false,
    requires: ["project", "canvas"],
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: CONNECTOR_KINDS },
        fromObjectId: objectId(),
        toObjectId: objectId(),
        from: point(),
        to: point(),
        fromAnchor: { type: "string", enum: ["top", "right", "bottom", "left", "center"] },
        toAnchor: { type: "string", enum: ["top", "right", "bottom", "left", "center"] },
        startArrowhead: {
          type: "string",
          enum: ["none", "triangle", "open", "circle", "open-circle", "bar", "neuron"]
        },
        endArrowhead: {
          type: "string",
          enum: ["none", "triangle", "open", "circle", "open-circle", "bar", "neuron"]
        },
        lineStyle: { type: "string", enum: ["solid", "dashed", "dotted"] },
        pathShape: {
          type: "string",
          enum: [
            "straight",
            "elbow",
            "rounded-elbow",
            "step",
            "rounded-step",
            "arc",
            "arch",
            "wave",
            "pulse",
            "circular",
            "bracket-square",
            "bracket-square-center",
            "bracket-round",
            "bracket-curly"
          ]
        },
        curvature: number(-1, 1),
        opacity: number(0, 1),
        widthScale: number(0.1, 10)
      },
      required: ["kind"],
      additionalProperties: false
    },
    outputSchema: changedOutput
  },
  {
    name: "move_objects",
    title: "Move objects",
    description: "Translate exact scene objects by a bounded canvas delta.",
    version: SEMANTIC_RUNTIME_VERSION,
    risk: "reversible_mutation",
    confirmation: "none",
    retryable: true,
    idempotent: false,
    cancellable: false,
    requires: ["project", "canvas"],
    inputSchema: {
      type: "object",
      properties: {
        objectIds: objectIds(),
        dx: number(-100000, 100000),
        dy: number(-100000, 100000)
      },
      required: ["objectIds", "dx", "dy"],
      additionalProperties: false
    },
    outputSchema: changedOutput
  },
  {
    name: "rotate_objects",
    title: "Rotate objects",
    description: "Rotate exact scene objects by a bounded number of degrees.",
    version: SEMANTIC_RUNTIME_VERSION,
    risk: "reversible_mutation",
    confirmation: "none",
    retryable: true,
    idempotent: false,
    cancellable: false,
    requires: ["project", "canvas"],
    inputSchema: {
      type: "object",
      properties: { objectIds: objectIds(), degrees: number(-3600, 3600) },
      required: ["objectIds", "degrees"],
      additionalProperties: false
    },
    outputSchema: changedOutput
  },
  {
    name: "scale_objects",
    title: "Scale objects",
    description: "Scale exact scene objects with positive finite factors.",
    version: SEMANTIC_RUNTIME_VERSION,
    risk: "reversible_mutation",
    confirmation: "none",
    retryable: true,
    idempotent: false,
    cancellable: false,
    requires: ["project", "canvas"],
    inputSchema: {
      type: "object",
      properties: {
        objectIds: objectIds(),
        scaleX: number(0.01, 100),
        scaleY: number(0.01, 100)
      },
      required: ["objectIds"],
      additionalProperties: false
    },
    outputSchema: changedOutput
  },
  {
    name: "flip_objects",
    title: "Flip objects",
    description: "Flip exact scene objects on one canvas axis.",
    version: SEMANTIC_RUNTIME_VERSION,
    risk: "reversible_mutation",
    confirmation: "none",
    retryable: true,
    idempotent: false,
    cancellable: false,
    requires: ["project", "canvas"],
    inputSchema: {
      type: "object",
      properties: { objectIds: objectIds(), axis: { type: "string", enum: ["x", "y"] } },
      required: ["objectIds", "axis"],
      additionalProperties: false
    },
    outputSchema: changedOutput
  },
  {
    name: "set_object_properties",
    title: "Set object properties",
    description: "Set only the typed, whitelisted properties supported by OpenSketch objects.",
    version: SEMANTIC_RUNTIME_VERSION,
    risk: "reversible_mutation",
    confirmation: "none",
    retryable: true,
    idempotent: true,
    cancellable: false,
    requires: ["project", "canvas"],
    inputSchema: {
      type: "object",
      properties: { objectIds: objectIds(), properties: propertiesSchema },
      required: ["objectIds", "properties"],
      additionalProperties: false
    },
    outputSchema: changedOutput
  },
  {
    name: "set_asset_color_preset",
    title: "Set asset color preset",
    description: "Apply one existing OpenSketch asset color preset to one exact asset object.",
    version: SEMANTIC_RUNTIME_VERSION,
    risk: "reversible_mutation",
    confirmation: "none",
    retryable: true,
    idempotent: true,
    cancellable: true,
    requires: ["project", "canvas"],
    inputSchema: {
      type: "object",
      properties: {
        objectId: objectId(),
        presetId: { type: "string", minLength: 1, maxLength: 100 }
      },
      required: ["objectId", "presetId"],
      additionalProperties: false
    },
    outputSchema: output({ objectId: objectId(), presetId: { type: "string" } })
  },
  {
    name: "arrange_objects",
    title: "Arrange objects",
    description: "Move exact objects within their existing layer collection.",
    version: SEMANTIC_RUNTIME_VERSION,
    risk: "reversible_mutation",
    confirmation: "none",
    retryable: true,
    idempotent: true,
    cancellable: false,
    requires: ["project", "canvas"],
    inputSchema: {
      type: "object",
      properties: { objectIds: objectIds(), action: { type: "string", enum: ARRANGE_ACTIONS } },
      required: ["objectIds", "action"],
      additionalProperties: false
    },
    outputSchema: changedOutput
  },
  {
    name: "align_objects",
    title: "Align objects",
    description: "Align exact objects to the union bounds of the requested set.",
    version: SEMANTIC_RUNTIME_VERSION,
    risk: "reversible_mutation",
    confirmation: "none",
    retryable: true,
    idempotent: true,
    cancellable: false,
    requires: ["project", "canvas"],
    inputSchema: {
      type: "object",
      properties: { objectIds: objectIds(), axis: { type: "string", enum: ALIGN_AXES } },
      required: ["objectIds", "axis"],
      additionalProperties: false
    },
    outputSchema: changedOutput
  },
  {
    name: "distribute_objects",
    title: "Distribute objects",
    description: "Distribute three or more exact objects evenly across one axis.",
    version: SEMANTIC_RUNTIME_VERSION,
    risk: "reversible_mutation",
    confirmation: "none",
    retryable: true,
    idempotent: true,
    cancellable: false,
    requires: ["project", "canvas"],
    inputSchema: {
      type: "object",
      properties: {
        objectIds: objectIds(),
        axis: { type: "string", enum: ["horizontal", "vertical"] }
      },
      required: ["objectIds", "axis"],
      additionalProperties: false
    },
    outputSchema: changedOutput
  },
  {
    name: "duplicate_objects",
    title: "Duplicate objects",
    description: "Clone exact objects with fresh identities through the editor's clone pathway.",
    version: SEMANTIC_RUNTIME_VERSION,
    risk: "reversible_mutation",
    confirmation: "none",
    retryable: false,
    idempotent: false,
    cancellable: false,
    requires: ["project", "canvas"],
    inputSchema: {
      type: "object",
      properties: { objectIds: objectIds(), offset: point() },
      required: ["objectIds"],
      additionalProperties: false
    },
    outputSchema: changedOutput
  },
  {
    name: "delete_objects",
    title: "Delete objects",
    description:
      "Delete exact scene objects and their bound connectors; explicit confirmation is required.",
    version: SEMANTIC_RUNTIME_VERSION,
    risk: "sensitive_or_destructive",
    confirmation: "explicit",
    retryable: false,
    idempotent: true,
    cancellable: false,
    requires: ["project", "canvas"],
    inputSchema: {
      type: "object",
      properties: { objectIds: objectIds(), confirmed: { type: "boolean" } },
      required: ["objectIds", "confirmed"],
      additionalProperties: false
    },
    outputSchema: changedOutput
  },
  {
    name: "group_objects",
    title: "Group objects",
    description: "Group exact sibling objects while preserving the existing scene hierarchy.",
    version: SEMANTIC_RUNTIME_VERSION,
    risk: "reversible_mutation",
    confirmation: "none",
    retryable: false,
    idempotent: false,
    cancellable: false,
    requires: ["project", "canvas"],
    inputSchema: {
      type: "object",
      properties: { objectIds: objectIds() },
      required: ["objectIds"],
      additionalProperties: false
    },
    outputSchema: changedOutput
  },
  {
    name: "ungroup_objects",
    title: "Ungroup object",
    description:
      "Ungroup one existing manual group without selecting it as an implementation trick.",
    version: SEMANTIC_RUNTIME_VERSION,
    risk: "reversible_mutation",
    confirmation: "none",
    retryable: false,
    idempotent: false,
    cancellable: false,
    requires: ["project", "canvas"],
    inputSchema: {
      type: "object",
      properties: { objectIds: { ...objectIds(), maxItems: 1 } },
      required: ["objectIds"],
      additionalProperties: false
    },
    outputSchema: changedOutput
  },
  {
    name: "undo",
    title: "Undo semantic edit",
    description: "Undo the most recent editor history step through the normal history pathway.",
    version: SEMANTIC_RUNTIME_VERSION,
    risk: "reversible_mutation",
    confirmation: "none",
    retryable: false,
    idempotent: false,
    cancellable: false,
    requires: ["project", "canvas"],
    inputSchema: emptyObject(),
    outputSchema: output({ applied: { type: "boolean" } })
  },
  {
    name: "redo",
    title: "Redo semantic edit",
    description: "Redo the next editor history step through the normal history pathway.",
    version: SEMANTIC_RUNTIME_VERSION,
    risk: "reversible_mutation",
    confirmation: "none",
    retryable: false,
    idempotent: false,
    cancellable: false,
    requires: ["project", "canvas"],
    inputSchema: emptyObject(),
    outputSchema: output({ applied: { type: "boolean" } })
  }
];

const batchOperationSchema: JsonSchema = {
  type: "object",
  properties: {
    command: { type: "string", enum: MUTATION_COMMAND_NAMES },
    input: {
      oneOf: definitions
        .filter((definition) =>
          MUTATION_COMMAND_NAMES.includes(
            definition.name as (typeof MUTATION_COMMAND_NAMES)[number]
          )
        )
        .map((definition) => definition.inputSchema)
    },
    as: { type: "string", minLength: 1, maxLength: 32 }
  },
  required: ["command", "input"],
  additionalProperties: false
};

definitions.push({
  name: "batch",
  title: "Run semantic batch",
  description: "Run a bounded list of registered typed mutations as one atomic history step.",
  version: SEMANTIC_RUNTIME_VERSION,
  risk: "reversible_mutation",
  confirmation: "none",
  retryable: false,
  idempotent: false,
  cancellable: true,
  requires: ["project", "canvas"],
  inputSchema: {
    type: "object",
    properties: {
      operations: { type: "array", minItems: 1, maxItems: 32, items: batchOperationSchema }
    },
    required: ["operations"],
    additionalProperties: false
  },
  outputSchema: output({ operations: { type: "array", maxItems: 32 }, objectIds: objectIds(0) })
});

export const SEMANTIC_COMMANDS = Object.freeze(definitions);
export type SemanticCommandName = (typeof SEMANTIC_COMMANDS)[number]["name"];
