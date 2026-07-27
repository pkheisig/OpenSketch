import { StaticCanvas, type Canvas } from "fabric";
import type { CanvasSettings, ProjectRecord } from "@workspace/editor-core";
import {
  isProjectThumbnailCurrent,
  svgThumbnailDataUrl,
  VECTOR_THUMBNAIL_VERSION
} from "@/persistence/thumbnailFormat";

export function createVectorThumbnail(
  canvas: Canvas | StaticCanvas,
  settings: CanvasSettings,
  projectRevision: string
): string {
  const viewport = [...canvas.viewportTransform] as [
    number,
    number,
    number,
    number,
    number,
    number
  ];
  canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
  try {
    const svg = canvas
      .toSVG({
        suppressPreamble: true,
        width: `${settings.width}`,
        height: `${settings.height}`,
        viewBox: { x: 0, y: 0, width: settings.width, height: settings.height }
      })
      .replace(
        /<svg\b/,
        `<svg data-opensketch-thumbnail="${VECTOR_THUMBNAIL_VERSION}" data-opensketch-project-revision="${projectRevision}"`
      );
    return svgThumbnailDataUrl(svg);
  } finally {
    canvas.setViewportTransform(viewport);
    canvas.requestRenderAll();
  }
}

async function renderSavedProjectThumbnail(project: ProjectRecord): Promise<string> {
  const canvas = new StaticCanvas(document.createElement("canvas"), {
    width: project.canvas.width,
    height: project.canvas.height,
    backgroundColor: project.canvas.transparent ? "" : project.canvas.background
  });
  try {
    await canvas.loadFromJSON(project.objects);
    return createVectorThumbnail(canvas, project.canvas, project.updatedAt);
  } finally {
    canvas.dispose();
  }
}

export async function upgradeProjectThumbnails(
  projects: readonly ProjectRecord[]
): Promise<ProjectRecord[]> {
  const upgraded: ProjectRecord[] = [];
  for (const project of projects) {
    if (isProjectThumbnailCurrent(project.thumbnail, project.updatedAt)) {
      upgraded.push(project);
      continue;
    }
    try {
      upgraded.push({
        ...project,
        thumbnail: await renderSavedProjectThumbnail(project)
      });
    } catch {
      upgraded.push(project);
    }
  }
  return upgraded;
}
