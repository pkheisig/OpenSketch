import { useCallback, useContext, useMemo, useRef, useSyncExternalStore } from "react";
import type { EditorContextValue } from "@/editor/EditorContext";
import { shallowEqual, type SnapshotListener } from "@/editor/editorStore";
import { EditorStoreContext } from "@/editor/editorStoreContext";

type EditorSelector<T> = (editor: EditorContextValue) => T;
const UNSET = Symbol("unset");

/**
 * Subscribe to a selected part of the editor snapshot. The selector result is
 * cached with the supplied equality function, so unrelated provider updates
 * do not invalidate the consuming component.
 */
export function useEditorSelector<T>(
  selector: EditorSelector<T>,
  isEqual: (left: T, right: T) => boolean = Object.is
): T {
  const store = useContext(EditorStoreContext);
  if (!store) throw new Error("useEditorSelector must be used inside EditorProvider.");

  const selectorRef = useRef(selector);
  const equalityRef = useRef(isEqual);
  const previousSelectorRef = useRef(selector);
  const previousEqualityRef = useRef(isEqual);
  const editorSnapshotRef = useRef<EditorContextValue | typeof UNSET>(UNSET);
  const selectedSnapshotRef = useRef<T | typeof UNSET>(UNSET);

  selectorRef.current = selector;
  equalityRef.current = isEqual;

  const getSelectedSnapshot = useCallback(() => {
    const snapshot = store.getSnapshot();
    const selectorChanged = previousSelectorRef.current !== selectorRef.current;
    const equalityChanged = previousEqualityRef.current !== equalityRef.current;
    if (
      editorSnapshotRef.current !== snapshot ||
      selectorChanged ||
      equalityChanged ||
      selectedSnapshotRef.current === UNSET
    ) {
      const next = selectorRef.current(snapshot);
      if (
        selectedSnapshotRef.current === UNSET ||
        !equalityRef.current(selectedSnapshotRef.current as T, next)
      ) {
        selectedSnapshotRef.current = next;
      }
      editorSnapshotRef.current = snapshot;
      previousSelectorRef.current = selectorRef.current;
      previousEqualityRef.current = equalityRef.current;
    }
    return selectedSnapshotRef.current as T;
  }, [store]);

  const subscribe = useCallback(
    (listener: SnapshotListener) =>
      store.subscribe(() => {
        const previous = selectedSnapshotRef.current;
        const next = getSelectedSnapshot();
        if (previous === UNSET || !equalityRef.current(previous as T, next)) listener();
      }),
    [getSelectedSnapshot, store]
  );

  return useSyncExternalStore(subscribe, getSelectedSnapshot, getSelectedSnapshot);
}

export function useEditorFields<const K extends readonly (keyof EditorContextValue)[]>(
  keys: K
): Pick<EditorContextValue, K[number]> {
  const selector = useMemo<EditorSelector<Pick<EditorContextValue, K[number]>>>(() => {
    return (editor) => {
      return Object.fromEntries(keys.map((key) => [key, editor[key]])) as Pick<
        EditorContextValue,
        K[number]
      >;
    };
  }, [keys]);
  return useEditorSelector(
    selector,
    shallowEqual as (
      left: Pick<EditorContextValue, K[number]>,
      right: Pick<EditorContextValue, K[number]>
    ) => boolean
  );
}
