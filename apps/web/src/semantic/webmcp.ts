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

export const WEBMCP_COMMAND_LOG_EVENT = "opensketch:webmcp-command";

export interface WebMcpCommandLogDetail {
  readonly callId: string;
  readonly name: string;
  readonly input: unknown;
  readonly phase: "started" | "finished";
  readonly timestamp: number;
  readonly durationMs?: number;
  readonly ok?: boolean;
  readonly errorCode?: string;
}

let commandLogSequence = 0;

function emitCommandLog(detail: WebMcpCommandLogDetail): void {
  if (typeof window === "undefined" || typeof CustomEvent === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<WebMcpCommandLogDetail>(WEBMCP_COMMAND_LOG_EVENT, { detail })
  );
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

export function createWebMcpTool(
  definition: SemanticCommandDefinition,
  runtime: SemanticRuntime
): WebMcpTool {
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
      const callId = `${Date.now().toString(36)}-${(commandLogSequence += 1).toString(36)}`;
      const startedAt = performance.now();
      emitCommandLog({
        callId,
        name: definition.name,
        input,
        phase: "started",
        timestamp: Date.now()
      });
      let result: SemanticCommandResult;
      try {
        if (!isRecord(input)) {
          result = {
            ok: false,
            runtimeVersion: runtime.version,
            error: { code: "INVALID_INPUT", message: "input must be an object." },
            changedObjectIds: [],
            warnings: []
          };
        } else {
          result = await runtime.execute(definition.name, input);
        }
      } catch (error) {
        emitCommandLog({
          callId,
          name: definition.name,
          input,
          phase: "finished",
          timestamp: Date.now(),
          durationMs: Math.max(0, performance.now() - startedAt),
          ok: false,
          errorCode: error instanceof Error ? error.name : "EXECUTION_FAILED"
        });
        throw error;
      }
      emitCommandLog({
        callId,
        name: definition.name,
        input,
        phase: "finished",
        timestamp: Date.now(),
        durationMs: Math.max(0, performance.now() - startedAt),
        ok: result.ok,
        ...(!result.ok ? { errorCode: result.error.code } : {})
      });
      return result;
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
            modelContext.registerTool(createWebMcpTool(definition, options.runtime), {
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
