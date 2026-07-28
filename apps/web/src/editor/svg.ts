import { loadSVGFromString, type FabricObject } from "fabric";

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

export function loadEditableSvg(source: string) {
  const compatibleSource = normalizeSvgForFabric(source);
  const rules = blendRules(compatibleSource);
  return loadSVGFromString(compatibleSource, (element, object) => {
    const blendMode = svgBlendMode(element, rules);
    if (blendMode) {
      object.globalCompositeOperation = blendMode;
      object.objectCaching = false;
    }
  });
}

export function copySvgBlendModes(source: FabricObject[], target: FabricObject[]): void {
  if (source.length !== target.length) return;
  source.forEach((sourceObject, index) => {
    if (sourceObject.globalCompositeOperation !== "source-over") {
      target[index].globalCompositeOperation = sourceObject.globalCompositeOperation;
      target[index].objectCaching = false;
      target[index].dirty = true;
    }
  });
}
