import { isAssetColorRole } from "@workspace/editor-core";
import { Group, Path, Shadow, loadSVGFromString, type FabricObject } from "fabric";

const SVG_BLEND_MODES = new Set<GlobalCompositeOperation>([
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "hard-light",
  "soft-light",
  "difference",
  "exclusion",
  "hue",
  "saturation",
  "color",
  "luminosity"
]);

interface BlendRule {
  selectors: string[];
  mode: GlobalCompositeOperation;
}

interface SvgHierarchyNode {
  kind: "svg-hierarchy";
  children: Array<SvgHierarchyNode | FabricObject>;
  groups: Map<string, SvgHierarchyNode>;
  name?: string;
}

interface SvgFilterShadow {
  blur: number;
  offsetX: number;
  offsetY: number;
  color?: string;
}

const SVG_GROUP_ATTRIBUTE = "data-opensketch-group";
const SVG_URL_REFERENCE = /url\(\s*["']?#([^"')]+)["']?\s*\)/i;

function svgProperty(element: Element, property: string): string | null {
  const attribute = element.getAttribute(property)?.trim();
  if (attribute) return attribute;
  const style = element.getAttribute("style");
  if (!style) return null;
  const declaration = style
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.split(":", 1)[0]?.trim().toLowerCase() === property.toLowerCase());
  return declaration?.slice(declaration.indexOf(":") + 1).trim() || null;
}

function svgUrlReference(value: string | null): string | null {
  return value?.match(SVG_URL_REFERENCE)?.[1] ?? null;
}

function finiteSvgNumber(value: string | null | undefined, fallback = 0): number {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : fallback;
}

function svgFilterBlur(filter: Element): number {
  const blur = filter.querySelector("feGaussianBlur, feDropShadow");
  if (!blur) return 0;
  const deviations = (blur.getAttribute("stdDeviation") ?? "")
    .trim()
    .split(/[\s,]+/)
    .map((value) => finiteSvgNumber(value))
    .filter((value) => value > 0);
  // Fabric's Shadow serializes blur as stdDeviation / 2. Doubling the SVG
  // value here therefore preserves the source blur when the object is
  // rendered on the Fabric canvas and when it is exported back to SVG.
  return Math.max(...deviations, 0) * 2;
}

function svgFilterOffset(filter: Element): { offsetX: number; offsetY: number } {
  const dropShadow = filter.querySelector("feDropShadow");
  if (dropShadow) {
    return {
      offsetX: finiteSvgNumber(dropShadow.getAttribute("dx")),
      offsetY: finiteSvgNumber(dropShadow.getAttribute("dy"))
    };
  }
  const offset = filter.querySelector("feOffset");
  return {
    offsetX: finiteSvgNumber(offset?.getAttribute("dx")),
    offsetY: finiteSvgNumber(offset?.getAttribute("dy"))
  };
}

function colorWithOpacity(color: string, opacity: number): string {
  if (opacity >= 1 || opacity < 0) return color;
  const hex = color.match(/^#([0-9a-f]{3,8})$/i)?.[1];
  if (!hex) return color;
  const expanded =
    hex.length === 3 || hex.length === 4 ? [...hex].map((part) => part + part).join("") : hex;
  const red = Number.parseInt(expanded.slice(0, 2), 16);
  const green = Number.parseInt(expanded.slice(2, 4), 16);
  const blue = Number.parseInt(expanded.slice(4, 6), 16);
  const sourceAlpha = expanded.length === 8 ? Number.parseInt(expanded.slice(6, 8), 16) / 255 : 1;
  return `rgba(${red}, ${green}, ${blue}, ${sourceAlpha * opacity})`;
}

function svgFilterColor(filter: Element): string | undefined {
  const flood = filter.querySelector("feFlood");
  const color = flood ? svgProperty(flood, "flood-color") : null;
  if (!color || /^(?:none|currentcolor)$/i.test(color)) return undefined;
  const opacity = finiteSvgNumber(flood ? svgProperty(flood, "flood-opacity") : null, 1);
  return colorWithOpacity(color, opacity);
}

function svgFilterShadows(source: string): Map<string, SvgFilterShadow> {
  const shadows = new Map<string, SvgFilterShadow>();
  const document = new DOMParser().parseFromString(source, "image/svg+xml");
  if (document.querySelector("parsererror")) return shadows;
  document.querySelectorAll("filter").forEach((filter) => {
    const id = filter.getAttribute("id");
    const blur = svgFilterBlur(filter);
    if (!id || blur <= 0) return;
    const { offsetX, offsetY } = svgFilterOffset(filter);
    const color = svgFilterColor(filter);
    shadows.set(id, { blur, offsetX, offsetY, ...(color ? { color } : {}) });
  });
  return shadows;
}

function objectPaintColor(object: FabricObject): string | undefined {
  for (const paint of [object.fill, object.stroke]) {
    if (typeof paint !== "string") continue;
    const value = paint.trim();
    if (value && !/^(?:none|transparent)$/i.test(value) && !/^url\(/i.test(value)) return value;
  }
  return undefined;
}

function applySvgFilterShadow(
  element: Element,
  object: FabricObject,
  shadows: Map<string, SvgFilterShadow>
): void {
  const filterId = svgUrlReference(svgProperty(element, "filter"));
  const effect = filterId ? shadows.get(filterId) : undefined;
  if (!effect) return;
  const color = effect.color ?? objectPaintColor(object);
  if (!color) return;
  object.set(
    "shadow",
    new Shadow({
      color,
      blur: effect.blur,
      offsetX: effect.offsetX,
      offsetY: effect.offsetY
    })
  );
}

function isSvgHierarchyNode(value: SvgHierarchyNode | FabricObject): value is SvgHierarchyNode {
  return (value as Partial<SvgHierarchyNode>).kind === "svg-hierarchy";
}

export function normalizeSvgForFabric(source: string): string {
  if (!/<clipPath\b/i.test(source) || !/clip-path\s*(?::|=)/i.test(source)) return source;
  const document = new DOMParser().parseFromString(source, "image/svg+xml");
  if (document.querySelector("parsererror")) return source;
  let changed = false;
  for (const element of document.querySelectorAll("clipPath, clipPath *")) {
    if (element.hasAttribute("clip-path")) {
      element.removeAttribute("clip-path");
      changed = true;
    }
    const style = element.getAttribute("style");
    if (!style) continue;
    const declarations = style
      .split(";")
      .map((declaration) => declaration.trim())
      .filter(Boolean);
    const compatible = declarations.filter(
      (declaration) => declaration.split(":", 1)[0]?.trim().toLowerCase() !== "clip-path"
    );
    if (compatible.length === declarations.length) continue;
    changed = true;
    if (compatible.length > 0) element.setAttribute("style", compatible.join(";"));
    else element.removeAttribute("style");
  }
  return changed ? new XMLSerializer().serializeToString(document.documentElement) : source;
}

function parseBlendMode(value: string | null | undefined): GlobalCompositeOperation | null {
  const mode = value?.trim().toLowerCase() as GlobalCompositeOperation | undefined;
  return mode && SVG_BLEND_MODES.has(mode) ? mode : null;
}

function inlineBlendMode(element: Element): GlobalCompositeOperation | null {
  const style = element.getAttribute("style") ?? "";
  return parseBlendMode(
    style.match(/(?:^|;)\s*mix-blend-mode\s*:\s*([a-z-]+)/i)?.[1] ??
      element.getAttribute("mix-blend-mode")
  );
}

function blendRules(source: string): BlendRule[] {
  const rules: BlendRule[] = [];
  for (const styleTag of source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    for (const block of styleTag[1].matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const mode = parseBlendMode(block[2].match(/(?:^|;)\s*mix-blend-mode\s*:\s*([a-z-]+)/i)?.[1]);
      if (!mode) continue;
      const selectors = block[1]
        .split(",")
        .map((selector) => selector.trim())
        .filter(Boolean);
      if (selectors.length > 0) rules.push({ selectors, mode });
    }
  }
  return rules;
}

function matchingRuleMode(element: Element, rules: BlendRule[]): GlobalCompositeOperation | null {
  for (let index = rules.length - 1; index >= 0; index -= 1) {
    for (const selector of rules[index].selectors) {
      try {
        if (element.matches(selector)) return rules[index].mode;
      } catch {
        // Ignore malformed selectors in a third-party illustration.
      }
    }
  }
  return null;
}

export function svgBlendMode(
  element: Element,
  rules: BlendRule[]
): GlobalCompositeOperation | null {
  for (let current: Element | null = element; current; current = current.parentElement) {
    const mode = inlineBlendMode(current) ?? matchingRuleMode(current, rules);
    if (mode) return mode;
  }
  return null;
}

function annotateSvgGroups(source: string): string {
  const document = new DOMParser().parseFromString(source, "image/svg+xml");
  if (document.querySelector("parsererror")) return source;
  document.querySelectorAll("g").forEach((group, index) => {
    group.setAttribute(SVG_GROUP_ATTRIBUTE, String(index));
  });
  return new XMLSerializer().serializeToString(document.documentElement);
}

function sourceGroupPath(element: Element): string[] {
  const path: string[] = [];
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    if (parent.localName.toLowerCase() !== "g") continue;
    const id = parent.getAttribute(SVG_GROUP_ATTRIBUTE);
    if (id) path.unshift(id);
  }
  return path;
}

function groupSvgHierarchy(
  objects: Array<FabricObject | null>,
  paths: WeakMap<FabricObject, string[]>,
  names: Map<string, string>
): Array<FabricObject | null> {
  const root: SvgHierarchyNode = {
    kind: "svg-hierarchy",
    children: [],
    groups: new Map()
  };
  objects.forEach((object) => {
    if (!object) return;
    let node = root;
    for (const id of paths.get(object) ?? []) {
      let child = node.groups.get(id);
      if (!child) {
        child = {
          kind: "svg-hierarchy",
          children: [],
          groups: new Map(),
          name: names.get(id)
        };
        node.groups.set(id, child);
        node.children.push(child);
      }
      node = child;
    }
    node.children.push(object);
  });
  const materialize = (child: SvgHierarchyNode | FabricObject): FabricObject => {
    if (!isSvgHierarchyNode(child)) return child;
    const group = new Group(child.children.map(materialize));
    if (child.name) {
      group.name = `Component: ${child.name}`;
      group.svgComponent = child.name;
    }
    return group;
  };
  return root.children.map(materialize);
}

function svgLeafObjects(objects: FabricObject[]): FabricObject[] {
  return objects.flatMap((object) =>
    object instanceof Group ? svgLeafObjects(object.getObjects()) : [object]
  );
}

export async function loadEditableSvg(source: string) {
  const compatibleSource = normalizeSvgForFabric(source);
  const annotatedSource = annotateSvgGroups(compatibleSource);
  const names = new Map<string, string>();
  new DOMParser()
    .parseFromString(annotatedSource, "image/svg+xml")
    .querySelectorAll("g[data-component]")
    .forEach((group) => {
      const name = group.getAttribute("data-component")?.trim();
      if (name) names.set(group.getAttribute(SVG_GROUP_ATTRIBUTE)!, name.slice(0, 80));
    });
  const rules = blendRules(annotatedSource);
  const filterShadows = svgFilterShadows(annotatedSource);
  const hierarchyPaths = new WeakMap<FabricObject, string[]>();
  const parsed = await loadSVGFromString(annotatedSource, (element, object) => {
    const role = element.closest("[data-color-role]")?.getAttribute("data-color-role");
    if (role !== null && role !== undefined) {
      if (!isAssetColorRole(role)) throw new Error("Unsupported SVG data-color-role: " + role);
      object.assetColorRole = role;
    }
    hierarchyPaths.set(object, sourceGroupPath(element));
    applySvgFilterShadow(element, object, filterShadows);
    const blendMode = svgBlendMode(element, rules);
    if (blendMode) {
      object.globalCompositeOperation = blendMode;
      object.objectCaching = false;
    }
  });
  return {
    ...parsed,
    // Empty SVG paths render nothing, but cannot form valid portable scene objects.
    objects: groupSvgHierarchy(
      parsed.objects.filter((object) => !(object instanceof Path && object.path.length === 0)),
      hierarchyPaths,
      names
    )
  };
}

export function copySvgBlendModes(source: FabricObject[], target: FabricObject[]): void {
  const sourceLeaves = svgLeafObjects(source);
  const targetLeaves = svgLeafObjects(target);
  if (sourceLeaves.length !== targetLeaves.length) return;
  sourceLeaves.forEach((sourceObject, index) => {
    if (sourceObject.globalCompositeOperation !== "source-over") {
      targetLeaves[index].globalCompositeOperation = sourceObject.globalCompositeOperation;
      targetLeaves[index].objectCaching = false;
      targetLeaves[index].dirty = true;
    }
  });
}
