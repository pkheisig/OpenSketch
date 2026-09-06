import type { ShapeKind, TextKind } from "@/editor/creation";
import { PORTABLE_PROJECT_LIMITS } from "@workspace/editor-core";
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
export const OBJECT_ANCHORS = ["top", "right", "bottom", "left", "center"] as const;
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
  "set_object_semantics",
  "create_text",
  "set_text_content",
  "create_shape",
  "create_connector",
  "create_bound_connector",
  "connect_sequence",
  "repair_connectors",
  "create_circular_arc",
  "insert_asset",
  "replace_asset_variant",
  "move_objects",
  "snap_object",
  "layout_objects_radially",
  "layout_objects_linear",
  "attach_object",
  "place_object_between",
  "rotate_objects",
  "scale_objects",
  "resize_objects",
  "flip_objects",
  "set_object_properties",
  "set_asset_color_preset",
  "arrange_objects",
  "align_objects",
  "distribute_objects",
  "apply_layout_plan",
  "repair_layout",
  "rebind_connector",
  "duplicate_objects",
  "delete_objects",
  "group_objects",
  "ungroup_objects",
  "compose_labeled_group",
  "compose_interaction",
  "create_particle_field",
  "create_annotation",
  "fit_text",
  "normalize_styles"
] as const;

const number = (minimum?: number, maximum?: number): JsonSchema => ({
  type: "number",
  ...(minimum === undefined ? {} : { minimum }),
  ...(maximum === undefined ? {} : { maximum })
});

const assetStyle = (): JsonSchema => ({
  type: "string",
  enum: ["detailed", "simplified"]
});

const integer = (minimum?: number, maximum?: number): JsonSchema => ({
  ...number(minimum, maximum),
  integer: true
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

const assetFamilyId = (): JsonSchema => ({ type: "string", minLength: 1, maxLength: 200 });
const assetVariantId = (): JsonSchema => ({ type: "string", minLength: 1, maxLength: 200 });
const assetLimit = (): JsonSchema => integer(1, 100);
const exportFormat = { type: "string", enum: ["svg", "pdf", "png", "credits"] } as const;

const semanticRole = {
  type: "string",
  enum: [
    "hub",
    "stage",
    "stage-content",
    "stage-label",
    "stage-title",
    "stage-subtitle",
    "scientific-asset",
    "interaction-participant",
    "mediator",
    "particle-field",
    "annotation",
    "intervention",
    "main-flow-connector",
    "annotation-leader",
    "decorative"
  ]
} as const;
const semanticRelationKind = {
  type: "string",
  enum: [
    "flow_to",
    "labels",
    "contacts",
    "binds",
    "crosses",
    "emits",
    "follows_gradient",
    "inhibited_by",
    "intervention_targets"
  ]
} as const;
const semanticMetadataSchema: JsonSchema = {
  type: "object",
  properties: {
    version: integer(1, 1),
    semanticRole,
    semanticType: { type: "string", maxLength: 120 },
    stageId: { type: "string", maxLength: 120 },
    stageIndex: integer(0, 999),
    tags: { type: "array", maxItems: 16, items: { type: "string", maxLength: 200 } },
    relationIds: { type: "array", maxItems: 32, items: { type: "string", maxLength: 200 } },
    preferredPortHint: {
      type: "string",
      enum: [
        "incoming",
        "outgoing",
        "radial-in",
        "radial-out",
        "clockwise",
        "counterclockwise",
        "annotation",
        "custom"
      ]
    },
    pinned: { type: "boolean" },
    allowedOverlapObjectIds: { type: "array", maxItems: 32, items: objectId() },
    semanticName: { type: "string", maxLength: 160 },
    layoutConstraint: {
      type: "object",
      properties: {
        version: integer(1, 1),
        kind: { type: "string", enum: ["label-placement"] },
        placement: { type: "string", enum: ["outward", "top", "right", "bottom", "left"] },
        contentObjectId: objectId(),
        labelObjectId: objectId(),
        referenceCenter: point(),
        gap: number(0, 10000)
      },
      required: [
        "version",
        "kind",
        "placement",
        "contentObjectId",
        "labelObjectId",
        "referenceCenter",
        "gap"
      ],
      additionalProperties: false
    }
  },
  required: ["version"],
  additionalProperties: false
};
const semanticRelationSchema: JsonSchema = {
  type: "object",
  properties: {
    id: objectId(),
    kind: semanticRelationKind,
    sourceObjectId: objectId(),
    targetObjectId: objectId(),
    mediatorObjectIds: { type: "array", maxItems: 8, items: objectId() },
    direction: { type: "string", enum: ["forward", "reverse", "bidirectional"] },
    allowedOverlap: { type: "boolean" }
  },
  required: ["id", "kind", "sourceObjectId", "targetObjectId"],
  additionalProperties: false
};
const objectAnchor = { type: "string", enum: OBJECT_ANCHORS } as const;

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
    cancellable: true,
    requires: ["project"],
    inputSchema: {
      type: "object",
      properties: {
        maxObjects: integer(1, 500),
        maxDepth: integer(0, 12)
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
    cancellable: true,
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
    cancellable: true,
    requires: ["project"],
    inputSchema: emptyObject(),
    outputSchema: output({
      objectIds: objectIds(0),
      objects: { type: "array", maxItems: 200 }
    })
  },
  {
    name: "search_assets",
    title: "Search scientific assets",
    description:
      "Search the bundled OpenSketch scientific asset manifest by trusted title, keywords, category, or provenance metadata.",
    version: SEMANTIC_RUNTIME_VERSION,
    risk: "read_only",
    confirmation: "none",
    retryable: true,
    idempotent: true,
    cancellable: true,
    requires: ["project"],
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", maxLength: 200 },
        category: { type: "string", maxLength: 100 },
        style: assetStyle(),
        limit: assetLimit()
      },
      required: ["query"],
      additionalProperties: false
    },
    outputSchema: output({ results: { type: "array", maxItems: 100 }, total: number(0, 100000) })
  },
  {
    name: "inspect_asset",
    title: "Inspect scientific asset",
    description:
      "Inspect one bundled asset family or exact variant without returning raw SVG source.",
    version: SEMANTIC_RUNTIME_VERSION,
    risk: "read_only",
    confirmation: "none",
    retryable: true,
    idempotent: true,
    cancellable: true,
    requires: ["project"],
    inputSchema: {
      type: "object",
      properties: { familyId: assetFamilyId(), variantId: assetVariantId(), style: assetStyle() },
      required: ["familyId"],
      additionalProperties: false
    },
    outputSchema: output({ family: { type: "object" } })
  },
  {
    name: "inspect_provenance",
    title: "Inspect figure provenance",
    description: "Return a bounded provenance summary for assets currently present in the figure.",
    version: SEMANTIC_RUNTIME_VERSION,
    risk: "read_only",
    confirmation: "none",
    retryable: true,
    idempotent: true,
    cancellable: true,
    requires: ["project"],
    inputSchema: emptyObject(),
    outputSchema: output({
      version: number(1, 1),
      assets: { type: "array", maxItems: 200 },
      truncated: { type: "boolean" }
    })
  },
  {
    name: "resize_canvas",
    title: "Resize canvas",
    description:
      "Set the logical canvas width and height through the existing editor canvas-settings pathway.",
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
        width: number(1, PORTABLE_PROJECT_LIMITS.maxCanvasDimension),
        height: number(1, PORTABLE_PROJECT_LIMITS.maxCanvasDimension)
      },
      required: ["width", "height"],
      additionalProperties: false
    },
    outputSchema: output({ width: number(1), height: number(1) })
  },
  {
    name: "set_project_metadata",
    title: "Set project metadata",
    description: "Set the current figure name or description through the editor persistence path.",
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
        name: { type: "string", minLength: 1, maxLength: 256 },
        description: { type: "string", maxLength: 16_384 }
      },
      additionalProperties: false
    },
    outputSchema: output({
      name: { type: "string", minLength: 1, maxLength: 256 },
      description: { type: "string", maxLength: 16_384 }
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
    cancellable: true,
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
    cancellable: true,
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
    name: "set_text_content",
    title: "Set text content",
    description:
      "Replace the text content of one exact text object while preserving its identity and style.",
    version: SEMANTIC_RUNTIME_VERSION,
    risk: "reversible_mutation",
    confirmation: "none",
    retryable: true,
    idempotent: true,
    cancellable: true,
    requires: ["project", "canvas"],
    inputSchema: {
      type: "object",
      properties: { objectId: objectId(), text: { type: "string", maxLength: 4_000 } },
      required: ["objectId", "text"],
      additionalProperties: false
    },
    outputSchema: output({ objectId: objectId(), text: { type: "string" } })
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
    cancellable: true,
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
    cancellable: true,
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
      oneOf: [{ required: ["fromObjectId", "toObjectId"] }, { required: ["from", "to"] }],
      required: ["kind"],
      additionalProperties: false
    },
    outputSchema: changedOutput
  },
  {
    name: "create_circular_arc",
    title: "Create circular arc",
    description:
      "Create one exact center-and-radius circular arc with consistent styling and optional arrowheads.",
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
        center: point(),
        radius: number(1, 100_000),
        startAngle: number(-3_600, 3_600),
        endAngle: number(-3_600, 3_600),
        direction: { type: "string", enum: ["clockwise", "counterclockwise"] },
        startArrowhead: {
          type: "string",
          enum: ["none", "triangle", "open", "circle", "open-circle", "bar", "neuron"]
        },
        endArrowhead: {
          type: "string",
          enum: ["none", "triangle", "open", "circle", "open-circle", "bar", "neuron"]
        },
        lineStyle: { type: "string", enum: ["solid", "dashed", "dotted"] },
        opacity: number(0, 1),
        widthScale: number(0.1, 10)
      },
      required: ["center", "radius", "startAngle", "endAngle"],
      additionalProperties: false
    },
    outputSchema: changedOutput
  },
  {
    name: "insert_asset",
    title: "Insert scientific asset",
    description:
      "Insert an exact bundled asset family and variant through the normal editor pathway and return its stable scene object ID.",
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
        familyId: assetFamilyId(),
        variantId: assetVariantId(),
        style: assetStyle(),
        x: number(),
        y: number()
      },
      required: ["familyId", "variantId"],
      additionalProperties: false
    },
    outputSchema: output({
      objectId: objectId(),
      familyId: assetFamilyId(),
      variantId: assetVariantId(),
      style: assetStyle()
    })
  },
  {
    name: "replace_asset_variant",
    title: "Replace asset variant",
    description:
      "Replace one exact asset scene object with a supported variant while preserving its stable object identity and placement.",
    version: SEMANTIC_RUNTIME_VERSION,
    risk: "reversible_mutation",
    confirmation: "none",
    retryable: true,
    idempotent: true,
    cancellable: true,
    requires: ["project", "canvas"],
    inputSchema: {
      type: "object",
      properties: { objectId: objectId(), variantId: assetVariantId(), style: assetStyle() },
      required: ["objectId", "variantId"],
      additionalProperties: false
    },
    outputSchema: output({ objectId: objectId(), variantId: assetVariantId(), style: assetStyle() })
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
    cancellable: true,
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
    name: "snap_object",
    title: "Snap object with gap",
    description:
      "Snap one exact object outside a named side of another object with an exact gap and cross-axis offset.",
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
        targetObjectId: objectId(),
        side: { type: "string", enum: ["top", "right", "bottom", "left"] },
        gap: number(0, 100_000),
        offset: number(-100_000, 100_000),
        angle: number(-3_600, 3_600)
      },
      required: ["objectId", "targetObjectId", "side", "gap"],
      additionalProperties: false
    },
    outputSchema: output({ objectId: objectId(), targetObjectId: objectId(), position: point() })
  },
  {
    name: "layout_objects_radially",
    title: "Layout objects radially",
    description:
      "Distribute ordered exact objects evenly around one circle while keeping each object upright.",
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
        objectIds: objectIds(2),
        center: point(),
        radius: number(1, 100_000),
        startAngle: number(-3_600, 3_600),
        direction: { type: "string", enum: ["clockwise", "counterclockwise"] }
      },
      required: ["objectIds", "center", "radius", "startAngle"],
      additionalProperties: false
    },
    outputSchema: changedOutput
  },
  {
    name: "layout_objects_linear",
    title: "Layout objects with exact gaps",
    description:
      "Lay out ordered exact objects in a centered row or column with an exact gap and cross-axis alignment.",
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
        objectIds: objectIds(2),
        center: point(),
        axis: { type: "string", enum: ["horizontal", "vertical"] },
        gap: number(0, 100_000),
        alignment: { type: "string", enum: ["start", "center", "end"] }
      },
      required: ["objectIds", "center", "axis", "gap"],
      additionalProperties: false
    },
    outputSchema: changedOutput
  },
  {
    name: "attach_object",
    title: "Attach object",
    description:
      "Place one exact object's anchor on another object's anchor once, with an optional canvas offset and absolute rotation. This does not create a persistent attachment.",
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
        targetObjectId: objectId(),
        objectAnchor,
        targetAnchor: objectAnchor,
        offset: point(),
        angle: number(-3600, 3600)
      },
      required: ["objectId", "targetObjectId", "objectAnchor", "targetAnchor"],
      additionalProperties: false
    },
    outputSchema: output({ objectId: objectId(), targetObjectId: objectId(), position: point() })
  },
  {
    name: "place_object_between",
    title: "Place object between objects",
    description:
      "Place one exact object's anchor at the midpoint between named anchors on two other objects, with an optional canvas offset and absolute rotation.",
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
        fromObjectId: objectId(),
        toObjectId: objectId(),
        objectAnchor,
        fromAnchor: objectAnchor,
        toAnchor: objectAnchor,
        offset: point(),
        angle: number(-3600, 3600)
      },
      required: [
        "objectId",
        "fromObjectId",
        "toObjectId",
        "objectAnchor",
        "fromAnchor",
        "toAnchor"
      ],
      additionalProperties: false
    },
    outputSchema: output({
      objectId: objectId(),
      fromObjectId: objectId(),
      toObjectId: objectId(),
      position: point()
    })
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
    cancellable: true,
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
    cancellable: true,
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
    name: "resize_objects",
    title: "Resize objects",
    description:
      "Set absolute displayed width and/or height in each object's parent plane, before rotation, using the inspector's scale-based sizing. Preserves intrinsic SVG geometry. One dimension preserves aspect ratio by default; two dimensions require preserveAspectRatio: false. Bound connectors must be resized through their endpoints instead.",
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
        objectIds: objectIds(),
        width: number(0.01, 100000),
        height: number(0.01, 100000),
        preserveAspectRatio: { type: "boolean" }
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
    cancellable: true,
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
    description:
      "Apply typed, whitelisted object properties. Use resize_objects for displayed size: raw width/height are not allowed on groups or assets. Use set_asset_color_preset to recolor an asset, and text properties only on text objects.",
    version: SEMANTIC_RUNTIME_VERSION,
    risk: "reversible_mutation",
    confirmation: "none",
    retryable: true,
    idempotent: true,
    cancellable: true,
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
    idempotent: false,
    cancellable: true,
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
    idempotent: false,
    cancellable: true,
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
    cancellable: true,
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
    name: "rebind_connector",
    title: "Rebind connector",
    description:
      "Retarget an existing bound connector to exact objects and edge-center anchors while preserving its identity and appearance.",
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
        connectorId: objectId(),
        fromObjectId: objectId(),
        fromAnchor: objectAnchor,
        toObjectId: objectId(),
        toAnchor: objectAnchor
      },
      required: ["connectorId"],
      additionalProperties: false
    },
    outputSchema: output({
      connectorId: objectId(),
      fromObjectId: objectId(),
      toObjectId: objectId()
    })
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
    cancellable: true,
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
    cancellable: true,
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
    cancellable: true,
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
    cancellable: true,
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
    cancellable: true,
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
    cancellable: true,
    requires: ["project", "canvas"],
    inputSchema: emptyObject(),
    outputSchema: output({ applied: { type: "boolean" } })
  },
  {
    name: "export_figure",
    title: "Export figure",
    description:
      "Export the current figure through the existing sanitized SVG, PDF, PNG, or provenance-credit pathway.",
    version: SEMANTIC_RUNTIME_VERSION,
    risk: "side_effect",
    confirmation: "none",
    retryable: false,
    idempotent: false,
    cancellable: true,
    requires: ["project", "canvas"],
    inputSchema: {
      type: "object",
      properties: {
        format: exportFormat,
        title: { type: "string", maxLength: 400 },
        description: { type: "string", maxLength: 2_000 },
        transparent: { type: "boolean" },
        dpi: number(1, 2_400),
        background: { type: "string", maxLength: 100 }
      },
      required: ["format"],
      additionalProperties: false
    },
    outputSchema: output({ format: exportFormat, started: { type: "boolean" } })
  }
];

definitions.push(
  {
    name: "find_objects",
    title: "Find semantic objects",
    description:
      "Find bounded scene objects by semantic role, stage, tag, type, asset, text, ancestor, or relation.",
    version: SEMANTIC_RUNTIME_VERSION,
    risk: "read_only",
    confirmation: "none",
    retryable: true,
    idempotent: true,
    cancellable: true,
    requires: ["project"],
    inputSchema: {
      type: "object",
      properties: {
        semanticRole,
        semanticType: { type: "string", minLength: 1, maxLength: 120 },
        stageId: { type: "string", maxLength: 120 },
        stageIndex: integer(0, 999),
        tag: { type: "string", maxLength: 200 },
        objectType: { type: "string", maxLength: 64 },
        assetFamilyId: assetFamilyId(),
        assetVariantId: assetVariantId(),
        text: { type: "string", maxLength: 200 },
        caseSensitive: { type: "boolean" },
        ancestorObjectId: objectId(),
        relationId: objectId(),
        limit: integer(1, 100)
      },
      additionalProperties: false
    },
    outputSchema: output({ objects: { type: "array", maxItems: 100 }, total: integer(0, 100000) })
  },
  {
    name: "inspect_geometry",
    title: "Inspect semantic geometry",
    description:
      "Inspect bounded visual, layout, selection, hull, text-independent geometry, and stable ports for exact objects.",
    version: SEMANTIC_RUNTIME_VERSION,
    risk: "read_only",
    confirmation: "none",
    retryable: true,
    idempotent: true,
    cancellable: true,
    requires: ["project"],
    inputSchema: {
      type: "object",
      properties: { objectIds: objectIds(1), clearance: number(0, 1000) },
      required: ["objectIds"],
      additionalProperties: false
    },
    outputSchema: output({ objects: { type: "array", maxItems: 32 } })
  },
  {
    name: "inspect_relations",
    title: "Inspect semantic relations",
    description: "Return a bounded relation graph for exact objects or the current figure.",
    version: SEMANTIC_RUNTIME_VERSION,
    risk: "read_only",
    confirmation: "none",
    retryable: true,
    idempotent: true,
    cancellable: true,
    requires: ["project"],
    inputSchema: {
      type: "object",
      properties: {
        objectIds: objectIds(0),
        stageId: { type: "string", maxLength: 120 },
        limit: integer(1, 256)
      },
      additionalProperties: false
    },
    outputSchema: output({
      relations: { type: "array", maxItems: 256 },
      truncated: { type: "boolean" }
    })
  },
  {
    name: "list_object_ports",
    title: "List object ports",
    description: "List deterministic geometry-aware ports for exact scene objects.",
    version: SEMANTIC_RUNTIME_VERSION,
    risk: "read_only",
    confirmation: "none",
    retryable: true,
    idempotent: true,
    cancellable: true,
    requires: ["project"],
    inputSchema: {
      type: "object",
      properties: {
        objectIds: objectIds(1),
        kind: {
          type: "string",
          enum: [
            "incoming",
            "outgoing",
            "radial-in",
            "radial-out",
            "clockwise",
            "counterclockwise",
            "annotation",
            "custom"
          ]
        }
      },
      required: ["objectIds"],
      additionalProperties: false
    },
    outputSchema: output({ objects: { type: "array", maxItems: 32 } })
  },
  {
    name: "set_object_semantics",
    title: "Set object semantics",
    description:
      "Apply only whitelisted semantic metadata and validated relation records to exact objects in one reversible publication.",
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
        metadata: semanticMetadataSchema,
        relations: { type: "array", maxItems: 32, items: semanticRelationSchema }
      },
      required: ["objectId", "metadata"],
      additionalProperties: false
    },
    outputSchema: output({
      objectId: objectId(),
      metadata: semanticMetadataSchema,
      relationIds: { type: "array", maxItems: 32, items: objectId() }
    })
  },
  {
    name: "create_bound_connector",
    title: "Create bound connector",
    description:
      "Create a persistently bound connector between exact semantic objects using visual-hull ports and bounded route types.",
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
        fromObjectId: objectId(),
        toObjectId: objectId(),
        fromPortId: objectId(),
        toPortId: objectId(),
        routeType: {
          type: "string",
          enum: ["straight", "orthogonal", "bezier", "outside", "circular-arc", "cycle-arc"]
        },
        direction: { type: "string", enum: ["clockwise", "counterclockwise"] },
        center: point(),
        radius: number(1, 100000),
        axes: {
          type: "object",
          properties: { x: number(1, 100000), y: number(1, 100000) },
          required: ["x", "y"],
          additionalProperties: false
        },
        clearance: number(0, 1000),
        arrowhead: {
          type: "string",
          enum: ["none", "triangle", "open", "circle", "open-circle", "bar", "neuron"]
        }
      },
      required: ["fromObjectId", "toObjectId"],
      additionalProperties: false
    },
    outputSchema: output({
      objectId: objectId(),
      fromObjectId: objectId(),
      toObjectId: objectId(),
      fromPortId: objectId(),
      toPortId: objectId(),
      routeType: { type: "string" }
    })
  },
  {
    name: "connect_sequence",
    title: "Connect semantic sequence",
    description:
      "Create or update adjacent persistently bound connectors for an ordered open or closed semantic sequence.",
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
        objectIds: objectIds(2),
        closed: { type: "boolean" },
        direction: { type: "string", enum: ["clockwise", "counterclockwise"] },
        arrowhead: {
          type: "string",
          enum: ["none", "triangle", "open", "circle", "open-circle", "bar", "neuron"]
        },
        routeType: {
          type: "string",
          enum: ["straight", "orthogonal", "bezier", "outside", "circular-arc", "cycle-arc"]
        },
        center: point(),
        radius: number(1, 100000),
        axes: {
          type: "object",
          properties: { x: number(1, 100000), y: number(1, 100000) },
          required: ["x", "y"],
          additionalProperties: false
        }
      },
      required: ["objectIds"],
      additionalProperties: false
    },
    outputSchema: output({ connectorIds: objectIds(0), bindings: { type: "array", maxItems: 200 } })
  },
  {
    name: "repair_connectors",
    title: "Repair bound connectors",
    description:
      "Repair only explicitly targeted connector bindings, ports, endpoints, arrowhead clearance, or route context.",
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
        connectorIds: objectIds(1),
        fromObjectId: objectId(),
        toObjectId: objectId(),
        category: {
          type: "string",
          enum: ["binding", "port", "arrowhead", "route", "scope", "z-order"]
        }
      },
      required: ["connectorIds", "category"],
      additionalProperties: false
    },
    outputSchema: output({ connectorIds: objectIds(0), repaired: { type: "array", maxItems: 32 } })
  },
  {
    name: "plan_layout",
    title: "Plan semantic layout",
    description:
      "Create a deterministic, bounded, non-mutating layout plan with a scene-revision guard and constraint diagnostics.",
    version: SEMANTIC_RUNTIME_VERSION,
    risk: "read_only",
    confirmation: "none",
    retryable: true,
    idempotent: true,
    cancellable: true,
    requires: ["project", "canvas"],
    inputSchema: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["cycle", "flow", "path", "grid", "cluster", "free"] },
        objectIds: objectIds(1),
        center: point(),
        radius: number(1, 100000),
        axes: {
          type: "object",
          properties: { x: number(1, 100000), y: number(1, 100000) },
          required: ["x", "y"],
          additionalProperties: false
        },
        preferredAxes: {
          type: "object",
          description: "Soft cycle axes; the planner may expand them to satisfy hard constraints.",
          properties: { x: number(1, 100000), y: number(1, 100000) },
          required: ["x", "y"],
          additionalProperties: false
        },
        fixedAxes: { type: "boolean", description: "Treat axes as a hard constraint." },
        startAngle: number(-3600, 3600),
        direction: { type: "string", enum: ["clockwise", "counterclockwise"] },
        gap: number(0, 10000),
        padding: number(0, 10000),
        maxIterations: number(1, 64),
        pinnedObjectIds: objectIds(0),
        maxMovement: number(0, 100000),
        hubKeepOut: {
          type: "object",
          properties: { left: number(), top: number(), width: number(0), height: number(0) },
          required: ["left", "top", "width", "height"],
          additionalProperties: false
        }
      },
      required: ["mode", "objectIds"],
      additionalProperties: false
    },
    outputSchema: output({ plan: { type: "object" } })
  },
  {
    name: "apply_layout_plan",
    title: "Apply layout plan",
    description:
      "Apply one current retained layout plan atomically after verifying its exact scene revision and targets.",
    version: SEMANTIC_RUNTIME_VERSION,
    risk: "reversible_mutation",
    confirmation: "none",
    retryable: true,
    idempotent: true,
    cancellable: true,
    requires: ["project", "canvas"],
    inputSchema: {
      type: "object",
      properties: { planId: objectId() },
      required: ["planId"],
      additionalProperties: false
    },
    outputSchema: output({ planId: objectId(), sceneRevision: objectId(), objectIds: objectIds(0) })
  },
  {
    name: "repair_layout",
    title: "Repair semantic layout",
    description:
      "Generate and apply a bounded minimal layout repair for explicitly targeted objects.",
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
        objectIds: objectIds(1),
        mode: { type: "string", enum: ["cycle", "flow", "path", "grid", "cluster", "free"] },
        center: point(),
        radius: number(1, 100000),
        gap: number(0, 10000),
        padding: number(0, 10000)
      },
      required: ["objectIds", "mode"],
      additionalProperties: false
    },
    outputSchema: output({ planId: objectId(), objectIds: objectIds(0) })
  },
  {
    name: "compose_labeled_group",
    title: "Compose labeled scientific group",
    description:
      "Atomically compose existing scientific content with a stage label and optional title/subtitle using semantic roles.",
    version: SEMANTIC_RUNTIME_VERSION,
    risk: "reversible_mutation",
    confirmation: "none",
    retryable: true,
    idempotent: false,
    cancellable: true,
    requires: ["project", "canvas"],
    inputSchema: {
      type: "object",
      properties: {
        objectIds: objectIds(1),
        label: { type: "string", minLength: 1, maxLength: 240 },
        title: { type: "string", maxLength: 240 },
        subtitle: { type: "string", maxLength: 400 },
        placement: { type: "string", enum: ["outward", "top", "right", "bottom", "left"] },
        stageId: { type: "string", maxLength: 120 },
        stageIndex: integer(0, 999),
        x: number(-100000, 100000),
        y: number(-100000, 100000)
      },
      required: ["objectIds", "label"],
      additionalProperties: false
    },
    outputSchema: output({
      objectId: objectId(),
      contentObjectId: objectId(),
      labelObjectId: objectId(),
      objectIds: objectIds(0)
    })
  },
  {
    name: "compose_interaction",
    title: "Compose scientific interaction",
    description:
      "Place two semantic participants and optional mediator geometry for a bounded scientific interaction relation.",
    version: SEMANTIC_RUNTIME_VERSION,
    risk: "reversible_mutation",
    confirmation: "none",
    retryable: true,
    idempotent: false,
    cancellable: true,
    requires: ["project", "canvas"],
    inputSchema: {
      type: "object",
      properties: {
        sourceObjectId: objectId(),
        targetObjectId: objectId(),
        mode: {
          type: "string",
          enum: [
            "contact",
            "binding",
            "secretion",
            "engulfment",
            "migration",
            "cross-boundary",
            "progression"
          ]
        },
        offset: number(0, 10000),
        mediatorObjectId: objectId(),
        relationId: objectId()
      },
      required: ["sourceObjectId", "targetObjectId", "mode"],
      additionalProperties: false
    },
    outputSchema: output({
      relation: semanticRelationSchema,
      source: point(),
      target: point(),
      mediator: point(),
      metrics: { type: "object" },
      warnings: { type: "array", maxItems: 16, items: { type: "string", maxLength: 320 } }
    })
  },
  {
    name: "create_particle_field",
    title: "Create bounded particle field",
    description:
      "Create a deterministic editable particle group within a bounded region or between semantic endpoints.",
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
        count: integer(1, 256),
        distribution: {
          type: "string",
          enum: ["cloud", "uniform", "linear", "arc", "gradient", "source-fan", "target-converging"]
        },
        seed: { type: "string", minLength: 1, maxLength: 120 },
        bounds: {
          type: "object",
          properties: {
            left: number(),
            top: number(),
            width: number(1, 100000),
            height: number(1, 100000)
          },
          required: ["left", "top", "width", "height"],
          additionalProperties: false
        },
        sourceObjectId: objectId(),
        targetObjectId: objectId(),
        semanticType: { type: "string", maxLength: 120 },
        role: { type: "string", enum: ["particle-field", "decorative"] }
      },
      required: ["count", "distribution", "seed"],
      additionalProperties: false
    },
    outputSchema: output({
      objectId: objectId(),
      particleIds: { type: "array", maxItems: 256, items: objectId() },
      seed: { type: "string" },
      distribution: {
        type: "string",
        enum: ["cloud", "uniform", "linear", "arc", "gradient", "source-fan", "target-converging"]
      },
      points: { type: "array", maxItems: 256 },
      reused: { type: "boolean" }
    })
  },
  {
    name: "create_annotation",
    title: "Create target-bound annotation",
    description:
      "Create an annotation with deterministic candidate placement and an optional bound leader to one semantic target.",
    version: SEMANTIC_RUNTIME_VERSION,
    risk: "reversible_mutation",
    confirmation: "none",
    retryable: true,
    idempotent: false,
    cancellable: true,
    requires: ["project", "canvas"],
    inputSchema: {
      type: "object",
      properties: {
        targetObjectId: objectId(),
        text: { type: "string", minLength: 1, maxLength: 800 },
        placement: { type: "string", enum: ["auto", "top", "right", "bottom", "left"] },
        gap: number(0, 1000),
        fontSize: number(6, 200),
        leader: { type: "boolean" },
        maxWidth: number(1, 100000),
        maxLines: integer(1, 32),
        relationId: objectId()
      },
      required: ["targetObjectId", "text"],
      additionalProperties: false
    },
    outputSchema: output({
      objectId: objectId(),
      leaderObjectId: objectId(),
      targetObjectId: objectId(),
      position: point()
    })
  },
  {
    name: "fit_text",
    title: "Fit text to bounds",
    description:
      "Fit editable text using Fabric font metrics and a bounded search without mutating when no fit exists.",
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
        maxWidth: number(1, 100000),
        maxHeight: number(1, 100000),
        minFontSize: number(6, 200),
        maxFontSize: number(6, 400),
        maxLines: integer(1, 64)
      },
      required: ["objectId", "maxWidth", "maxHeight"],
      additionalProperties: false
    },
    outputSchema: output({
      objectId: objectId(),
      fitted: { type: "boolean" },
      fontSize: number(6),
      width: number(0),
      height: number(0),
      lines: integer(1)
    })
  },
  {
    name: "normalize_styles",
    title: "Normalize semantic styles",
    description:
      "Apply canonical role presets to explicit objects or semantic roles without recoloring bundled assets.",
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
        objectIds: objectIds(0),
        roles: { type: "array", maxItems: 16, items: semanticRole },
        presetId: { type: "string", maxLength: 64 },
        includeAssets: { type: "boolean" }
      },
      additionalProperties: false
    },
    outputSchema: output({
      objectIds: objectIds(0),
      changed: integer(0, 256),
      skipped: { type: "array", maxItems: 256, items: objectId() },
      truncated: { type: "boolean" },
      totalChanged: integer(0),
      totalSkipped: integer(0)
    })
  },
  {
    name: "render_scene_preview",
    title: "Render scene preview",
    description:
      "Return bounded capability information for a read-only scene preview; geometry validation remains authoritative when image transport is unavailable.",
    version: SEMANTIC_RUNTIME_VERSION,
    risk: "read_only",
    confirmation: "none",
    retryable: true,
    idempotent: true,
    cancellable: true,
    requires: ["project", "canvas"],
    inputSchema: {
      type: "object",
      properties: {
        maxWidth: integer(64, 2048),
        maxHeight: integer(64, 2048),
        background: { type: "string", enum: ["transparent", "canvas"] }
      },
      additionalProperties: false
    },
    outputSchema: output({
      supported: { type: "boolean" },
      reason: { type: "string", maxLength: 320 },
      sceneRevision: objectId(),
      width: integer(0),
      height: integer(0)
    })
  },
  {
    name: "analyze_composition",
    title: "Analyze composition",
    description:
      "Run a bounded deterministic read-only analysis of geometry, text, connectors, relations, scientific stages, and styles.",
    version: SEMANTIC_RUNTIME_VERSION,
    risk: "read_only",
    confirmation: "none",
    retryable: true,
    idempotent: true,
    cancellable: true,
    requires: ["project", "canvas"],
    inputSchema: {
      type: "object",
      properties: {
        profile: {
          type: "string",
          enum: ["scientific-diagram", "publication", "presentation", "cycle"]
        },
        categories: {
          type: "array",
          maxItems: 6,
          items: {
            type: "string",
            enum: ["geometry", "text", "connectors", "relations", "scientific", "style"]
          }
        },
        maxFindings: integer(1, 256),
        clearance: number(0, 1000),
        padding: number(0, 1000)
      },
      additionalProperties: false
    },
    outputSchema: output({
      version: { type: "string" },
      profile: { type: "string" },
      sceneRevision: objectId(),
      findings: { type: "array", maxItems: 256 },
      counts: { type: "object" },
      metrics: { type: "object" },
      truncated: { type: "boolean" },
      skipped: { type: "array", maxItems: 32 },
      pass: { type: "boolean" }
    })
  },
  {
    name: "validate_figure",
    title: "Validate figure",
    description:
      "Validate a figure against versioned scientific-diagram, publication, presentation, or cycle thresholds without mutation.",
    version: SEMANTIC_RUNTIME_VERSION,
    risk: "read_only",
    confirmation: "none",
    retryable: true,
    idempotent: true,
    cancellable: true,
    requires: ["project", "canvas"],
    inputSchema: {
      type: "object",
      properties: {
        profile: {
          type: "string",
          enum: ["scientific-diagram", "publication", "presentation", "cycle"]
        },
        maxFindings: integer(1, 256),
        clearance: number(0, 1000),
        padding: number(0, 1000)
      },
      required: ["profile"],
      additionalProperties: false
    },
    outputSchema: output({
      version: { type: "string" },
      profile: { type: "string" },
      sceneRevision: objectId(),
      findings: { type: "array", maxItems: 256 },
      counts: { type: "object" },
      metrics: { type: "object" },
      truncated: { type: "boolean" },
      skipped: { type: "array", maxItems: 32 },
      pass: { type: "boolean" }
    })
  }
);

definitions.push({
  name: "return_to_project_library",
  title: "Return to project library",
  description:
    "Durably save the current project and return to the project library through the guarded application path.",
  version: SEMANTIC_RUNTIME_VERSION,
  risk: "reversible_mutation",
  confirmation: "none",
  retryable: true,
  idempotent: true,
  cancellable: true,
  requires: ["project"],
  inputSchema: emptyObject(),
  outputSchema: output({ requested: { type: "boolean" } })
});

const batchOperationSchema: JsonSchema = {
  type: "object",
  properties: {
    command: { type: "string", enum: MUTATION_COMMAND_NAMES },
    // The command is the discriminator. Runtime validation applies that
    // command's schema after resolving aliases.
    input: { type: "object" },
    as: { type: "string", minLength: 1, maxLength: 32 }
  },
  required: ["command", "input"],
  additionalProperties: false
};

definitions.push({
  name: "batch",
  title: "Run semantic batch",
  description:
    "Run a bounded list of registered typed mutations as one atomic history step; one explicit batch confirmation authorizes all operations, including deletes.",
  version: SEMANTIC_RUNTIME_VERSION,
  risk: "sensitive_or_destructive",
  confirmation: "explicit",
  retryable: false,
  idempotent: false,
  cancellable: true,
  requires: ["project", "canvas"],
  inputSchema: {
    type: "object",
    properties: {
      operations: { type: "array", minItems: 1, maxItems: 32, items: batchOperationSchema },
      confirmed: { type: "boolean" }
    },
    required: ["operations", "confirmed"],
    additionalProperties: false
  },
  outputSchema: output({ operations: { type: "array", maxItems: 32 }, objectIds: objectIds(0) })
});

export const SEMANTIC_COMMANDS = Object.freeze(definitions);
export type SemanticCommandName = (typeof SEMANTIC_COMMANDS)[number]["name"];
