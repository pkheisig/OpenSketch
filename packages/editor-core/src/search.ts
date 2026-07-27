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

const CATEGORY_BROWSE_PRIORITY: Record<string, number> = {
  "Cells and organelles": 0,
  Proteins: 1,
  Molecules: 2,
  "Cellular processes": 3,
  Equipment: 4,
  Bacteria: 5,
  Viruses: 6,
  Anatomy: 10,
  "Shapes and arrows": 11,
  Other: 12,
  Plants: 13,
  Arthropods: 14,
  Animals: 15,
  People: 16
};

const OTHER_BIOCHEMISTRY_PRIORITY: Array<[number, RegExp]> = [
  [
    0,
    /\b(cell|cellular|organelle|nucleus|neutrophil|astrocyte|lymphocyte|macrophage|monocyte|hepatocyte|fibroblast|eosinophil|basophil|erythrocyte|platelet|neuron)\b/
  ],
  [
    1,
    /\b(protein|receptor|antibody|immunoglobulin|enzyme|kinase|complex|filament|actin|tubulin|microtubule|complement|cd\d+)\b/
  ],
  [2, /\b(dna|rna|chromatin|chromosome|gene|genome|nucleic|lipid|molecule|metabolite|ceramide)\b/],
  [3, /\b(apoptosis|translation|transcription|polymerization|signaling|pathway|cascade)\b/],
  [
    4,
    /\b(plate|dish|vial|tube|pipette|microscope|sequencer|flask|spectrometry|reader|qpcr|centrifuge|grid box)\b/
  ],
  [5, /\b(bacteria|bacillus|borrelia|spirochete)\b/],
  [6, /\b(virus|viral|virion)\b/]
];

export function assetBrowsePriority(family: AssetFamily): number {
  if (family.category !== "Other") return CATEGORY_BROWSE_PRIORITY[family.category] ?? 12;
  const metadata = searchableText(family);
  return (
    OTHER_BIOCHEMISTRY_PRIORITY.find(([, pattern]) => pattern.test(metadata))?.[0] ??
    CATEGORY_BROWSE_PRIORITY.Other
  );
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
