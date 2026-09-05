import { useState } from "react";
import type { Group } from "fabric";
import { useEditorFields } from "@/editor/editorHooks";
import { MAX_BRUSH_ANCHORS, type ScientificBrushSpec } from "@/editor/scientific/catalog";
import { sampleBrush } from "@/editor/scientific/geometry";

export function ScientificBrushInspector({
  object
}: {
  object: Group & { scientificBrush: ScientificBrushSpec };
}) {
  const editor = useEditorFields(["setObject", "selection"]);
  const [error, setError] = useState("");
  const spec = object.scientificBrush;
  const update = (patch: Partial<ScientificBrushSpec>) => {
    try {
      editor.setObject({ scientificBrush: { ...spec, ...patch } });
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update the structure.");
    }
  };
  const addPoint = () => {
    let index = 0,
      largest = -1;
    for (let i = 0; i < spec.points.length - (spec.closed ? 0 : 1); i++) {
      const a = spec.points[i],
        b = spec.points[(i + 1) % spec.points.length];
      const length = Math.hypot(a.x - b.x, a.y - b.y);
      if (length > largest) {
        largest = length;
        index = i;
      }
    }
    const points = spec.points.map((p) => ({ ...p }));
    const a = points[index],
      b = points[(index + 1) % points.length];
    points.splice(index + 1, 0, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    update({ points });
  };
  return (
    <div className="scientific-brush-settings" aria-label="Editable structure settings">
      <p className="section-note">
        Drag the path handles to extend or bend. Units retain their shape.
      </p>
      <div className="field-row two">
        <label className="field">
          Unit size
          <input
            aria-label="Structure unit size"
            type="number"
            min={8}
            max={100}
            value={spec.unitSize}
            onChange={(e) => update({ unitSize: Number(e.target.value) })}
          />
        </label>
        <label className="field">
          Spacing
          <input
            aria-label="Structure spacing"
            type="number"
            min={0.65}
            max={3}
            step={0.05}
            value={spec.spacing}
            onChange={(e) => update({ spacing: Number(e.target.value) })}
          />
        </label>
      </div>
      <div className="field-row two">
        <label>
          <input
            type="checkbox"
            checked={spec.smooth}
            onChange={(e) => update({ smooth: e.target.checked })}
          />{" "}
          Smooth path
        </label>
        <label>
          <input
            type="checkbox"
            checked={spec.closed}
            disabled={spec.points.length < 3}
            onChange={(e) => update({ closed: e.target.checked })}
          />{" "}
          Closed path
        </label>
      </div>
      <div className="field-row two">
        <button onClick={addPoint} disabled={spec.points.length >= MAX_BRUSH_ANCHORS}>
          Add bend point
        </button>
        <button
          disabled={spec.points.length <= (spec.closed ? 3 : 2)}
          onClick={() =>
            update({ points: spec.points.filter((_, i) => i !== spec.points.length - 2) })
          }
        >
          Remove bend point
        </button>
      </div>
      {(spec.kind === "monolayer" || spec.kind === "epithelium") && (
        <label>
          <input
            type="checkbox"
            checked={spec.flipped}
            onChange={(e) => update({ flipped: e.target.checked })}
          />{" "}
          Reverse facing
        </label>
      )}
      <div className="scientific-brush-colors">
        {(["fill", "accent", "stroke"] as const).map((key) => (
          <label className="field" key={key}>
            {key === "fill" ? "Primary" : key === "stroke" ? "Outline" : "Accent"}
            <input
              type="color"
              aria-label={`Structure ${key} color`}
              value={spec[key]}
              onChange={(e) => update({ [key]: e.target.value })}
            />
          </label>
        ))}
      </div>
      <p className="section-note" aria-label="Structure unit count">
        {sampleBrush(spec).samples.length} repeat positions · schematic spacing
      </p>
      <button onClick={() => editor.setObject({ scientificBrush: null })}>
        Convert to editable parts
      </button>
      <p className="section-note">
        Conversion keeps the vectors and releases each part for individual editing. Undo restores
        the path controls.
      </p>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
