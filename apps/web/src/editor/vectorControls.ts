import {
  Control,
  FabricObject,
  Group,
  Line,
  Point,
  controlsUtils,
  util,
  type TMat2D,
  type TransformActionHandler
} from "fabric";
import { freeConnectorEndpoints, updateFreeConnectorEndpoint } from "@/editor/connectors";

type Endpoint = "start" | "end";

const vectorControlsInstalled = new WeakSet<FabricObject>();

const STANDARD_RESIZE_CONTROLS = {
  tl: false,
  tr: false,
  br: false,
  bl: false,
  mt: false,
  mr: false,
  mb: false,
  ml: false
} as const;

function viewportTransform(object: FabricObject) {
  return util.multiplyTransformMatrices(
    object.getViewportTransform(),
    object.calcTransformMatrix()
  );
}

function transformPoint(point: { x: number; y: number }, matrix: TMat2D) {
  return util.transformPoint(new Point(point.x, point.y), matrix);
}

function endpointLocalPoint(object: FabricObject, endpoint: Endpoint): Point | null {
  if (object instanceof Line) {
    const points = object.calcLinePoints();
    return new Point(
      endpoint === "start" ? points.x1 : points.x2,
      endpoint === "start" ? points.y1 : points.y2
    );
  }
  if (object instanceof Group) {
    const endpoints = freeConnectorEndpoints(object);
    if (!endpoints) return null;
    const point = endpoint === "start" ? endpoints.from : endpoints.to;
    return new Point(point.x, point.y);
  }
  return null;
}

function endpointPositionHandler(
  _dim: Point,
  _finalMatrix: number[],
  object: FabricObject,
  control: Control
): Point {
  const endpoint = control.actionName === "vectorEndpointStart" ? "start" : "end";
  const local = endpointLocalPoint(object, endpoint);
  return local ? transformPoint(local, viewportTransform(object)) : new Point(0, 0);
}

function updateLineEndpoint(line: Line, endpoint: Endpoint, parentPoint: Point): boolean {
  const current = line.calcLinePoints();
  const fixedLocal = new Point(
    endpoint === "start" ? current.x2 : current.x1,
    endpoint === "start" ? current.y2 : current.y1
  );
  const fixedParent = transformPoint(fixedLocal, line.calcOwnMatrix());
  const start = endpoint === "start" ? parentPoint : fixedParent;
  const end = endpoint === "end" ? parentPoint : fixedParent;
  if (Math.hypot(end.x - start.x, end.y - start.y) < 0.001) return false;

  // Fabric's Line stores x1/y1/x2/y2 as the points used to derive its bounds.
  // Replacing those points in the parent plane gives us a true endpoint edit:
  // the opposite endpoint stays fixed and stroke width is never scaled.
  line.set({
    angle: 0,
    scaleX: 1,
    scaleY: 1,
    skewX: 0,
    skewY: 0,
    flipX: false,
    flipY: false
  });
  line.x1 = start.x;
  line.y1 = start.y;
  line.x2 = end.x;
  line.y2 = end.y;
  (line as unknown as { _setWidthHeight: () => void })._setWidthHeight();
  line.setCoords();
  return true;
}

const endpointAction: TransformActionHandler = (_event, transform, x, y) => {
  const object = transform.target;
  const endpoint = transform.corner === "vectorStart" ? "start" : "end";
  const parentPoint = new Point(x, y);
  if (object instanceof Line) return updateLineEndpoint(object, endpoint, parentPoint);
  if (object instanceof Group) {
    return updateFreeConnectorEndpoint(object, endpoint === "start" ? "from" : "to", parentPoint);
  }
  return false;
};

function createEndpointControl(endpoint: Endpoint): Control {
  return new Control({
    actionName: endpoint === "start" ? "vectorEndpointStart" : "vectorEndpointEnd",
    cursorStyle: "crosshair",
    positionHandler: endpointPositionHandler,
    actionHandler: endpointAction,
    render: controlsUtils.renderCircleControl,
    sizeX: 12,
    sizeY: 12,
    touchSizeX: 24,
    touchSizeY: 24
  });
}

function configureEndpointControls(object: FabricObject): void {
  if (vectorControlsInstalled.has(object)) return;
  const isLine = object instanceof Line;
  const isFreeConnector = object instanceof Group && Boolean(object.freeConnectorBinding);
  if (!isLine && !isFreeConnector) return;

  object.controls = {
    ...object.controls,
    vectorStart: createEndpointControl("start"),
    vectorEnd: createEndpointControl("end")
  };
  object.setControlsVisibility({
    ...STANDARD_RESIZE_CONTROLS,
    vectorStart: true,
    vectorEnd: true
  });
  object.set({ lockScalingX: true, lockScalingY: true });
  vectorControlsInstalled.add(object);
}

export function configureVectorControls(object: FabricObject): void {
  configureEndpointControls(object);
  if (vectorControlsInstalled.has(object)) object.setCoords();
}
