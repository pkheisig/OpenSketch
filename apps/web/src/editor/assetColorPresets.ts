import { Color } from "fabric";
import type { AssetFamily } from "@workspace/editor-core";

export type AssetColorProfile = "cell" | "protein" | "equipment";

export interface AssetColorPreset {
  id: string;
  family?: string;
  shade?: string;
  label: string;
  ramps: Record<AssetColorProfile, string[]>;
}

const BASE_PRESETS: AssetColorPreset[] = [
  {
    id: "green",
    label: "Green",
    ramps: {
      cell: ["#173b2a", "#2f7650", "#61aa78", "#a6d9b4", "#e3f2e7"],
      protein: ["#123b2b", "#1d7250", "#42a778", "#8bd0aa", "#d8f0e2"],
      equipment: ["#263f38", "#52786a", "#87a99b", "#bed1c8", "#edf3f0"]
    }
  },
  {
    id: "blue",
    label: "Blue",
    ramps: {
      cell: ["#173552", "#306b99", "#659fc5", "#a8cee4", "#e4f1f8"],
      protein: ["#102f50", "#205f92", "#408fc3", "#85bee0", "#d9ecf7"],
      equipment: ["#293e4b", "#587486", "#8ba6b5", "#c1d2db", "#eef3f6"]
    }
  },
  {
    id: "purple",
    label: "Purple",
    ramps: {
      cell: ["#3d255c", "#704a91", "#9d78bd", "#c9addc", "#eee4f4"],
      protein: ["#351d59", "#67408f", "#9667bd", "#c59cdd", "#eadcf4"],
      equipment: ["#403747", "#75677d", "#a89aaf", "#d0c5d4", "#f1edf2"]
    }
  },
  {
    id: "red",
    label: "Red",
    ramps: {
      cell: ["#572622", "#934b43", "#c27b6f", "#dfb2aa", "#f6e7e3"],
      protein: ["#551e20", "#943b40", "#c56164", "#e39b9c", "#f5dede"],
      equipment: ["#493432", "#7e6460", "#ae9691", "#d4c1bd", "#f3edeb"]
    }
  },
  {
    id: "gold",
    label: "Gold",
    ramps: {
      cell: ["#4d3518", "#8a682b", "#c09a4e", "#dec68c", "#f5ecd2"],
      protein: ["#4c3110", "#8b621c", "#c49332", "#dfbf72", "#f4e7bd"],
      equipment: ["#463c2d", "#796c54", "#a99b7d", "#d1c5aa", "#f1ecdf"]
    }
  }
];

export const ASSET_PALETTE_SHADES = ["Light", "Soft", "Classic", "Deep"] as const;
const extraFamilies: [string, string, string[]][] = [
  ["orange", "Orange", ["#55301d", "#99532a", "#cf8650", "#e9bb91", "#fae9d9"]],
  ["teal", "Teal", ["#153e40", "#287c7e", "#51aeb0", "#a0d8d6", "#e0f3ef"]],
  ["cyan", "Cyan", ["#183d50", "#237b9b", "#49b1cc", "#a0dce7", "#e0f5f8"]],
  ["indigo", "Indigo", ["#282b54", "#505b99", "#818dca", "#b7c1e9", "#e9ecf9"]],
  ["pink", "Pink", ["#562b46", "#984d7e", "#c780ab", "#e5b4ce", "#f8e6ef"]],
  ["brown", "Brown", ["#3c2c23", "#79543d", "#ae8968", "#d7bea3", "#f1e8dc"]],
  ["slate", "Slate", ["#28343e", "#526879", "#879ba8", "#becdd4", "#edf2f4"]]
];
for (const [id, label, ramp] of extraFamilies) {
  BASE_PRESETS.push({ id, label, ramps: { cell: ramp, protein: ramp, equipment: ramp } });
}
const FAMILY_ORDER = [
  "red",
  "orange",
  "gold",
  "green",
  "teal",
  "cyan",
  "blue",
  "indigo",
  "purple",
  "pink",
  "brown",
  "slate"
];
export const ASSET_COLOR_PRESETS: AssetColorPreset[] = [...BASE_PRESETS]
  .sort((a, b) => FAMILY_ORDER.indexOf(a.id) - FAMILY_ORDER.indexOf(b.id))
  .flatMap((base) =>
    ASSET_PALETTE_SHADES.map((shade) => ({
      ...base,
      id: shade === "Classic" ? base.id : base.id + "-" + shade.toLowerCase(),
      label: base.label + " " + shade.toLowerCase(),
      family: base.label,
      shade,
      ramps: Object.fromEntries(
        Object.entries(base.ramps).map(([profile, ramp]) => [
          profile,
          ramp.map((color) =>
            shade === "Light"
              ? interpolateHex(color, "#ffffff", 0.32)
              : shade === "Soft"
                ? interpolateHex(color, "#ffffff", 0.16)
                : shade === "Deep"
                  ? interpolateHex(color, ramp[0], 0.2)
                  : color
          )
        ])
      ) as Record<AssetColorProfile, string[]>
    }))
  );

export function colorProfileForFamily(
  family: Pick<AssetFamily, "category" | "title" | "keywords">
): AssetColorProfile {
  if (/equipment|labware/i.test(family.category)) return "equipment";
  if (/protein/i.test(family.category)) return "protein";
  return "cell";
}

export function normalizedPresetColor(color: string): string {
  const [red, green, blue, alpha] = new Color(color).getSource();
  return `${Math.round(red)},${Math.round(green)},${Math.round(blue)},${alpha}`;
}

function colorMetrics(color: string) {
  const [red, green, blue, alpha] = new Color(color).getSource();
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  return {
    alpha,
    luminance: (red * 0.2126 + green * 0.7152 + blue * 0.0722) / 255,
    saturation: maximum === 0 ? 0 : (maximum - minimum) / maximum
  };
}

function interpolateHex(left: string, right: string, amount: number): string {
  const from = new Color(left).getSource();
  const to = new Color(right).getSource();
  const channel = (index: number) => Math.round(from[index] + (to[index] - from[index]) * amount);
  return `#${[channel(0), channel(1), channel(2)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
}

function shadeAt(ramp: string[], position: number): string {
  if (ramp.length === 1) return ramp[0];
  const scaled = Math.max(0, Math.min(1, position)) * (ramp.length - 1);
  const index = Math.floor(scaled);
  return interpolateHex(ramp[index], ramp[Math.min(index + 1, ramp.length - 1)], scaled - index);
}

/** Color families are inferred from original paints, not anatomical labels. */
export function presetColorMap(
  sourceColors: string[],
  profile: AssetColorProfile,
  preset: AssetColorPreset,
  weights: Map<string, number> = new Map()
): Map<string, string> {
  const unique = [
    ...new Map(sourceColors.map((color) => [normalizedPresetColor(color), color])).values()
  ];
  const hue = (color: string) => {
    const [r, g, b] = new Color(color).getSource();
    const max = Math.max(r, g, b),
      min = Math.min(r, g, b),
      delta = max - min;
    if (!delta) return 0;
    return (
      ((max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4) * 60 +
        360) %
      360
    );
  };
  const distance = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
  const chromatic = unique.filter((color) => {
    const m = colorMetrics(color);
    return m.alpha > 0 && m.saturation >= 0.12 && m.luminance > 0.12 && m.luminance < 0.96;
  });
  const dominant = chromatic.reduce<string | undefined>((best, color) => {
    const score = (candidate: string) =>
      chromatic.reduce(
        (sum, paint) =>
          sum +
          (distance(hue(candidate), hue(paint)) <= 35
            ? (weights.get(normalizedPresetColor(paint)) ?? 1) * colorMetrics(paint).alpha
            : 0),
        0
      );
    return !best || score(color) > score(best) ? color : best;
  }, undefined);
  const result = new Map<string, string>();
  for (const color of unique) {
    const m = colorMetrics(color);
    // Keep neutral outlines/highlights and contrasting organelle color families.
    if (!m.alpha || m.luminance < 0.12 || m.luminance > 0.96) continue;
    if (dominant && (m.saturation < 0.12 || distance(hue(color), hue(dominant)) > 40)) continue;
    const mapped = shadeAt(preset.ramps[profile], m.luminance);
    const [r, g, b] = new Color(mapped).getSource();
    result.set(
      normalizedPresetColor(color),
      m.alpha === 1 ? mapped : `rgba(${r}, ${g}, ${b}, ${m.alpha})`
    );
  }
  return result;
}
