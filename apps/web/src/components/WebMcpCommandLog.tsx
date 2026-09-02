import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronUp, Radio, Trash2, X } from "lucide-react";
import { WEBMCP_COMMAND_LOG_EVENT, type WebMcpCommandLogDetail } from "@/semantic/webmcp";

interface CommandEntry extends WebMcpCommandLogDetail {
  readonly phase: "started" | "finished";
}

const MAX_ENTRIES = 200;
const COMMAND_LOG_STORAGE_KEY = "OpenSketch:webmcp-command-log";

function demoLogEnabled(): boolean {
  return new URLSearchParams(window.location.search).get("webmcpDemo") === "1";
}

function conciseInput(name: string, input: unknown): string {
  if (!input || typeof input !== "object" || Array.isArray(input)) return String(input ?? "");
  const value = input as Record<string, unknown>;
  if (name === "resize_canvas") return `${value.width} × ${value.height} px`;
  if (name === "insert_asset") return String(value.familyId ?? value.variantId ?? "asset");
  if (name === "create_text") return JSON.stringify(value.text ?? "text");
  if (Array.isArray(value.objectIds))
    return `${value.objectIds.length} object${value.objectIds.length === 1 ? "" : "s"}`;
  if (name === "search_assets") return JSON.stringify(value.query ?? "");
  if (name === "inspect_object") return String(value.objectId ?? "");
  const serialized = JSON.stringify(input);
  return serialized.length > 96 ? `${serialized.slice(0, 93)}…` : serialized;
}

function storedEntries(): CommandEntry[] {
  if (!demoLogEnabled()) return [];
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(COMMAND_LOG_STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (entry): entry is CommandEntry =>
          Boolean(entry) &&
          typeof entry === "object" &&
          typeof (entry as CommandEntry).callId === "string" &&
          typeof (entry as CommandEntry).name === "string" &&
          ["started", "finished"].includes((entry as CommandEntry).phase) &&
          typeof (entry as CommandEntry).timestamp === "number"
      )
      .slice(-MAX_ENTRIES);
  } catch {
    return [];
  }
}

export function WebMcpCommandLog() {
  const [entries, setEntries] = useState<CommandEntry[]>(storedEntries);
  const [collapsed, setCollapsed] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const enabled = useMemo(demoLogEnabled, []);

  useEffect(() => {
    if (!enabled) return undefined;
    const onCommand = (event: Event) => {
      const detail = (event as CustomEvent<WebMcpCommandLogDetail>).detail;
      if (!detail?.callId) return;
      setEntries((current) => {
        const index = current.findIndex((entry) => entry.callId === detail.callId);
        if (index < 0) return [...current, detail].slice(-MAX_ENTRIES);
        const next = [...current];
        next[index] = detail;
        return next;
      });
    };
    window.addEventListener(WEBMCP_COMMAND_LOG_EVENT, onCommand);
    return () => window.removeEventListener(WEBMCP_COMMAND_LOG_EVENT, onCommand);
  }, [enabled]);

  useEffect(() => {
    if (!collapsed && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [collapsed, entries]);

  useEffect(() => {
    if (!enabled) return;
    try {
      window.sessionStorage.setItem(COMMAND_LOG_STORAGE_KEY, JSON.stringify(entries));
    } catch {
      // Keep the live panel useful when session storage is unavailable or full.
    }
  }, [enabled, entries]);

  if (!enabled) return null;

  return (
    <aside
      className={`webmcp-command-log ${collapsed ? "collapsed" : ""}`}
      aria-label="WebMCP command log"
    >
      <header>
        <span className="webmcp-command-log-live">
          <Radio size={12} /> LIVE
        </span>
        <strong>WebMCP commands</strong>
        <span className="webmcp-command-log-count">{entries.length}</span>
        <button
          type="button"
          onClick={() => {
            setEntries([]);
            try {
              window.sessionStorage.removeItem(COMMAND_LOG_STORAGE_KEY);
            } catch {
              // The in-memory clear still succeeds when storage is unavailable.
            }
          }}
          aria-label="Clear WebMCP command log"
        >
          <Trash2 size={13} />
        </button>
        <button
          type="button"
          onClick={() => setCollapsed((current) => !current)}
          aria-label={collapsed ? "Expand WebMCP command log" : "Collapse WebMCP command log"}
        >
          {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </header>
      {!collapsed ? (
        <div className="webmcp-command-log-list" ref={listRef} role="log" aria-live="polite">
          {entries.length === 0 ? (
            <p className="webmcp-command-log-empty">Waiting for an agent tool call…</p>
          ) : (
            entries.map((entry) => (
              <div className="webmcp-command-log-entry" key={entry.callId}>
                <span
                  className={`webmcp-command-log-status ${entry.phase === "started" ? "pending" : entry.ok ? "ok" : "error"}`}
                >
                  {entry.phase === "started" ? (
                    <Radio size={11} />
                  ) : entry.ok ? (
                    <Check size={11} />
                  ) : (
                    <X size={11} />
                  )}
                </span>
                <span className="webmcp-command-log-command">{entry.name}</span>
                <span className="webmcp-command-log-input">
                  {conciseInput(entry.name, entry.input)}
                </span>
                <span className="webmcp-command-log-duration">
                  {entry.phase === "finished" && entry.durationMs !== undefined
                    ? (entry.errorCode ?? `${Math.round(entry.durationMs)} ms`)
                    : "running"}
                </span>
              </div>
            ))
          )}
        </div>
      ) : null}
    </aside>
  );
}
