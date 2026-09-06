import { describe, expect, it } from "vitest";

import { createHistoryBuffer } from "../apps/web/src/editor/historyBuffer";

describe("history buffer", () => {
  it("supports undo, redo, and branch truncation", () => {
    const history = createHistoryBuffer<string>({
      maxBytes: 100,
      maxEntries: 10,
      measure: (value) => value.length
    });

    history.push("a");
    history.push("b");
    history.push("c");

    expect(history.current()).toBe("c");
    expect(history.peek(-1)).toBe("b");
    expect(history.move(-1)).toBe("b");
    expect(history.move(-1)).toBe("a");
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(true);

    history.push("d");

    expect(history.current()).toBe("d");
    expect(history.length).toBe(2);
    expect(history.canRedo).toBe(false);
    expect(history.retainedBytes).toBe(2);
  });

  it("accounts for replacement and preserves the current entry", () => {
    const history = createHistoryBuffer<string>({
      maxBytes: 4,
      maxEntries: 10,
      measure: (value) => value.length
    });

    history.push("a");
    history.push("b");
    history.push("c");
    expect(history.move(-1)).toBe("b");

    history.replaceCurrent("bbbb");

    expect(history.current()).toBe("bbbb");
    expect(history.length).toBe(1);
    expect(history.cursor).toBe(0);
    expect(history.retainedBytes).toBe(4);
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
  });

  it("evicts oldest retained entries deterministically under the byte budget", () => {
    const history = createHistoryBuffer<string>({
      maxBytes: 6,
      maxEntries: 10,
      measure: (value) => value.length
    });

    history.push("aa");
    history.push("bb");
    history.push("cc");
    history.push("dd");

    expect(history.length).toBe(3);
    expect(history.retainedBytes).toBe(6);
    expect(history.peek(-2)).toBe("bb");
    expect(history.peek(-1)).toBe("cc");
    expect(history.current()).toBe("dd");
  });

  it("keeps the current checkpoint while applying the entry limit", () => {
    const history = createHistoryBuffer<string>({
      maxBytes: 100,
      maxEntries: 2,
      measure: (value) => value.length
    });

    history.push("a");
    history.push("b");
    history.push("c");

    expect(history.length).toBe(2);
    expect(history.peek(-1)).toBe("b");
    expect(history.current()).toBe("c");
  });

  it("keeps an oversized current checkpoint usable by itself", () => {
    const history = createHistoryBuffer<string>({
      maxBytes: 3,
      maxEntries: 10,
      measure: (value) => value.length
    });

    history.push("abcd");

    expect(history.length).toBe(1);
    expect(history.current()).toBe("abcd");
    expect(history.retainedBytes).toBe(4);
    expect(history.retainedBytes).toBeGreaterThanOrEqual(3);
  });

  it("resets and disposes all retained entries", () => {
    const history = createHistoryBuffer<string>({
      maxBytes: 100,
      maxEntries: 10,
      measure: (value) => value.length
    });

    history.push("before");
    history.reset("after");

    expect(history.length).toBe(1);
    expect(history.cursor).toBe(0);
    expect(history.current()).toBe("after");
    expect(history.retainedBytes).toBe(5);

    history.dispose();

    expect(history.length).toBe(0);
    expect(history.cursor).toBe(-1);
    expect(history.current()).toBeUndefined();
    expect(history.retainedBytes).toBe(0);
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
  });

  it("releases each discarded entry exactly once", () => {
    const discarded: string[] = [];
    const history = createHistoryBuffer<string>({
      maxBytes: 100,
      maxEntries: 10,
      measure: (value) => value.length,
      onDiscard: (value) => discarded.push(value)
    });

    history.push("a");
    history.push("b");
    history.move(-1);
    history.push("c");
    expect(discarded).toEqual(["b"]);

    history.reset("d");
    expect(discarded).toEqual(["b", "a", "c"]);

    history.dispose();
    expect(discarded).toEqual(["b", "a", "c", "d"]);
  });
});
