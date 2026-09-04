import { useEffect, useState } from "react";
import { Check, Copy, TerminalSquare, X } from "lucide-react";
import {
  WEBMCP_PROMPT_DISPLAY_EVENT,
  type WebMcpPromptDisplayDetail
} from "@/semantic/promptDisplay";

export function WebMcpPromptDisplay() {
  const [detail, setDetail] = useState<WebMcpPromptDisplayDetail | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const showPrompt = (event: Event) => {
      const next = (event as CustomEvent<WebMcpPromptDisplayDetail>).detail;
      if (!next?.prompt) return;
      setCopied(false);
      setDetail(next);
    };
    window.addEventListener(WEBMCP_PROMPT_DISPLAY_EVENT, showPrompt);
    return () => window.removeEventListener(WEBMCP_PROMPT_DISPLAY_EVENT, showPrompt);
  }, []);

  if (!detail) return null;

  return (
    <aside className="webmcp-prompt-display" role="dialog" aria-label="WebMCP prompt display">
      <header className="webmcp-prompt-display__bar">
        <span className="webmcp-prompt-display__signal" aria-hidden="true" />
        <TerminalSquare size={15} aria-hidden="true" />
        <strong>{detail.title ?? "Agent prompt"}</strong>
        <span>Displayed by WebMCP</span>
        <button type="button" onClick={() => setDetail(null)} aria-label="Close prompt display">
          <X size={16} />
        </button>
      </header>
      <div className="webmcp-prompt-display__body">
        <label htmlFor="webmcp-displayed-prompt">Prompt</label>
        <textarea id="webmcp-displayed-prompt" value={detail.prompt} readOnly rows={4} />
        <div className="webmcp-prompt-display__footer">
          <p>{detail.context ?? "This prompt was supplied to the live agent session."}</p>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(detail.prompt).then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1400);
              });
            }}
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
    </aside>
  );
}
