export const DEFAULT_TEXT_LINE_HEIGHT = 1;

export const TEXT_LINE_SPACING_OPTIONS = [
  { value: 0.8, label: "Tight (0.8×)" },
  { value: 1, label: "No extra spacing (1×)" },
  { value: 1.2, label: "Standard (1.2×)" },
  { value: 1.5, label: "1.5 lines (1.5×)" },
  { value: 2, label: "Double (2×)" }
] as const;

export type TextLineSpacingValue = (typeof TEXT_LINE_SPACING_OPTIONS)[number]["value"] | "custom";

export function lineSpacingValue(lineHeight: number | undefined): TextLineSpacingValue {
  const value =
    typeof lineHeight === "number" && Number.isFinite(lineHeight)
      ? lineHeight
      : DEFAULT_TEXT_LINE_HEIGHT;
  return TEXT_LINE_SPACING_OPTIONS.find((option) => option.value === value)?.value ?? "custom";
}
