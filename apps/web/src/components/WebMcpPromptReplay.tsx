import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Play, Square, TerminalSquare } from "lucide-react";
import { useEditor } from "@/editor/EditorContext";
import { CANCER_IMMUNITY_DEMO_PROMPT, runCancerImmunityDemo } from "@/semantic/cancerImmunityDemo";
import { createWebMcpTool } from "@/semantic/webmcp";

type ReplayState = "ready" | "typing" | "running" | "complete" | "error" | "stopped";

function queryNumber(name: string, fallback: number): number {
  const value = Number(new URLSearchParams(window.location.search).get(name));
  return Number.isFinite(value) ? Math.max(0, Math.min(1.5, value)) : fallback;
}

export function WebMcpPromptReplay() {
  const { semanticRuntime } = useEditor();
  const autoReplay = new URLSearchParams(window.location.search).get("autoReplay") === "1";
  const [prompt, setPrompt] = useState(autoReplay ? "" : CANCER_IMMUNITY_DEMO_PROMPT);
  const [state, setState] = useState<ReplayState>(autoReplay ? "typing" : "ready");
  const [expanded, setExpanded] = useState(true);
  const [stage, setStage] = useState("Ready for a reproducible live build");
  const [commandCount, setCommandCount] = useState(0);
  const [copied, setCopied] = useState(false);
  const autoStarted = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const startedAt = useRef(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const definitions = useMemo(
    () =>
      new Map(semanticRuntime.listCommands().map((definition) => [definition.name, definition])),
    [semanticRuntime]
  );

  const start = useCallback(async () => {
    if (state === "running" || !prompt.trim()) return;
    if (!semanticRuntime.getCapabilities().canvasReady) {
      setState("error");
      setStage("Canvas is still loading — try again in a moment");
      return;
    }
    const nextController = new AbortController();
    controller.current = nextController;
    startedAt.current = Date.now();
    setElapsedSeconds(0);
    setCommandCount(0);
    setStage("Preparing canvas");
    setState("running");
    setExpanded(false);
    try {
      const result = await runCancerImmunityDemo({
        pace: queryNumber("demoPace", 0.72),
        signal: nextController.signal,
        execute: async (name, input) => {
          const definition = definitions.get(name);
          if (!definition) throw new Error(`Missing WebMCP command: ${name}`);
          return createWebMcpTool(definition, semanticRuntime).execute(input);
        },
        onProgress: (progress) => {
          setCommandCount(progress.commandCount);
          setStage(progress.stage);
        }
      });
      setCommandCount(result.commandCount);
      setStage("Figure assembled and checked on the live canvas");
      setState("complete");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setStage("Replay stopped between commands");
        setState("stopped");
      } else {
        setStage(error instanceof Error ? error.message : String(error));
        setState("error");
        setExpanded(true);
      }
    } finally {
      controller.current = null;
    }
  }, [definitions, prompt, semanticRuntime, state]);

  useEffect(() => {
    if (state !== "running") return undefined;
    const timer = window.setInterval(
      () => setElapsedSeconds(Math.round((Date.now() - startedAt.current) / 1000)),
      500
    );
    return () => window.clearInterval(timer);
  }, [state]);

  useEffect(() => {
    if (!autoReplay || autoStarted.current) return undefined;
    autoStarted.current = true;
    let cancelled = false;
    const typeAndRun = async () => {
      while (!semanticRuntime.getCapabilities().canvasReady && !cancelled) {
        await new Promise((resolve) => window.setTimeout(resolve, 150));
      }
      for (let index = 1; index <= CANCER_IMMUNITY_DEMO_PROMPT.length && !cancelled; index += 1) {
        setPrompt(CANCER_IMMUNITY_DEMO_PROMPT.slice(0, index));
        await new Promise((resolve) => window.setTimeout(resolve, 9));
      }
      if (cancelled) return;
      setState("ready");
      await new Promise((resolve) => window.setTimeout(resolve, 700));
      document.querySelector<HTMLButtonElement>("[data-webmcp-replay-start]")?.click();
    };
    void typeAndRun();
    return () => {
      cancelled = true;
    };
  }, [autoReplay, semanticRuntime]);

  const statusLabel =
    state === "complete"
      ? `Build complete · ${commandCount} commands · ${elapsedSeconds}s`
      : state === "running"
        ? `${stage} · ${commandCount} commands · ${elapsedSeconds}s`
        : state === "typing"
          ? "Receiving reference prompt…"
          : stage;

  return (
    <aside
      className={`webmcp-prompt-replay ${expanded ? "is-expanded" : "is-collapsed"} is-${state}`}
      aria-label="WebMCP reference prompt replay"
    >
      <button
        type="button"
        className="webmcp-prompt-replay__bar"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
      >
        <span className="webmcp-prompt-replay__signal" aria-hidden="true" />
        <TerminalSquare size={15} aria-hidden="true" />
        <strong>Reference prompt</strong>
        <span>{statusLabel}</span>
        <i aria-hidden="true">{expanded ? "⌃" : "⌄"}</i>
      </button>
      {expanded ? (
        <div className="webmcp-prompt-replay__body">
          <label htmlFor="webmcp-demo-prompt">Prompt shown in the demo</label>
          <textarea
            id="webmcp-demo-prompt"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            disabled={state === "running" || state === "typing"}
            rows={4}
          />
          <div className="webmcp-prompt-replay__actions">
            <p>
              Replays the exact semantic command trace on this canvas. For free-form prompting, ask
              your ChatGPT agent with this page open.
            </p>
            <button
              type="button"
              className="webmcp-prompt-replay__copy"
              onClick={() => {
                void navigator.clipboard.writeText(prompt).then(() => {
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1400);
                });
              }}
            >
              {copied ? <Check size={15} /> : <Copy size={15} />}
              {copied ? "Copied" : "Copy"}
            </button>
            {state === "running" ? (
              <button
                type="button"
                className="webmcp-prompt-replay__stop"
                onClick={() => controller.current?.abort()}
              >
                <Square size={13} fill="currentColor" /> Stop
              </button>
            ) : (
              <button
                type="button"
                className="webmcp-prompt-replay__start"
                data-webmcp-replay-start
                onClick={() => void start()}
                disabled={!prompt.trim() || state === "typing"}
              >
                <Play size={15} fill="currentColor" /> Replay live build
              </button>
            )}
          </div>
          <div className="webmcp-prompt-replay__proof">
            <span>59 browser tools</span>
            <span>NIH BioArt</span>
            <span>No prerecorded canvas</span>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
