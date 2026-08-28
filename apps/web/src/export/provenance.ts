import { Group, type FabricObject } from "fabric";

export const PROVENANCE_MANIFEST_VERSION = 1 as const;
export const PROVENANCE_METADATA_KEY = "OpenSketch:provenance";

export interface AssetProvenanceRecord {
  assetId?: string;
  familyId?: string;
  name?: string;
  source?: string;
  sourceUrl?: string;
  sourceReference?: string;
  sourcePage?: string;
  nihSourcePage?: string;
  commonsPage?: string;
  sourceName?: string;
  author?: string;
  license?: string;
  licenseUrl?: string;
  spdx?: string;
  spdxId?: string;
  licenseSpdx?: string;
  attribution?: string;
  credit?: string;
}

export interface ProvenanceManifest {
  version: typeof PROVENANCE_MANIFEST_VERSION;
  assets: AssetProvenanceRecord[];
}

type ProvenanceValue = Record<string, unknown>;

const RECORD_FIELDS: Array<keyof AssetProvenanceRecord> = [
  "assetId",
  "familyId",
  "name",
  "source",
  "sourceUrl",
  "sourceReference",
  "sourcePage",
  "nihSourcePage",
  "commonsPage",
  "sourceName",
  "author",
  "license",
  "licenseUrl",
  "spdx",
  "spdxId",
  "licenseSpdx",
  "attribution",
  "credit"
];

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

function provenanceRecordForObject(object: FabricObject): AssetProvenanceRecord | undefined {
  const provenance = object.provenance as ProvenanceValue | undefined;
  if (!provenance || typeof provenance !== "object" || Array.isArray(provenance)) return undefined;

  const sourcePage =
    nonEmptyString(provenance.sourcePage) ??
    nonEmptyString(provenance.nihSourcePage) ??
    nonEmptyString(provenance.commonsPage) ??
    nonEmptyString(provenance.source) ??
    nonEmptyString(provenance.sourceUrl) ??
    nonEmptyString(provenance.sourceReference);
  const record: AssetProvenanceRecord = {
    ...((nonEmptyString(object.assetId) ?? nonEmptyString(provenance.assetId))
      ? { assetId: nonEmptyString(object.assetId) ?? nonEmptyString(provenance.assetId) }
      : {}),
    ...((nonEmptyString(object.familyId) ?? nonEmptyString(provenance.familyId))
      ? { familyId: nonEmptyString(object.familyId) ?? nonEmptyString(provenance.familyId) }
      : {}),
    ...((nonEmptyString(object.name) ?? nonEmptyString(provenance.name))
      ? { name: nonEmptyString(object.name) ?? nonEmptyString(provenance.name) }
      : {}),
    ...(sourcePage ? { source: sourcePage } : {}),
    ...Object.fromEntries(
      RECORD_FIELDS.filter(
        (field) => field !== "assetId" && field !== "familyId" && field !== "name"
      )
        .map((field) => [field, nonEmptyString(provenance[field])])
        .filter(([, value]) => value !== undefined)
    )
  } as AssetProvenanceRecord;

  return Object.keys(record).length > 0 ? record : undefined;
}

function identityForRecord(record: AssetProvenanceRecord): string {
  return JSON.stringify(
    RECORD_FIELDS.filter((field) => field !== "name").map((field) => [field, record[field] ?? ""])
  );
}

function mergeDuplicateRecord(
  current: AssetProvenanceRecord,
  candidate: AssetProvenanceRecord
): AssetProvenanceRecord {
  if (!candidate.name) return current;
  if (!current.name || candidate.name.localeCompare(current.name) < 0) {
    return { ...current, name: candidate.name };
  }
  return current;
}

export function collectProvenanceManifest(objects: readonly FabricObject[]): ProvenanceManifest {
  const records = new Map<string, AssetProvenanceRecord>();
  const visit = (object: FabricObject): void => {
    const record = provenanceRecordForObject(object);
    if (record) {
      const identity = identityForRecord(record);
      const existing = records.get(identity);
      records.set(identity, existing ? mergeDuplicateRecord(existing, record) : record);
    }
    if (object instanceof Group) object.getObjects().forEach(visit);
  };
  objects.forEach(visit);

  return {
    version: PROVENANCE_MANIFEST_VERSION,
    assets: [...records.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, record]) => record)
  };
}

export function provenanceManifestJson(manifest: ProvenanceManifest): string {
  return JSON.stringify(manifest);
}

export function formatProvenanceCredits(
  manifest: ProvenanceManifest,
  title: string,
  description: string,
  globalCredit: string
): string {
  const lines = ["OpenSketch figure credits", `Title: ${title}`];
  if (description) lines.push(`Description: ${description}`);
  lines.push("", `Application credit: ${globalCredit}`, "", "Per-asset provenance:");
  if (manifest.assets.length === 0) {
    lines.push("No per-asset provenance records were present.");
    return `${lines.join("\n")}\n`;
  }

  manifest.assets.forEach((asset, index) => {
    lines.push("", `${index + 1}. ${asset.name ?? asset.assetId ?? "Unnamed asset"}`);
    if (asset.assetId) lines.push(`   Asset ID: ${asset.assetId}`);
    if (asset.familyId) lines.push(`   Family ID: ${asset.familyId}`);
    if (asset.source) lines.push(`   Source: ${asset.source}`);
    if (asset.sourceUrl) lines.push(`   Source URL: ${asset.sourceUrl}`);
    if (asset.sourceReference) lines.push(`   Source reference: ${asset.sourceReference}`);
    if (asset.sourcePage) lines.push(`   Source page: ${asset.sourcePage}`);
    if (asset.nihSourcePage) lines.push(`   NIH source page: ${asset.nihSourcePage}`);
    if (asset.commonsPage) lines.push(`   Commons page: ${asset.commonsPage}`);
    if (asset.sourceName) lines.push(`   Source name: ${asset.sourceName}`);
    if (asset.author) lines.push(`   Author: ${asset.author}`);
    if (asset.license) lines.push(`   License: ${asset.license}`);
    if (asset.licenseUrl) lines.push(`   License URL: ${asset.licenseUrl}`);
    if (asset.spdx) lines.push(`   SPDX: ${asset.spdx}`);
    if (asset.spdxId) lines.push(`   SPDX ID: ${asset.spdxId}`);
    if (asset.licenseSpdx) lines.push(`   License SPDX: ${asset.licenseSpdx}`);
    if (asset.attribution) lines.push(`   Attribution: ${asset.attribution}`);
    if (asset.credit && asset.credit !== asset.attribution) {
      lines.push(`   ${asset.attribution ? "Credit" : "Attribution"}: ${asset.credit}`);
    }
  });
  return `${lines.join("\n")}\n`;
}
