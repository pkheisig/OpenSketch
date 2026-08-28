import { useEffect, useMemo, useState } from "react";
import type { AssetManifest } from "@workspace/editor-core";
import {
  buildOfflineAssetPack,
  getOfflineAssetPackStatus,
  OFFLINE_ASSET_PACK_CHANGED_EVENT,
  prepareOfflineAssetPack,
  type OfflineAssetPackStatus
} from "@/assets/offlineAssetPack";

function errorMessage(reason: unknown): string {
  return reason instanceof Error
    ? reason.message
    : "Could not prepare the offline asset library. Reconnect and retry.";
}

export function OfflineAssetLibraryCard({
  assetManifest,
  version
}: {
  assetManifest: AssetManifest;
  version: string;
}) {
  const pack = useMemo(
    () => buildOfflineAssetPack(assetManifest, version),
    [assetManifest, version]
  );
  const [status, setStatus] = useState<OfflineAssetPackStatus | null>(null);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void getOfflineAssetPackStatus(pack).then((next) => {
        if (active) setStatus(next);
      });
    };
    const updateFromEvent = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const next = event.detail as OfflineAssetPackStatus | undefined;
      if (next?.version === pack.version) {
        setStatus(next);
      }
    };
    refresh();
    window.addEventListener(OFFLINE_ASSET_PACK_CHANGED_EVENT, updateFromEvent);
    return () => {
      active = false;
      window.removeEventListener(OFFLINE_ASSET_PACK_CHANGED_EVENT, updateFromEvent);
    };
  }, [pack]);

  const startPreparation = () => {
    setStatus({
      state: "preparing",
      version: pack.version,
      total: pack.entries.length,
      completed: 0,
      sourceCount: pack.sourceCount,
      previewCount: pack.previewCount
    });
    void prepareOfflineAssetPack(pack)
      .then(setStatus)
      .catch((reason) => {
        setStatus((current) => ({
          state: "error",
          version: pack.version,
          total: pack.entries.length,
          completed: current?.completed ?? 0,
          sourceCount: pack.sourceCount,
          previewCount: pack.previewCount,
          message: errorMessage(reason)
        }));
      });
  };

  const state = status?.state ?? "not-ready";
  const label =
    state === "ready"
      ? "Ready for offline use"
      : state === "preparing"
        ? "Preparing offline copy…"
        : state === "unavailable"
          ? "Offline storage unavailable"
          : state === "error"
            ? "Offline copy incomplete"
            : "Not prepared for offline use";

  return (
    <section className="offline-asset-card" aria-label="Offline asset library">
      <div className="offline-asset-card-heading">
        <div>
          <strong>Offline asset library</strong>
          <span>{label}</span>
        </div>
        <span className={`offline-asset-state offline-asset-state-${state}`} aria-hidden="true" />
      </div>
      <p>
        Prepare {pack.sourceCount.toLocaleString()} SVGs and {pack.previewCount.toLocaleString()}{" "}
        previews for cold offline use.
      </p>
      {state === "preparing" ? (
        <div className="offline-asset-progress" role="status" aria-live="polite">
          <progress value={status?.completed ?? 0} max={pack.entries.length} />
          <span>
            {(status?.completed ?? 0).toLocaleString()} / {pack.entries.length.toLocaleString()}
          </span>
        </div>
      ) : null}
      {status?.message && state === "error" ? (
        <p className="offline-asset-error" role="alert">
          {status.message}
        </p>
      ) : null}
      {state !== "ready" && state !== "preparing" && state !== "unavailable" ? (
        <button type="button" className="offline-asset-button" onClick={startPreparation}>
          {state === "error" ? "Retry offline library" : "Prepare offline library"}
        </button>
      ) : null}
    </section>
  );
}
