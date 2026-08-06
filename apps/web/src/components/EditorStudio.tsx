import { useEffect, useState } from "react";
import type { ProjectRecord } from "@workspace/editor-core";
import { EditorProvider } from "@/editor/EditorContext";
import { TopToolbar } from "@/components/TopToolbar";
import { LeftSidebar } from "@/components/LeftSidebar";
import { CanvasWorkspace } from "@/components/CanvasWorkspace";
import { ASSET_PREVIEW_CACHE_VERSION, assetManifest } from "@/assets/manifest";
import { scheduleAssetPreviewWarmup } from "@/assets/previewWarmup";

const ASSET_PREVIEW_WARMUP_DELAY_MS = 10_000;

export function EditorStudio({
  project,
  onProjectChange,
  onHome
}: {
  project: ProjectRecord;
  onProjectChange: (project: ProjectRecord) => Promise<void>;
  onHome: () => void;
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("OpenSketch:left-sidebar-collapsed") === "true"
  );
  const toggleSidebar = () => {
    setSidebarCollapsed((current) => {
      const next = !current;
      localStorage.setItem("OpenSketch:left-sidebar-collapsed", String(next));
      return next;
    });
  };
  useEffect(() => {
    const warmupTimer = window.setTimeout(() => {
      scheduleAssetPreviewWarmup(
        assetManifest.families.flatMap((family) =>
          family.variants.map((variant) => variant.thumbnailPath)
        ),
        ASSET_PREVIEW_CACHE_VERSION
      );
    }, ASSET_PREVIEW_WARMUP_DELAY_MS);
    return () => window.clearTimeout(warmupTimer);
  }, []);
  return (
    <EditorProvider key={project.id} project={project} onProjectChange={onProjectChange}>
      <main className="editor-shell">
        <TopToolbar project={project} onHome={onHome} />
        <div className={`editor-grid ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
          <LeftSidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
          <CanvasWorkspace />
        </div>
      </main>
    </EditorProvider>
  );
}
