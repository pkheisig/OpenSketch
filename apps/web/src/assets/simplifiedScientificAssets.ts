import type { AssetStyle, AssetVariant } from "@workspace/editor-core";

const SIMPLIFIED: AssetStyle = "simplified";
const REVIEWED_AT = "2026-09-06";

function approvedCounterpart(sourceVariantId: string, notes: string) {
  return {
    lineage: { sourceVariantId, relationship: "simplified-counterpart" as const },
    qualification: {
      state: "approved" as const,
      reviewedAt: REVIEWED_AT,
      reviewer: "OpenSketch asset review",
      notes
    }
  };
}

export const SIMPLIFIED_SCIENTIFIC_VARIANTS: Record<string, AssetVariant> = {
  "editable-cell": {
    id: "editable-cell-simplified",
    style: SIMPLIFIED,
    label: "Simplified",
    assetPath: "assets/scientific-structures/editable-cell-simplified.svg",
    thumbnailPath: "assets/scientific-structures/editable-cell-simplified.svg",
    localSha256: "611d5b76dbb9bf38e46467983ac5391988ff54c80b07bcdf89f28cea77bd1d4a",
    width: 220,
    height: 170,
    ...approvedCounterpart(
      "editable-cell",
      "Preserves the broad cell boundary and nucleus; the ellipse silhouette distinguishes this generic cell from the circular T lymphocyte counterpart at small size."
    )
  },
  "editable-protein": {
    id: "editable-protein-simplified",
    style: SIMPLIFIED,
    label: "Simplified",
    assetPath: "assets/scientific-structures/editable-protein-simplified.svg",
    thumbnailPath: "assets/scientific-structures/editable-protein-simplified.svg",
    localSha256: "143457170a55238d2a729067e179d6a744b820baa7046e69ad25b33be48e7c47",
    width: 160,
    height: 130,
    ...approvedCounterpart(
      "editable-protein",
      "Preserves the protein silhouette and two distinguishing domains with reduced internal detail."
    )
  },
  "editable-antibody": {
    id: "editable-antibody-simplified",
    style: SIMPLIFIED,
    label: "Simplified",
    assetPath: "assets/scientific-structures/editable-antibody-simplified.svg",
    thumbnailPath: "assets/scientific-structures/editable-antibody-simplified.svg",
    localSha256: "8b8287ad91fb9b0ee0a048d1226dfa071d6c1ce533f0190301a6a57ac2650686",
    width: 150,
    height: 150,
    ...approvedCounterpart(
      "editable-antibody",
      "Preserves the Y-shaped antibody topology and paired arms without decorative internal detail."
    )
  },
  "opensketch-generated-t-lymphocyte": {
    id: "opensketch-generated-t-lymphocyte-simplified",
    style: SIMPLIFIED,
    label: "Simplified",
    assetPath: "assets/opensketch-generated/t-lymphocyte-simplified.svg",
    thumbnailPath: "assets/opensketch-generated/t-lymphocyte-simplified.svg",
    localSha256: "f2e742270ecc9305c567a72d7a8251cf7c412cfe5dc95d62daa9beb39e2830f4",
    width: 180,
    height: 180,
    ...approvedCounterpart(
      "opensketch-generated-t-lymphocyte",
      "Preserves the rounded lymphocyte body and nucleus; the circular silhouette and immunology lineage keep it distinct from the generic editable cell."
    )
  },
  "opensketch-generated-lysosome": {
    id: "opensketch-generated-lysosome-simplified",
    style: SIMPLIFIED,
    label: "Simplified",
    assetPath: "assets/opensketch-generated/lysosome-simplified.svg",
    thumbnailPath: "assets/opensketch-generated/lysosome-simplified.svg",
    localSha256: "ec8c191309ce6697f59da4177e75fae14f15a2ac96224fb330f9ee5065f2d7d9",
    width: 180,
    height: 160,
    ...approvedCounterpart(
      "opensketch-generated-lysosome",
      "Preserves the lysosome boundary and internal vesicle cue while removing granular texture."
    )
  },
  "opensketch-generated-streptavidin-tetramer": {
    id: "opensketch-generated-streptavidin-tetramer-simplified",
    style: SIMPLIFIED,
    label: "Simplified",
    assetPath: "assets/opensketch-generated/streptavidin-tetramer-simplified.svg",
    thumbnailPath: "assets/opensketch-generated/streptavidin-tetramer-simplified.svg",
    localSha256: "30d642adad60ef7eeae21617211644add43282115854a401d1518c3ea68700f6",
    width: 190,
    height: 170,
    ...approvedCounterpart(
      "opensketch-generated-streptavidin-tetramer",
      "Preserves the four-subunit tetramer arrangement and central cavity with restrained line work."
    )
  },
  "opensketch-generated-magnetic-separation-column": {
    id: "opensketch-generated-magnetic-separation-column-simplified",
    style: SIMPLIFIED,
    label: "Simplified",
    assetPath: "assets/opensketch-generated/magnetic-separation-column-simplified.svg",
    thumbnailPath: "assets/opensketch-generated/magnetic-separation-column-simplified.svg",
    localSha256: "f3d93bbf7593d236bd1fab987a06dd215b99083bc07eb75d12fa7603128b2833",
    width: 150,
    height: 190,
    ...approvedCounterpart(
      "opensketch-generated-magnetic-separation-column",
      "Preserves the column, sample path, and magnetic separation geometry without labels or texture."
    )
  },
  "opensketch-generated-dna-fragment-with-sequencing-adapters": {
    id: "opensketch-generated-dna-fragment-with-sequencing-adapters-simplified",
    style: SIMPLIFIED,
    label: "Simplified",
    assetPath: "assets/opensketch-generated/dna-fragment-with-sequencing-adapters-simplified.svg",
    thumbnailPath:
      "assets/opensketch-generated/dna-fragment-with-sequencing-adapters-simplified.svg",
    localSha256: "f03fa564f5ce8c03df4a36700cc4b985e90144104badf3c1c4d470243fbcbab5",
    width: 220,
    height: 150,
    ...approvedCounterpart(
      "opensketch-generated-dna-fragment-with-sequencing-adapters",
      "Preserves the paired DNA fragment and adapter end topology with fewer rungs and no decorative detail."
    )
  }
};
