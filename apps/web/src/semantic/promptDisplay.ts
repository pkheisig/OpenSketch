export const WEBMCP_PROMPT_DISPLAY_EVENT = "opensketch:webmcp-prompt-display";

export interface WebMcpPromptDisplayDetail {
  prompt: string;
  title?: string;
  context?: string;
}

export function displayWebMcpPrompt(detail: WebMcpPromptDisplayDetail): boolean {
  if (typeof window === "undefined" || typeof CustomEvent === "undefined") return false;
  window.dispatchEvent(
    new CustomEvent<WebMcpPromptDisplayDetail>(WEBMCP_PROMPT_DISPLAY_EVENT, { detail })
  );
  return true;
}
