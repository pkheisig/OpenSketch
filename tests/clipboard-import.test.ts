import { describe, expect, it } from "vitest";
import { importedMediaFilesFromDataTransfer } from "../apps/web/src/editor/clipboardImport";

describe("file drop interchange routing", () => {
  it("passes unknown files through for strict refusal instead of silently filtering them", () => {
    const file = new File(["not an image"], "figure.txt", { type: "text/plain" });
    const data = { files: [file], items: [] } as unknown as DataTransfer;

    expect(importedMediaFilesFromDataTransfer(data)).toEqual([file]);
  });
});
