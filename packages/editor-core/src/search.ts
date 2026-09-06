import { ASSET_CATEGORY_ORDER } from "./assetTaxonomy";
import type { AssetFamily } from "./types";

const ABBREVIATIONS: Record<string, string[]> = {
  er: ["endoplasmic reticulum"],
  igg: ["antibody", "immunoglobulin"],
  "t cell": ["t-cell", "t lymphocyte"],
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
      ...(family.topics ?? []),
      ...family.keywords,
      ...family.keywords.flatMap((keyword) => ABBREVIATIONS[normalizeSearch(keyword)] ?? [])
    ].join(" ")
  );
}

function matchesTerm(haystack: string, term: string): boolean {
  const singular =
    term.endsWith("ies") && term.length > 4
      ? `${term.slice(0, -3)}y`
      : term.endsWith("s") && !/(ss|us|is)$/.test(term)
        ? term.slice(0, -1)
        : term;
  const variants = new Set([term, singular, `${singular}s`]);
  return [...variants].some((variant) => {
    if (variant.length <= 3 || /^[a-z]+\d+$/i.test(variant)) {
      const escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`(?:^|\\s)${escaped}(?:$|\\s)`).test(haystack);
    }
    return haystack.includes(variant);
  });
}

function matchesTerms(haystack: string, value: string): boolean {
  return value
    .split(" ")
    .filter(Boolean)
    .every((term) => matchesTerm(haystack, term));
}

/** Browse order shared by the catalog UI and unfiltered search results. */
export { ASSET_CATEGORY_ORDER } from "./assetTaxonomy";

const CATEGORY_BROWSE_PRIORITY: Record<string, number> = Object.fromEntries(
  ASSET_CATEGORY_ORDER.map((category, index) => [category, index])
);

export function assetBrowsePriority(family: AssetFamily): number {
  return CATEGORY_BROWSE_PRIORITY[family.category] ?? ASSET_CATEGORY_ORDER.length;
}

export function filterAssetFamilies(
  families: AssetFamily[],
  query: string,
  category = "All"
): AssetFamily[] {
  const normalized = normalizeSearch(query);
  const alternatives = (ABBREVIATIONS[normalized] ?? []).map(normalizeSearch);
  const browseAll = category === "All" && !normalized;
  return families
    .flatMap((family, index) => {
      if (category !== "All" && family.category !== category) return [];
      if (!normalized) return [{ family, score: 0, index }];
      const haystack = searchableText(family);
      const title = normalizeSearch(family.title);
      const direct = matchesTerms(haystack, normalized);
      const synonym = alternatives.some((alternative) => matchesTerms(haystack, alternative));
      if (!direct && !synonym) return [];
      const score =
        title === normalized ? 1_000 : title.startsWith(normalized) ? 800 : direct ? 500 : 100;
      return [{ family, score, index }];
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        (browseAll
          ? assetBrowsePriority(left.family) - assetBrowsePriority(right.family) ||
            left.family.title.localeCompare(right.family.title) ||
            left.index - right.index
          : left.index - right.index)
    )
    .map(({ family }) => family);
}
