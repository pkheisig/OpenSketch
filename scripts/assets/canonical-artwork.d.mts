export interface SourceArtwork {
  status: string;
  name: string;
  category: string;
  svg: string;
  svg_sha256: string;
  png: string;
  png_sha256: string;
  alias_of?: string;
  keywords?: string[];
}
export function canonicalArtworkGroups(
  assets: Record<string, SourceArtwork>,
  previous?: Array<{ id: string; sha256: string }>
): Array<{
  canonical: SourceArtwork & { id: string };
  entries: Array<SourceArtwork & { id: string }>;
  sha256: string;
}>;
