import { describe, expect, it } from "vitest";
import {
  importedMediaFilesFromClipboard,
  importedMediaFilesFromDataTransfer
} from "../apps/web/src/editor/clipboardImport";

describe("file drop interchange routing", () => {
  it("passes unknown files through for strict refusal instead of silently filtering them", () => {
    const file = new File(["not an image"], "figure.txt", { type: "text/plain" });
    const data = { files: [file], items: [] } as unknown as DataTransfer;

    expect(importedMediaFilesFromDataTransfer(data)).toEqual([file]);
  });

  it("does not let an unknown clipboard file hijack internal selection paste", () => {
    const file = new File(["not an image"], "figure.zip", { type: "application/zip" });
    const data = {
      files: [file],
      items: [],
      getData: () => ""
    } as unknown as DataTransfer;

    expect(importedMediaFilesFromClipboard(data)).toEqual([]);
  });
});
