import { ASSET_COLOR_PRESETS, ASSET_PALETTE_SHADES } from "@/editor/assetColorPresets";
import { useEditorFields } from "@/editor/editorHooks";
import type { FabricObject } from "fabric";

export function AssetColorPresets({ object }: { object: FabricObject }) {
  const editor = useEditorFields(["applyColorPreset", "resetColors", "selection"]);
  const families = [...new Set(ASSET_COLOR_PRESETS.map((preset) => preset.family))];
  return (
    <div className="asset-color-presets" aria-label="Asset color presets">
      <button
        className="asset-palette-original"
        aria-pressed={!object.assetColorPreset}
        onClick={editor.resetColors}
      >
        Original colors
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
            {ASSET_COLOR_PRESETS.filter((preset) => preset.family === family).map((preset) => (
              <button
                key={preset.id}
                aria-label={preset.label}
                title={preset.label}
                aria-pressed={object.assetColorPreset === preset.id}
                style={{ background: preset.ramps.cell[3], borderColor: preset.ramps.cell[1] }}
                onClick={() => editor.applyColorPreset(preset.id)}
              >
                <span style={{ background: preset.ramps.cell[2] }} />
                <span style={{ background: preset.ramps.cell[1] }} />
              </button>
            ))}
          </div>
        ))}
      </div>
      <p className="section-note">
        Themes larger regions together. Tiny details and neutral outlines retain their colors.
      </p>
    </div>
  );
}
