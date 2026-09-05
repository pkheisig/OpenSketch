import { ASSET_COLOR_PRESETS } from "@/editor/assetColorPresets";
import { useEditorFields } from "@/editor/editorHooks";
import { type FabricObject } from "fabric";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function AssetColorPresets({ object }: { object: FabricObject }) {
  const editor = useEditorFields(["applyColorPreset", "resetColors", "selection", "setObject"]);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0, maxHeight: 640 });
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const presets = ASSET_COLOR_PRESETS.filter((p) => p.shade === "Classic");
  const selectedFamily = ASSET_COLOR_PRESETS.find((p) => p.id === object.assetColorPreset)?.family;
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = (
        trigger.current?.closest(".inspector-embedded") ?? trigger.current
      )?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(500, window.innerWidth - 24);
      const top = Math.max(12, Math.min(rect.top, window.innerHeight - 640));
      setPosition({
        maxHeight: window.innerHeight - top - 12,
        left: Math.max(12, Math.min(rect.right + 12, window.innerWidth - width - 12)),
        top
      });
    };
    place();
    close.current?.focus();
    const outside = (event: PointerEvent) => {
      if (
        !popup.current?.contains(event.target as Node) &&
        !trigger.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        trigger.current?.focus();
      }
    };
    window.addEventListener("resize", place);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape, true);
    return () => {
      window.removeEventListener("resize", place);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape, true);
    };
  }, [open]);
  return (
    <div className="asset-color-presets" aria-label="Asset color presets">
      <div className="asset-palette-actions">
        <button
          ref={trigger}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          Choose palette…
        </button>
        <button onClick={editor.resetColors} title="Restore every original color exactly">
          Restore to Default
        </button>
      </div>
      {open &&
        createPortal(
          <div
            ref={popup}
            className="asset-palette-popover"
            role="dialog"
            aria-label="Choose asset palette"
            style={position}
          >
            <header>
              <strong>Asset palette</strong>
              <button
                ref={close}
                aria-label="Close asset palette"
                onClick={() => {
                  setOpen(false);
                  trigger.current?.focus();
                }}
              >
                ×
              </button>
            </header>
            <div className="asset-family-grid">
              {presets.map((p) => (
                <button
                  key={p.id}
                  aria-label={p.family}
                  title={p.family}
                  aria-pressed={selectedFamily === p.family}
                  onClick={() => editor.applyColorPreset(p.id)}
                >
                  <span style={{ background: p.id === "white" ? "#ffffff" : p.ramps.cell[2] }} />
                  {p.family}
                </button>
              ))}
            </div>
            <div className="asset-adjustments">
              {(["assetSaturation", "assetBrightness"] as const).map((key) => {
                const label = key === "assetSaturation" ? "Saturation" : "Brightness";
                return (
                  <label key={key}>
                    {label}
                    <output>{Math.round((object[key] ?? 0) * 100)}%</output>
                    <input
                      type="range"
                      aria-label={label}
                      min={-100}
                      max={100}
                      step={1}
                      value={Math.round((object[key] ?? 0) * 100)}
                      onChange={(e) => editor.setObject({ [key]: Number(e.target.value) / 100 })}
                    />
                  </label>
                );
              })}
            </div>
            <p className="section-note">
              Themes larger regions together. Tiny details and neutral outlines retain their colors.
            </p>
          </div>,
          document.body
        )}
    </div>
  );
}
