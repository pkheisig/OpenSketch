import { describe, expect, it } from "vitest";
import {
  OPENSUITE_UI_CONTRACT_VERSION,
  resolveOpenSketchApplicationPresentation
} from "../apps/web/src/application/uiContract";

describe("OpenSketch application presentation contract", () => {
  it("keeps standalone ownership and fallback behavior", () => {
    expect(resolveOpenSketchApplicationPresentation({}, "dark")).toEqual({
      mode: "standalone",
      theme: "dark",
      density: "comfortable",
      reducedMotion: false,
      uiContractVersion: OPENSUITE_UI_CONTRACT_VERSION,
      ownsGlobalChrome: true,
      ownsTheme: true,
      ownsUpdating: true,
      ownsShutdown: true
    });
  });

  it("accepts the hosted contract and assigns outer chrome ownership to the host", () => {
    expect(
      resolveOpenSketchApplicationPresentation({
        mode: "opensuite",
        theme: "dark",
        density: "compact",
        reducedMotion: true,
        uiContractVersion: OPENSUITE_UI_CONTRACT_VERSION
      })
    ).toMatchObject({
      mode: "opensuite",
      theme: "dark",
      density: "compact",
      reducedMotion: true,
      ownsGlobalChrome: false,
      ownsTheme: false,
      ownsUpdating: false,
      ownsShutdown: false
    });
  });

  it("supports explicit module ownership when the host embeds the application", () => {
    expect(
      resolveOpenSketchApplicationPresentation({
        mode: "opensuite",
        ownership: {
          globalChrome: "host",
          theme: "module",
          updating: "host",
          shutdown: "host"
        }
      })
    ).toMatchObject({
      ownsGlobalChrome: false,
      ownsTheme: true,
      ownsUpdating: false,
      ownsShutdown: false
    });
  });
});
