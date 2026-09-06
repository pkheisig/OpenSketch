import { useEffect, useMemo, useState } from "react";
import type { AssetManifest } from "@workspace/editor-core";
import { buildOfflineAssetPack, type OfflineAssetPackStatus } from "@/assets/offlineAssetPack";
import { useOpenSketchHostServices } from "@/application/hostServices";

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
  const services = useOpenSketchHostServices();
  const pack = useMemo(
    () => buildOfflineAssetPack(assetManifest, version),
    [assetManifest, version]
  );
  const [status, setStatus] = useState<OfflineAssetPackStatus | null>(null);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      const getStatus = services.assets.getOfflineStatus;
      if (!getStatus) return;
      void getStatus().then((next) => {
        if (active) setStatus(next);
      });
    };
    const unsubscribe = services.assets.onOfflineStatusChange?.((next) => {
      if (next.version === pack.version) {
        setStatus(next);
      }
    });
    refresh();
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [pack, services]);

  const startPreparation = () => {
    const prepareOffline = services.assets.prepareOffline;
    if (!prepareOffline) return;
    setStatus({
      state: "preparing",
      version: pack.version,
      total: pack.entries.length,
      completed: 0,
      sourceCount: pack.sourceCount,
      previewCount: pack.previewCount
    });
    void prepareOffline()
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

  const effectiveStatus = status?.version === pack.version ? status : null;
  const state = effectiveStatus?.state ?? "not-ready";
  const stateLabel =
    state === "preparing"
      ? "Preparing offline copy"
      : state === "unavailable"
        ? "Offline storage unavailable"
        : state === "error"
          ? "Offline copy incomplete"
          : "Not prepared for offline use";

  if (state === "ready") return null;

  return (
    <section className="offline-asset-card" aria-label="Offline asset library">
      <div className="offline-asset-card-heading">
        <strong>Offline asset library</strong>
        <span
          className={`offline-asset-state offline-asset-state-${state}`}
          role="img"
          aria-label={stateLabel}
        />
      </div>
      {state === "preparing" ? (
        <div className="offline-asset-progress" role="status" aria-live="polite">
          <progress value={effectiveStatus?.completed ?? 0} max={pack.entries.length} />
          <span>
            {(effectiveStatus?.completed ?? 0).toLocaleString()} /{" "}
            {pack.entries.length.toLocaleString()}
          </span>
        </div>
      ) : null}
      {effectiveStatus?.message && state === "error" ? (
        <p className="offline-asset-error" role="alert">
          {effectiveStatus.message}
        </p>
      ) : null}
      {state !== "preparing" && state !== "unavailable" ? (
        <button type="button" className="offline-asset-button" onClick={startPreparation}>
          {state === "error" ? "Retry offline library" : "Prepare offline library"}
        </button>
      ) : null}
    </section>
  );
}
