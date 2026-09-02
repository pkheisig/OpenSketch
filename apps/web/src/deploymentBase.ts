export const DEFAULT_PUBLIC_BASE = "/OpenSketch/";

const EXTERNAL_SCHEME = /^[a-z][a-z\d+.-]*:/i;
const URL_CHARACTERS = new Set(["?", "#", "\\"]);

function hasControlOrUrlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return URL_CHARACTERS.has(character) || code < 0x20 || code === 0x7f;
  });
}

/** Normalize a deployment base to one safe, slash-terminated URL path. */
export function normalizePublicBase(value = DEFAULT_PUBLIC_BASE): string {
  const raw = value.trim();
  if (!raw) throw new Error("The public deployment base must not be empty.");
  if (EXTERNAL_SCHEME.test(raw) || (raw.startsWith("//") && !raw.startsWith("///"))) {
    throw new Error("The public deployment base must be a local path, not an external URL.");
  }
  const path = raw.replace(/^\/+|\/+$/g, "");
  if (hasControlOrUrlCharacter(raw) || path.includes("//")) {
    throw new Error("The public deployment base contains an invalid URL character.");
  }

  return path ? `/${path}/` : "/";
}

export function publicPath(publicBase: string, path: string): string {
  return `${publicBase}${path.replace(/^\/+/, "")}`;
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function publicAssetPattern(publicBase: string, suffix: string): RegExp {
  const origin = "(?:[a-z][a-z\\d+.-]*:\\/\\/[^/]+)?";
  return new RegExp(`^${origin}${escapeRegExp(publicBase)}assets/${suffix}`);
}
