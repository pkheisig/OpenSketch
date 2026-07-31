import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import Piscina from "piscina";
import { sha256, writeTextAtomic } from "./io";
import { ROOT } from "./paths";

const execFileAsync = promisify(execFile);
const THUMBNAIL_WORKER = path.join(ROOT, "scripts/assets/thumbnail-worker.mjs");
const sanitizerPool = new Piscina({
  filename: fileURLToPath(new URL("./sanitize-worker.mjs", import.meta.url)),
  minThreads: 2,
  maxThreads: 8
});

function ensureViewBox(source: string): string {
  if (/\bviewBox\s*=/i.test(source)) return source;
  const width = source.match(/\bwidth=["']([0-9.]+)(?:px)?["']/i)?.[1];
  const height = source.match(/\bheight=["']([0-9.]+)(?:px)?["']/i)?.[1];
  if (!width || !height) return source;
  return source.replace(/<svg\b/i, `<svg viewBox="0 0 ${width} ${height}"`);
}

function dimensions(svg: string): { width: number; height: number } {
  const values = svg
    .match(/\bviewBox=["']([^"']+)["']/i)?.[1]
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (!values || values.length !== 4 || values.some((value) => !Number.isFinite(value))) {
    throw new Error("SVG has no valid viewBox.");
  }
  return { width: Math.abs(values[2]), height: Math.abs(values[3]) };
}

export async function storeOpenAsset(
  source: string,
  assetId: string,
  assetDirectory: string,
  thumbnailDirectory: string
): Promise<{
  assetPath: string;
  thumbnailPath: string;
  localSha256: string;
  width: number;
  height: number;
}> {
  const sanitized = (await sanitizerPool.run(
    {
      source: ensureViewBox(source),
      assetId
    },
    { signal: AbortSignal.timeout(120_000) }
  )) as string;
  const filename = `${assetId}.svg`;
  const thumbnailFilename = `${assetId}.webp`;
  const svgPath = path.join(assetDirectory, filename);
  const thumbnailPath = path.join(thumbnailDirectory, thumbnailFilename);
  await writeTextAtomic(svgPath, sanitized);
  await execFileAsync(process.execPath, [THUMBNAIL_WORKER, svgPath, thumbnailPath], {
    timeout: 60_000
  });
  const size = dimensions(sanitized);
  const publicRoot = path.join(ROOT, "apps/web/public");
  return {
    assetPath: path.relative(publicRoot, svgPath).split(path.sep).join("/"),
    thumbnailPath: path.relative(publicRoot, thumbnailPath).split(path.sep).join("/"),
    localSha256: sha256(sanitized),
    ...size
  };
}

export async function closeOpenAssetStorage(): Promise<void> {
  await sanitizerPool.destroy();
}
