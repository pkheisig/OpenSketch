export const NIH_BIOART_ORIGIN = "https://bioart.niaid.nih.gov";

export interface NihBioartRecord {
  entryId: number;
  title: string;
  description: string;
  category: string;
  keywords: string[];
  author: string;
  license: string;
  sourcePage: string;
  svgFileIds: number[];
}

function decodeHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replace(/\s+/g, " ")
    .trim();
}

function nextFlightPayload(html: string): string {
  const chunks: string[] = [];
  for (const match of html.matchAll(
    /<script>self\.__next_f\.push\(\[1,([\s\S]*?)\]\)<\/script>/g
  )) {
    try {
      const chunk = JSON.parse(match[1]) as unknown;
      if (typeof chunk === "string") chunks.push(chunk);
    } catch {
      // Unrelated or incomplete Next.js bootstrap chunks can be ignored.
    }
  }
  return chunks.join("\n");
}

function jsonObjectAfter(source: string, marker: string): Record<string, unknown> | undefined {
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) return undefined;
  const start = source.indexOf("{", markerIndex + marker.length);
  if (start < 0) return undefined;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return JSON.parse(source.slice(start, index + 1)) as Record<string, unknown>;
      }
    }
  }
  return undefined;
}

function referencedChildren(payload: string, label: string): string {
  const reference = payload.match(
    new RegExp(`"children":"${label}"\\}\\],"\\$L([a-z0-9]+)"`, "i")
  )?.[1];
  if (!reference) return "";
  const value = payload.match(
    new RegExp(`(?:^|\\n)${reference}:.*?"children":"([^"]*)"`, "i")
  )?.[1];
  return value ? decodeHtml(value) : "";
}

export function parseNihBioartPage(entryId: number, html: string): NihBioartRecord | undefined {
  const payload = nextFlightPayload(html);
  if (!payload.includes(`BIOART-${String(entryId).padStart(6, "0")}`)) return undefined;

  const title = payload.match(/"variant":"h4","color":"heading","children":"([^"]+)"/)?.[1];
  const licensingBlock = payload.slice(
    payload.indexOf("Licensing:"),
    payload.indexOf('"children":"Category:"', payload.indexOf("Licensing:"))
  );
  const license = licensingBlock.includes("Public Domain")
    ? "Public Domain"
    : /creativecommons\.org\/licenses\/by\/4\.0/i.test(licensingBlock)
      ? "CC BY 4.0"
      : "Unknown";
  const category = payload.match(/"children":"Category:"[\s\S]{0,300}?"children":"([^"]+)"/)?.[1];
  const descriptionHtml = payload.match(/"dangerouslySetInnerHTML":\{"__html":"([^"]*)"\}/)?.[1];
  const fileMapping = jsonObjectAfter(payload, '"filemapping":');
  if (!title || !category || !fileMapping) return undefined;

  const svgFileIds = Object.values(fileMapping)
    .map((group) =>
      group && typeof group === "object" && "SVG" in group
        ? Number((group as { SVG?: unknown }).SVG)
        : Number.NaN
    )
    .filter((value) => Number.isSafeInteger(value) && value > 0);
  const keywordText = referencedChildren(payload, "Keywords");
  const creator = referencedChildren(payload, "Creator");

  return {
    entryId,
    title: decodeHtml(title),
    description: descriptionHtml ? decodeHtml(descriptionHtml) : "",
    category: decodeHtml(category),
    keywords: keywordText
      .split(",")
      .map((keyword) => keyword.trim())
      .filter(Boolean),
    author: creator || "NIAID Visual & Medical Arts",
    license: decodeHtml(license),
    sourcePage: `${NIH_BIOART_ORIGIN}/bioart/${entryId}`,
    svgFileIds: [...new Set(svgFileIds)]
  };
}

export function directSvgUrl(entryId: number, fileId: number): string {
  return `${NIH_BIOART_ORIGIN}/api/bioarts/${entryId}/files/${fileId}`;
}
