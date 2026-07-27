import { StaticCanvas, type Canvas } from "fabric";
import type { CanvasSettings, ProjectRecord } from "@workspace/editor-core";
import {
  isCurrentVectorThumbnail,
  svgThumbnailDataUrl,
  VECTOR_THUMBNAIL_VERSION
} from "@/persistence/thumbnailFormat";

export function createVectorThumbnail(
  canvas: Canvas | StaticCanvas,
  settings: CanvasSettings
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
      .replace(/<svg\b/, `<svg data-opensketch-thumbnail="${VECTOR_THUMBNAIL_VERSION}"`);
    return svgThumbnailDataUrl(svg);
  } finally {
    canvas.setViewportTransform(viewport);
    canvas.requestRenderAll();
  }
}

function hasProjectObjects(project: ProjectRecord): boolean {
  const objects = project.objects.objects;
  return Array.isArray(objects) && objects.length > 0;
}

async function renderSavedProjectThumbnail(project: ProjectRecord): Promise<string> {
  const canvas = new StaticCanvas(document.createElement("canvas"), {
    width: project.canvas.width,
    height: project.canvas.height,
    backgroundColor: project.canvas.transparent ? "" : project.canvas.background
  });
  try {
    await canvas.loadFromJSON(project.objects);
    return createVectorThumbnail(canvas, project.canvas);
  } finally {
    canvas.dispose();
  }
}

export async function upgradeProjectThumbnails(
  projects: readonly ProjectRecord[]
): Promise<ProjectRecord[]> {
  const upgraded: ProjectRecord[] = [];
  for (const project of projects) {
    if (
      isCurrentVectorThumbnail(project.thumbnail) ||
      (!project.thumbnail && !hasProjectObjects(project))
    ) {
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
