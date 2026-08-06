import { describe, expect, it, vi } from "vitest";
import {
  loadStringList,
  saveStringList,
  type StringListStorage
} from "../apps/web/src/editor/stringListStorage";

function mockStorage(initial: string | null): StringListStorage & { value: string | null } {
  return {
    value: initial,
    getItem() {
      return this.value;
    },
    setItem(_key, value) {
      this.value = value;
    }
  };
}

describe("string-list storage", () => {
  it("recovers from malformed, non-array, and mixed persisted values", () => {
    expect(loadStringList("favorites", mockStorage("not JSON"))).toEqual([]);
    expect(loadStringList("favorites", mockStorage(JSON.stringify({ id: "one" })))).toEqual([]);
    expect(
      loadStringList("favorites", mockStorage(JSON.stringify(["one", 2, null, "two"])))
    ).toEqual(["one", "two"]);
  });

  it("keeps the current session usable when storage writes fail", () => {
    const storage = mockStorage(null);
    vi.spyOn(storage, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });

    expect(() => saveStringList("favorites", ["one"], storage)).not.toThrow();
  });
});
