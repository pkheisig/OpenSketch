import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import {
  ActiveSelection,
  Canvas,
  Circle,
  FabricImage,
  FabricObject,
  Group,
  IText,
  Line,
  Path,
  Polygon,
  Rect,
  Textbox,
  Triangle,
  loadSVGFromString,
  util
} from "fabric";
import type {
  AssetFamily,
  AssetVariant,
  CanvasSettings,
  ProjectRecord,
  UploadRecord
} from "@opensketch/editor-core";
import { sanitizeUploadedSvg } from "@/assets/browserSanitizer";
import { setPngDpi } from "@/export/png";
import { downloadBlob, safeFilename } from "@/persistence/portable";
import { GLOBAL_CREDIT } from "@/assets/manifest";

FabricObject.customProperties = [
  "objectId",
  "name",
  "opensketchType",
  "assetId",
  "familyId",
  "provenance",
  "originalPalette",
  "originalFill",
  "originalStroke",
  "connector"
];

const MAX_HISTORY = 120;
const svgStringCache = new Map<string, string>();

type ShapeKind =
  | "rectangle"
  | "rounded-rectangle"
  | "ellipse"
  | "circle"
  | "triangle"
  | "polygon"
  | "line"
  | "arrow"
  | "double-arrow"
  | "curved-arrow"
  | "bracket"
  | "callout"
  | "membrane";

interface EditorContextValue {
  canvas: Canvas | null;
  selection: FabricObject[];
  zoom: number;
  historyState: { canUndo: boolean; canRedo: boolean };
  canvasSettings: CanvasSettings;
  saveStatus: "saved" | "saving";
  setCanvasElement: (element: HTMLCanvasElement | null) => void;
  setCanvasSettings: (settings: Partial<CanvasSettings>) => void;
  setProjectName: (name: string) => void;
  addText: (kind?: "point" | "box") => void;
  addShape: (kind: ShapeKind) => void;
  addAsset: (family: AssetFamily, variant: AssetVariant) => Promise<void>;
  addUpload: (file: File) => Promise<void>;
  deleteSelection: () => void;
  duplicateSelection: () => Promise<void>;
  groupSelection: () => void;
  ungroupSelection: () => void;
  arrange: (action: "front" | "forward" | "backward" | "back") => void;
  align: (axis: "left" | "center" | "right" | "top" | "middle" | "bottom") => void;
  distribute: (axis: "horizontal" | "vertical") => void;
  flip: (axis: "x" | "y") => void;
  setObject: (properties: Record<string, unknown>) => void;
  replaceColor: (before: string, after: string) => void;
  resetColors: () => void;
  getPalette: () => string[];
  undo: () => void;
  redo: () => void;
  setZoom: (value: number) => void;
  fitCanvas: () => void;
  exportSvg: (title?: string, description?: string) => void;
  exportPng: (scale: number, transparent: boolean, dpi: number) => void;
  commit: (label?: string) => void;
}

const EditorContext = createContext<EditorContextValue | null>(null);

function assignIdentity(object: FabricObject, name: string, type: string): void {
  object.objectId ??= crypto.randomUUID();
  object.name ??= name;
  object.opensketchType ??= type;
}

function solidColor(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value !== "" &&
    value !== "transparent" &&
    !value.startsWith("url(")
  );
}

function paletteFromObject(object: FabricObject): string[] {
  const colors = new Set<string>();
  const walk = (current: FabricObject) => {
    if (solidColor(current.fill)) colors.add(current.fill);
    if (solidColor(current.stroke)) colors.add(current.stroke);
    if (current instanceof Group) current.getObjects().forEach(walk);
  };
  walk(object);
  return [...colors];
}

function replaceObjectColor(object: FabricObject, before: string, after: string): void {
  const walk = (current: FabricObject) => {
    if (current.fill === before) current.set("fill", after);
    if (current.stroke === before) current.set("stroke", after);
    if (current instanceof Group) current.getObjects().forEach(walk);
  };
  walk(object);
}

function rememberOriginalColors(object: FabricObject): void {
  const walk = (current: FabricObject) => {
    if (solidColor(current.fill)) current.originalFill = current.fill;
    if (solidColor(current.stroke)) current.originalStroke = current.stroke;
    if (current instanceof Group) current.getObjects().forEach(walk);
  };
  walk(object);
}

function restoreOriginalColors(object: FabricObject): void {
  const walk = (current: FabricObject) => {
    if (current.originalFill !== undefined) current.set("fill", current.originalFill);
    if (current.originalStroke !== undefined) current.set("stroke", current.originalStroke);
    if (current instanceof Group) current.getObjects().forEach(walk);
  };
  walk(object);
}

function createArrowPath(doubleHeaded = false, curved = false): FabricObject {
  const data = curved
    ? "M 0 60 Q 90 -20 180 60 M 165 45 L 180 60 L 160 66"
    : doubleHeaded
      ? "M 0 40 L 180 40 M 15 25 L 0 40 L 15 55 M 165 25 L 180 40 L 165 55"
      : "M 0 40 L 180 40 M 165 25 L 180 40 L 165 55";
  return new Path(data, {
    fill: "",
    stroke: "#25494b",
    strokeWidth: 5,
    strokeLineCap: "round",
    strokeLineJoin: "round"
  });
}

function withLogicalViewport<T>(canvas: Canvas, settings: CanvasSettings, operation: () => T): T {
  const dimensions = { width: canvas.width, height: canvas.height };
  const viewport = [...canvas.viewportTransform] as [
    number,
    number,
    number,
    number,
    number,
    number
  ];
  canvas.setDimensions({ width: settings.width, height: settings.height });
  canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
  try {
    return operation();
  } finally {
    canvas.setDimensions(dimensions);
    canvas.setViewportTransform(viewport);
    canvas.requestRenderAll();
  }
}

export function EditorProvider({
  project,
  onProjectChange,
  children
}: {
  project: ProjectRecord;
  onProjectChange: (project: ProjectRecord) => Promise<void>;
  children: ReactNode;
}) {
  const [canvas, setCanvas] = useState<Canvas | null>(null);
  const [selection, setSelection] = useState<FabricObject[]>([]);
  const [zoom, setZoomState] = useState(1);
  const [canvasSettings, setCanvasSettingsState] = useState(project.canvas);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving">("saved");
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });
  const history = useRef<string[]>([]);
  const historyIndex = useRef(-1);
  const restoring = useRef(false);
  const clipboard = useRef<FabricObject[]>([]);
  const saveTimer = useRef<number | undefined>(undefined);
  const latestProject = useRef(project);
  const latestCanvasSettings = useRef(project.canvas);
  const canvasElement = useRef<HTMLCanvasElement | null>(null);

  const serialize = useCallback(
    () =>
      canvas ? JSON.stringify(canvas.toJSON()) : JSON.stringify(latestProject.current.objects),
    [canvas]
  );

  const updateHistoryState = useCallback(() => {
    setHistoryState({
      canUndo: historyIndex.current > 0,
      canRedo: historyIndex.current >= 0 && historyIndex.current < history.current.length - 1
    });
  }, []);

  const persist = useCallback(
    (snapshot?: string) => {
      if (!canvas) return;
      setSaveStatus("saving");
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(async () => {
        const now = new Date().toISOString();
        const current = latestProject.current;
        const next: ProjectRecord = {
          ...current,
          updatedAt: now,
          canvas: latestCanvasSettings.current,
          objects: JSON.parse(snapshot ?? serialize()) as Record<string, unknown>,
          usedAssetIds: canvas
            .getObjects()
            .map((object) => object.assetId)
            .filter((value): value is string => Boolean(value)),
          thumbnail: canvas.toDataURL({
            format: "png",
            multiplier: Math.min(0.25, 320 / latestCanvasSettings.current.width),
            enableRetinaScaling: false
          })
        };
        latestProject.current = next;
        await onProjectChange(next);
        setSaveStatus("saved");
      }, 500);
    },
    [canvas, onProjectChange, serialize]
  );

  const commit = useCallback(
    (label = "Change") => {
      void label;
      if (!canvas || restoring.current) return;
      const snapshot = serialize();
      if (history.current[historyIndex.current] === snapshot) return;
      history.current = history.current.slice(0, historyIndex.current + 1);
      history.current.push(snapshot);
      if (history.current.length > MAX_HISTORY) history.current.shift();
      historyIndex.current = history.current.length - 1;
      updateHistoryState();
      persist(snapshot);
    },
    [canvas, persist, serialize, updateHistoryState]
  );

  const setCanvasElement = useCallback(
    (element: HTMLCanvasElement | null) => {
      if (!element || element === canvasElement.current) return;
      canvasElement.current = element;
      const instance = new Canvas(element, {
        preserveObjectStacking: true,
        selectionColor: "rgba(18, 178, 175, 0.12)",
        selectionBorderColor: "#12b2af",
        selectionLineWidth: 1
      });
      instance.setDimensions({ width: project.canvas.width, height: project.canvas.height });
      instance.backgroundColor = project.canvas.transparent ? "" : project.canvas.background;
      instance.loadFromJSON(project.objects).then(() => {
        instance
          .getObjects()
          .forEach((object) =>
            assignIdentity(
              object,
              object.name ?? "Untitled layer",
              object.opensketchType ?? object.type
            )
          );
        instance.requestRenderAll();
        const initial = JSON.stringify(instance.toJSON());
        history.current = [initial];
        historyIndex.current = 0;
        updateHistoryState();
      });
      setCanvas(instance);
    },
    [project, updateHistoryState]
  );

  useEffect(() => {
    if (!canvas) return;
    const select = () => setSelection(canvas.getActiveObjects());
    const modified = () => {
      setSelection(canvas.getActiveObjects());
      commit("Transform");
    };
    const updateConnectors = ({ target }: { target?: FabricObject }) => {
      if (!target?.objectId) return;
      const objects = canvas.getObjects();
      for (const candidate of objects) {
        const binding = candidate.connector;
        if (
          !(candidate instanceof Line) ||
          !binding ||
          (binding.fromObjectId !== target.objectId && binding.toObjectId !== target.objectId)
        ) {
          continue;
        }
        const from = objects.find((object) => object.objectId === binding.fromObjectId);
        const to = objects.find((object) => object.objectId === binding.toObjectId);
        if (!from || !to) continue;
        const fromPoint = from.getCenterPoint();
        const toPoint = to.getCenterPoint();
        candidate.set({
          x1: fromPoint.x,
          y1: fromPoint.y,
          x2: toPoint.x,
          y2: toPoint.y
        });
        candidate.setCoords();
      }
      canvas.requestRenderAll();
    };
    canvas.on("selection:created", select);
    canvas.on("selection:updated", select);
    canvas.on("selection:cleared", select);
    canvas.on("object:modified", modified);
    canvas.on("object:moving", updateConnectors);
    canvas.on("object:scaling", updateConnectors);
    canvas.on("text:editing:exited", modified);
    return () => {
      canvas.dispose();
      setCanvas(null);
    };
  }, [canvas, commit]);

  const restoreAt = useCallback(
    async (index: number) => {
      if (!canvas || !history.current[index]) return;
      restoring.current = true;
      await canvas.loadFromJSON(history.current[index]);
      canvas.requestRenderAll();
      historyIndex.current = index;
      setSelection([]);
      updateHistoryState();
      restoring.current = false;
      persist(history.current[index]);
    },
    [canvas, persist, updateHistoryState]
  );

  const undo = useCallback(() => {
    if (historyIndex.current > 0) void restoreAt(historyIndex.current - 1);
  }, [restoreAt]);
  const redo = useCallback(() => {
    if (historyIndex.current < history.current.length - 1) {
      void restoreAt(historyIndex.current + 1);
    }
  }, [restoreAt]);

  const centerObject = useCallback(
    (object: FabricObject) => {
      if (!canvas) return;
      const viewport = canvas.vptCoords;
      object.set({
        left: (viewport.tl.x + viewport.br.x) / 2,
        top: (viewport.tl.y + viewport.br.y) / 2,
        originX: "center",
        originY: "center"
      });
      object.setCoords();
    },
    [canvas]
  );

  const addObject = useCallback(
    (object: FabricObject, name: string, type: string) => {
      if (!canvas) return;
      assignIdentity(object, name, type);
      centerObject(object);
      canvas.add(object);
      canvas.setActiveObject(object);
      canvas.requestRenderAll();
      setSelection([object]);
      commit(`Add ${name}`);
    },
    [canvas, centerObject, commit]
  );

  const addText = useCallback(
    (kind: "point" | "box" = "point") => {
      const options = {
        fill: "#183133",
        fontFamily: "Source Sans 3, sans-serif",
        fontSize: 54,
        lineHeight: 1.2
      };
      const object =
        kind === "box"
          ? new Textbox("Text box", { ...options, width: 420 })
          : new IText("Label", options);
      addObject(object, kind === "box" ? "Text box" : "Label", "text");
      object.enterEditing();
      object.selectAll();
    },
    [addObject]
  );

  const addShape = useCallback(
    (kind: ShapeKind) => {
      const common = {
        fill: "#d8efe9",
        stroke: "#25494b",
        strokeWidth: 4
      };
      let object: FabricObject;
      if (kind === "rectangle" || kind === "rounded-rectangle") {
        object = new Rect({
          ...common,
          width: 280,
          height: 170,
          rx: kind === "rounded-rectangle" ? 28 : 0,
          ry: kind === "rounded-rectangle" ? 28 : 0
        });
      } else if (kind === "circle") {
        object = new Circle({ ...common, radius: 95 });
      } else if (kind === "ellipse") {
        object = new Circle({ ...common, radius: 100, scaleX: 1.5, scaleY: 0.85 });
      } else if (kind === "triangle") {
        object = new Triangle({ ...common, width: 210, height: 190 });
      } else if (kind === "polygon") {
        object = new Polygon(
          [
            { x: 50, y: 0 },
            { x: 150, y: 0 },
            { x: 200, y: 86 },
            { x: 150, y: 172 },
            { x: 50, y: 172 },
            { x: 0, y: 86 }
          ],
          common
        );
      } else if (kind === "line") {
        const targets = canvas?.getActiveObjects() ?? [];
        if (targets.length === 2) {
          const from = targets[0].getCenterPoint();
          const to = targets[1].getCenterPoint();
          object = new Line([from.x, from.y, to.x, to.y], {
            stroke: "#25494b",
            strokeWidth: 5,
            strokeLineCap: "round"
          });
          object.connector = {
            fromObjectId: targets[0].objectId ?? "",
            fromAnchor: "center",
            toObjectId: targets[1].objectId ?? "",
            toAnchor: "center"
          };
        } else {
          object = new Line([0, 0, 220, 0], {
            stroke: "#25494b",
            strokeWidth: 5,
            strokeLineCap: "round"
          });
        }
      } else if (kind === "bracket") {
        object = new Path("M 32 0 H 0 V 180 H 32 M 168 0 H 200 V 180 H 168", {
          fill: "",
          stroke: "#25494b",
          strokeWidth: 5,
          strokeLineCap: "round",
          strokeLineJoin: "round"
        });
      } else if (kind === "callout") {
        object = new Polygon(
          [
            { x: 0, y: 0 },
            { x: 260, y: 0 },
            { x: 260, y: 150 },
            { x: 90, y: 150 },
            { x: 48, y: 200 },
            { x: 58, y: 150 },
            { x: 0, y: 150 }
          ],
          { ...common, strokeLineJoin: "round" }
        );
      } else if (kind === "membrane") {
        const lipids: FabricObject[] = [];
        for (let index = 0; index < 9; index += 1) {
          const x = index * 30;
          lipids.push(
            new Circle({ left: x, top: 0, radius: 8, fill: "#69bdb4", stroke: "#25494b" }),
            new Line([x + 8, 16, x + 8, 42], { stroke: "#25494b", strokeWidth: 3 }),
            new Circle({ left: x, top: 58, radius: 8, fill: "#69bdb4", stroke: "#25494b" }),
            new Line([x + 8, 32, x + 8, 58], { stroke: "#25494b", strokeWidth: 3 })
          );
        }
        object = new Group(lipids);
      } else {
        object = createArrowPath(kind === "double-arrow", kind === "curved-arrow");
      }
      addObject(object, kind.replace("-", " "), kind.includes("arrow") ? "connector" : "shape");
    },
    [addObject, canvas]
  );

  const addAsset = useCallback(
    async (family: AssetFamily, variant: AssetVariant) => {
      if (!canvas) return;
      let source = svgStringCache.get(variant.id);
      if (!source) {
        const response = await fetch(variant.assetPath);
        if (!response.ok) throw new Error(`Could not load ${family.title}.`);
        source = await response.text();
        svgStringCache.set(variant.id, source);
      }
      const result = await loadSVGFromString(source);
      const objects = result.objects.filter((object): object is FabricObject => Boolean(object));
      const group = util.groupSVGElements(objects, result.options);
      const maxSide = Math.max(group.width || 1, group.height || 1);
      const scale = Math.min(1, 360 / maxSide);
      group.scale(scale);
      group.assetId = variant.id;
      group.familyId = family.familyId;
      group.provenance = {
        nihSourcePage: family.nihSourcePage,
        commonsPage: family.commonsPage,
        author: family.author,
        license: family.license
      };
      group.originalPalette = Object.fromEntries(
        paletteFromObject(group).map((color) => [color, color])
      );
      rememberOriginalColors(group);
      addObject(group, family.title, "nih-asset");
    },
    [addObject, canvas]
  );

  const addUpload = useCallback(
    async (file: File) => {
      if (!canvas) return;
      const uploadId = crypto.randomUUID();
      let dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      let object: FabricObject;
      if (file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg")) {
        const source = sanitizeUploadedSvg(await file.text(), `upload-${uploadId}`);
        dataUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(source)))}`;
        const result = await loadSVGFromString(source);
        object = util.groupSVGElements(
          result.objects.filter((item): item is FabricObject => Boolean(item)),
          result.options
        );
      } else {
        object = await FabricImage.fromURL(dataUrl);
      }
      const maxSide = Math.max(object.width || 1, object.height || 1);
      object.scale(Math.min(1, 420 / maxSide));
      object.assetId = uploadId;
      object.originalPalette = Object.fromEntries(
        paletteFromObject(object).map((color) => [color, color])
      );
      rememberOriginalColors(object);
      const upload: UploadRecord = { id: uploadId, name: file.name, mimeType: file.type, dataUrl };
      latestProject.current = {
        ...latestProject.current,
        uploads: [...latestProject.current.uploads, upload]
      };
      addObject(object, file.name, "upload");
    },
    [addObject, canvas]
  );

  const deleteSelection = useCallback(() => {
    if (!canvas) return;
    const active = canvas.getActiveObjects();
    active.forEach((object) => canvas.remove(object));
    canvas.discardActiveObject();
    setSelection([]);
    canvas.requestRenderAll();
    commit("Delete");
  }, [canvas, commit]);

  const duplicateSelection = useCallback(async () => {
    if (!canvas) return;
    const clones = await Promise.all(canvas.getActiveObjects().map((object) => object.clone()));
    clones.forEach((clone) => {
      clone.set({ left: (clone.left ?? 0) + 28, top: (clone.top ?? 0) + 28 });
      clone.objectId = crypto.randomUUID();
      canvas.add(clone);
    });
    const active = clones.length === 1 ? clones[0] : new ActiveSelection(clones, { canvas });
    canvas.setActiveObject(active);
    setSelection(clones);
    canvas.requestRenderAll();
    commit("Duplicate");
  }, [canvas, commit]);

  const groupSelection = useCallback(() => {
    if (!canvas || !(canvas.getActiveObject() instanceof ActiveSelection)) return;
    const active = canvas.getActiveObject() as ActiveSelection;
    const objects = active.removeAll();
    canvas.discardActiveObject();
    canvas.remove(...objects);
    const group = new Group(objects);
    canvas.add(group);
    canvas.setActiveObject(group);
    assignIdentity(group, "Group", "group");
    setSelection([group]);
    canvas.requestRenderAll();
    commit("Group");
  }, [canvas, commit]);

  const ungroupSelection = useCallback(() => {
    if (!canvas || !(canvas.getActiveObject() instanceof Group)) return;
    const group = canvas.getActiveObject() as Group;
    const objects = group.removeAll();
    canvas.remove(group);
    canvas.add(...objects);
    const selectionObject = new ActiveSelection(objects, { canvas });
    canvas.setActiveObject(selectionObject);
    setSelection(selectionObject.getObjects());
    canvas.requestRenderAll();
    commit("Ungroup");
  }, [canvas, commit]);

  const arrange = useCallback(
    (action: "front" | "forward" | "backward" | "back") => {
      if (!canvas) return;
      for (const object of canvas.getActiveObjects()) {
        if (action === "front") canvas.bringObjectToFront(object);
        if (action === "forward") canvas.bringObjectForward(object);
        if (action === "backward") canvas.sendObjectBackwards(object);
        if (action === "back") canvas.sendObjectToBack(object);
      }
      canvas.requestRenderAll();
      commit("Arrange layers");
    },
    [canvas, commit]
  );

  const align = useCallback(
    (axis: "left" | "center" | "right" | "top" | "middle" | "bottom") => {
      if (!canvas) return;
      const objects = canvas.getActiveObjects();
      if (objects.length < 2) return;
      const bounds = canvas.getActiveObject()!.getBoundingRect();
      objects.forEach((object) => {
        const objectBounds = object.getBoundingRect();
        if (axis === "left") object.left! += bounds.left - objectBounds.left;
        if (axis === "center")
          object.left! +=
            bounds.left + bounds.width / 2 - (objectBounds.left + objectBounds.width / 2);
        if (axis === "right")
          object.left! += bounds.left + bounds.width - (objectBounds.left + objectBounds.width);
        if (axis === "top") object.top! += bounds.top - objectBounds.top;
        if (axis === "middle")
          object.top! +=
            bounds.top + bounds.height / 2 - (objectBounds.top + objectBounds.height / 2);
        if (axis === "bottom")
          object.top! += bounds.top + bounds.height - (objectBounds.top + objectBounds.height);
        object.setCoords();
      });
      canvas.requestRenderAll();
      commit("Align");
    },
    [canvas, commit]
  );

  const distribute = useCallback(
    (axis: "horizontal" | "vertical") => {
      if (!canvas) return;
      const objects = [...canvas.getActiveObjects()].sort((a, b) =>
        axis === "horizontal" ? (a.left ?? 0) - (b.left ?? 0) : (a.top ?? 0) - (b.top ?? 0)
      );
      if (objects.length < 3) return;
      const first = axis === "horizontal" ? (objects[0].left ?? 0) : (objects[0].top ?? 0);
      const last = axis === "horizontal" ? (objects.at(-1)!.left ?? 0) : (objects.at(-1)!.top ?? 0);
      objects.slice(1, -1).forEach((object, index) => {
        const value = first + ((last - first) * (index + 1)) / (objects.length - 1);
        object.set(axis === "horizontal" ? "left" : "top", value);
        object.setCoords();
      });
      canvas.requestRenderAll();
      commit("Distribute");
    },
    [canvas, commit]
  );

  const flip = useCallback(
    (axis: "x" | "y") => {
      canvas
        ?.getActiveObjects()
        .forEach((object) =>
          object.set(axis === "x" ? "flipX" : "flipY", axis === "x" ? !object.flipX : !object.flipY)
        );
      canvas?.requestRenderAll();
      commit("Flip");
    },
    [canvas, commit]
  );

  const setObject = useCallback(
    (properties: Record<string, unknown>) => {
      if (!canvas) return;
      canvas.getActiveObjects().forEach((object) => {
        object.set(properties);
        object.setCoords();
      });
      canvas.requestRenderAll();
      setSelection([...canvas.getActiveObjects()]);
      commit("Change properties");
    },
    [canvas, commit]
  );

  const getPalette = useCallback(
    () => (selection.length === 1 ? paletteFromObject(selection[0]) : []),
    [selection]
  );
  const replaceColor = useCallback(
    (before: string, after: string) => {
      if (!canvas) return;
      canvas.getActiveObjects().forEach((object) => replaceObjectColor(object, before, after));
      canvas.requestRenderAll();
      commit("Recolor");
    },
    [canvas, commit]
  );
  const resetColors = useCallback(() => {
    if (!canvas) return;
    canvas.getActiveObjects().forEach(restoreOriginalColors);
    canvas.requestRenderAll();
    commit("Reset colors");
  }, [canvas, commit]);

  const setZoom = useCallback(
    (value: number) => {
      if (!canvas) return;
      const next = Math.max(0.1, Math.min(4, value));
      const settings = latestCanvasSettings.current;
      canvas.setDimensions({
        width: Math.max(1, Math.round(settings.width * next)),
        height: Math.max(1, Math.round(settings.height * next))
      });
      canvas.setZoom(next);
      setZoomState(next);
      canvas.requestRenderAll();
    },
    [canvas]
  );
  const fitCanvas = useCallback(() => {
    if (!canvas) return;
    const host = canvas.wrapperEl.closest(".workspace-scroll") as HTMLElement | null;
    if (!host) return;
    const next = Math.min(
      (host.clientWidth - 120) / canvasSettings.width,
      (host.clientHeight - 120) / canvasSettings.height,
      1
    );
    setZoom(next);
  }, [canvas, canvasSettings, setZoom]);

  const setCanvasSettings = useCallback(
    (settings: Partial<CanvasSettings>) => {
      const next = { ...latestCanvasSettings.current, ...settings };
      latestCanvasSettings.current = next;
      setCanvasSettingsState(next);
      if (canvas) {
        canvas.setDimensions({
          width: Math.max(1, Math.round(next.width * zoom)),
          height: Math.max(1, Math.round(next.height * zoom))
        });
        canvas.backgroundColor = next.transparent ? "" : next.background;
        canvas.requestRenderAll();
        commit("Canvas settings");
      }
    },
    [canvas, commit, zoom]
  );

  const setProjectName = useCallback(
    (name: string) => {
      latestProject.current = { ...latestProject.current, name };
      persist();
    },
    [persist]
  );

  const exportSvg = useCallback(
    (title = latestProject.current.name, description = "") => {
      if (!canvas) return;
      let svg = withLogicalViewport(canvas, canvasSettings, () =>
        canvas.toSVG({
          suppressPreamble: false,
          width: `${canvasSettings.width}`,
          height: `${canvasSettings.height}`,
          viewBox: { x: 0, y: 0, width: canvasSettings.width, height: canvasSettings.height }
        })
      );
      const metadata = `<metadata>${escapeXml(
        JSON.stringify({
          generator: "OpenSketch",
          title,
          description,
          credit: GLOBAL_CREDIT,
          usedAssets: canvas
            .getObjects()
            .map((object) => object.assetId)
            .filter(Boolean)
        })
      )}</metadata><title>${escapeXml(title)}</title>${
        description ? `<desc>${escapeXml(description)}</desc>` : ""
      }`;
      svg = svg.replace(/(<svg[^>]*>)/, `$1${metadata}`);
      downloadBlob(new Blob([svg], { type: "image/svg+xml" }), `${safeFilename(title)}.svg`);
    },
    [canvas, canvasSettings]
  );

  const exportPng = useCallback(
    (scale: number, transparent: boolean, dpi: number) => {
      if (!canvas) return;
      const previous = canvas.backgroundColor;
      if (transparent) canvas.backgroundColor = "";
      let dataUrl: string;
      try {
        dataUrl = withLogicalViewport(canvas, canvasSettings, () =>
          canvas.toDataURL({
            format: "png",
            multiplier: scale,
            enableRetinaScaling: false
          })
        );
      } finally {
        canvas.backgroundColor = previous;
        canvas.requestRenderAll();
      }
      fetch(dataUrl)
        .then((response) => response.blob())
        .then((blob) => setPngDpi(blob, dpi))
        .then((blob) =>
          downloadBlob(blob, `${safeFilename(latestProject.current.name)}-${scale}x.png`)
        );
    },
    [canvas, canvasSettings]
  );

  useEffect(() => {
    const copySelection = async (cut = false) => {
      if (!canvas) return;
      clipboard.current = await Promise.all(
        canvas.getActiveObjects().map((object) => object.clone())
      );
      if (cut) deleteSelection();
    };
    const pasteSelection = async () => {
      if (!canvas || clipboard.current.length === 0) return;
      const clones = await Promise.all(clipboard.current.map((object) => object.clone()));
      clones.forEach((clone) => {
        clone.set({ left: (clone.left ?? 0) + 24, top: (clone.top ?? 0) + 24 });
        clone.objectId = crypto.randomUUID();
        canvas.add(clone);
      });
      clipboard.current = await Promise.all(clones.map((clone) => clone.clone()));
      canvas.setActiveObject(
        clones.length === 1 ? clones[0] : new ActiveSelection(clones, { canvas })
      );
      setSelection(clones);
      canvas.requestRenderAll();
      commit("Paste");
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        !canvas ||
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      const activeObject = canvas.getActiveObject();
      if (activeObject instanceof IText && activeObject.isEditing) return;
      const modifier = event.metaKey || event.ctrlKey;
      if (modifier && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (modifier && event.key.toLowerCase() === "d") {
        event.preventDefault();
        void duplicateSelection();
      } else if (modifier && event.key.toLowerCase() === "c") {
        event.preventDefault();
        void copySelection();
      } else if (modifier && event.key.toLowerCase() === "x") {
        event.preventDefault();
        void copySelection(true);
      } else if (modifier && event.key.toLowerCase() === "v") {
        event.preventDefault();
        void pasteSelection();
      } else if (modifier && event.key.toLowerCase() === "a") {
        event.preventDefault();
        const objects = canvas.getObjects().filter((object) => object.visible !== false);
        if (objects.length) {
          canvas.setActiveObject(new ActiveSelection(objects, { canvas }));
          setSelection(objects);
          canvas.requestRenderAll();
        }
      } else if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        deleteSelection();
      } else if (event.key === "Escape") {
        canvas.discardActiveObject();
        setSelection([]);
        canvas.requestRenderAll();
      } else if (event.key.startsWith("Arrow")) {
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        canvas.getActiveObjects().forEach((object) => {
          if (event.key === "ArrowLeft") object.left! -= step;
          if (event.key === "ArrowRight") object.left! += step;
          if (event.key === "ArrowUp") object.top! -= step;
          if (event.key === "ArrowDown") object.top! += step;
          object.setCoords();
        });
        canvas.requestRenderAll();
      } else if (modifier && event.key.toLowerCase() === "g") {
        event.preventDefault();
        if (event.shiftKey) ungroupSelection();
        else groupSelection();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const activeObject = canvas?.getActiveObject();
      if (activeObject instanceof IText && activeObject.isEditing) return;
      if (event.key.startsWith("Arrow")) commit("Nudge");
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [
    canvas,
    commit,
    deleteSelection,
    duplicateSelection,
    groupSelection,
    redo,
    undo,
    ungroupSelection
  ]);

  const value = useMemo<EditorContextValue>(
    () => ({
      canvas,
      selection,
      zoom,
      historyState,
      canvasSettings,
      saveStatus,
      setCanvasElement,
      setCanvasSettings,
      setProjectName,
      addText,
      addShape,
      addAsset,
      addUpload,
      deleteSelection,
      duplicateSelection,
      groupSelection,
      ungroupSelection,
      arrange,
      align,
      distribute,
      flip,
      setObject,
      replaceColor,
      resetColors,
      getPalette,
      undo,
      redo,
      setZoom,
      fitCanvas,
      exportSvg,
      exportPng,
      commit
    }),
    [
      addAsset,
      addShape,
      addText,
      addUpload,
      align,
      arrange,
      canvas,
      canvasSettings,
      commit,
      deleteSelection,
      distribute,
      duplicateSelection,
      exportPng,
      exportSvg,
      fitCanvas,
      flip,
      getPalette,
      groupSelection,
      historyState,
      redo,
      replaceColor,
      resetColors,
      saveStatus,
      selection,
      setCanvasElement,
      setCanvasSettings,
      setObject,
      setProjectName,
      setZoom,
      undo,
      ungroupSelection,
      zoom
    ]
  );
  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (character) => {
    const values: Record<string, string> = {
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      "'": "&apos;",
      '"': "&quot;"
    };
    return values[character];
  });
}

export function useEditor(): EditorContextValue {
  const value = useContext(EditorContext);
  if (!value) throw new Error("useEditor must be used inside EditorProvider.");
  return value;
}
