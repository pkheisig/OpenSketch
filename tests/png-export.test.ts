import { describe, expect, it } from "vitest";
import { setPngDpi } from "../apps/web/src/export/png";
import { PROVENANCE_METADATA_KEY } from "../apps/web/src/export/provenance";

const ONE_PIXEL_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

describe("PNG export metadata", () => {
  it("writes the selected physical resolution", async () => {
    const bytes = Uint8Array.from(atob(ONE_PIXEL_PNG), (character) => character.charCodeAt(0));
    const outputBlob = await setPngDpi(new Blob([bytes]), 300);
    const output = new Uint8Array(
      await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(outputBlob);
      })
    );
    const marker = new TextEncoder().encode("pHYs");
    const index = output.findIndex(
      (_, offset) =>
        offset + marker.length <= output.length &&
        marker.every((value, index) => output[offset + index] === value)
    );
    expect(index).toBeGreaterThan(0);
    const pixelsPerMeter = new DataView(output.buffer).getUint32(index + 4);
    expect(pixelsPerMeter).toBe(11811);
    expect(output[index + 12]).toBe(1);
  });

  it("writes the canonical provenance manifest as UTF-8 iTXt metadata", async () => {
    const bytes = Uint8Array.from(atob(ONE_PIXEL_PNG), (character) => character.charCodeAt(0));
    const provenance = {
      version: 1 as const,
      assets: [
        {
          assetId: "asset-a",
          name: "Alpha",
          source: "https://example.org/alpha",
          author: "A. Author",
          license: "CC-BY-4.0",
          credit: "A. Author / Example"
        }
      ]
    };
    const outputBlob = await setPngDpi(new Blob([bytes]), 300, { provenance });
    const output = new Uint8Array(
      await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(outputBlob);
      })
    );
    let offset = 8;
    let manifest: unknown;
    while (offset + 12 <= output.length) {
      const length = new DataView(output.buffer).getUint32(offset);
      const type = new TextDecoder().decode(output.subarray(offset + 4, offset + 8));
      const data = output.subarray(offset + 8, offset + 8 + length);
      if (type === "iTXt") {
        const keywordEnd = data.indexOf(0);
        const keyword = new TextDecoder().decode(data.subarray(0, keywordEnd));
        if (keyword === PROVENANCE_METADATA_KEY) {
          manifest = JSON.parse(new TextDecoder().decode(data.subarray(keywordEnd + 5)));
        }
      }
      offset += length + 12;
    }
    expect(manifest).toEqual(provenance);
  });
});
