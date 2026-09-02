import type { SemanticCommandDefinition, SemanticCommandResult } from "./semanticTypes";
import type { SemanticRuntime } from "./semanticRuntime";

export type WebMcpExecutionContext = { readonly signal?: AbortSignal };

export interface WebMcpTool {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: SemanticCommandDefinition["inputSchema"];
  readonly annotations: {
    readonly readOnlyHint: boolean;
    readonly destructiveHint: boolean;
    readonly idempotentHint: boolean;
    readonly openWorldHint: boolean;
  };
  readonly execute: (
    input: unknown,
    context?: WebMcpExecutionContext
  ) => Promise<SemanticCommandResult>;
}

export interface WebMcpModelContext {
  registerTool: (tool: WebMcpTool, options?: { readonly signal?: AbortSignal }) => unknown;
}

export interface WebMcpDocumentLike {
  readonly modelContext?: unknown;
}

export interface WebMcpSyncResult {
  readonly supported: boolean;
  readonly registered: number;
  readonly skipped: number;
}

export interface WebMcpAdapter {
  readonly sync: () => Promise<WebMcpSyncResult>;
  readonly dispose: () => void;
}

function isModelContext(value: unknown): value is WebMcpModelContext {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    typeof (value as { registerTool?: unknown }).registerTool === "function"
  );
}

export function detectModelContext(
  documentLike: WebMcpDocumentLike | undefined = typeof document === "undefined"
    ? undefined
    : (document as WebMcpDocumentLike)
): WebMcpModelContext | null {
  return isModelContext(documentLike?.modelContext) ? documentLike.modelContext : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toolFor(definition: SemanticCommandDefinition, runtime: SemanticRuntime): WebMcpTool {
  return {
    name: definition.name,
    title: definition.title,
    description: definition.description,
    inputSchema: definition.inputSchema,
    annotations: {
      readOnlyHint: definition.risk === "read_only",
      destructiveHint: definition.risk === "sensitive_or_destructive",
      idempotentHint: definition.idempotent,
      openWorldHint: false
    },
    execute: async (input) => {
      if (!isRecord(input)) {
        return {
          ok: false,
          runtimeVersion: runtime.version,
          error: { code: "INVALID_INPUT", message: "input must be an object." },
          changedObjectIds: [],
          warnings: []
        };
      }
      return runtime.execute(definition.name, input);
    }
  };
}

export function createWebMcpAdapter(options: {
  runtime: SemanticRuntime;
  documentLike?: WebMcpDocumentLike;
  getDocumentLike?: () => WebMcpDocumentLike | undefined;
}): WebMcpAdapter {
  let generation = 0;
  let registrationController: AbortController | null = null;

  return {
    async sync(): Promise<WebMcpSyncResult> {
      registrationController?.abort();
      generation += 1;
      const currentGeneration = generation;
      const modelContext = detectModelContext(
        options.getDocumentLike ? options.getDocumentLike() : options.documentLike
      );
      if (!modelContext) return { supported: false, registered: 0, skipped: 0 };

      const controller = new AbortController();
      registrationController = controller;
      const capabilities = options.runtime.getCapabilities();
      const definitions = options.runtime
        .listCommands()
        .filter((definition) => capabilities.commands[definition.name]?.available !== false);
      let registered = 0;
      let skipped = 0;
      for (const definition of definitions) {
        if (controller.signal.aborted || currentGeneration !== generation) {
          skipped += definitions.length - registered - skipped;
          break;
        }
        try {
          await Promise.resolve(
            modelContext.registerTool(toolFor(definition, options.runtime), {
              signal: controller.signal
            })
          );
          registered += 1;
          if (controller.signal.aborted || currentGeneration !== generation) {
            skipped += definitions.length - registered - skipped;
            break;
          }
        } catch {
          skipped += 1;
        }
      }
      return { supported: true, registered, skipped };
    },
    dispose(): void {
      generation += 1;
      registrationController?.abort();
      registrationController = null;
    }
  };
}
