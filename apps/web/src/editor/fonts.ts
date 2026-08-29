export const TEXT_FONT_REGISTRY = [
  { family: "Source Sans 3", pdfFamily: "Source Sans 3", assetKey: "source-sans-3" },
  { family: "Inter", pdfFamily: "Inter", assetKey: "inter" },
  {
    family: "Atkinson Hyperlegible",
    pdfFamily: "Atkinson Hyperlegible",
    assetKey: "atkinson-hyperlegible"
  },
  { family: "IBM Plex Sans", pdfFamily: "IBM Plex Sans", assetKey: "ibm-plex-sans" },
  { family: "Lato", pdfFamily: "Lato", assetKey: "lato" },
  { family: "Noto Sans", pdfFamily: "Noto Sans", assetKey: "noto-sans" },
  { family: "Source Serif 4", pdfFamily: "Source Serif 4", assetKey: "source-serif-4" },
  { family: "IBM Plex Serif", pdfFamily: "IBM Plex Serif", assetKey: "ibm-plex-serif" },
  { family: "Merriweather", pdfFamily: "Merriweather", assetKey: "merriweather" },
  { family: "Noto Serif", pdfFamily: "Noto Serif", assetKey: "noto-serif" },
  { family: "STIX Two Text", pdfFamily: "STIX Two Text", assetKey: "stix-two-text" },
  { family: "Roboto Mono", pdfFamily: "Roboto Mono", assetKey: "roboto-mono" },
  // Georgia is a system font in the browser; PDF export uses the bundled serif face explicitly.
  { family: "Georgia", pdfFamily: "Noto Serif", assetKey: "noto-serif" }
] as const;

export type TextFontFamily = (typeof TEXT_FONT_REGISTRY)[number]["family"];

export const TEXT_FONT_FAMILIES = TEXT_FONT_REGISTRY.map(
  ({ family }) => family
) as TextFontFamily[];

export function getPdfFontFamily(family: string): string {
  return TEXT_FONT_REGISTRY.find((definition) => definition.family === family)?.pdfFamily ?? family;
}
