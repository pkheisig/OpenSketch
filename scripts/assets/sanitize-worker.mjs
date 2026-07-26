import { sanitizeSvg } from "./sanitize-svg.ts";

export default function sanitizeInWorker({ source, assetId }) {
  return sanitizeSvg(source, assetId);
}
