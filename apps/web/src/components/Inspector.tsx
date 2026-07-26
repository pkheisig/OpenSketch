import { useState } from "react";
import {
  AlignCenter,
  AlignHorizontalDistributeCenter,
  AlignLeft,
  AlignRight,
  AlignVerticalDistributeCenter,
  ArrowDownToLine,
  ArrowUpToLine,
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  FlipHorizontal2,
  FlipVertical2,
  Group,
  Layers3,
  Lock,
  MoveDown,
  MoveUp,
  RotateCw,
  Trash2,
  Ungroup,
  Unlock
} from "lucide-react";
import {
  CANVAS_PRESETS,
  pixelsToUnit,
  unitToPixels,
  type CanvasUnit
} from "@opensketch/editor-core";
import { FabricObject, Group as FabricGroup, Text } from "fabric";
import { useEditor } from "@/editor/EditorContext";

function number(value: number | undefined, digits = 0) {
  return Number(value ?? 0).toFixed(digits);
}

export function Inspector() {
  const editor = useEditor();
  const selected = editor.selection[0];
  return (
    <aside className="right-sidebar">
      <div className="inspector-header">
        <div>
          <p className="eyebrow">
            {selected ? (selected.opensketchType ?? selected.type) : "DOCUMENT"}
          </p>
          <h2>{selected?.name ?? "Canvas"}</h2>
        </div>
        <span>{editor.selection.length > 1 ? `${editor.selection.length} selected` : ""}</span>
      </div>
      <div className="inspector-scroll">
        {selected ? <ObjectInspector object={selected} /> : <CanvasInspector />}
        <LayersPanel />
      </div>
    </aside>
  );
}

function CanvasInspector() {
  const editor = useEditor();
  const settings = editor.canvasSettings;
  const unit = settings.unit;
  const width = pixelsToUnit(settings.width, unit, settings.dpi);
  const height = pixelsToUnit(settings.height, unit, settings.dpi);
  return (
    <>
      <InspectorSection title="Artboard" open>
        <label className="field">
          Preset
          <select
            value=""
            onChange={(event) => {
              const preset = CANVAS_PRESETS[event.target.value];
              if (preset) editor.setCanvasSettings(preset);
            }}
          >
            <option value="">Custom dimensions</option>
            {Object.keys(CANVAS_PRESETS).map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <div className="field-row three">
          <NumberField
            label="W"
            value={width}
            step={unit === "px" ? 1 : 0.1}
            onChange={(value) =>
              editor.setCanvasSettings({
                width: Math.round(unitToPixels(value, unit, settings.dpi))
              })
            }
          />
          <NumberField
            label="H"
            value={height}
            step={unit === "px" ? 1 : 0.1}
            onChange={(value) =>
              editor.setCanvasSettings({
                height: Math.round(unitToPixels(value, unit, settings.dpi))
              })
            }
          />
          <label className="mini-field">
            Unit
            <select
              value={unit}
              onChange={(event) =>
                editor.setCanvasSettings({ unit: event.target.value as CanvasUnit })
              }
            >
              <option value="px">px</option>
              <option value="mm">mm</option>
              <option value="in">in</option>
            </select>
          </label>
        </div>
        <NumberField
          label="Export DPI"
          value={settings.dpi}
          min={72}
          max={1200}
          onChange={(dpi) => editor.setCanvasSettings({ dpi })}
        />
        <label className="check-field compact">
          <input
            type="checkbox"
            checked={settings.transparent}
            onChange={(event) => editor.setCanvasSettings({ transparent: event.target.checked })}
          />
          Transparent background
        </label>
        {!settings.transparent && (
          <label className="color-field">
            Background
            <span>
              <input
                type="color"
                value={settings.background}
                onChange={(event) => editor.setCanvasSettings({ background: event.target.value })}
              />
              {settings.background}
            </span>
          </label>
        )}
      </InspectorSection>
      <div className="canvas-empty-state">
        <Layers3 size={24} />
        <strong>Select an object to inspect it</strong>
        <p>Position, palette, typography, and layer controls appear here.</p>
      </div>
    </>
  );
}

function ObjectInspector({ object }: { object: FabricObject }) {
  const editor = useEditor();
  const palette = editor.getPalette();
  const isText = object instanceof Text;
  const width = (object.width ?? 0) * (object.scaleX ?? 1);
  const height = (object.height ?? 0) * (object.scaleY ?? 1);
  return (
    <>
      <InspectorSection title="Transform" open>
        <div className="field-row two">
          <NumberField
            label="X"
            value={object.left ?? 0}
            onChange={(left) => editor.setObject({ left })}
          />
          <NumberField
            label="Y"
            value={object.top ?? 0}
            onChange={(top) => editor.setObject({ top })}
          />
        </div>
        <div className="field-row two">
          <NumberField
            label="W"
            value={width}
            min={1}
            onChange={(next) => editor.setObject({ scaleX: next / (object.width || 1) })}
          />
          <NumberField
            label="H"
            value={height}
            min={1}
            onChange={(next) => editor.setObject({ scaleY: next / (object.height || 1) })}
          />
        </div>
        <NumberField
          label="Rotation"
          value={object.angle ?? 0}
          suffix="°"
          onChange={(angle) => editor.setObject({ angle })}
          icon={<RotateCw size={13} />}
        />
        <div className="segmented-icons">
          <button onClick={() => editor.flip("x")}>
            <FlipHorizontal2 size={16} /> Flip H
          </button>
          <button onClick={() => editor.flip("y")}>
            <FlipVertical2 size={16} /> Flip V
          </button>
        </div>
      </InspectorSection>
      {isText && (
        <InspectorSection title="Typography" open>
          <label className="field">
            Typeface
            <select
              value={object.fontFamily}
              onChange={(event) => editor.setObject({ fontFamily: event.target.value })}
            >
              <option>Source Sans 3</option>
              <option>Source Serif 4</option>
              <option>STIX Two Text</option>
              <option>Inter</option>
              <option>Georgia</option>
            </select>
          </label>
          <div className="field-row two">
            <NumberField
              label="Size"
              value={object.fontSize}
              min={6}
              max={400}
              onChange={(fontSize) => editor.setObject({ fontSize })}
            />
            <label className="mini-field">
              Weight
              <select
                value={String(object.fontWeight)}
                onChange={(event) => editor.setObject({ fontWeight: event.target.value })}
              >
                <option value="400">Regular</option>
                <option value="600">Semibold</option>
                <option value="700">Bold</option>
              </select>
            </label>
          </div>
          <div className="segmented-icons text-style">
            <button
              className={object.fontStyle === "italic" ? "active" : ""}
              onClick={() =>
                editor.setObject({ fontStyle: object.fontStyle === "italic" ? "normal" : "italic" })
              }
            >
              <em>I</em>
            </button>
            <button
              className={object.underline ? "active" : ""}
              onClick={() => editor.setObject({ underline: !object.underline })}
            >
              <u>U</u>
            </button>
            <button onClick={() => editor.setObject({ textAlign: "left" })}>
              <AlignLeft size={15} />
            </button>
            <button onClick={() => editor.setObject({ textAlign: "center" })}>
              <AlignCenter size={15} />
            </button>
            <button onClick={() => editor.setObject({ textAlign: "right" })}>
              <AlignRight size={15} />
            </button>
          </div>
        </InspectorSection>
      )}
      <InspectorSection title="Appearance" open>
        <label className="range-field">
          <span>
            Opacity <output>{Math.round((object.opacity ?? 1) * 100)}%</output>
          </span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={object.opacity ?? 1}
            onChange={(event) => editor.setObject({ opacity: Number(event.target.value) })}
          />
        </label>
        {palette.length > 0 && (
          <div className="palette">
            <div className="palette-title">
              <span>Asset palette</span>
              <button onClick={editor.resetColors}>Reset</button>
            </div>
            <div className="swatches">
              {palette.map((color) => (
                <label key={color} title={`Replace ${color}`}>
                  <input
                    type="color"
                    value={normalizeHex(color)}
                    onChange={(event) => editor.replaceColor(color, event.target.value)}
                  />
                  <span style={{ background: color }} />
                </label>
              ))}
            </div>
          </div>
        )}
        {typeof object.fill === "string" && (
          <label className="color-field">
            Fill
            <span>
              <input
                type="color"
                value={normalizeHex(object.fill)}
                onChange={(event) => editor.setObject({ fill: event.target.value })}
              />
              {object.fill}
            </span>
          </label>
        )}
        <div className="field-row two">
          <label className="color-field mini">
            Stroke
            <span>
              <input
                type="color"
                value={normalizeHex(typeof object.stroke === "string" ? object.stroke : "#000000")}
                onChange={(event) => editor.setObject({ stroke: event.target.value })}
              />
            </span>
          </label>
          <NumberField
            label="Weight"
            value={object.strokeWidth ?? 0}
            min={0}
            max={40}
            onChange={(strokeWidth) => editor.setObject({ strokeWidth })}
          />
        </div>
      </InspectorSection>
      <InspectorSection title="Align & distribute">
        <div className="icon-grid">
          <button onClick={() => editor.align("left")} aria-label="Align left">
            <AlignLeft size={15} />
          </button>
          <button onClick={() => editor.align("center")} aria-label="Align centers">
            <AlignCenter size={15} />
          </button>
          <button onClick={() => editor.align("right")} aria-label="Align right">
            <AlignRight size={15} />
          </button>
          <button
            onClick={() => editor.distribute("horizontal")}
            aria-label="Distribute horizontally"
          >
            <AlignHorizontalDistributeCenter size={15} />
          </button>
          <button onClick={() => editor.distribute("vertical")} aria-label="Distribute vertically">
            <AlignVerticalDistributeCenter size={15} />
          </button>
        </div>
      </InspectorSection>
      <InspectorSection title="Object actions" open>
        <div className="action-grid">
          <button onClick={() => void editor.duplicateSelection()}>
            <Copy size={15} /> Duplicate
          </button>
          <button
            onClick={editor.selection.length > 1 ? editor.groupSelection : editor.ungroupSelection}
          >
            {object instanceof FabricGroup ? <Ungroup size={15} /> : <Group size={15} />}
            {object instanceof FabricGroup ? "Ungroup" : "Group"}
          </button>
          <button
            onClick={() =>
              editor.setObject({
                selectable: object.selectable === false,
                evented: object.evented === false
              })
            }
          >
            {object.selectable === false ? <Unlock size={15} /> : <Lock size={15} />}
            {object.selectable === false ? "Unlock" : "Lock"}
          </button>
          <button onClick={() => editor.setObject({ visible: object.visible === false })}>
            {object.visible === false ? <Eye size={15} /> : <EyeOff size={15} />}
            {object.visible === false ? "Show" : "Hide"}
          </button>
          <button className="danger span-two" onClick={editor.deleteSelection}>
            <Trash2 size={15} /> Delete object
          </button>
        </div>
      </InspectorSection>
    </>
  );
}

function LayersPanel() {
  const editor = useEditor();
  const [open, setOpen] = useState(true);
  const objects = [...(editor.canvas?.getObjects() ?? [])].reverse();
  return (
    <section className="layers-panel">
      <button className="layers-title" onClick={() => setOpen(!open)}>
        <span>
          {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          <Layers3 size={15} /> Layers
        </span>
        <small>{objects.length}</small>
      </button>
      {open && (
        <div className="layer-list">
          {objects.length === 0 && <p>No objects yet</p>}
          {objects.map((object, index) => (
            <button
              key={object.objectId ?? `${object.type}-${index}`}
              className={editor.selection.includes(object) ? "active" : ""}
              onClick={() => {
                editor.canvas?.setActiveObject(object);
                editor.canvas?.requestRenderAll();
                object.fire("selected");
              }}
            >
              <span className="layer-icon">
                {(object.name ?? object.type).slice(0, 1).toUpperCase()}
              </span>
              <span className="layer-copy">
                <strong>{object.name ?? object.type}</strong>
                <small>{object.opensketchType ?? object.type}</small>
              </span>
              {object.visible === false ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          ))}
        </div>
      )}
      {open && objects.length > 0 && (
        <div className="layer-controls">
          <button onClick={() => editor.arrange("front")} aria-label="Bring to front">
            <ArrowUpToLine size={14} />
          </button>
          <button onClick={() => editor.arrange("forward")} aria-label="Bring forward">
            <MoveUp size={14} />
          </button>
          <button onClick={() => editor.arrange("backward")} aria-label="Send backward">
            <MoveDown size={14} />
          </button>
          <button onClick={() => editor.arrange("back")} aria-label="Send to back">
            <ArrowDownToLine size={14} />
          </button>
        </div>
      )}
    </section>
  );
}

function InspectorSection({
  title,
  open: initial = false,
  children
}: {
  title: string;
  open?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(initial);
  return (
    <section className="inspector-section">
      <button className="inspector-section-title" onClick={() => setOpen(!open)}>
        {title}
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {open && <div className="inspector-section-body">{children}</div>}
    </section>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  icon,
  onChange
}: {
  label: string;
  value: number | undefined;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  icon?: React.ReactNode;
  onChange: (value: number) => void;
}) {
  return (
    <label className="number-field">
      <span>
        {icon}
        {label}
      </span>
      <input
        type="number"
        value={number(value, step < 1 ? 2 : 0)}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
      />
      {suffix && <small>{suffix}</small>}
    </label>
  );
}

function normalizeHex(value: string): string {
  if (/^#[0-9a-f]{6}$/i.test(value)) return value;
  if (/^#[0-9a-f]{3}$/i.test(value)) {
    return `#${value
      .slice(1)
      .split("")
      .map((character) => character + character)
      .join("")}`;
  }
  const context = document.createElement("canvas").getContext("2d");
  if (!context) return "#000000";
  context.fillStyle = value;
  return context.fillStyle.startsWith("#") ? context.fillStyle : "#000000";
}
