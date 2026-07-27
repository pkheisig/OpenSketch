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
  const rules = blendRules(source);
  return loadSVGFromString(source, (element, object) => {
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
