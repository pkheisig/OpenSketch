import { DEFAULT_CANVAS } from "./presets";
import {
  OpenSketch_FORMAT_VERSION,
  type ConnectorArrowhead,
  type ConnectorAnchor,
  type ConnectorLineCap,
  type ConnectorLineStyle,
  type ConnectorPathShape,
  type ConnectorRouting,
  type ImportedMediaRecord,
  type PortableProject
} from "./types";
import { repairProjectIdentity } from "./identity";
import {
  decodeImageDataUrlText,
  imageDataUrlByteLength,
  inspectRasterDataUrl,
  isSupportedImageMimeType,
  parseImageDataUrl,
  type ParsedImageDataUrl
} from "./rasterResources";
import { PORTABLE_PROJECT_LIMITS } from "./resourceLimits";

export { repairProjectIdentity } from "./identity";
export type { ProjectIdentityRepair } from "./identity";
export { PORTABLE_PROJECT_LIMITS } from "./resourceLimits";

const SUPPORTED_SCENE_TYPES = new Set([
  "Circle",
  "Ellipse",
  "Group",
  "IText",
  "Image",
  "Line",
  "Path",
  "Polygon",
  "Polyline",
  "Rect",
  "Text",
  "Textbox",
  "Triangle",
  // Fabric 5/6 aliases found in older serialized projects.
  "i-text",
  "image"
]);

const SCENE_ROOT_PROPERTIES = new Set([
  "version",
  "objects",
  "background",
  "overlay",
  "backgroundImage",
  "overlayImage",
  "clipPath"
]);

const SCENE_PROPERTIES = new Set([
  "type",
  "version",
  "originX",
  "originY",
  "left",
  "top",
  "width",
  "height",
  "fill",
  "stroke",
  "strokeWidth",
  "strokeDashArray",
  "strokeLineCap",
  "strokeDashOffset",
  "strokeLineJoin",
  "strokeUniform",
  "strokeMiterLimit",
  "scaleX",
  "scaleY",
  "angle",
  "flipX",
  "flipY",
  "opacity",
  "shadow",
  "visible",
  "backgroundColor",
  "fillRule",
  "paintFirst",
  "globalCompositeOperation",
  "skewX",
  "skewY",
  "clipPath",
  "minScaleLimit",
  "padding",
  "centeredRotation",
  "centeredScaling",
  "lockMovementX",
  "lockMovementY",
  "lockRotation",
  "lockScalingX",
  "lockScalingY",
  "lockSkewingX",
  "lockSkewingY",
  "lockScalingFlip",
  "noScaleCache",
  "hoverCursor",
  "moveCursor",
  "selectionBackgroundColor",
  "perPixelTargetFind",
  "selectable",
  "evented",
  "activeOn",
  "hasControls",
  "borderColor",
  "borderDashArray",
  "cornerColor",
  "cornerStrokeColor",
  "cornerStyle",
  "transparentCorners",
  "cornerSize",
  "touchCornerSize",
  "rotatingPointOffset",
  "borderOpacityWhenMoving",
  "borderScaleFactor",
  "hasBorders",
  "objectCaching",
  "excludeFromExport",
  "includeDefaultValues",
  "inverted",
  "absolutePositioned",
  "dirty",
  "subTargetCheck",
  "interactive",
  "layoutManager",
  "objects",
  "rx",
  "ry",
  "radius",
  "startAngle",
  "endAngle",
  "counterClockwise",
  "x1",
  "x2",
  "y1",
  "y2",
  "points",
  "path",
  "exactBoundingBox",
  "fontSize",
  "fontWeight",
  "fontFamily",
  "fontStyle",
  "lineHeight",
  "text",
  "textAlign",
  "charSpacing",
  "styles",
  "pathStartOffset",
  "pathSide",
  "pathAlign",
  "underline",
  "overline",
  "linethrough",
  "textBackgroundColor",
  "direction",
  "textDecorationThickness",
  "textDecorationColor",
  "deltaY",
  "minWidth",
  "splitByGrapheme",
  "src",
  "crossOrigin",
  "filters",
  "resizeFilter",
  "cropX",
  "cropY",
  "srcFromAttribute",
  "imageSmoothing",
  "objectId",
  "name",
  "OpenSketchType",
  "assetId",
  "familyId",
  "provenance",
  "originalPalette",
  "originalFill",
  "originalStroke",
  "effectBaseFill",
  "effectBaseStroke",
  "originalGradientFill",
  "originalGradientStroke",
  "effectBaseGradientFill",
  "effectBaseGradientStroke",
  "connector",
  "freeConnectorBinding",
  "freeConnectorGeometry",
  "connectorHeadOffsetVersion",
  "assetTint",
  "assetTintAmount",
  "assetSaturation",
  "assetBrightness",
  "assetColorPreset",
  "recognizedGroups",
  "defaultElementStyle",
  "semanticMetadata",
  "semanticRelations",
  "particleFieldSpec",
  "semanticConnector"
]);

const SCENE_NUMERIC_PROPERTIES = new Set([
  "left",
  "top",
  "width",
  "height",
  "strokeWidth",
  "strokeDashOffset",
  "strokeMiterLimit",
  "scaleX",
  "scaleY",
  "opacity",
  "angle",
  "skewX",
  "skewY",
  "minScaleLimit",
  "padding",
  "cornerSize",
  "touchCornerSize",
  "rotatingPointOffset",
  "borderOpacityWhenMoving",
  "borderScaleFactor",
  "rx",
  "ry",
  "radius",
  "startAngle",
  "endAngle",
  "x1",
  "x2",
  "y1",
  "y2",
  "fontSize",
  "lineHeight",
  "charSpacing",
  "pathStartOffset",
  "textDecorationThickness",
  "deltaY",
  "minWidth",
  "cropX",
  "cropY",
  "assetTintAmount",
  "assetSaturation",
  "assetBrightness",
  "connectorHeadOffsetVersion"
]);

const SCENE_BOOLEAN_PROPERTIES = new Set([
  "flipX",
  "flipY",
  "strokeUniform",
  "visible",
  "counterClockwise",
  "centeredRotation",
  "centeredScaling",
  "lockMovementX",
  "lockMovementY",
  "lockRotation",
  "lockScalingX",
  "lockScalingY",
  "lockSkewingX",
  "lockSkewingY",
  "lockScalingFlip",
  "noScaleCache",
  "perPixelTargetFind",
  "selectable",
  "evented",
  "hasControls",
  "transparentCorners",
  "hasBorders",
  "objectCaching",
  "excludeFromExport",
  "includeDefaultValues",
  "inverted",
  "absolutePositioned",
  "dirty",
  "exactBoundingBox",
  "subTargetCheck",
  "interactive",
  "underline",
  "overline",
  "linethrough",
  "splitByGrapheme",
  "srcFromAttribute",
  "imageSmoothing"
]);

const SCENE_STRING_PROPERTIES = new Set([
  "version",
  "originX",
  "originY",
  "strokeLineCap",
  "strokeLineJoin",
  "fillRule",
  "paintFirst",
  "globalCompositeOperation",
  "hoverCursor",
  "moveCursor",
  "activeOn",
  "cornerStyle",
  "fontFamily",
  "fontStyle",
  "text",
  "textAlign",
  "pathSide",
  "pathAlign",
  "direction",
  "textDecorationColor",
  "objectId",
  "name",
  "OpenSketchType",
  "assetId",
  "familyId",
  "assetTint",
  "assetColorPreset",
  "type"
]);

const PAINT_PROPERTIES = new Set([
  "fill",
  "stroke",
  "backgroundColor",
  "selectionBackgroundColor",
  "borderColor",
  "cornerColor",
  "cornerStrokeColor",
  "originalFill",
  "originalStroke",
  "effectBaseFill",
  "effectBaseStroke",
  "textBackgroundColor"
]);

const SUPPORTED_FILTER_TYPES = new Set([
  "BaseFilter",
  "BlackWhite",
  "BlendColor",
  "BlendImage",
  "Blur",
  "Brightness",
  "Brownie",
  "ColorMatrix",
  "Composed",
  "Contrast",
  "Convolute",
  "Gamma",
  "Grayscale",
  "HueRotation",
  "Invert",
  "Kodachrome",
  "Noise",
  "Pixelate",
  "Polaroid",
  "RemoveColor",
  "Resize",
  "Saturation",
  "Sepia",
  "Technicolor",
  "Vibrance"
]);

const CONNECTOR_ANCHORS = new Set<ConnectorAnchor>(["top", "right", "bottom", "left", "center"]);
const CONNECTOR_ARROWHEADS = new Set<ConnectorArrowhead>([
  "none",
  "triangle",
  "open",
  "circle",
  "open-circle",
  "bar",
  "neuron"
]);
const CONNECTOR_LINE_STYLES = new Set<ConnectorLineStyle>(["solid", "dashed", "dotted"]);
const CONNECTOR_LINE_CAPS = new Set<ConnectorLineCap>(["butt", "round"]);
const SEMANTIC_ROLES = new Set([
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
]);
const SEMANTIC_PORT_KINDS = new Set([
  "incoming",
  "outgoing",
  "radial-in",
  "radial-out",
  "clockwise",
  "counterclockwise",
  "annotation",
  "custom"
]);
const SEMANTIC_RELATION_KINDS = new Set([
  "flow_to",
  "labels",
  "contacts",
  "binds",
  "crosses",
  "emits",
  "follows_gradient",
  "inhibited_by",
  "intervention_targets"
]);
const CONNECTOR_ROUTINGS = new Set<ConnectorRouting>(["direct", "orthogonal"]);
const CONNECTOR_PATH_SHAPES = new Set<ConnectorPathShape>([
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
]);

type JsonRecord = Record<string, unknown>;

interface ValidationContext {
  objectCount: number;
  totalDataUrlBytes: number;
  totalRasterArea: number;
  dataUrls: Set<string>;
  objectIds: Set<string>;
  connectorBindings: Array<{
    path: string;
    binding: JsonRecord;
    allowEmptyIds: boolean;
  }>;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function fail(path: string, detail: string): never {
  throw new Error(`The project ${path} ${detail}.`);
}

function assertKnownKeys(value: JsonRecord, path: string, allowed: Set<string>): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(`${path}.${key}`, "uses an unsupported property");
  }
}

function assertString(
  value: unknown,
  path: string,
  options: { maxLength?: number; nonEmpty?: boolean } = {}
): asserts value is string {
  const maxLength = options.maxLength ?? PORTABLE_PROJECT_LIMITS.maxStringLength;
  if (
    typeof value !== "string" ||
    (options.nonEmpty && value.trim().length === 0) ||
    value.length > maxLength
  ) {
    fail(path, "is invalid");
  }
}

function assertFiniteNumber(
  value: unknown,
  path: string,
  options: { min?: number; max?: number; integer?: boolean } = {}
): asserts value is number {
  const min = options.min ?? -PORTABLE_PROJECT_LIMITS.maxCoordinate;
  const max = options.max ?? PORTABLE_PROJECT_LIMITS.maxCoordinate;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (options.integer && !Number.isInteger(value))
  ) {
    fail(path, "is invalid");
  }
}

function assertBoolean(value: unknown, path: string): asserts value is boolean {
  if (typeof value !== "boolean") fail(path, "is invalid");
}

function assertArray(
  value: unknown,
  path: string,
  maxLength: number = PORTABLE_PROJECT_LIMITS.maxArrayLength
): asserts value is unknown[] {
  if (!Array.isArray(value) || value.length > maxLength) {
    fail(path, "is invalid or exceeds its size limit");
  }
}

function assertNonEmptyString(
  value: unknown,
  path: string,
  maxLength: number
): asserts value is string {
  assertString(value, path, { maxLength, nonEmpty: true });
}

function validateRasterResource(
  value: string,
  parsed: ParsedImageDataUrl,
  path: string
): number | undefined {
  if (parsed.mimeType === "image/svg+xml") return undefined;
  const inspection = inspectRasterDataUrl(value, parsed.mimeType);
  if (!inspection) {
    fail(path, "does not contain readable raster dimensions");
  }
  if (
    inspection.width > PORTABLE_PROJECT_LIMITS.maxRasterDimension ||
    inspection.height > PORTABLE_PROJECT_LIMITS.maxRasterDimension ||
    inspection.pixels > PORTABLE_PROJECT_LIMITS.maxRasterArea
  ) {
    fail(path, "exceeds the decoded raster dimension limit");
  }
  return inspection.pixels;
}

function assertSafeSvgText(value: string, path: string): void {
  if (
    /<!doctype\b|<!entity\b|<\s*(?:script|foreignObject|iframe|object|embed)\b|\bon[a-z][\w:-]*\s*=|(?:href|xlink:href|src)\s*=\s*["']?\s*(?:https?:|\/\/|javascript:|data:text\/html)/i.test(
      value
    ) ||
    /url\(\s*["']?(?:https?:|\/\/|javascript:)/i.test(value)
  ) {
    throw new Error("The project contains an external or executable scene reference.");
  }
  if (new TextEncoder().encode(value).byteLength > PORTABLE_PROJECT_LIMITS.maxDataUrlBytes) {
    fail(path, "is invalid");
  }
}

function validateDataUrl(
  value: unknown,
  path: string,
  context: ValidationContext,
  expectedMimeType?: string
): asserts value is string {
  assertString(value, path, { maxLength: PORTABLE_PROJECT_LIMITS.maxDataUrlBytes * 2 });
  if (/^(?:https?:|\/\/|javascript:)/i.test(value.trim())) {
    throw new Error("The project contains an external or executable scene reference.");
  }
  const parsed = parseImageDataUrl(value);
  if (!parsed || !isSupportedImageMimeType(parsed.mimeType) || parsed.payload.length === 0) {
    fail(path, "must be a supported image data URL");
  }
  if (expectedMimeType && parsed.mimeType !== expectedMimeType.toLowerCase()) {
    fail(path, "does not match its declared media type");
  }
  if (
    parsed.base64 &&
    (() => {
      const payload = parsed.payload.replace(/[\t\n\f\r ]+/g, "");
      return payload.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(payload);
    })()
  ) {
    fail(path, "contains invalid base64 data");
  }
  const byteLength = imageDataUrlByteLength(parsed);
  if (!Number.isFinite(byteLength) || byteLength > PORTABLE_PROJECT_LIMITS.maxDataUrlBytes) {
    fail(path, "exceeds the embedded data URL size limit");
  }
  const rasterArea = validateRasterResource(value, parsed, path);
  if (!context.dataUrls.has(value)) {
    context.dataUrls.add(value);
    context.totalDataUrlBytes += byteLength;
    if (context.totalDataUrlBytes > PORTABLE_PROJECT_LIMITS.maxTotalDataUrlBytes) {
      fail(path, "exceeds the total embedded data URL size limit");
    }
    if (rasterArea !== undefined) {
      context.totalRasterArea += rasterArea;
      if (context.totalRasterArea > PORTABLE_PROJECT_LIMITS.maxTotalRasterArea) {
        fail(path, "exceeds the total decoded raster area limit");
      }
    }
  }
  if (parsed.mimeType === "image/svg+xml") {
    const text = decodeImageDataUrlText(parsed);
    if (text === undefined) fail(path, "contains unreadable SVG data");
    assertSafeSvgText(text, path);
  }
}

function validateBoundedData(
  value: unknown,
  path: string,
  context: ValidationContext,
  depth = 0
): void {
  if (depth > PORTABLE_PROJECT_LIMITS.maxMetadataDepth) fail(path, "is too deeply nested");
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "string") {
    if (/^data:image\//i.test(value.trim())) {
      validateDataUrl(value, path, context);
      return;
    }
    assertString(value, path);
    if (
      /^(?:https?:|\/\/|javascript:|data:text\/html)/i.test(value.trim()) ||
      /url\(\s*["']?(?:https?:|\/\/|javascript:)/i.test(value)
    ) {
      throw new Error("The project contains an external or executable scene reference.");
    }
    return;
  }
  if (typeof value === "number") {
    assertFiniteNumber(value, path);
    return;
  }
  if (Array.isArray(value)) {
    assertArray(value, path);
    value.forEach((child, index) =>
      validateBoundedData(child, `${path}[${index}]`, context, depth + 1)
    );
    return;
  }
  if (!isRecord(value)) fail(path, "contains an unsupported value");
  if (Object.keys(value).length > PORTABLE_PROJECT_LIMITS.maxMetadataEntries) {
    fail(path, "contains too many properties");
  }
  for (const [key, child] of Object.entries(value)) {
    assertString(key, `${path} property name`, { maxLength: 128, nonEmpty: true });
    const childPath = `${path}.${key}`;
    if (key.toLowerCase() === "src") {
      validateDataUrl(child, childPath, context);
    } else {
      validateBoundedData(child, childPath, context, depth + 1);
    }
  }
}

function validateGradient(value: JsonRecord, path: string, context: ValidationContext): void {
  assertKnownKeys(
    value,
    path,
    new Set([
      "type",
      "coords",
      "colorStops",
      "offsetX",
      "offsetY",
      "gradientUnits",
      "gradientTransform",
      "id"
    ])
  );
  if (value.type !== "linear" && value.type !== "radial") fail(`${path}.type`, "is invalid");
  if (!isRecord(value.coords)) fail(`${path}.coords`, "is invalid");
  assertKnownKeys(value.coords, `${path}.coords`, new Set(["x1", "y1", "x2", "y2", "r1", "r2"]));
  for (const [key, coordinate] of Object.entries(value.coords)) {
    assertFiniteNumber(coordinate, `${path}.coords.${key}`);
  }
  const colorStops = value.colorStops;
  assertArray(colorStops, `${path}.colorStops`, 256);
  colorStops.forEach((stop, index) => {
    const stopPath = `${path}.colorStops[${index}]`;
    if (!isRecord(stop)) fail(stopPath, "is invalid");
    assertKnownKeys(stop, stopPath, new Set(["offset", "color", "opacity"]));
    assertFiniteNumber(stop.offset, `${stopPath}.offset`, { min: 0, max: 1 });
    assertString(stop.color, `${stopPath}.color`, { maxLength: 4_096, nonEmpty: true });
    if (stop.opacity !== undefined) {
      assertFiniteNumber(stop.opacity, `${stopPath}.opacity`, { min: 0, max: 1 });
    }
  });
  if (value.offsetX !== undefined) assertFiniteNumber(value.offsetX, `${path}.offsetX`);
  if (value.offsetY !== undefined) assertFiniteNumber(value.offsetY, `${path}.offsetY`);
  if (value.gradientUnits !== undefined) {
    if (!["pixels", "percentage", "objectBoundingBox"].includes(String(value.gradientUnits))) {
      fail(`${path}.gradientUnits`, "is invalid");
    }
  }
  if (value.gradientTransform !== undefined) {
    const transform = value.gradientTransform;
    assertArray(transform, `${path}.gradientTransform`, 6);
    if (transform.length !== 6) fail(`${path}.gradientTransform`, "is invalid");
    transform.forEach((item, index) =>
      assertFiniteNumber(item, `${path}.gradientTransform[${index}]`)
    );
  }
  if (value.id !== undefined) {
    if (typeof value.id === "number") {
      assertFiniteNumber(value.id, `${path}.id`, { min: 0 });
    } else {
      assertString(value.id, `${path}.id`, { maxLength: 512, nonEmpty: true });
    }
  }
  void context;
}

function validatePattern(value: JsonRecord, path: string, context: ValidationContext): void {
  assertKnownKeys(
    value,
    path,
    new Set(["type", "source", "repeat", "crossOrigin", "offsetX", "offsetY", "patternTransform"])
  );
  if (value.type !== "pattern") fail(`${path}.type`, "is invalid");
  validateDataUrl(value.source, `${path}.source`, context);
  if (value.repeat !== undefined) {
    if (!["repeat", "repeat-x", "repeat-y", "no-repeat"].includes(String(value.repeat))) {
      fail(`${path}.repeat`, "is invalid");
    }
  }
  if (value.crossOrigin !== undefined)
    assertString(value.crossOrigin, `${path}.crossOrigin`, { maxLength: 64 });
  if (value.offsetX !== undefined) assertFiniteNumber(value.offsetX, `${path}.offsetX`);
  if (value.offsetY !== undefined) assertFiniteNumber(value.offsetY, `${path}.offsetY`);
  if (value.patternTransform !== undefined) {
    const transform = value.patternTransform;
    assertArray(transform, `${path}.patternTransform`, 6);
    if (transform.length !== 6) fail(`${path}.patternTransform`, "is invalid");
    transform.forEach((item, index) =>
      assertFiniteNumber(item, `${path}.patternTransform[${index}]`)
    );
  }
}

function validatePaint(value: unknown, path: string, context: ValidationContext): void {
  if (value === null || value === undefined) return;
  if (typeof value === "string") {
    assertString(value, path);
    if (/(?:url\(\s*(?:https?:|\/\/|javascript:)|data:text\/html|javascript:)/i.test(value)) {
      throw new Error("The project contains an external or executable scene reference.");
    }
    return;
  }
  if (!isRecord(value)) fail(path, "contains an unsupported paint value");
  if (value.type === "linear" || value.type === "radial") {
    validateGradient(value, path, context);
    return;
  }
  if (value.type === "pattern") {
    validatePattern(value, path, context);
    return;
  }
  fail(path, "contains an unsupported paint value");
}

function validateShadow(value: unknown, path: string, context: ValidationContext): void {
  if (value === null || value === undefined) return;
  if (!isRecord(value)) fail(path, "is invalid");
  assertKnownKeys(
    value,
    path,
    new Set(["color", "blur", "offsetX", "offsetY", "affectStroke", "nonScaling", "type"])
  );
  if (value.type !== undefined && value.type !== "shadow") fail(`${path}.type`, "is invalid");
  if (value.color !== undefined) validatePaint(value.color, `${path}.color`, context);
  for (const key of ["blur", "offsetX", "offsetY"]) {
    if (value[key] !== undefined) assertFiniteNumber(value[key], `${path}.${key}`);
  }
  for (const key of ["affectStroke", "nonScaling"]) {
    if (value[key] !== undefined) assertBoolean(value[key], `${path}.${key}`);
  }
}

function validateFilter(value: unknown, path: string, context: ValidationContext): void {
  if (!isRecord(value)) fail(path, "is invalid");
  if (typeof value.type !== "string" || !SUPPORTED_FILTER_TYPES.has(value.type)) {
    fail(`${path}.type`, "is unsupported");
  }
  validateBoundedData(value, path, context);
}

function validateConnectorBinding(
  value: unknown,
  path: string,
  context: ValidationContext | undefined,
  allowEmptyIds: boolean
): void {
  if (!isRecord(value)) fail(path, "is invalid");
  const required = [
    "fromObjectId",
    "fromAnchor",
    "toObjectId",
    "toAnchor",
    "startArrowhead",
    "endArrowhead",
    "lineStyle",
    "curvature"
  ];
  assertKnownKeys(value, path, new Set([...required, "lineCap", "routing", "pathShape"]));
  for (const key of ["fromObjectId", "toObjectId"]) {
    assertString(value[key], `${path}.${key}`, {
      maxLength: PORTABLE_PROJECT_LIMITS.maxObjectIdLength
    });
    if (!allowEmptyIds && value[key].trim().length === 0) fail(`${path}.${key}`, "is invalid");
  }
  for (const [key, allowed] of [
    ["fromAnchor", CONNECTOR_ANCHORS],
    ["toAnchor", CONNECTOR_ANCHORS],
    ["startArrowhead", CONNECTOR_ARROWHEADS],
    ["endArrowhead", CONNECTOR_ARROWHEADS],
    ["lineStyle", CONNECTOR_LINE_STYLES]
  ] as const) {
    if (typeof value[key] !== "string" || !allowed.has(value[key] as never)) {
      fail(`${path}.${key}`, "is invalid");
    }
  }
  for (const [key, allowed] of [
    ["lineCap", CONNECTOR_LINE_CAPS],
    ["routing", CONNECTOR_ROUTINGS],
    ["pathShape", CONNECTOR_PATH_SHAPES]
  ] as const) {
    if (
      value[key] !== undefined &&
      (typeof value[key] !== "string" || !allowed.has(value[key] as never))
    ) {
      fail(`${path}.${key}`, "is invalid");
    }
  }
  assertFiniteNumber(value.curvature, `${path}.curvature`, {
    min: -PORTABLE_PROJECT_LIMITS.maxCurvature,
    max: PORTABLE_PROJECT_LIMITS.maxCurvature
  });
  context?.connectorBindings.push({ path, binding: value, allowEmptyIds });
}

function validatePoint(value: unknown, path: string): void {
  if (!isRecord(value)) fail(path, "is invalid");
  assertKnownKeys(value, path, new Set(["x", "y"]));
  assertFiniteNumber(value.x, `${path}.x`);
  assertFiniteNumber(value.y, `${path}.y`);
}

function validateStyles(
  value: unknown,
  path: string,
  textLength: number,
  context: ValidationContext
): void {
  if (Array.isArray(value)) {
    assertArray(value, path, PORTABLE_PROJECT_LIMITS.maxTextStyles);
    value.forEach((range, index) => {
      const rangePath = `${path}[${index}]`;
      if (!isRecord(range)) fail(rangePath, "is invalid");
      assertKnownKeys(range, rangePath, new Set(["start", "end", "style"]));
      assertFiniteNumber(range.start, `${rangePath}.start`, {
        min: 0,
        max: textLength,
        integer: true
      });
      assertFiniteNumber(range.end, `${rangePath}.end`, { min: 1, max: textLength, integer: true });
      if (range.end <= range.start) fail(rangePath, "has an invalid range");
      validateStyleDeclaration(range.style, `${rangePath}.style`, context);
    });
    return;
  }
  if (!isRecord(value)) fail(path, "is invalid");
  if (Object.keys(value).length > PORTABLE_PROJECT_LIMITS.maxTextStyles)
    fail(path, "contains too many styles");
  let styleCount = 0;
  for (const [line, characters] of Object.entries(value)) {
    if (!/^\d+$/.test(line) || !isRecord(characters)) fail(`${path}.${line}`, "is invalid");
    for (const [character, style] of Object.entries(characters)) {
      if (!/^\d+$/.test(character)) fail(`${path}.${line}.${character}`, "is invalid");
      styleCount += 1;
      if (styleCount > PORTABLE_PROJECT_LIMITS.maxTextStyles)
        fail(path, "contains too many styles");
      validateStyleDeclaration(style, `${path}.${line}.${character}`, context);
    }
  }
}

function validateStyleDeclaration(value: unknown, path: string, context: ValidationContext): void {
  if (!isRecord(value)) fail(path, "is invalid");
  const allowed = new Set([
    "fill",
    "stroke",
    "strokeWidth",
    "fontSize",
    "fontFamily",
    "fontWeight",
    "fontStyle",
    "textBackgroundColor",
    "deltaY",
    "overline",
    "underline",
    "linethrough",
    "textDecorationThickness",
    "textDecorationColor"
  ]);
  assertKnownKeys(value, path, allowed);
  for (const [key, item] of Object.entries(value)) {
    if (["fill", "stroke", "textBackgroundColor", "textDecorationColor"].includes(key)) {
      validatePaint(item, `${path}.${key}`, context);
    } else if (["strokeWidth", "fontSize", "deltaY", "textDecorationThickness"].includes(key)) {
      assertFiniteNumber(item, `${path}.${key}`);
    } else if (["overline", "underline", "linethrough"].includes(key)) {
      assertBoolean(item, `${path}.${key}`);
    } else if (key === "fontWeight") {
      if (typeof item !== "string" && typeof item !== "number")
        fail(`${path}.${key}`, "is invalid");
      if (typeof item === "string") assertString(item, `${path}.${key}`, { maxLength: 64 });
      if (typeof item === "number")
        assertFiniteNumber(item, `${path}.${key}`, { min: 1, max: 1_000 });
    } else {
      assertString(item, `${path}.${key}`, { maxLength: 512 });
    }
  }
}

function validateStringMap(value: unknown, path: string): void {
  if (!isRecord(value)) fail(path, "is invalid");
  if (Object.keys(value).length > PORTABLE_PROJECT_LIMITS.maxMetadataEntries)
    fail(path, "contains too many entries");
  for (const [key, item] of Object.entries(value)) {
    assertString(key, `${path} property name`, { maxLength: 256, nonEmpty: true });
    assertString(item, `${path}.${key}`, { maxLength: PORTABLE_PROJECT_LIMITS.maxStringLength });
    if (["src", "href", "xlink:href"].includes(key.toLowerCase())) {
      if (/^(?:https?:|\/\/|javascript:)/i.test(item.trim())) {
        throw new Error("The project contains an external or executable scene reference.");
      }
    }
    if (/^(?:javascript:|data:text\/html)/i.test(item.trim())) {
      throw new Error("The project contains an external or executable scene reference.");
    }
  }
}

function validateRecognizedGroups(value: unknown, path: string, context: ValidationContext): void {
  // Recognized groups are advisory lineage metadata mirrored onto scene members.
  // Deleting a member can leave a historical ID behind; it is ignored by the
  // recognition matcher and must not make an otherwise renderable project fail.
  assertArray(value, path, PORTABLE_PROJECT_LIMITS.maxMetadataEntries);
  value.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(item)) fail(itemPath, "is invalid");
    assertKnownKeys(item, itemPath, new Set(["objectId", "memberObjectIds", "properties"]));
    assertNonEmptyString(
      item.objectId,
      `${itemPath}.objectId`,
      PORTABLE_PROJECT_LIMITS.maxObjectIdLength
    );
    assertArray(
      item.memberObjectIds,
      `${itemPath}.memberObjectIds`,
      PORTABLE_PROJECT_LIMITS.maxSceneObjects
    );
    const memberIds = new Set<string>();
    item.memberObjectIds.forEach((memberId, memberIndex) => {
      assertNonEmptyString(
        memberId,
        `${itemPath}.memberObjectIds[${memberIndex}]`,
        PORTABLE_PROJECT_LIMITS.maxObjectIdLength
      );
      if (memberIds.has(memberId))
        fail(`${itemPath}.memberObjectIds`, "contains duplicate object IDs");
      memberIds.add(memberId);
    });
    if (!isRecord(item.properties)) fail(`${itemPath}.properties`, "is invalid");
    validateCustomProperties(item.properties, `${itemPath}.properties`, context);
  });
}

function validateStyleSnapshot(
  value: unknown,
  path: string,
  context: ValidationContext,
  depth = 0
): void {
  if (depth > PORTABLE_PROJECT_LIMITS.maxMetadataDepth) fail(path, "is too deeply nested");
  if (!isRecord(value)) fail(path, "is invalid");
  assertKnownKeys(value, path, new Set(["properties", "connector", "children"]));
  if (!isRecord(value.properties)) fail(`${path}.properties`, "is invalid");
  if (Object.keys(value.properties).length > PORTABLE_PROJECT_LIMITS.maxMetadataEntries) {
    fail(`${path}.properties`, "contains too many entries");
  }
  const stylePropertyNames = new Set([
    "fill",
    "stroke",
    "strokeWidth",
    "strokeDashArray",
    "strokeLineCap",
    "strokeLineJoin",
    "strokeUniform",
    "paintFirst",
    "opacity",
    "globalCompositeOperation",
    "fontFamily",
    "fontSize",
    "fontWeight",
    "fontStyle",
    "underline",
    "linethrough",
    "overline",
    "charSpacing",
    "lineHeight",
    "textAlign",
    "scaleX",
    "scaleY",
    "assetTint",
    "assetTintAmount",
    "assetSaturation",
    "assetBrightness",
    "assetColorPreset"
  ]);
  for (const [key, item] of Object.entries(value.properties)) {
    if (!stylePropertyNames.has(key))
      fail(`${path}.properties.${key}`, "uses an unsupported property");
    if (key === "fill" || key === "stroke") {
      validatePaint(item, `${path}.properties.${key}`, context);
    } else if (item === null || typeof item === "string" || typeof item === "boolean") {
      if (typeof item === "string") assertString(item, `${path}.properties.${key}`);
    } else if (typeof item === "number") {
      const max = ["scaleX", "scaleY"].includes(key)
        ? PORTABLE_PROJECT_LIMITS.maxScale
        : PORTABLE_PROJECT_LIMITS.maxCoordinate;
      assertFiniteNumber(item, `${path}.properties.${key}`, { min: -max, max });
    } else if (Array.isArray(item)) {
      assertArray(item, `${path}.properties.${key}`, 128);
      item.forEach((number, index) =>
        assertFiniteNumber(number, `${path}.properties.${key}[${index}]`)
      );
    } else {
      fail(`${path}.properties.${key}`, "contains an unsupported value");
    }
  }
  if (value.connector !== undefined)
    validateConnectorBinding(value.connector, `${path}.connector`, undefined, true);
  if (value.children !== undefined) {
    assertArray(value.children, `${path}.children`, PORTABLE_PROJECT_LIMITS.maxSceneObjects);
    value.children.forEach((child, index) =>
      validateStyleSnapshot(child, `${path}.children[${index}]`, context, depth + 1)
    );
  }
}

function validateCustomProperties(
  value: JsonRecord,
  path: string,
  context: ValidationContext
): void {
  const allowed = new Set([
    "name",
    "OpenSketchType",
    "assetId",
    "familyId",
    "provenance",
    "originalPalette",
    "originalFill",
    "originalStroke",
    "effectBaseFill",
    "effectBaseStroke",
    "originalGradientFill",
    "originalGradientStroke",
    "effectBaseGradientFill",
    "effectBaseGradientStroke",
    "connector",
    "freeConnectorBinding",
    "freeConnectorGeometry",
    "assetTint",
    "assetTintAmount",
    "assetSaturation",
    "assetBrightness",
    "assetColorPreset",
    "recognizedGroups",
    "semanticMetadata",
    "semanticRelations",
    "particleFieldSpec",
    "semanticConnector",
    "defaultElementStyle"
  ]);
  assertKnownKeys(value, path, allowed);
  for (const [key, item] of Object.entries(value)) {
    if (
      ["name", "OpenSketchType", "assetId", "familyId", "assetTint", "assetColorPreset"].includes(
        key
      )
    ) {
      assertString(item, `${path}.${key}`, {
        maxLength: PORTABLE_PROJECT_LIMITS.maxObjectNameLength
      });
    } else if (
      ["originalFill", "originalStroke", "effectBaseFill", "effectBaseStroke"].includes(key)
    ) {
      validatePaint(item, `${path}.${key}`, context);
    } else if (key === "provenance" || key === "originalPalette") {
      validateStringMap(item, `${path}.${key}`);
    } else if (key.endsWith("GradientFill") || key.endsWith("GradientStroke")) {
      if (!isRecord(item)) fail(`${path}.${key}`, "is invalid");
      validateGradient(item, `${path}.${key}`, context);
    } else if (key === "connector") {
      validateConnectorBinding(item, `${path}.${key}`, undefined, false);
    } else if (key === "freeConnectorBinding") {
      validateConnectorBinding(item, `${path}.${key}`, undefined, true);
    } else if (key === "freeConnectorGeometry") {
      if (!isRecord(item)) fail(`${path}.${key}`, "is invalid");
      assertKnownKeys(item, `${path}.${key}`, new Set(["from", "to"]));
      validatePoint(item.from, `${path}.${key}.from`);
      validatePoint(item.to, `${path}.${key}.to`);
    } else if (["assetTintAmount", "assetSaturation", "assetBrightness"].includes(key)) {
      assertFiniteNumber(item, `${path}.${key}`, { min: -1_000, max: 1_000 });
    } else if (key === "recognizedGroups") {
      validateRecognizedGroups(item, `${path}.${key}`, context);
    } else if (key === "defaultElementStyle") {
      validateStyleSnapshot(item, `${path}.${key}`, context);
    } else if (key === "semanticMetadata") {
      validateSemanticMetadata(item, `${path}.${key}`);
    } else if (key === "semanticRelations") {
      validateSemanticRelations(item, `${path}.${key}`);
    } else if (key === "particleFieldSpec") {
      validateParticleFieldSpec(item, `${path}.${key}`);
    } else if (key === "semanticConnector") {
      validateSemanticConnector(item, `${path}.${key}`);
    }
  }
}

function validatePath(value: unknown, path: string): void {
  assertArray(value, path, PORTABLE_PROJECT_LIMITS.maxPathCommands);
  if (value.length === 0) fail(path, "must contain at least one command");
  const commandLengths: Record<string, number> = {
    M: 3,
    L: 3,
    H: 2,
    V: 2,
    C: 7,
    S: 5,
    Q: 5,
    T: 3,
    A: 8,
    Z: 1
  };
  value.forEach((command, index) => {
    const commandPath = `${path}[${index}]`;
    assertArray(command, commandPath, 8);
    const name = command[0];
    if (
      typeof name !== "string" ||
      name.length !== 1 ||
      commandLengths[name.toUpperCase()] === undefined
    ) {
      fail(`${commandPath}[0]`, "contains an unsupported path command");
    }
    const expectedLength = commandLengths[name.toUpperCase()];
    if (command.length !== expectedLength) fail(commandPath, "has the wrong number of coordinates");
    command.slice(1).forEach((number, numberIndex) => {
      assertFiniteNumber(number, `${commandPath}[${numberIndex + 1}]`);
    });
    if (name.toUpperCase() === "A") {
      if (![0, 1].includes(command[4] as number) || ![0, 1].includes(command[5] as number)) {
        fail(commandPath, "contains invalid arc flags");
      }
    }
  });
}

function validatePoints(value: unknown, path: string): void {
  assertArray(value, path, PORTABLE_PROJECT_LIMITS.maxPoints);
  if (value.length < 2) fail(path, "must contain at least two points");
  value.forEach((point, index) => validatePoint(point, `${path}[${index}]`));
}

function validateLayoutManager(value: unknown, path: string): void {
  if (!isRecord(value)) fail(path, "is invalid");
  assertKnownKeys(value, path, new Set(["type", "strategy"]));
  if (value.type !== "layoutManager") fail(`${path}.type`, "is invalid");
  if (
    typeof value.strategy !== "string" ||
    !["fit-content", "fixed", "clip-path"].includes(value.strategy)
  ) {
    fail(`${path}.strategy`, "is unsupported");
  }
}

function validateSemanticMetadata(value: unknown, path: string): void {
  if (!isRecord(value)) fail(path, "is invalid");
  assertKnownKeys(
    value,
    path,
    new Set([
      "version",
      "semanticRole",
      "semanticType",
      "stageId",
      "stageIndex",
      "tags",
      "relationIds",
      "preferredPortHint",
      "pinned",
      "allowedOverlapObjectIds",
      "semanticName"
    ])
  );
  if (value.version !== 1) fail(`${path}.version`, "is unsupported");
  if (
    value.semanticRole !== undefined &&
    (typeof value.semanticRole !== "string" || !SEMANTIC_ROLES.has(value.semanticRole))
  )
    fail(`${path}.semanticRole`, "is unsupported");
  for (const key of ["semanticType", "stageId", "semanticName"] as const) {
    if (value[key] !== undefined)
      assertString(value[key], `${path}.${key}`, {
        maxLength: key === "semanticName" ? 160 : 120,
        nonEmpty: true
      });
  }
  if (value.stageIndex !== undefined)
    assertFiniteNumber(value.stageIndex, `${path}.stageIndex`, { min: 0, max: 999, integer: true });
  for (const key of ["tags", "relationIds", "allowedOverlapObjectIds"] as const) {
    if (value[key] === undefined) continue;
    const maximum = key === "tags" ? 16 : 32;
    assertArray(value[key], `${path}.${key}`, maximum);
    (value[key] as unknown[]).forEach((item, index) =>
      assertNonEmptyString(item, `${path}.${key}[${index}]`, 200)
    );
  }
  if (
    value.preferredPortHint !== undefined &&
    (typeof value.preferredPortHint !== "string" ||
      !SEMANTIC_PORT_KINDS.has(value.preferredPortHint))
  )
    fail(`${path}.preferredPortHint`, "is unsupported");
  if (value.pinned !== undefined) assertBoolean(value.pinned, `${path}.pinned`);
}

function validateParticleFieldSpec(value: unknown, path: string): void {
  if (!isRecord(value)) fail(path, "is invalid");
  assertKnownKeys(
    value,
    path,
    new Set([
      "seed",
      "count",
      "distribution",
      "bounds",
      "sourceObjectId",
      "targetObjectId",
      "semanticType",
      "role"
    ])
  );
  assertNonEmptyString(value.seed, `${path}.seed`, 200);
  assertFiniteNumber(value.count, `${path}.count`, { min: 0, max: 256, integer: true });
  if (
    typeof value.distribution !== "string" ||
    ![
      "cloud",
      "uniform",
      "linear",
      "arc",
      "gradient",
      "source-fan",
      "target-converging"
    ].includes(value.distribution)
  )
    fail(`${path}.distribution`, "is unsupported");
  if (!isRecord(value.bounds)) fail(`${path}.bounds`, "is invalid");
  const bounds = value.bounds;
  assertKnownKeys(bounds, `${path}.bounds`, new Set(["left", "top", "width", "height"]));
  ["left", "top", "width", "height"].forEach((key) =>
    assertFiniteNumber(bounds[key], `${path}.bounds.${key}`, { min: 0 })
  );
  for (const key of ["sourceObjectId", "targetObjectId"] as const) {
    if (value[key] !== undefined) assertNonEmptyString(value[key], `${path}.${key}`, 200);
  }
  if (value.semanticType !== undefined && value.semanticType !== null)
    assertNonEmptyString(value.semanticType, `${path}.semanticType`, 120);
  assertNonEmptyString(value.role, `${path}.role`, 120);
}

function validateSemanticRelations(value: unknown, path: string): void {
  assertArray(value, path, 32);
  value.forEach((item, index) => {
    const relationPath = `${path}[${index}]`;
    if (!isRecord(item)) fail(relationPath, "is invalid");
    assertKnownKeys(
      item,
      relationPath,
      new Set([
        "id",
        "kind",
        "sourceObjectId",
        "targetObjectId",
        "mediatorObjectIds",
        "direction",
        "allowedOverlap"
      ])
    );
    assertNonEmptyString(item.id, `${relationPath}.id`, 200);
    assertNonEmptyString(item.sourceObjectId, `${relationPath}.sourceObjectId`, 200);
    assertNonEmptyString(item.targetObjectId, `${relationPath}.targetObjectId`, 200);
    if (typeof item.kind !== "string" || !SEMANTIC_RELATION_KINDS.has(item.kind))
      fail(`${relationPath}.kind`, "is unsupported");
    if (item.mediatorObjectIds !== undefined) {
      assertArray(item.mediatorObjectIds, `${relationPath}.mediatorObjectIds`, 8);
      (item.mediatorObjectIds as unknown[]).forEach((id, mediatorIndex) =>
        assertNonEmptyString(id, `${relationPath}.mediatorObjectIds[${mediatorIndex}]`, 200)
      );
    }
    if (
      item.direction !== undefined &&
      !["forward", "reverse", "bidirectional"].includes(String(item.direction))
    )
      fail(`${relationPath}.direction`, "is unsupported");
    if (item.allowedOverlap !== undefined)
      assertBoolean(item.allowedOverlap, `${relationPath}.allowedOverlap`);
  });
}

function validateSemanticConnector(value: unknown, path: string): void {
  if (!isRecord(value)) fail(path, "is invalid");
  assertKnownKeys(
    value,
    path,
    new Set(["version", "fromPortId", "toPortId", "routeType", "clearance", "routeContext"])
  );
  if (value.version !== 1) fail(`${path}.version`, "is unsupported");
  assertNonEmptyString(value.fromPortId, `${path}.fromPortId`, 200);
  assertNonEmptyString(value.toPortId, `${path}.toPortId`, 200);
  if (
    !["straight", "orthogonal", "bezier", "outside", "circular-arc", "cycle-arc"].includes(
      String(value.routeType)
    )
  )
    fail(`${path}.routeType`, "is unsupported");
  assertFiniteNumber(value.clearance, `${path}.clearance`, { min: 0, max: 1000 });
  if (value.routeContext !== undefined) {
    if (!isRecord(value.routeContext)) fail(`${path}.routeContext`, "is invalid");
    assertKnownKeys(
      value.routeContext,
      `${path}.routeContext`,
      new Set(["center", "radius", "axes", "direction"])
    );
    if (value.routeContext.center !== undefined)
      validatePoint(value.routeContext.center, `${path}.routeContext.center`);
    if (value.routeContext.radius !== undefined)
      assertFiniteNumber(value.routeContext.radius, `${path}.routeContext.radius`, {
        min: 0,
        max: PORTABLE_PROJECT_LIMITS.maxCoordinate
      });
    if (value.routeContext.axes !== undefined) {
      if (!isRecord(value.routeContext.axes)) fail(`${path}.routeContext.axes`, "is invalid");
      assertFiniteNumber(value.routeContext.axes.x, `${path}.routeContext.axes.x`, {
        min: 0,
        max: PORTABLE_PROJECT_LIMITS.maxCoordinate
      });
      assertFiniteNumber(value.routeContext.axes.y, `${path}.routeContext.axes.y`, {
        min: 0,
        max: PORTABLE_PROJECT_LIMITS.maxCoordinate
      });
    }
    if (
      value.routeContext.direction !== undefined &&
      !["clockwise", "counterclockwise"].includes(String(value.routeContext.direction))
    )
      fail(`${path}.routeContext.direction`, "is unsupported");
  }
}

function validateSceneObject(
  value: unknown,
  path: string,
  context: ValidationContext,
  depth: number
): void {
  if (!isRecord(value)) fail(path, "must be an object");
  if (depth > PORTABLE_PROJECT_LIMITS.maxSceneDepth) fail(path, "exceeds the scene nesting limit");
  context.objectCount += 1;
  if (context.objectCount > PORTABLE_PROJECT_LIMITS.maxSceneObjects)
    fail("scene", "contains too many objects");
  if (Object.keys(value).length > PORTABLE_PROJECT_LIMITS.maxObjectProperties) {
    fail(path, "contains too many properties");
  }
  assertKnownKeys(value, path, SCENE_PROPERTIES);
  if (typeof value.type !== "string" || !SUPPORTED_SCENE_TYPES.has(value.type)) {
    fail(`${path}.type`, "is unsupported");
  }

  for (const [key, item] of Object.entries(value)) {
    if (SCENE_NUMERIC_PROPERTIES.has(key)) {
      const max =
        key === "scaleX" || key === "scaleY"
          ? PORTABLE_PROJECT_LIMITS.maxScale
          : PORTABLE_PROJECT_LIMITS.maxCoordinate;
      assertFiniteNumber(item, `${path}.${key}`, {
        min: key === "opacity" ? 0 : -max,
        max: key === "opacity" ? 1 : max
      });
    } else if (SCENE_BOOLEAN_PROPERTIES.has(key)) {
      assertBoolean(item, `${path}.${key}`);
    } else if (key === "fontWeight") {
      if (typeof item !== "string" && typeof item !== "number")
        fail(`${path}.${key}`, "is invalid");
      if (typeof item === "string") assertString(item, `${path}.${key}`, { maxLength: 64 });
      if (typeof item === "number")
        assertFiniteNumber(item, `${path}.${key}`, { min: 1, max: 1_000 });
    } else if (key === "crossOrigin") {
      if (item !== null) assertString(item, `${path}.${key}`, { maxLength: 64 });
    } else if (SCENE_STRING_PROPERTIES.has(key)) {
      if (["objectId", "assetId", "familyId"].includes(key)) {
        assertNonEmptyString(item, `${path}.${key}`, PORTABLE_PROJECT_LIMITS.maxObjectIdLength);
      } else if (key === "name") {
        assertString(item, `${path}.${key}`, {
          maxLength: PORTABLE_PROJECT_LIMITS.maxObjectNameLength
        });
      } else if (key === "text") {
        assertString(item, `${path}.${key}`, {
          maxLength: PORTABLE_PROJECT_LIMITS.maxStringLength
        });
      } else if (key === "OpenSketchType") {
        assertString(item, `${path}.${key}`, { maxLength: 64, nonEmpty: true });
        if (
          ![
            "connector",
            "group",
            "shape",
            "text",
            "nih-asset",
            "import",
            "upload",
            "svg-part",
            "line",
            "curved-line",
            "arrow",
            "double-arrow",
            "curved-arrow"
          ].includes(item)
        ) {
          fail(`${path}.${key}`, "is unsupported");
        }
      } else {
        assertString(item, `${path}.${key}`);
      }
    } else if (PAINT_PROPERTIES.has(key)) {
      validatePaint(item, `${path}.${key}`, context);
    } else if (["strokeDashArray", "borderDashArray"].includes(key)) {
      if (item === null) continue;
      assertArray(item, `${path}.${key}`, 128);
      item.forEach((number, index) =>
        assertFiniteNumber(number, `${path}.${key}[${index}]`, {
          min: 0,
          max: PORTABLE_PROJECT_LIMITS.maxCoordinate
        })
      );
    } else if (key === "shadow") {
      validateShadow(item, `${path}.${key}`, context);
    } else if (key === "clipPath") {
      validateSceneObject(item, `${path}.${key}`, context, depth + 1);
    } else if (key === "layoutManager") {
      if (value.type !== "Group") fail(`${path}.layoutManager`, "is only supported on groups");
      validateLayoutManager(item, `${path}.${key}`);
    } else if (key === "objects") {
      if (value.type !== "Group") fail(`${path}.objects`, "is only supported on groups");
      if (!Array.isArray(item)) fail(`${path}.${key}`, "is invalid");
      if (item.length > PORTABLE_PROJECT_LIMITS.maxSceneObjects) {
        fail(`${path}.${key}`, "contains too many objects");
      }
      item.forEach((child, index) =>
        validateSceneObject(child, `${path}.objects[${index}]`, context, depth + 1)
      );
    } else if (key === "path") {
      if (["Text", "Textbox", "IText", "i-text"].includes(value.type) && isRecord(item)) {
        validateSceneObject(item, `${path}.path`, context, depth + 1);
      } else {
        validatePath(item, `${path}.path`);
      }
    } else if (key === "points") {
      validatePoints(item, `${path}.points`);
    } else if (key === "styles") {
      validateStyles(
        item,
        `${path}.styles`,
        typeof value.text === "string" ? value.text.length : 0,
        context
      );
    } else if (key === "src") {
      validateDataUrl(item, `${path}.src`, context);
    } else if (key === "filters") {
      assertArray(item, `${path}.filters`, 64);
      item.forEach((filter, index) => validateFilter(filter, `${path}.filters[${index}]`, context));
    } else if (key === "resizeFilter") {
      validateFilter(item, `${path}.resizeFilter`, context);
    } else if (key === "connector") {
      if (value.type !== "Group") fail(`${path}.connector`, "is only supported on groups");
      validateConnectorBinding(item, `${path}.connector`, context, false);
    } else if (key === "freeConnectorBinding") {
      if (value.type !== "Group")
        fail(`${path}.freeConnectorBinding`, "is only supported on groups");
      validateConnectorBinding(item, `${path}.freeConnectorBinding`, context, true);
    } else if (key === "freeConnectorGeometry") {
      if (!isRecord(item)) fail(`${path}.freeConnectorGeometry`, "is invalid");
      assertKnownKeys(item, `${path}.freeConnectorGeometry`, new Set(["from", "to"]));
      validatePoint(item.from, `${path}.freeConnectorGeometry.from`);
      validatePoint(item.to, `${path}.freeConnectorGeometry.to`);
    } else if (key === "provenance" || key === "originalPalette") {
      validateStringMap(item, `${path}.${key}`);
    } else if (
      [
        "originalGradientFill",
        "originalGradientStroke",
        "effectBaseGradientFill",
        "effectBaseGradientStroke"
      ].includes(key)
    ) {
      if (!isRecord(item)) fail(`${path}.${key}`, "is invalid");
      validateGradient(item, `${path}.${key}`, context);
    } else if (key === "recognizedGroups") {
      validateRecognizedGroups(item, `${path}.${key}`, context);
    } else if (key === "defaultElementStyle") {
      validateStyleSnapshot(item, `${path}.${key}`, context);
    }
  }

  if (value.objectId !== undefined) {
    if (typeof value.objectId !== "string") fail(`${path}.objectId`, "is invalid");
    if (context.objectIds.has(value.objectId)) fail(`${path}.objectId`, "is duplicated");
    context.objectIds.add(value.objectId);
  }
  if (value.type === "Group" && !Array.isArray(value.objects))
    fail(`${path}.objects`, "is required for groups");
  if (["Image", "image"].includes(value.type) && typeof value.src !== "string") {
    fail(`${path}.src`, "is required for images");
  }
  if (value.OpenSketchType === "connector" && !["Group", "Path"].includes(value.type))
    fail(`${path}.OpenSketchType`, "is invalid for this object type");
  if (["group", "nih-asset"].includes(String(value.OpenSketchType)) && value.type !== "Group") {
    fail(`${path}.OpenSketchType`, "is invalid for this object type");
  }
  if (
    value.OpenSketchType === "text" &&
    !["IText", "i-text", "Text", "Textbox"].includes(value.type)
  ) {
    fail(`${path}.OpenSketchType`, "is invalid for this object type");
  }
  if (
    ["line", "curved-line", "arrow", "double-arrow", "curved-arrow"].includes(
      String(value.OpenSketchType)
    )
  ) {
    if (value.type !== "Group") fail(`${path}.OpenSketchType`, "is invalid for this object type");
    if (!value.freeConnectorBinding)
      fail(`${path}.freeConnectorBinding`, "is required for free connectors");
  }
}

function createValidationContext(): ValidationContext {
  return {
    objectCount: 0,
    totalDataUrlBytes: 0,
    totalRasterArea: 0,
    dataUrls: new Set(),
    objectIds: new Set(),
    connectorBindings: []
  };
}

function validateScene(
  value: unknown,
  path: string,
  context = createValidationContext()
): JsonRecord {
  if (!isRecord(value)) throw new Error("The project scene is invalid.");
  assertKnownKeys(value, path, SCENE_ROOT_PROPERTIES);
  if (value.version !== undefined)
    assertString(value.version, `${path}.version`, { maxLength: 64, nonEmpty: true });
  if (!Array.isArray(value.objects)) fail(`${path}.objects`, "is invalid");
  if (value.objects.length > PORTABLE_PROJECT_LIMITS.maxSceneObjects)
    fail(path, "contains too many objects");
  value.objects.forEach((object, index) =>
    validateSceneObject(object, `${path}.objects[${index}]`, context, 1)
  );
  for (const key of ["background", "overlay"]) {
    if (value[key] !== undefined) validatePaint(value[key], `${path}.${key}`, context);
  }
  for (const key of ["backgroundImage", "overlayImage", "clipPath"]) {
    if (value[key] !== undefined) validateSceneObject(value[key], `${path}.${key}`, context, 1);
  }
  for (const reference of context.connectorBindings) {
    for (const key of ["fromObjectId", "toObjectId"]) {
      const id = reference.binding[key];
      if (typeof id !== "string") continue;
      if (id.length === 0 && reference.allowEmptyIds) continue;
      if (!context.objectIds.has(id))
        fail(`${reference.path}.${key}`, "references an unknown object ID");
    }
  }
  return value;
}

function validateCanvas(value: unknown): PortableProject["canvas"] {
  if (!isRecord(value)) fail("canvas", "is invalid");
  assertKnownKeys(
    value,
    "canvas",
    new Set([
      "width",
      "height",
      "unit",
      "dpi",
      "background",
      "transparent",
      "grid",
      "doubleClickCreatesText"
    ])
  );
  const width = value.width;
  const height = value.height;
  const dpi = value.dpi;
  if (
    typeof width !== "number" ||
    !Number.isFinite(width) ||
    width <= 0 ||
    width > PORTABLE_PROJECT_LIMITS.maxCanvasDimension
  ) {
    fail("canvas width", "is invalid or exceeds the practical canvas limit");
  }
  if (
    typeof height !== "number" ||
    !Number.isFinite(height) ||
    height <= 0 ||
    height > PORTABLE_PROJECT_LIMITS.maxCanvasDimension
  ) {
    fail("canvas height", "is invalid or exceeds the practical canvas limit");
  }
  if (width * height > PORTABLE_PROJECT_LIMITS.maxCanvasArea)
    fail("canvas area", "exceeds the practical canvas limit");
  if (
    typeof dpi !== "number" ||
    !Number.isFinite(dpi) ||
    dpi <= 0 ||
    dpi > PORTABLE_PROJECT_LIMITS.maxDpi
  ) {
    fail("export DPI", "is invalid or exceeds the practical canvas limit");
  }
  if (typeof value.unit !== "string" || !["px", "mm", "in"].includes(value.unit)) {
    fail("canvas unit", "is invalid");
  }
  const background = value.background ?? DEFAULT_CANVAS.background;
  const transparent = value.transparent ?? DEFAULT_CANVAS.transparent;
  const grid = value.grid ?? DEFAULT_CANVAS.grid;
  const doubleClickCreatesText =
    value.doubleClickCreatesText ?? DEFAULT_CANVAS.doubleClickCreatesText;
  assertString(background, "canvas background", { maxLength: 4_096 });
  assertBoolean(transparent, "canvas transparent");
  assertBoolean(grid, "canvas grid");
  assertBoolean(doubleClickCreatesText, "canvas doubleClickCreatesText");
  const canvas = {
    ...DEFAULT_CANVAS,
    width,
    height,
    dpi,
    unit: value.unit as PortableProject["canvas"]["unit"],
    background,
    transparent,
    grid,
    doubleClickCreatesText
  };
  return canvas;
}

function validateUploads(value: unknown, context: ValidationContext): ImportedMediaRecord[] {
  if (value === undefined) return [];
  assertArray(value, "imported media", PORTABLE_PROJECT_LIMITS.maxUploads);
  const ids = new Set<string>();
  return value.map((media, index) => {
    const path = `imported media[${index}]`;
    if (!isRecord(media)) fail(path, "is invalid");
    assertKnownKeys(media, path, new Set(["id", "name", "mimeType", "dataUrl"]));
    assertNonEmptyString(media.id, `${path}.id`, PORTABLE_PROJECT_LIMITS.maxObjectIdLength);
    if (ids.has(media.id)) fail(`${path}.id`, "is duplicated");
    ids.add(media.id);
    assertString(media.name, `${path}.name`, {
      maxLength: PORTABLE_PROJECT_LIMITS.maxObjectNameLength,
      nonEmpty: true
    });
    assertString(media.mimeType, `${path}.mimeType`, { maxLength: 128, nonEmpty: true });
    const mimeType = media.mimeType.toLowerCase();
    if (!isSupportedImageMimeType(mimeType)) fail(`${path}.mimeType`, "is unsupported");
    validateDataUrl(media.dataUrl, `${path}.dataUrl`, context, mimeType);
    return { id: media.id, name: media.name, mimeType, dataUrl: media.dataUrl };
  });
}

function validateAssetIds(value: unknown): string[] {
  if (value === undefined) return [];
  assertArray(value, "asset references", PORTABLE_PROJECT_LIMITS.maxUsedAssetIds);
  const ids = new Set<string>();
  return value.map((assetId, index) => {
    assertNonEmptyString(
      assetId,
      `asset references[${index}]`,
      PORTABLE_PROJECT_LIMITS.maxObjectIdLength
    );
    if (ids.has(assetId)) fail(`asset references[${index}]`, "is duplicated");
    ids.add(assetId);
    return assetId;
  });
}

export function migrateProject(input: unknown): PortableProject {
  if (!isRecord(input)) throw new Error("This file is not an OpenSketch project.");
  const project = input;
  if (project.format !== "OpenSketch") throw new Error("The project marker is missing or invalid.");
  if (project.formatVersion !== OpenSketch_FORMAT_VERSION) {
    throw new Error(
      `Project version ${String(project.formatVersion)} is not supported by this release.`
    );
  }
  if (
    !project.id ||
    !project.name ||
    !project.createdAt ||
    !project.updatedAt ||
    !project.canvas ||
    !project.objects
  ) {
    throw new Error("The project is incomplete.");
  }
  assertNonEmptyString(project.id, "project id", PORTABLE_PROJECT_LIMITS.maxProjectIdLength);
  assertNonEmptyString(project.name, "project name", PORTABLE_PROJECT_LIMITS.maxProjectNameLength);
  assertNonEmptyString(project.createdAt, "createdAt", PORTABLE_PROJECT_LIMITS.maxTimestampLength);
  assertNonEmptyString(project.updatedAt, "updatedAt", PORTABLE_PROJECT_LIMITS.maxTimestampLength);
  if (project.version !== undefined && project.version !== 1) fail("version", "is unsupported");
  const canvas = validateCanvas(project.canvas);
  const context = createValidationContext();
  const scene = validateScene(project.objects, "scene", context);
  const relationIds = new Set<string>();
  const collectRelations = (value: unknown): void => {
    if (!isRecord(value)) return;
    if (Array.isArray(value.semanticRelations)) {
      value.semanticRelations.forEach((relation) => {
        if (!isRecord(relation)) return;
        if (relationIds.has(String(relation.id)))
          fail("scene.semanticRelations", "contains a duplicated relation id");
        relationIds.add(String(relation.id));
        if (
          !context.objectIds.has(String(relation.sourceObjectId)) ||
          !context.objectIds.has(String(relation.targetObjectId))
        ) {
          fail("scene.semanticRelations", "contains a relation with a missing endpoint");
        }
        if (
          Array.isArray(relation.mediatorObjectIds) &&
          relation.mediatorObjectIds.some((id) => !context.objectIds.has(String(id)))
        ) {
          fail("scene.semanticRelations", "contains a relation with a missing mediator");
        }
      });
    }
    if (Array.isArray(value.objects)) value.objects.forEach(collectRelations);
  };
  collectRelations(scene);
  const uploads = validateUploads(project.uploads, context);
  const usedAssetIds = validateAssetIds(project.usedAssetIds);
  let description: string | undefined;
  if (project.description !== undefined) {
    assertString(project.description, "description", {
      maxLength: PORTABLE_PROJECT_LIMITS.maxDescriptionLength
    });
    description = project.description;
  }
  // Return an isolated, allowlisted candidate. Unknown top-level fields (for example
  // local library metadata) cannot reach Fabric or IndexedDB through an import.
  return {
    format: "OpenSketch",
    formatVersion: OpenSketch_FORMAT_VERSION,
    version: 1,
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    canvas: structuredClone(canvas),
    objects: structuredClone(scene),
    uploads: structuredClone(uploads),
    usedAssetIds: structuredClone(usedAssetIds),
    ...(description === undefined ? {} : { description })
  };
}

export interface MigratedProjectForLoad {
  project: PortableProject;
  identityRepaired: boolean;
  identityWarnings: string[];
}

function repairMissingCircularArcBindings(input: unknown): {
  repaired: boolean;
  warnings: string[];
} {
  if (!isRecord(input) || !isRecord(input.objects) || !Array.isArray(input.objects.objects)) {
    return { repaired: false, warnings: [] };
  }
  let repaired = false;
  const warnings: string[] = [];
  const walk = (value: unknown, path: string): void => {
    if (!isRecord(value)) return;
    if (
      value.type === "Group" &&
      value.OpenSketchType === "curved-arrow" &&
      value.name === "Circular arc" &&
      value.freeConnectorBinding === undefined
    ) {
      value.freeConnectorBinding = {
        fromObjectId: "",
        fromAnchor: "center",
        toObjectId: "",
        toAnchor: "center",
        startArrowhead: "none",
        endArrowhead: "triangle",
        lineStyle: "solid",
        routing: "direct",
        pathShape: "circular",
        curvature: 1
      };
      repaired = true;
      warnings.push(`Repaired missing free-connector metadata for circular arc at ${path}.`);
    }
    if (Array.isArray(value.objects)) {
      value.objects.forEach((child, index) => walk(child, `${path}.objects[${index}]`));
    }
    if (isRecord(value.clipPath)) walk(value.clipPath, `${path}.clipPath`);
    if (isRecord(value.path) && typeof value.path.type === "string") {
      walk(value.path, `${path}.path`);
    }
  };
  input.objects.objects.forEach((object, index) => walk(object, `scene.objects[${index}]`));
  return { repaired, warnings };
}

/**
 * Repairs duplicate identities produced by older clone paths before applying
 * the strict portable-project validation gate.
 */
export function migrateProjectForLoad(input: unknown): MigratedProjectForLoad {
  const repair = repairProjectIdentity(input);
  const circularArcRepair = repairMissingCircularArcBindings(repair.project);
  return {
    project: migrateProject(repair.project),
    identityRepaired: repair.repaired || circularArcRepair.repaired,
    identityWarnings: [...repair.warnings, ...circularArcRepair.warnings]
  };
}
