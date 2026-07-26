import { describe, expect, it } from "vitest";
import { setPngDpi } from "../apps/web/src/export/png";

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
});
