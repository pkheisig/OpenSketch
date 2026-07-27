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
  CornerUpLeft,
  Eye,
  EyeOff,
  FlipHorizontal2,
  FlipVertical2,
  Group,
  Layers3,
  Lock,
  MoveDown,
  MoveUp,
  PanelRightClose,
  PanelRightOpen,
  RotateCw,
  Trash2,
  Ungroup,
  Unlock
} from "lucide-react";
import {
  CANVAS_PRESETS,
  pixelsToUnit,
  unitToPixels,
  type CanvasUnit,
  type ConnectorAnchor,
  type ConnectorArrowhead,
  type ConnectorLineStyle,
  type ConnectorRouting
} from "@workspace/editor-core";
import { Color, FabricObject, Group as FabricGroup, Text } from "fabric";
import { useEditor } from "@/editor/EditorContext";
import { UiSelect } from "@/components/UiSelect";
import { useSidebarHover } from "./useSidebarHover";

function number(value: number | undefined, digits = 0) {
  return Number(value ?? 0).toFixed(digits);
}

export function Inspector({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { hoverExpanded, show, scheduleHide, hideNow } = useSidebarHover(collapsed);
  const editor = useEditor();
  const selected = editor.selection[0];
  const isSvgPart = selected?.OpenSketchType === "svg-part";
  const parentAsset = isSvgPart ? svgPartParent(selected) : null;
  const expanded = !collapsed || hoverExpanded;
  return (
    <aside
      className={`right-sidebar ${collapsed ? "collapsed" : ""} ${
        collapsed && hoverExpanded ? "hover-expanded" : ""
      }`}
      onPointerLeave={scheduleHide}
    >
      <div
        className="sidebar-hover-trigger"
        aria-hidden="true"
        onPointerEnter={(event) => {
          if (event.pointerType !== "touch") show();
        }}
      />
      <div className="sidebar-rail" inert={expanded} aria-hidden={expanded}>
        <button
          className="sidebar-expand"
          onClick={onToggle}
          aria-label="Expand right sidebar"
          title="Expand inspector"
        >
          <PanelRightOpen size={18} />
        </button>
      </div>
      <div className="inspector-expanded" inert={!expanded} aria-hidden={!expanded}>
        <div className="inspector-header">
          <h2>{selected?.name ?? "Canvas"}</h2>
          <span>{editor.selection.length > 1 ? `${editor.selection.length} selected` : ""}</span>
          <button
            className="inspector-collapse"
            onClick={() => {
              hideNow();
              onToggle();
            }}
            aria-label={collapsed ? "Keep right sidebar open" : "Minimize right sidebar"}
            title={collapsed ? "Keep inspector open" : "Minimize inspector"}
          >
            {collapsed ? <PanelRightOpen size={16} /> : <PanelRightClose size={16} />}
          </button>
        </div>
        <div className="inspector-scroll">
          {isSvgPart && (
            <div className="svg-part-context">
              <span>Inside {parentAsset?.name ?? "SVG asset"}</span>
              <button onClick={editor.selectParentAsset}>
                <CornerUpLeft size={13} /> Done
              </button>
            </div>
          )}
          {selected ? <ObjectInspector object={selected} /> : <CanvasInspector />}
          <LayersPanel />
        </div>
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
  const activePreset =
    Object.entries(CANVAS_PRESETS).find(
      ([, preset]) => preset.width === settings.width && preset.height === settings.height
    )?.[0] ?? "";
  return (
    <>
      <InspectorSection title="Artboard" open>
        <UiSelect
          className="field"
          label="Preset"
          value={activePreset}
          options={[
            { value: "", label: "Custom dimensions" },
            ...Object.keys(CANVAS_PRESETS).map((name) => ({ value: name, label: name }))
          ]}
          onChange={(name) => {
            const preset = CANVAS_PRESETS[name];
            if (preset) editor.setCanvasSettings(preset);
          }}
        />
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
          <UiSelect
            className="mini-field"
            label="Unit"
            value={unit}
            options={[
              { value: "px", label: "px" },
              { value: "mm", label: "mm" },
              { value: "in", label: "in" }
            ]}
            onChange={(unit) => editor.setCanvasSettings({ unit: unit as CanvasUnit })}
          />
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
  const [aspectLocked, setAspectLocked] = useState(true);
  const palette = editor.getPalette();
  const effects = editor.getAssetEffects();
  const isText = object instanceof Text;
  const isSvgPart = object.OpenSketchType === "svg-part";
  const isAsset =
    object.OpenSketchType === "nih-asset" ||
    object.OpenSketchType === "import" ||
    object.OpenSketchType === "upload";
  const width = (object.width ?? 0) * (object.scaleX ?? 1);
  const height = (object.height ?? 0) * (object.scaleY ?? 1);
  return (
    <>
      {isAsset && object instanceof FabricGroup && (
        <div className="svg-edit-hint">
          <strong>Edit individual parts</strong>
          <span>Double-click a visible region of the SVG.</span>
        </div>
      )}
      <InspectorSection title="Transform" open>
        {isSvgPart && <p className="section-note">Position and size within the parent SVG.</p>}
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
        <div className="field-row dimensions">
          <NumberField
            label="W"
            value={width}
            min={1}
            onChange={(next) => {
              const scaleX = next / (object.width || 1);
              editor.setObject(
                aspectLocked
                  ? { scaleX, scaleY: (object.scaleY ?? 1) * (next / Math.max(width, 1)) }
                  : { scaleX }
              );
            }}
          />
          <button
            className={`aspect-lock ${aspectLocked ? "active" : ""}`}
            onClick={() => setAspectLocked((current) => !current)}
            aria-label={aspectLocked ? "Unlock aspect ratio" : "Lock aspect ratio"}
            aria-pressed={aspectLocked}
          >
            {aspectLocked ? <Lock size={13} /> : <Unlock size={13} />}
          </button>
          <NumberField
            label="H"
            value={height}
            min={1}
            onChange={(next) => {
              const scaleY = next / (object.height || 1);
              editor.setObject(
                aspectLocked
                  ? { scaleY, scaleX: (object.scaleX ?? 1) * (next / Math.max(height, 1)) }
                  : { scaleY }
              );
            }}
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
          <UiSelect
            className="field"
            label="Typeface"
            value={object.fontFamily}
            options={["Source Sans 3", "Source Serif 4", "STIX Two Text", "Inter", "Georgia"].map(
              (font) => ({ value: font, label: font })
            )}
            onChange={(fontFamily) => editor.setObject({ fontFamily })}
          />
          <div className="field-row two">
            <NumberField
              label="Size"
              value={object.fontSize}
              min={6}
              max={400}
              onChange={(fontSize) => editor.setObject({ fontSize })}
            />
            <UiSelect
              className="mini-field"
              label="Weight"
              value={String(object.fontWeight)}
              options={[
                { value: "400", label: "Regular" },
                { value: "600", label: "Semibold" },
                { value: "700", label: "Bold" }
              ]}
              onChange={(fontWeight) => editor.setObject({ fontWeight })}
            />
          </div>
          <div className="field-row two">
            <NumberField
              label="Line height"
              value={object.lineHeight}
              min={0.5}
              max={4}
              step={0.05}
              onChange={(lineHeight) => editor.setObject({ lineHeight })}
            />
            <NumberField
              label="Tracking"
              value={object.charSpacing}
              min={-200}
              max={1000}
              onChange={(charSpacing) => editor.setObject({ charSpacing })}
            />
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
          <div className="segmented-icons text-script" aria-label="Scientific text position">
            <button onClick={() => editor.applyTextScript("normal")}>Normal</button>
            <button onClick={() => editor.applyTextScript("subscript")}>
              X<sub>2</sub>
            </button>
            <button onClick={() => editor.applyTextScript("superscript")}>
              X<sup>2</sup>
            </button>
          </div>
        </InspectorSection>
      )}
      {object.connector && (
        <InspectorSection title="Connector" open>
          <div className="field-row two">
            <ConnectorSelect
              label="Start anchor"
              value={object.connector.fromAnchor}
              values={["top", "right", "bottom", "left", "center"]}
              onChange={(fromAnchor) => editor.updateConnector({ fromAnchor })}
            />
            <ConnectorSelect
              label="End anchor"
              value={object.connector.toAnchor}
              values={["top", "right", "bottom", "left", "center"]}
              onChange={(toAnchor) => editor.updateConnector({ toAnchor })}
            />
          </div>
          <div className="field-row two">
            <ConnectorSelect
              label="Start head"
              value={object.connector.startArrowhead}
              values={["none", "triangle", "open", "circle"]}
              onChange={(startArrowhead) => editor.updateConnector({ startArrowhead })}
            />
            <ConnectorSelect
              label="End head"
              value={object.connector.endArrowhead}
              values={["none", "triangle", "open", "circle"]}
              onChange={(endArrowhead) => editor.updateConnector({ endArrowhead })}
            />
          </div>
          <ConnectorSelect
            label="Line style"
            value={object.connector.lineStyle}
            values={["solid", "dashed", "dotted"]}
            onChange={(lineStyle) => editor.updateConnector({ lineStyle })}
          />
          <ConnectorSelect
            label="Routing"
            value={object.connector.routing ?? "direct"}
            values={["direct", "orthogonal"]}
            onChange={(routing) => editor.updateConnector({ routing })}
          />
          {(object.connector.routing ?? "direct") === "direct" && (
            <label className="range-field">
              <span>
                Curvature <output>{Math.round(object.connector.curvature * 100)}%</output>
              </span>
              <input
                type="range"
                min="-0.8"
                max="0.8"
                step="0.02"
                value={object.connector.curvature}
                onChange={(event) =>
                  editor.updateConnector({ curvature: Number(event.target.value) })
                }
              />
            </label>
          )}
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
              <span>{isSvgPart ? "Part colors" : "Asset palette"}</span>
              <button onClick={editor.resetColors}>Reset</button>
            </div>
            <div className="swatches">
              {palette.map((color, index) => (
                <label key={`${object.objectId ?? "object"}-${index}`} title={`Replace ${color}`}>
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
        {isAsset && (
          <div className="asset-effects">
            <div className="palette-title">
              <span>Scientific color effects</span>
              <button onClick={editor.resetColors}>Reset all</button>
            </div>
            <label className="color-field">
              Tint
              <span>
                <input
                  type="color"
                  value={effects.tint}
                  onChange={(event) => editor.setAssetEffects({ tint: event.target.value })}
                />
              </span>
            </label>
            <EffectRange
              label="Tint strength"
              value={effects.tintAmount}
              onChange={(tintAmount) => editor.setAssetEffects({ tintAmount })}
            />
            <EffectRange
              label="Saturation"
              value={effects.saturation}
              minimum={-1}
              onChange={(saturation) => editor.setAssetEffects({ saturation })}
            />
            <EffectRange
              label="Brightness"
              value={effects.brightness}
              minimum={-1}
              onChange={(brightness) => editor.setAssetEffects({ brightness })}
            />
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
        <div className="icon-grid alignment-grid">
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
          <button onClick={() => editor.align("top")} aria-label="Align top">
            <ArrowUpToLine size={15} />
          </button>
          <button onClick={() => editor.align("middle")} aria-label="Align middles">
            <AlignVerticalDistributeCenter size={15} />
          </button>
          <button onClick={() => editor.align("bottom")} aria-label="Align bottom">
            <ArrowDownToLine size={15} />
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
          {isSvgPart ? (
            <button onClick={editor.selectParentAsset}>
              <CornerUpLeft size={15} /> Done editing
            </button>
          ) : (
            <>
              <button
                onClick={
                  editor.selection.length > 1 ? editor.groupSelection : editor.ungroupSelection
                }
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
            </>
          )}
          <button className="danger span-two" onClick={editor.deleteSelection}>
            <Trash2 size={15} /> Delete {isSvgPart ? "part" : "object"}
          </button>
        </div>
      </InspectorSection>
    </>
  );
}

function svgPartParent(object: FabricObject): FabricGroup | null {
  for (let parent = object.group; parent; parent = parent.group) {
    if (
      parent instanceof FabricGroup &&
      (parent.OpenSketchType === "nih-asset" ||
        parent.OpenSketchType === "import" ||
        parent.OpenSketchType === "upload")
    ) {
      return parent;
    }
  }
  return null;
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
                <small>{object.OpenSketchType ?? object.type}</small>
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

function ConnectorSelect<
  T extends ConnectorAnchor | ConnectorArrowhead | ConnectorLineStyle | ConnectorRouting
>({
  label,
  value,
  values,
  onChange
}: {
  label: string;
  value: T;
  values: readonly T[];
  onChange: (value: T) => void;
}) {
  return (
    <UiSelect
      className="field"
      label={label}
      value={value}
      options={values.map((item) => ({
        value: item,
        label: item.replaceAll("-", " ")
      }))}
      onChange={onChange}
    />
  );
}

function EffectRange({
  label,
  value,
  minimum = 0,
  onChange
}: {
  label: string;
  value: number;
  minimum?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="range-field">
      <span>
        {label} <output>{Math.round(value * 100)}%</output>
      </span>
      <input
        type="range"
        min={minimum}
        max="1"
        step="0.01"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function normalizeHex(value: string): string {
  const parsed = new Color(value);
  return parsed.isUnrecognised ? "#000000" : `#${parsed.toHex()}`;
}
