import { createElement } from "../apps/web/node_modules/react/index.js";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  OPENSUITE_UI_CONTRACT_VERSION,
  resolveOpenSketchApplicationPresentation
} from "../apps/web/src/application/uiContract";
import { OpenSketchPortalRoot } from "../apps/web/src/application/hostServices";

afterEach(cleanup);

describe("OpenSketch application presentation contract", () => {
  it("keeps standalone ownership and fallback behavior", () => {
    expect(resolveOpenSketchApplicationPresentation({}, "dark")).toEqual({
      mode: "standalone",
      theme: "dark",
      appearance: "dark",
      systemTheme: "dark",
      style: "default",
      palette: "opensuite-default",
      themeContractVersion: "1.0.0",
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

  it("resolves system appearance from the host-provided system theme", () => {
    expect(
      resolveOpenSketchApplicationPresentation({
        mode: "opensuite",
        appearance: "system",
        systemTheme: "dark"
      })
    ).toMatchObject({ appearance: "system", systemTheme: "dark", theme: "dark" });
  });

  it("scopes external hosted portal roots and restores host attributes", () => {
    const hostRoot = document.createElement("div");
    hostRoot.id = "host-portal-root";
    hostRoot.dataset.suiteUi = "host";
    document.body.append(hostRoot);

    const view = render(
      createElement(
        OpenSketchPortalRoot,
        {
          portalRootId: hostRoot.id,
          scope: {
            mode: "opensuite",
            theme: "dark",
            density: "compact",
            reducedMotion: true,
            uiContractVersion: OPENSUITE_UI_CONTRACT_VERSION,
            style: "default",
            palette: "opensuite-default",
            appearance: "dark",
            themeContractVersion: "1.0.0"
          }
        },
        createElement("span", null, "portal content")
      )
    );

    expect(hostRoot).toHaveAttribute("data-suite-ui", "opensketch");
    expect(hostRoot).toHaveAttribute("data-opensketch-theme", "dark");
    expect(hostRoot).toHaveAttribute("data-density", "compact");

    view.unmount();
    expect(hostRoot).toHaveAttribute("data-suite-ui", "host");
    expect(hostRoot).not.toHaveAttribute("data-opensketch-theme");
    hostRoot.remove();
  });
});
