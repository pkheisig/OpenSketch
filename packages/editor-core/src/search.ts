import type { AssetFamily } from "./types";

const ABBREVIATIONS: Record<string, string[]> = {
  er: ["endoplasmic reticulum"],
  igg: ["antibody", "immunoglobulin"],
  "t cell": ["t-cell", "lymphocyte", "cd4", "cd8"],
  mitochondria: ["mitochondrion"]
};

export function normalizeSearch(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[-_/.,()[\]{}:;]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function searchableText(family: AssetFamily): string {
  return normalizeSearch(
    [
      family.title,
      family.description,
      family.category,
      family.author,
      ...family.keywords,
      ...family.keywords.flatMap((keyword) => ABBREVIATIONS[normalizeSearch(keyword)] ?? [])
    ].join(" ")
  );
}

export function filterAssetFamilies(
  families: AssetFamily[],
  query: string,
  category = "All"
): AssetFamily[] {
  const normalized = normalizeSearch(query);
  return families.filter((family) => {
    if (category !== "All" && family.category !== category) return false;
    const haystack = searchableText(family);
    const alternatives = [normalized, ...(ABBREVIATIONS[normalized] ?? [])].map(normalizeSearch);
    return alternatives.some((alternative) =>
      alternative
        .split(" ")
        .filter(Boolean)
        .every((term) => {
          const singular =
            term.endsWith("ies") && term.length > 4
              ? `${term.slice(0, -3)}y`
              : term.endsWith("s") && !/(ss|us|is)$/.test(term)
                ? term.slice(0, -1)
                : term;
          const variants = new Set([term, singular, `${singular}s`]);
          return [...variants].some((variant) =>
            variant.length <= 2
              ? new RegExp(`(?:^|\\s)${variant}(?:$|\\s)`).test(haystack)
              : haystack.includes(variant)
          );
        })
    );
  });
}
