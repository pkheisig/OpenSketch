import { Color } from "fabric";
import type { AssetFamily } from "@workspace/editor-core";

export type AssetColorProfile = "cell" | "protein" | "equipment";

export interface AssetColorPreset {
  id: "green" | "blue" | "purple" | "red" | "gold";
  label: string;
  ramps: Record<AssetColorProfile, string[]>;
}

export const ASSET_COLOR_PRESETS: AssetColorPreset[] = [
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

const SUPPORTED_EQUIPMENT =
  /\b(plate|dish|flask|beaker|tube|vial|pipette|syringe|bottle|well|rack|microscope|centrifuge|incubator|bioreactor)\b/i;

export function colorProfileForFamily(
  family: Pick<AssetFamily, "category" | "title" | "keywords">
): AssetColorProfile | undefined {
  if (family.category === "Cells") return "cell";
  if (family.category === "Proteins") return "protein";
  if (
    family.category === "Equipment" &&
    SUPPORTED_EQUIPMENT.test(`${family.title} ${family.keywords.join(" ")}`)
  ) {
    return "equipment";
  }
  return undefined;
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

export function presetColorMap(
  sourceColors: string[],
  profile: AssetColorProfile,
  preset: AssetColorPreset
): Map<string, string> {
  const unique = [...new Map(sourceColors.map((color) => [normalizedPresetColor(color), color])).values()];
  const recolorable = unique
    .filter((color) => {
      const metrics = colorMetrics(color);
      if (metrics.alpha === 0) return false;
      if (profile !== "equipment") return true;
      return !(
        metrics.saturation < 0.08 &&
        (metrics.luminance < 0.2 || metrics.luminance > 0.94)
      );
    })
    .sort((left, right) => colorMetrics(left).luminance - colorMetrics(right).luminance);

  return new Map(
    recolorable.map((color, index) => [
      normalizedPresetColor(color),
      shadeAt(
        preset.ramps[profile],
        recolorable.length === 1 ? 0.5 : index / (recolorable.length - 1)
      )
    ])
  );
}
