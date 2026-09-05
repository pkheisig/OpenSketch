import { createContext } from "react";
import type { EditorContextValue } from "@/editor/EditorContext";
import type { SnapshotStore } from "@/editor/editorStore";

export const EditorStoreContext = createContext<SnapshotStore<EditorContextValue> | null>(null);
