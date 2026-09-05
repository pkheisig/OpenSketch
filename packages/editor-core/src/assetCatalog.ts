import { normalizeSearch } from "./search";
import type { AssetFamily } from "./types";

const SEARCH_TERMS: Array<[RegExp, string[]]> = [
  [/\blymphocyte\b/, ["lymphoid cell", "immune cell", "immunology"]],
  [/\berythrocyte\b/, ["red blood cell", "RBC", "blood cell"]],
  [
    /\b(leukocyte|neutrophil|monocyte|macrophage|eosinophil|basophil)\b/,
    ["white blood cell", "immune cell", "immunology"]
  ],
  [/\bplatelet\b/, ["thrombocyte", "blood", "clotting"]],
  [/\bmitochondri(on|a)\b/, ["mitochondrion", "mitochondria", "organelle"]],
  [/\bendoplasmic reticulum\b/, ["ER", "organelle"]],
  [
    /\b(nucleus|nucleolus|golgi|lysosome|endosome|ribosome|peroxisome)\b/,
    ["cell component", "organelle"]
  ],
  [/\b(membrane|bilayer)\b/, ["lipid bilayer", "phospholipid", "cell boundary"]],
  [/\b(receptor|channel|transporter)\b/, ["protein", "binding", "signaling"]],
  [/\b(antibody|immunoglobulin)\b/, ["antibody", "immunoglobulin", "binding protein"]],
  [/\b(pipette|pipetting)\b/, ["liquid handling", "laboratory", "lab equipment"]],
  [
    /\b(flask|beaker|graduated cylinder|microcentrifuge tube|culture dish|well plate|cryovial)\b/,
    ["labware", "laboratory", "container"]
  ],
  [
    /\b(microscope|cytometer|centrifuge|incubator|shaker|counter)\b/,
    ["instrument", "laboratory", "lab equipment"]
  ],
  [/\bpolymerase chain reaction\b/, ["PCR"]],
  [/\b(deoxyribonucleic acid|dna)\b/, ["DNA", "deoxyribonucleic acid", "nucleic acid"]],
  [/\b(ribonucleic acid|rna)\b/, ["RNA", "ribonucleic acid", "nucleic acid"]]
];

/** Search terms describe/discover an asset; they never create another asset ID. */
export function enrichAssetKeywords(
  family: Pick<AssetFamily, "title" | "category" | "keywords">
): string[] {
  const title = normalizeSearch(family.title);
  const terms = [
    family.title,
    family.category,
    ...family.keywords,
    ...SEARCH_TERMS.filter(([pattern]) => pattern.test(title)).flatMap(([, keywords]) => keywords)
  ];
  const seen = new Set<string>();
  return terms
    .map((term) => term.trim())
    .filter((term) => {
      const key = normalizeSearch(term);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/** IDs remain stable across metadata/artwork revisions. Fail closed on collisions. */
export function assertUniqueAssetCatalog(families: AssetFamily[]): void {
  const familyIds = new Set<string>();
  const variantIds = new Set<string>();
  const artwork = new Map<string, string>();
  for (const family of families) {
    if (!family.familyId.trim() || familyIds.has(family.familyId))
      throw new Error(`Duplicate or empty asset ID: ${family.familyId}`);
    familyIds.add(family.familyId);
    if (!family.variants.some((variant) => variant.id === family.defaultVariantId))
      throw new Error(`Missing default variant for ${family.familyId}`);
    for (const variant of family.variants) {
      if (!variant.id.trim() || variantIds.has(variant.id))
        throw new Error(`Duplicate or empty variant ID: ${variant.id}`);
      variantIds.add(variant.id);
      const fingerprint = variant.localSha256
        ? `sha256:${variant.localSha256}`
        : `path:${variant.assetPath}`;
      if (fingerprint) {
        const previous = artwork.get(fingerprint);
        if (previous) throw new Error(`Duplicate artwork: ${previous} and ${variant.id}`);
        artwork.set(fingerprint, variant.id);
      }
    }
  }
}
