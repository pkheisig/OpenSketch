import { useEffect, useMemo, useState } from "react";
import {
  WEBMCP_COMMAND_LOG_EVENT,
  type WebMcpCommandLogDetail
} from "@/semantic/webmcp";

const MAX_VISIBLE_CALLS = 5;

type LoggedCall = WebMcpCommandLogDetail & { inputSummary: string };

function summarizeInput(input: unknown): string {
  if (!input || typeof input !== "object" || Array.isArray(input)) return "{}";
  const entries = Object.entries(input as Record<string, unknown>);
  if (entries.length === 0) return "{}";
  const preview = entries
    .slice(0, 2)
    .map(([key, value]) => {
      if (Array.isArray(value)) return `${key}: [${value.length}]`;
      if (typeof value === "string") {
        const compact = value.replace(/\s+/g, " ").trim();
        return `${key}: "${compact.length > 20 ? `${compact.slice(0, 19)}…` : compact}"`;
      }
      if (value && typeof value === "object") return `${key}: {…}`;
      return `${key}: ${String(value)}`;
    })
    .join(", ");
  return `{ ${preview}${entries.length > 2 ? ", …" : ""} }`;
}

export function WebMcpCommandLog() {
  const [calls, setCalls] = useState<LoggedCall[]>([]);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const record = (event: Event) => {
      const detail = (event as CustomEvent<WebMcpCommandLogDetail>).detail;
      if (!detail) return;
      setCalls((current) => {
        const existing = current.findIndex((call) => call.callId === detail.callId);
        const next: LoggedCall = {
          ...detail,
          inputSummary:
            existing >= 0 ? current[existing]!.inputSummary : summarizeInput(detail.input)
        };
        if (existing < 0) return [...current, next];
        return current.map((call, index) => (index === existing ? next : call));
      });
    };
    window.addEventListener(WEBMCP_COMMAND_LOG_EVENT, record);
    return () => window.removeEventListener(WEBMCP_COMMAND_LOG_EVENT, record);
  }, []);

  const visibleCalls = useMemo(() => calls.slice(-MAX_VISIBLE_CALLS).reverse(), [calls]);
  const completeCount = calls.filter((call) => call.phase === "finished").length;

  return (
    <aside className={`webmcp-command-log${collapsed ? " is-collapsed" : ""}`} aria-label="Live WebMCP command log">
      <button
        className="webmcp-command-log__header"
        type="button"
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((value) => !value)}
      >
        <span><i aria-hidden="true" /> LIVE · WebMCP commands</span>
        <span className="webmcp-command-log__count">{completeCount}</span>
        <span aria-hidden="true">{collapsed ? "⌃" : "⌄"}</span>
      </button>
      {!collapsed ? (
        <div className="webmcp-command-log__body" aria-live="polite">
          {visibleCalls.length === 0 ? (
            <div className="webmcp-command-log__waiting">
              <span>●</span>
              <div><strong>Agent canvas ready</strong><small>Waiting for the first site-tool call…</small></div>
            </div>
          ) : (
            visibleCalls.map((call) => (
              <div className="webmcp-command-log__call" key={call.callId}>
                <span className={`webmcp-command-log__status ${call.phase === "started" ? "is-running" : call.ok ? "is-ok" : "is-error"}`}>
                  {call.phase === "started" ? "·" : call.ok ? "✓" : "!"}
                </span>
                <strong>{call.name}</strong>
                <code>{call.inputSummary}</code>
                <small>{call.phase === "finished" && call.durationMs !== undefined ? `${Math.round(call.durationMs)} ms` : "running"}</small>
              </div>
            ))
          )}
        </div>
      ) : null}
    </aside>
  );
}
