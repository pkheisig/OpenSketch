import { act, render } from "@testing-library/react";
import { createElement, useRef } from "../apps/web/node_modules/react/index.js";
import { describe, expect, it } from "vitest";
import { useEditorFields } from "../apps/web/src/editor/editorHooks";
import { EditorSnapshotProvider } from "../apps/web/src/editor/editorSnapshotProvider";
import type { EditorContextValue } from "../apps/web/src/editor/EditorContext";
import { createSnapshotStore } from "../apps/web/src/editor/editorStore";

describe("editor subscriptions", () => {
  it("does not rerender a selection consumer when only the viewport changes", () => {
    const initial = { selection: [], zoom: 1 } as unknown as EditorContextValue;
    const store = createSnapshotStore(initial);
    let selectionRenders = 0;
    let viewportRenders = 0;

    function SelectionConsumer() {
      const { selection } = useEditorFields(["selection"]);
      const renders = useRef(0);
      renders.current += 1;
      selectionRenders = renders.current;
      return createElement("output", { "data-testid": "selection" }, selection.length);
    }

    function ViewportConsumer() {
      const { zoom } = useEditorFields(["zoom"]);
      const renders = useRef(0);
      renders.current += 1;
      viewportRenders = renders.current;
      return createElement("output", { "data-testid": "zoom" }, zoom);
    }

    render(
      createElement(
        EditorSnapshotProvider,
        { store },
        createElement(SelectionConsumer),
        createElement(ViewportConsumer)
      )
    );
    expect(selectionRenders).toBe(1);
    expect(viewportRenders).toBe(1);

    act(() => {
      store.setSnapshot({ ...initial, zoom: 1.5 });
      store.publish();
    });

    expect(selectionRenders).toBe(1);
    expect(viewportRenders).toBe(2);
  });
});
