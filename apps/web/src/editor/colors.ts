import { Color } from "fabric";

export interface AssetColorEffects {
  tint: string;
  tintAmount: number;
  saturation: number;
  brightness: number;
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

export function transformColor(color: string, effects: AssetColorEffects): string {
  const source = new Color(color).getSource();
  const tint = new Color(effects.tint).getSource();
  const tintAmount = clamp(effects.tintAmount, 0, 1);
  let red = source[0] * (1 - tintAmount) + tint[0] * tintAmount;
  let green = source[1] * (1 - tintAmount) + tint[1] * tintAmount;
  let blue = source[2] * (1 - tintAmount) + tint[2] * tintAmount;
  const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
  const saturation = clamp(1 + effects.saturation, 0, 2);
  red = luminance + (red - luminance) * saturation;
  green = luminance + (green - luminance) * saturation;
  blue = luminance + (blue - luminance) * saturation;
  const brightness = effects.brightness * 255;
  red = clamp(red + brightness, 0, 255);
  green = clamp(green + brightness, 0, 255);
  blue = clamp(blue + brightness, 0, 255);
  const alpha = source[3];
  return `rgba(${Math.round(red)},${Math.round(green)},${Math.round(blue)},${alpha})`;
}
