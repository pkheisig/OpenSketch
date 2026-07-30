import type { AssetFamily } from "../../packages/editor-core/src/types";

export interface CommonsMetadataValue {
  value?: string;
}

export interface CommonsPage {
  pageid: number;
  ns: number;
  title: string;
  imageinfo?: Array<{
    url: string;
    descriptionurl?: string;
    mime: string;
    size: number;
    width: number;
    height: number;
    sha1: string;
    extmetadata?: Record<string, CommonsMetadataValue>;
  }>;
}

export interface SourceLockEntry {
  title: string;
  sourceKind?: "nih" | "commons";
  sourcePage?: string;
  commonsPage?: string;
  sourceUrl: string;
  commonsSha1?: string;
  sourceFileId?: number;
  sourceSha256?: string;
  localSha256: string;
  sanitizerVersion: number;
  assetId: string;
  bioartEntryId: number;
  assetPath: string;
  thumbnailPath: string;
  width: number;
  height: number;
  author: string;
  license: "Public Domain";
  nihSourcePage: string;
  family: Omit<AssetFamily, "variants" | "defaultVariantId" | "familyId" | "bioartEntryId">;
}

export interface SourceLock {
  version: 1;
  sanitizerVersion: number;
  updatedAt: string;
  files: Record<string, SourceLockEntry>;
}

export interface ImportFailure {
  title: string;
  stage: string;
  error: string;
}

export interface ImportSkip {
  title: string;
  reason: string;
}
