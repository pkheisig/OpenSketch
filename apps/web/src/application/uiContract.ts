import type { OpenSketchApplicationContext, Theme } from "@/application/hostServices";

export const OPENSUITE_UI_CONTRACT_VERSION = "0.1.0-bootstrap" as const;

export interface OpenSketchApplicationPresentation {
  mode: "standalone" | "opensuite";
  theme: Theme;
  density: "comfortable" | "compact" | "standard";
  reducedMotion: boolean;
  uiContractVersion: string;
  ownsGlobalChrome: boolean;
  ownsTheme: boolean;
  ownsUpdating: boolean;
  ownsShutdown: boolean;
}

function hostOwns(
  mode: OpenSketchApplicationPresentation["mode"],
  nested: "module" | "host" | undefined,
  moduleOwns: boolean | undefined
): boolean {
  if (nested === "host") return true;
  if (nested === "module") return false;
  if (moduleOwns !== undefined) return !moduleOwns;
  return mode === "opensuite";
}

export function resolveOpenSketchApplicationPresentation(
  context: OpenSketchApplicationContext = {},
  standaloneTheme: Theme = "light"
): OpenSketchApplicationPresentation {
  const mode = context.mode === "opensuite" ? "opensuite" : "standalone";
  return {
    mode,
    theme: context.theme ?? standaloneTheme,
    density: context.density ?? "comfortable",
    reducedMotion: context.reducedMotion ?? false,
    uiContractVersion: context.uiContractVersion ?? OPENSUITE_UI_CONTRACT_VERSION,
    ownsGlobalChrome: !hostOwns(mode, context.ownership?.globalChrome, context.ownsGlobalChrome),
    ownsTheme: !hostOwns(mode, context.ownership?.theme, context.ownsThemeControl),
    ownsUpdating: !hostOwns(mode, context.ownership?.updating, context.ownsUpdater),
    ownsShutdown: !hostOwns(mode, context.ownership?.shutdown, context.ownsShutdown)
  };
}
