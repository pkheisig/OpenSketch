import { OPENSKETCH_FORMAT_VERSION, type PortableProject } from "./types";

export function migrateProject(input: unknown): PortableProject {
  if (!input || typeof input !== "object") {
    throw new Error("This file is not an OpenSketch project.");
  }
  const project = input as Partial<PortableProject>;
  if (project.format !== "opensketch") {
    throw new Error("The project marker is missing or invalid.");
  }
  if (project.formatVersion !== OPENSKETCH_FORMAT_VERSION) {
    throw new Error(
      `Project version ${String(project.formatVersion)} is not supported by this release.`
    );
  }
  if (!project.id || !project.name || !project.canvas || !project.objects) {
    throw new Error("The project is incomplete.");
  }
  return { ...project, version: 1 } as PortableProject;
}
