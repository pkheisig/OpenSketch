import { lazy, Suspense, useEffect, useState } from "react";
import type { ProjectRecord } from "@workspace/editor-core";
import { EditorProvider } from "@/editor/EditorContext";
import { CanvasWorkspace } from "@/components/CanvasWorkspace";
import { scheduleAssetPreviewWarmup } from "@/assets/previewWarmup";

const TopToolbar = lazy(() =>
  import("@/components/TopToolbar").then((module) => ({ default: module.TopToolbar }))
);
const LeftSidebar = lazy(() =>
  import("@/components/LeftSidebar").then((module) => ({ default: module.LeftSidebar }))
);

const ASSET_PREVIEW_WARMUP_DELAY_MS = 10_000;

export function EditorStudio({
  project,
  onProjectChange,
  onHome,
  theme,
  onToggleTheme
}: {
  project: ProjectRecord;
  onProjectChange: (project: ProjectRecord) => Promise<void>;
  onHome: () => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
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
      void import("@/assets/manifest").then(({ assetManifest, ASSET_PREVIEW_CACHE_VERSION }) => {
        scheduleAssetPreviewWarmup(
          assetManifest.families.flatMap((family) =>
            family.variants.map((variant) => variant.thumbnailPath)
          ),
          ASSET_PREVIEW_CACHE_VERSION
        );
      });
    }, ASSET_PREVIEW_WARMUP_DELAY_MS);
    return () => window.clearTimeout(warmupTimer);
  }, []);
  return (
    <EditorProvider key={project.id} project={project} onProjectChange={onProjectChange}>
      <main className="editor-shell">
        <Suspense fallback={<header className="top-toolbar" aria-hidden="true" />}>
          <TopToolbar
            project={project}
            onHome={onHome}
            theme={theme}
            onToggleTheme={onToggleTheme}
          />
        </Suspense>
        <div className={`editor-grid ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
          <Suspense
            fallback={<aside className="left-sidebar floating-sidebar" aria-hidden="true" />}
          >
            <LeftSidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
          </Suspense>
          <CanvasWorkspace />
        </div>
      </main>
    </EditorProvider>
  );
}
