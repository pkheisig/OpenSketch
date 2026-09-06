import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "../apps/web/node_modules/react/index.js";
import type { AssetManifest } from "@workspace/editor-core";
import {
  OpenSketchHostProvider,
  type OpenSketchHostServices
} from "../apps/web/src/application/hostServices";
import { OfflineAssetLibraryCard } from "../apps/web/src/components/OfflineAssetLibraryCard";
import type { OfflineAssetPackStatus } from "../apps/web/src/assets/offlineAssetPack";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function manifest(): AssetManifest {
  return {
    version: 1,
    generatedAt: "2026-09-06T00:00:00.000Z",
    source: "test",
    families: [
      {
        familyId: "family",
        title: "Test family",
        description: "Test family",
        category: "Test",
        keywords: [],
        author: "Test",
        credit: "Test",
        license: "CC0-1.0",
        defaultVariantId: "variant",
        variants: [
          {
            id: "variant",
            assetPath: "/assets/test.svg",
            thumbnailPath: "/assets/test.webp"
          }
        ]
      }
    ]
  };
}

function status(
  version: string,
  state: OfflineAssetPackStatus["state"],
  completed = state === "ready" ? 2 : 0,
  message?: string
): OfflineAssetPackStatus {
  return {
    state,
    version,
    total: 2,
    completed,
    sourceCount: 1,
    previewCount: 1,
    ...(message ? { message } : {})
  };
}

function services(
  getOfflineStatus: OpenSketchHostServices["assets"]["getOfflineStatus"],
  prepareOffline: OpenSketchHostServices["assets"]["prepareOffline"] = vi.fn()
): OpenSketchHostServices {
  return {
    assets: {
      getManifest: vi.fn(async () => manifest()),
      getVersion: vi.fn(async () => "pack-1"),
      loadText: vi.fn(async () => ""),
      loadBlob: vi.fn(async () => new Blob()),
      resolveVariant: vi.fn((_family, variant) => variant),
      getOfflineStatus,
      prepareOffline,
      onOfflineStatusChange: vi.fn(() => () => undefined)
    }
  } as unknown as OpenSketchHostServices;
}

function card(version: string, host: OpenSketchHostServices) {
  return createElement(
    OpenSketchHostProvider,
    { services: host },
    createElement(OfflineAssetLibraryCard, { assetManifest: manifest(), version })
  );
}

describe("OfflineAssetLibraryCard", () => {
  it("keeps the not-ready state compact and removes the card after preparation", async () => {
    const getOfflineStatus = vi.fn().mockResolvedValue(status("pack-1", "not-ready"));
    const prepareOffline = vi.fn().mockResolvedValue(status("pack-1", "ready"));
    const host = services(getOfflineStatus, prepareOffline);

    render(card("pack-1", host));

    const library = await screen.findByRole("region", { name: "Offline asset library" });
    expect(library).not.toHaveTextContent("Not prepared for offline use");
    expect(library.querySelector(".offline-asset-card > p")).toBeNull();
    expect(screen.getByRole("img", { name: "Not prepared for offline use" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Prepare offline library" }));
    await waitFor(() => expect(prepareOffline).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(
        screen.queryByRole("region", { name: "Offline asset library" })
      ).not.toBeInTheDocument()
    );
  });

  it("shows preparation progress and an actionable error", async () => {
    let rejectPreparation!: (reason: unknown) => void;
    const preparation = new Promise<OfflineAssetPackStatus>((_resolve, reject) => {
      rejectPreparation = reject;
    });
    const getOfflineStatus = vi.fn().mockResolvedValue(status("pack-1", "not-ready"));
    const prepareOffline = vi.fn(() => preparation);
    const host = services(getOfflineStatus, prepareOffline);

    render(card("pack-1", host));
    await screen.findByRole("region", { name: "Offline asset library" });
    fireEvent.click(screen.getByRole("button", { name: "Prepare offline library" }));

    expect(await screen.findByRole("status")).toHaveTextContent("0 / 2");
    expect(
      screen.queryByRole("button", { name: "Prepare offline library" })
    ).not.toBeInTheDocument();

    rejectPreparation(new Error("Browser storage blocked"));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Browser storage blocked")
    );
    expect(screen.getByRole("button", { name: "Retry offline library" })).toBeVisible();
  });

  it("does not treat a ready older pack as ready for a newer version", async () => {
    const getOfflineStatus = vi
      .fn()
      .mockResolvedValueOnce(status("pack-1", "ready"))
      .mockResolvedValueOnce(status("pack-2", "not-ready"));
    const host = services(getOfflineStatus);

    const view = render(card("pack-1", host));
    await waitFor(() =>
      expect(
        screen.queryByRole("region", { name: "Offline asset library" })
      ).not.toBeInTheDocument()
    );

    view.rerender(card("pack-2", host));
    await waitFor(() =>
      expect(screen.getByRole("region", { name: "Offline asset library" })).toBeVisible()
    );
    expect(screen.getByRole("button", { name: "Prepare offline library" })).toBeVisible();
    expect(getOfflineStatus).toHaveBeenCalledTimes(2);
  });
});
