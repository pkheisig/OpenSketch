import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

function withTimeout(init: RequestInit, milliseconds = 15_000): RequestInit {
  const timeout = AbortSignal.timeout(milliseconds);
  return {
    ...init,
    signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout
  };
}

export async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

export async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, filePath);
}

export async function writeTextAtomic(filePath: string, value: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp`;
  await writeFile(temporary, value, "utf8");
  await rename(temporary, filePath);
}

export async function writeBufferAtomic(filePath: string, value: Buffer): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp`;
  await writeFile(temporary, value);
  await rename(temporary, filePath);
}

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function mapLimit<T, R>(
  values: T[],
  limit: number,
  worker: (value: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let next = 0;
  async function run() {
    while (next < values.length) {
      const index = next++;
      results[index] = await worker(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, run));
  return results;
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  attempts = 5
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(url, withTimeout(init));
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(8000, 500 * 2 ** attempt + Math.random() * 150))
        );
      }
      continue;
    }
    if (response.ok) return response;
    if (response.status < 500 && response.status !== 429) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    lastError = new Error(`${response.status} ${response.statusText}`);
    if (attempt < attempts - 1) {
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(8000, 500 * 2 ** attempt + Math.random() * 150))
      );
    }
  }
  throw new Error(`Request failed after ${attempts} attempts: ${String(lastError)}`);
}

let requestQueue: Promise<void> = Promise.resolve();
let lastRequestAt = 0;
let requestCooldownUntil = 0;

function retryAfterMilliseconds(response: Response): number {
  const value = response.headers.get("retry-after");
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 0;
}

async function enterRequestQueue(minimumIntervalMs: number): Promise<void> {
  const wait = requestQueue.then(async () => {
    while (true) {
      const allowedAt = Math.max(lastRequestAt + minimumIntervalMs, requestCooldownUntil);
      const delay = allowedAt - Date.now();
      if (delay <= 0) break;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    lastRequestAt = Date.now();
  });
  requestQueue = wait.catch(() => {});
  await wait;
}

export async function rateLimitedFetch(
  url: string,
  init: RequestInit = {},
  minimumIntervalMs = 180,
  attempts = 8,
  timeoutMs = 15_000
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await enterRequestQueue(minimumIntervalMs);
    let response: Response;
    try {
      response = await fetch(url, withTimeout(init, timeoutMs));
    } catch (error) {
      lastError = error;
      requestCooldownUntil = Math.max(
        requestCooldownUntil,
        Date.now() + Math.min(15_000, 500 * 2 ** attempt)
      );
      continue;
    }
    if (response.ok) return response;
    if (response.status < 500 && response.status !== 429) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    lastError = new Error(`${response.status} ${response.statusText}`);
    const exponential = Math.min(30_000, 1000 * 2 ** attempt);
    const serverDelay = retryAfterMilliseconds(response);
    const delay = Math.max(response.status === 429 ? 10_000 : 0, exponential, serverDelay);
    requestCooldownUntil = Math.max(requestCooldownUntil, Date.now() + delay);
    if (response.status === 429) {
      console.warn(`Remote rate limit reached; pausing the shared request queue for ${delay} ms.`);
    }
  }
  throw new Error(`Request failed after ${attempts} queued attempts: ${String(lastError)}`);
}
