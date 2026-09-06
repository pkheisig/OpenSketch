/** One logical asset per artwork digest; concept aliases remain search metadata. */
export function canonicalArtworkGroups(assets, previous = []) {
  const existing = new Map(previous.map((asset) => [asset.sha256, asset.id]));
  const groups = new Map();
  for (const [id, entry] of Object.entries(assets)) {
    if (entry.status !== "complete") continue;
    if (!/^[a-f0-9]{64}$/.test(entry.svg_sha256 ?? ""))
      throw new Error(`Missing artwork checksum: ${id}`);
    const entries = groups.get(entry.svg_sha256) ?? [];
    entries.push({ ...entry, id });
    groups.set(entry.svg_sha256, entries);
  }
  const ids = new Set();
  return [...groups.entries()].map(([sha256, entries]) => {
    const previousId = existing.get(sha256);
    const canonical =
      entries.find((entry) => entry.id === previousId) ??
      entries.find(
        (entry) => !entry.alias_of && entry.svg.split("/").at(-1)?.startsWith(`${entry.id}-`)
      ) ??
      entries.find((entry) => !entry.alias_of) ??
      entries[0];
    if (ids.has(canonical.id)) throw new Error(`Canonical ID collision: ${canonical.id}`);
    ids.add(canonical.id);
    return { canonical, entries, sha256 };
  });
}
