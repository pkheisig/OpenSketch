import type { ReactNode } from "react";
import type { EditorContextValue } from "@/editor/EditorContext";
import type { SnapshotStore } from "@/editor/editorStore";
import { EditorStoreContext } from "@/editor/editorStoreContext";

export function EditorSnapshotProvider({
  store,
  children
}: {
  store: SnapshotStore<EditorContextValue>;
  children: ReactNode;
}) {
  return <EditorStoreContext.Provider value={store}>{children}</EditorStoreContext.Provider>;
}
