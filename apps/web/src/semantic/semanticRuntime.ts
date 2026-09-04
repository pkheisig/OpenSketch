import {
  MUTATION_COMMAND_NAMES,
  SEMANTIC_COMMANDS,
  type SemanticCommandName
} from "./semanticCommands";
import {
  SEMANTIC_RUNTIME_VERSION,
  type JsonSchema,
  type SemanticAdapterResult,
  type SemanticCommandDefinition,
  type SemanticCommandFailure,
  type SemanticCommandResult,
  type SemanticEditorAdapter
} from "./semanticTypes";
import { displayWebMcpPrompt } from "./promptDisplay";

export interface SemanticCapabilities {
  runtimeVersion: typeof SEMANTIC_RUNTIME_VERSION;
  projectId: string;
  canvasReady: boolean;
  commands: Record<string, { available: boolean; reason?: string }>;
}

export interface SemanticRuntime {
  readonly version: typeof SEMANTIC_RUNTIME_VERSION;
  readonly commands: readonly SemanticCommandDefinition[];
  listCommands(): readonly SemanticCommandDefinition[];
  getCapabilities(): SemanticCapabilities;
  execute<T = unknown>(
    name: string,
    input?: Record<string, unknown>
  ): Promise<SemanticCommandResult<T>>;
}

interface AliasValue {
  value: string | string[];
}

class SemanticInputError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SemanticInputError";
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function schemaTypeMatches(type: string, value: unknown): boolean {
  if (type === "object") return isRecord(value);
  if (type === "array") return Array.isArray(value);
  if (type === "string") return typeof value === "string";
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "boolean") return typeof value === "boolean";
  if (type === "null") return value === null;
  return true;
}

function validateSchema(value: unknown, schema: JsonSchema, path = "input"): string | undefined {
  if (schema.type && !schemaTypeMatches(schema.type, value)) {
    return `${path} must be a ${schema.type}.`;
  }
  if (schema.enum && !schema.enum.some((candidate) => Object.is(candidate, value))) {
    return `${path} has an unsupported value.`;
  }
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength)
      return `${path} is too short.`;
    if (schema.maxLength !== undefined && value.length > schema.maxLength)
      return `${path} is too long.`;
  }
  if (typeof value === "number") {
    if (schema.integer && !Number.isInteger(value)) return `${path} must be an integer.`;
    if (schema.minimum !== undefined && value < schema.minimum)
      return `${path} is below the allowed minimum.`;
    if (schema.maximum !== undefined && value > schema.maximum)
      return `${path} is above the allowed maximum.`;
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems)
      return `${path} requires at least ${schema.minItems} item(s).`;
    if (schema.maxItems !== undefined && value.length > schema.maxItems)
      return `${path} allows at most ${schema.maxItems} item(s).`;
    if (schema.items) {
      for (let index = 0; index < value.length; index += 1) {
        const error = validateSchema(value[index], schema.items, `${path}[${index}]`);
        if (error) return error;
      }
    }
  }
  if (isRecord(value)) {
    const properties = schema.properties ?? {};
    if (schema.additionalProperties === false) {
      const unknown = Object.keys(value).find((key) => !Object.hasOwn(properties, key));
      if (unknown) return `${path}.${unknown} is not supported.`;
    }
    for (const required of schema.required ?? []) {
      if (!Object.hasOwn(value, required)) return `${path}.${required} is required.`;
    }
    for (const [key, child] of Object.entries(properties)) {
      if (Object.hasOwn(value, key)) {
        const error = validateSchema(value[key], child, `${path}.${key}`);
        if (error) return error;
      }
    }
  }
  if (schema.oneOf) {
    const matches = schema.oneOf.filter((candidate) => !validateSchema(value, candidate, path));
    if (matches.length !== 1) return `${path} does not match exactly one supported schema.`;
  }
  return undefined;
}

function success<T>(
  data?: T,
  changedObjectIds: string[] = [],
  warnings: string[] = []
): SemanticCommandResult<T> {
  return {
    ok: true,
    runtimeVersion: SEMANTIC_RUNTIME_VERSION,
    ...(data === undefined ? {} : { data }),
    changedObjectIds: [...new Set(changedObjectIds)],
    warnings: [...new Set(warnings)]
  };
}

function failure(code: string, message: string, warnings: string[] = []): SemanticCommandFailure {
  return {
    ok: false,
    runtimeVersion: SEMANTIC_RUNTIME_VERSION,
    error: { code, message },
    changedObjectIds: [],
    warnings
  };
}

function asFailure(error: unknown): SemanticCommandFailure {
  if (error instanceof SemanticInputError) return failure(error.code, error.message);
  if (error && typeof error === "object") {
    const candidate = error as { code?: unknown; message?: unknown };
    if (typeof candidate.code === "string" && typeof candidate.message === "string") {
      return failure(candidate.code, candidate.message);
    }
  }
  return failure("EXECUTION_FAILED", error instanceof Error ? error.message : String(error));
}

function definitionFor(name: string): SemanticCommandDefinition | undefined {
  return SEMANTIC_COMMANDS.find((definition) => definition.name === name);
}

const ALIAS_ID_FIELDS = new Set([
  "objectId",
  "objectIds",
  "fromObjectId",
  "toObjectId",
  "sourceObjectId",
  "targetObjectId",
  "mediatorObjectId",
  "stageId"
]);

function resolveAliases(value: unknown, aliases: Map<string, AliasValue>, field?: string): unknown {
  if (typeof value === "string" && field && ALIAS_ID_FIELDS.has(field) && value.startsWith("$")) {
    const alias = aliases.get(value.slice(1));
    if (!alias)
      throw new SemanticInputError("UNKNOWN_ALIAS", `Semantic alias "${value}" is not defined.`);
    if (Array.isArray(alias.value) && field !== "objectIds") {
      throw new SemanticInputError(
        "INVALID_ALIAS_USE",
        `Semantic alias "${value}" contains multiple object IDs and cannot be used for ${field}.`
      );
    }
    return alias.value;
  }
  if (Array.isArray(value)) {
    const itemField = field === "objectIds" ? "objectId" : undefined;
    return value.flatMap((item) => {
      const resolved = resolveAliases(item, aliases, itemField);
      return Array.isArray(resolved) ? resolved : [resolved];
    });
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, resolveAliases(child, aliases, key)])
    );
  }
  return value;
}

function aliasFromResult(result: SemanticCommandResult): AliasValue | undefined {
  if (!result.ok) return undefined;
  const data = result.data;
  if (isRecord(data) && typeof data.objectId === "string") return { value: data.objectId };
  if (
    isRecord(data) &&
    Array.isArray(data.objectIds) &&
    data.objectIds.every((id) => typeof id === "string")
  ) {
    return { value: data.objectIds as string[] };
  }
  if (result.changedObjectIds.length > 0) return { value: result.changedObjectIds };
  return undefined;
}

function adapterResult<T = unknown>(result: SemanticAdapterResult): SemanticCommandResult<T> {
  return success(
    result.data as T | undefined,
    result.changedObjectIds ?? [],
    result.warnings ?? []
  );
}

export function createSemanticRuntime(adapter: SemanticEditorAdapter): SemanticRuntime {
  let executionTail: Promise<void> = Promise.resolve();

  const executeInternal = async <T = unknown>(
    name: string,
    input: Record<string, unknown>,
    inBatch = false
  ): Promise<SemanticCommandResult<T>> => {
    const definition = definitionFor(name);
    if (!definition)
      return failure("UNKNOWN_COMMAND", `Semantic command "${name}" is not registered.`);
    const inputError = validateSchema(input, definition.inputSchema);
    if (inputError) return failure("INVALID_INPUT", inputError);
    if (definition.requires.includes("canvas") && !adapter.isCanvasReady()) {
      return failure(
        "EDITOR_NOT_READY",
        "The OpenSketch canvas is not ready for semantic commands."
      );
    }
    if (name === "inspect_scene") {
      return success(
        adapter.inspectScene({
          maxObjects: typeof input.maxObjects === "number" ? input.maxObjects : 200,
          maxDepth: typeof input.maxDepth === "number" ? input.maxDepth : 8
        }) as T
      );
    }
    if (name === "inspect_selection") {
      const selectedObjectIds = adapter.getSelectionObjectIds();
      const objectIds = selectedObjectIds.slice(0, 200);
      const objects = objectIds
        .map((objectId) => adapter.inspectObject(objectId))
        .filter((object): object is NonNullable<typeof object> => Boolean(object));
      return success(
        { objectIds, objects } as T,
        [],
        selectedObjectIds.length > objectIds.length
          ? ["Selection output capped at 200 objects."]
          : []
      );
    }
    if (name === "display_prompt") {
      const displayed = displayWebMcpPrompt({
        prompt: String(input.prompt),
        ...(typeof input.title === "string" ? { title: input.title } : {}),
        ...(typeof input.context === "string" ? { context: input.context } : {})
      });
      return success({ displayed } as T);
    }
    if (name === "inspect_object") {
      const object = adapter.inspectObject(String(input.objectId));
      if (!object)
        return failure("STALE_OBJECT_ID", `Scene object "${input.objectId}" does not exist.`);
      return success({ object } as T);
    }
    if (name === "search_assets") {
      return success(
        (await adapter.searchAssets({
          query: typeof input.query === "string" ? input.query : "",
          category: typeof input.category === "string" ? input.category : undefined,
          limit: typeof input.limit === "number" ? input.limit : 25
        })) as T
      );
    }
    if (name === "inspect_asset") {
      return success(
        (await adapter.inspectAsset({
          familyId: String(input.familyId),
          variantId: typeof input.variantId === "string" ? input.variantId : undefined
        })) as T
      );
    }
    if (name === "inspect_provenance") {
      return success(adapter.inspectProvenance() as T);
    }
    if (definition.confirmation === "explicit" && input.confirmed !== true) {
      return failure("CONFIRMATION_REQUIRED", `${name} requires confirmed: true.`);
    }
    if (name === "batch") {
      if (inBatch) return failure("NESTED_BATCH", "Semantic batches cannot contain another batch.");
      return executeBatch(input);
    }
    try {
      return adapterResult<T>(await adapter.execute(name as SemanticCommandName, input));
    } catch (error) {
      return asFailure(error);
    }
  };

  const executeBatch = async <T = unknown>(
    input: Record<string, unknown>
  ): Promise<SemanticCommandResult<T>> => {
    const operations = input.operations;
    if (!Array.isArray(operations))
      return failure("INVALID_INPUT", "input.operations must be an array.");
    const aliases = new Map<string, AliasValue>();
    const completed: Array<{ command: string; as?: string; result: SemanticCommandResult }> = [];
    const changedObjectIds: string[] = [];
    let batchFailure: SemanticCommandFailure | undefined;
    try {
      await adapter.runTransaction(async () => {
        for (const rawOperation of operations as unknown[]) {
          if (
            !isRecord(rawOperation) ||
            typeof rawOperation.command !== "string" ||
            !isRecord(rawOperation.input)
          ) {
            batchFailure = failure(
              "INVALID_INPUT",
              "Each batch operation needs a command and object input."
            );
            throw new SemanticInputError("BATCH_ABORTED", batchFailure.error.message);
          }
          const command = rawOperation.command;
          if (
            !MUTATION_COMMAND_NAMES.includes(command as (typeof MUTATION_COMMAND_NAMES)[number])
          ) {
            batchFailure = failure(
              "INVALID_BATCH_COMMAND",
              `"${command}" is not a registered mutation command.`
            );
            throw new SemanticInputError("BATCH_ABORTED", batchFailure.error.message);
          }
          const resolvedInput = resolveAliases(rawOperation.input, aliases);
          if (!isRecord(resolvedInput)) {
            batchFailure = failure(
              "INVALID_INPUT",
              `Batch input for "${command}" must be an object.`
            );
            throw new SemanticInputError("BATCH_ABORTED", batchFailure.error.message);
          }
          const commandInput =
            command === "delete_objects" && !Object.hasOwn(resolvedInput, "confirmed")
              ? { ...resolvedInput, confirmed: true }
              : resolvedInput;
          const commandDefinition = definitionFor(command);
          const commandInputError = commandDefinition
            ? validateSchema(commandInput, commandDefinition.inputSchema)
            : undefined;
          if (commandInputError) {
            batchFailure = failure("INVALID_INPUT", commandInputError);
            throw new SemanticInputError("BATCH_ABORTED", commandInputError);
          }
          const result = await executeInternal(command, commandInput, true);
          completed.push({
            command,
            as: typeof rawOperation.as === "string" ? rawOperation.as : undefined,
            result
          });
          if (!result.ok) {
            batchFailure = result;
            throw new SemanticInputError("BATCH_ABORTED", result.error.message);
          }
          changedObjectIds.push(...result.changedObjectIds);
          if (typeof rawOperation.as === "string") {
            const alias = aliasFromResult(result);
            if (!alias) {
              batchFailure = failure(
                "ALIAS_TARGET_MISSING",
                `Batch operation "${command}" produced no object identity.`
              );
              throw new SemanticInputError("BATCH_ABORTED", batchFailure.error.message);
            }
            aliases.set(rawOperation.as, alias);
          }
        }
      });
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        (error as { code?: unknown }).code === "ROLLBACK_FAILED"
      ) {
        return asFailure(error);
      }
      if (batchFailure) return batchFailure;
      return asFailure(error);
    }
    return success(
      {
        operations: completed.map(({ command, as, result }) => ({
          command,
          ...(as ? { as } : {}),
          result
        })),
        objectIds: [...new Set(changedObjectIds)]
      } as T,
      changedObjectIds
    );
  };

  return {
    version: SEMANTIC_RUNTIME_VERSION,
    commands: SEMANTIC_COMMANDS,
    listCommands: () => SEMANTIC_COMMANDS,
    getCapabilities: () => {
      const canvasReady = adapter.isCanvasReady();
      return {
        runtimeVersion: SEMANTIC_RUNTIME_VERSION,
        projectId: adapter.getProjectId(),
        canvasReady,
        commands: Object.fromEntries(
          SEMANTIC_COMMANDS.map((definition) => [
            definition.name,
            definition.requires.includes("canvas") && !canvasReady
              ? { available: false, reason: "The canvas is not ready." }
              : { available: true }
          ])
        )
      };
    },
    execute: <T = unknown>(name: string, input: Record<string, unknown> = {}) => {
      const scheduled = executionTail
        .then(() => executeInternal<T>(name, input))
        .catch((error) => asFailure(error));
      executionTail = scheduled.then(
        () => undefined,
        () => undefined
      );
      return scheduled;
    }
  };
}
