import type { ProjectFolderRecord, ProjectRecord } from "@workspace/editor-core";
import {
  SEMANTIC_EXECUTION_ABORTED,
  SEMANTIC_RUNTIME_VERSION,
  SemanticExecutionAborted,
  type JsonSchema,
  type SemanticCommandDefinition,
  type SemanticCommandResult,
  type SemanticExecutionOptions,
  throwIfSemanticExecutionAborted
} from "./semanticTypes";
import { validateSemanticInput } from "./semanticRuntime";
import type { WebMcpRuntime } from "./webmcp";

const MAX_PROJECTS = 100;
const MAX_ID_LENGTH = 200;
const MAX_NAME_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 400;
const MAX_FOLDER_NAME_LENGTH = 200;

const boundedString = (value: unknown, maximum: number): string | undefined =>
  typeof value === "string" && value.length > 0 ? value.slice(0, maximum) : undefined;

const projectId = (): JsonSchema => ({ type: "string", minLength: 1, maxLength: MAX_ID_LENGTH });
const projectName = (): JsonSchema => ({
  type: "string",
  minLength: 1,
  maxLength: MAX_NAME_LENGTH
});
const output = (properties: Record<string, JsonSchema>): JsonSchema => ({
  type: "object",
  properties,
  additionalProperties: false
});

export const PROJECT_LIFECYCLE_COMMANDS = Object.freeze([
  {
    name: "list_projects",
    title: "List project library",
    description: "List bounded safe metadata for projects in the OpenSketch project library.",
    version: SEMANTIC_RUNTIME_VERSION,
    risk: "read_only",
    confirmation: "none",
    retryable: true,
    idempotent: true,
    cancellable: true,
    requires: [],
    inputSchema: {
      type: "object",
      properties: {
        includeArchived: { type: "boolean" },
        limit: { type: "number", integer: true, minimum: 1, maximum: MAX_PROJECTS }
      },
      additionalProperties: false
    },
    outputSchema: output({
      context: { type: "string", enum: ["project-library"] },
      projects: { type: "array", maxItems: MAX_PROJECTS, items: { type: "object" } },
      total: { type: "number", minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
      truncated: { type: "boolean" }
    })
  },
  {
    name: "inspect_project",
    title: "Inspect project metadata",
    description: "Inspect bounded safe metadata for one project by its opaque project ID.",
    version: SEMANTIC_RUNTIME_VERSION,
    risk: "read_only",
    confirmation: "none",
    retryable: true,
    idempotent: true,
    cancellable: true,
    requires: [],
    inputSchema: output({ projectId: projectId() }),
    outputSchema: output({ project: { type: "object" } })
  },
  {
    name: "create_project",
    title: "Create project",
    description: "Create and open a project through the canonical OpenSketch application path.",
    version: SEMANTIC_RUNTIME_VERSION,
    risk: "reversible_mutation",
    confirmation: "none",
    retryable: false,
    idempotent: false,
    cancellable: true,
    requires: [],
    inputSchema: {
      type: "object",
      properties: { name: projectName() },
      additionalProperties: false
    },
    outputSchema: output({
      created: { type: "boolean" },
      projectId: projectId(),
      name: projectName()
    })
  },
  {
    name: "open_project",
    title: "Open project",
    description:
      "Open a current project-library entry through the canonical guarded application path.",
    version: SEMANTIC_RUNTIME_VERSION,
    risk: "reversible_mutation",
    confirmation: "none",
    retryable: true,
    idempotent: true,
    cancellable: true,
    requires: [],
    inputSchema: output({ projectId: projectId() }),
    outputSchema: output({ opened: { type: "boolean" }, projectId: projectId() })
  }
] satisfies readonly SemanticCommandDefinition[]);

export type ProjectLifecycleCallbacks = {
  getProjects: () => readonly ProjectRecord[];
  getFolders: () => readonly ProjectFolderRecord[];
  createProject: (
    name: string | undefined,
    options: SemanticExecutionOptions
  ) => Promise<ProjectRecord | null>;
  openProject: (project: ProjectRecord) => boolean;
};

function success<T>(data: T): SemanticCommandResult<T> {
  return {
    ok: true,
    runtimeVersion: SEMANTIC_RUNTIME_VERSION,
    data,
    changedObjectIds: [],
    warnings: []
  };
}

function failure(code: string, message: string): SemanticCommandResult {
  return {
    ok: false,
    runtimeVersion: SEMANTIC_RUNTIME_VERSION,
    error: { code, message },
    changedObjectIds: [],
    warnings: []
  };
}

function projectSummary(
  project: ProjectRecord,
  folders: readonly ProjectFolderRecord[]
): Record<string, unknown> {
  const folder = project.folderId
    ? folders.find((candidate) => candidate.id === project.folderId)
    : undefined;
  return {
    projectId: project.id,
    name: boundedString(project.name, MAX_NAME_LENGTH) ?? project.id,
    ...(boundedString(project.description, MAX_DESCRIPTION_LENGTH)
      ? { description: boundedString(project.description, MAX_DESCRIPTION_LENGTH) }
      : {}),
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    archived: Boolean(project.archivedAt),
    ...(folder && boundedString(folder.name, MAX_FOLDER_NAME_LENGTH)
      ? { folderName: boundedString(folder.name, MAX_FOLDER_NAME_LENGTH) }
      : {}),
    thumbnailAvailable: typeof project.thumbnail === "string" && project.thumbnail.length > 0
  };
}

function projectFor(
  projectIdValue: string,
  callbacks: ProjectLifecycleCallbacks
): ProjectRecord | undefined {
  return callbacks.getProjects().find((project) => project.id === projectIdValue);
}

export function createProjectLifecycleRuntime(callbacks: ProjectLifecycleCallbacks): WebMcpRuntime {
  let executionTail: Promise<void> = Promise.resolve();
  const definitions = PROJECT_LIFECYCLE_COMMANDS;

  const executeInternal = async (
    name: string,
    input: Record<string, unknown>,
    options: SemanticExecutionOptions
  ): Promise<SemanticCommandResult> => {
    throwIfSemanticExecutionAborted(options.signal);
    const definition = definitions.find((candidate) => candidate.name === name);
    if (!definition)
      return failure("UNKNOWN_COMMAND", `Lifecycle command "${name}" is not registered.`);
    const inputError = validateSemanticInput(input, definition.inputSchema);
    if (inputError) return failure("INVALID_INPUT", inputError);
    const folders = callbacks.getFolders();

    if (name === "list_projects") {
      const includeArchived = input.includeArchived === true;
      const limit = typeof input.limit === "number" ? input.limit : MAX_PROJECTS;
      const candidates = callbacks
        .getProjects()
        .filter((project) => includeArchived || !project.archivedAt)
        .slice()
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
      return success({
        context: "project-library",
        projects: candidates.slice(0, limit).map((project) => projectSummary(project, folders)),
        total: candidates.length,
        truncated: candidates.length > limit
      });
    }

    if (name === "inspect_project") {
      const project = projectFor(String(input.projectId), callbacks);
      return project
        ? success({ project: projectSummary(project, folders) })
        : failure("STALE_PROJECT_ID", `Project "${String(input.projectId)}" does not exist.`);
    }

    if (name === "open_project") {
      const project = projectFor(String(input.projectId), callbacks);
      if (!project)
        return failure("STALE_PROJECT_ID", `Project "${String(input.projectId)}" does not exist.`);
      throwIfSemanticExecutionAborted(options.signal);
      if (!callbacks.openProject(project)) {
        return failure("PROJECT_OPEN_FAILED", `Project "${project.id}" could not be opened.`);
      }
      return success({ opened: true, projectId: project.id });
    }

    if (name === "create_project") {
      throwIfSemanticExecutionAborted(options.signal);
      const nameValue = typeof input.name === "string" ? input.name.trim() : undefined;
      if (nameValue !== undefined && nameValue.length === 0) {
        return failure("INVALID_INPUT", "input.name must not be blank.");
      }
      const project = await callbacks.createProject(
        nameValue,
        options
      );
      if (!project) {
        if (options.signal?.aborted) throw new SemanticExecutionAborted();
        return failure("PROJECT_CREATE_FAILED", "The project could not be created.");
      }
      return success({ created: true, projectId: project.id, name: project.name });
    }

    return failure("UNKNOWN_COMMAND", `Lifecycle command "${name}" is not registered.`);
  };

  return {
    version: SEMANTIC_RUNTIME_VERSION,
    commands: definitions,
    listCommands: () => definitions,
    getCapabilities: () => ({
      runtimeVersion: SEMANTIC_RUNTIME_VERSION,
      projectId: "project-library",
      canvasReady: false,
      commands: Object.fromEntries(
        definitions.map((definition) => [definition.name, { available: true }])
      )
    }),
    execute: <T = unknown>(
      name: string,
      input: Record<string, unknown> = {},
      options: SemanticExecutionOptions = {}
    ): Promise<SemanticCommandResult<T>> => {
      if (options.signal?.aborted) {
        return Promise.resolve(
          failure(SEMANTIC_EXECUTION_ABORTED, new SemanticExecutionAborted().message)
        ) as Promise<SemanticCommandResult<T>>;
      }
      const scheduled = executionTail
        .then(() => {
          if (options.signal?.aborted) {
            return failure(SEMANTIC_EXECUTION_ABORTED, new SemanticExecutionAborted().message);
          }
          return executeInternal(name, input, options);
        })
        .catch((error) => {
          if (error instanceof SemanticExecutionAborted) {
            return failure(SEMANTIC_EXECUTION_ABORTED, error.message);
          }
          return failure(
            typeof error?.code === "string" ? error.code : "EXECUTION_FAILED",
            error instanceof Error ? error.message : String(error)
          );
        });
      executionTail = scheduled.then(
        () => undefined,
        () => undefined
      );
      return scheduled as Promise<SemanticCommandResult<T>>;
    }
  };
}
