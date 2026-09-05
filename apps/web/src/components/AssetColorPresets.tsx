import {
  ASSET_COLOR_PRESETS,
  ASSET_PALETTE_SHADES,
  normalizedPresetColor
} from "@/editor/assetColorPresets";
import { useEditorFields } from "@/editor/editorHooks";
import { Color, Group, type FabricObject } from "fabric";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

function originalColors(object: FabricObject): string[] {
  const colors = new Map<string, string>();
  const add = (paint: unknown) => {
    if (typeof paint !== "string" || !paint || paint === "none") return;
    const color = new Color(paint);
    if (color.getAlpha() > 0) colors.set(normalizedPresetColor(paint), paint);
  };
  if (object.scientificBrush) {
    for (const role of ["fill", "accent", "stroke"] as const)
      add(object.originalPalette?.["scientific:" + role] ?? object.scientificBrush[role]);
  } else {
    const walk = (part: FabricObject) => {
      add(part.originalFill ?? part.fill);
      add(part.originalStroke ?? part.stroke);
      for (const gradient of [part.originalGradientFill, part.originalGradientStroke])
        if (Array.isArray(gradient?.colorStops))
          for (const stop of gradient.colorStops) add((stop as { color?: string }).color);
      if (part instanceof Group) part.getObjects().forEach(walk);
    };
    walk(object);
  }
  return [...colors.values()];
}

export function AssetColorPresets({ object }: { object: FabricObject }) {
  const editor = useEditorFields(["applyColorPreset", "resetColors", "selection"]);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0, maxHeight: 640 });
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const colors = originalColors(object);
  const families = [...new Set(ASSET_COLOR_PRESETS.map((p) => p.family))];
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
          Original colors
        </button>
      </div>
      <div className="asset-native-preview" aria-label="Original asset colors">
        {colors.map((color) => (
          <span key={color} title={color} style={{ background: color }} />
        ))}
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
            <button
              className="asset-palette-original"
              aria-label="Restore original colors"
              aria-pressed={!object.assetColorPreset}
              onClick={editor.resetColors}
            >
              Restore original colors
              <span className="asset-native-preview">
                {colors.map((color) => (
                  <span key={color} title={color} style={{ background: color }} />
                ))}
              </span>
            </button>
            <div className="asset-palette-grid">
              <span />
              {ASSET_PALETTE_SHADES.map((shade) => (
                <span className="asset-palette-heading" key={shade}>
                  {shade}
                </span>
              ))}
              {families.map((family) => (
                <div className="asset-palette-row" key={family}>
                  <span>{family}</span>
                  {ASSET_COLOR_PRESETS.filter((p) => p.family === family).map((p) => (
                    <button
                      key={p.id}
                      aria-label={p.label}
                      title={p.label}
                      aria-pressed={object.assetColorPreset === p.id}
                      style={{ background: p.ramps.cell[3], borderColor: p.ramps.cell[1] }}
                      onClick={() => editor.applyColorPreset(p.id)}
                    >
                      <span style={{ background: p.ramps.cell[2] }} />
                      <span style={{ background: p.ramps.cell[1] }} />
                    </button>
                  ))}
                </div>
              ))}
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
