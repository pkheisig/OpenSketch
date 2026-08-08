import { useEffect, useState } from "react";
import {
  AlignCenter,
  AlignHorizontalDistributeCenter,
  AlignLeft,
  AlignRight,
  AlignVerticalDistributeCenter,
  ArrowDownToLine,
  ArrowUpToLine,
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
  RotateCw,
  Trash2,
  Ungroup,
  Unlock
} from "lucide-react";
import { MotionCollapse } from "@/components/MotionCollapse";
import {
  type AssetFamily,
  type ConnectorAnchor,
  type ConnectorArrowhead,
  type ConnectorLineCap,
  type ConnectorLineStyle,
  type ConnectorRouting
} from "@workspace/editor-core";
import { Color, FabricObject, Group as FabricGroup, Text } from "fabric";
import { useEditor } from "@/editor/EditorContext";
import { TEXT_FONT_FAMILIES } from "@/editor/fonts";
import { isManualGroup } from "@/editor/grouping";
import { AssetVariantGrid } from "@/components/AssetVariantPicker";
import { ColorPalettePicker } from "@/components/ColorPalettePicker";
import { UiSelect } from "@/components/UiSelect";
import {
  DEFAULT_TEXT_LINE_HEIGHT,
  lineSpacingValue,
  TEXT_LINE_SPACING_OPTIONS
} from "@/editor/text";

function number(value: number | undefined, digits = 0) {
  return Number(value ?? 0).toFixed(digits);
}

export function InspectorContent({ onClose }: { onClose?: () => void }) {
  const editor = useEditor();
  const selected = editor.selection[0];
  if (!selected) return null;
  const isSvgPart = selected?.OpenSketchType === "svg-part";
  const parentAsset = isSvgPart ? svgPartParent(selected) : null;
  return (
    <div className="inspector-embedded">
      <div className="inspector-header">
        <h2>{selected.name ?? selected.type}</h2>
        <span>{editor.selection.length > 1 ? `${editor.selection.length} selected` : ""}</span>
        {onClose ? (
          <button className="panel-close-button" onClick={onClose} aria-label="Close properties">
            ×
          </button>
        ) : null}
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
        <ObjectInspector object={selected} />
      </div>
    </div>
  );
}

function ObjectInspector({ object }: { object: FabricObject }) {
  const editor = useEditor();
  const [aspectLocked, setAspectLocked] = useState(true);
  const [assetFamilies, setAssetFamilies] = useState<AssetFamily[] | null>(null);
  const objectType = object.OpenSketchType ?? "";
  const isText = object instanceof Text;
  const isLineLike = [
    "connector",
    "line",
    "curved-line",
    "arrow",
    "double-arrow",
    "curved-arrow"
  ].includes(objectType);
  const canEditLineCap =
    objectType === "line" ||
    objectType === "curved-line" ||
    (objectType === "connector" &&
      object.connector?.startArrowhead === "none" &&
      object.connector?.endArrowhead === "none");
  const lineCap: ConnectorLineCap = object.connector
    ? (object.connector.lineCap ??
      (object.connector.startArrowhead === "none" && object.connector.endArrowhead === "none"
        ? "round"
        : "butt"))
    : object instanceof FabricGroup
      ? object.getObjects()[0]?.strokeLineCap === "butt"
        ? "butt"
        : "round"
      : object.strokeLineCap === "butt"
        ? "butt"
        : "round";
  const isShape = objectType === "shape";
  const isSvgPart = objectType === "svg-part";
  useEffect(() => {
    if (!(object instanceof FabricGroup) || !object.familyId) {
      setAssetFamilies(null);
      return;
    }
    let active = true;
    void import("@/assets/manifest").then(({ assetManifest }) => {
      if (active) setAssetFamilies(assetManifest.families);
    });
    return () => {
      active = false;
    };
  }, [object]);
  const assetFamily =
    object instanceof FabricGroup && object.familyId
      ? assetFamilies?.find((family) => family.familyId === object.familyId)
      : undefined;
  const hasStoredVariants = Boolean(assetFamily && assetFamily.variants.length > 1);
  const canGroup = editor.selection.length > 1;
  const canUngroup = !canGroup && isManualGroup(object);
  const canAlign = editor.selection.length >= 2;
  const canDistribute = editor.selection.length >= 3;
  const width = (object.width ?? 0) * (object.scaleX ?? 1);
  const height = (object.height ?? 0) * (object.scaleY ?? 1);
  const transparencyControl = (
    <label className="inspector-value-range">
      <span>Transparency</span>
      <input
        className="compact-value"
        type="number"
        min="0"
        max="100"
        value={Math.round((1 - (object.opacity ?? 1)) * 100)}
        onChange={(event) => editor.setObject({ opacity: 1 - Number(event.target.value) / 100 })}
      />
      <input
        type="range"
        min="0"
        max="100"
        value={Math.round((1 - (object.opacity ?? 1)) * 100)}
        onChange={(event) => editor.setObject({ opacity: 1 - Number(event.target.value) / 100 })}
      />
    </label>
  );
  return (
    <>
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
      {assetFamily ? (
        hasStoredVariants && object.assetId ? (
          <InspectorSection title="Variant" open>
            <div className="asset-variants">
              <AssetVariantGrid
                family={assetFamily}
                value={object.assetId}
                onChange={(variantId) => {
                  void editor.setAssetVariant(variantId);
                }}
              />
            </div>
            {transparencyControl}
          </InspectorSection>
        ) : (
          <div className="inspector-section-body inspector-transparency-only">
            {transparencyControl}
          </div>
        )
      ) : null}
      {isLineLike ? (
        <InspectorSection title="Line" open>
          <div className="inspector-color-row color-field">
            <span>Color</span>
            <ColorPalettePicker
              ariaLabel="Line color"
              value={normalizeHex(typeof object.stroke === "string" ? object.stroke : "#232323")}
              onChange={(stroke) => editor.setObject({ stroke })}
            />
            <input
              value={normalizeHex(typeof object.stroke === "string" ? object.stroke : "#232323")}
              onChange={(event) => editor.setObject({ stroke: event.target.value })}
              aria-label="Line color value"
            />
          </div>
          <label className="inspector-value-range">
            <span>Width</span>
            <input
              className="compact-value"
              type="number"
              min="0.25"
              max="40"
              step="0.25"
              value={object.strokeWidth ?? 2}
              onChange={(event) => editor.setObject({ strokeWidth: Number(event.target.value) })}
            />
            <input
              type="range"
              min="0.25"
              max="20"
              step="0.25"
              value={object.strokeWidth ?? 2}
              onChange={(event) => editor.setObject({ strokeWidth: Number(event.target.value) })}
            />
          </label>
          <label className="inspector-value-range">
            <span>Dash</span>
            <input
              className="compact-value"
              type="number"
              min="0"
              max="40"
              value={object.strokeDashArray?.[0] ?? 0}
              onChange={(event) => {
                const dash = Number(event.target.value);
                editor.setObject({ strokeDashArray: dash > 0 ? [dash, dash] : null });
              }}
            />
            <input
              type="range"
              min="0"
              max="40"
              value={object.strokeDashArray?.[0] ?? 0}
              onChange={(event) => {
                const dash = Number(event.target.value);
                editor.setObject({ strokeDashArray: dash > 0 ? [dash, dash] : null });
              }}
            />
          </label>
          {canEditLineCap ? (
            <UiSelect
              className="field"
              label="Line ends"
              value={lineCap}
              options={[
                { value: "butt" as const, label: "Blunt" },
                { value: "round" as const, label: "Curved" }
              ]}
              onChange={(next) => {
                if (object.connector) editor.updateConnector({ lineCap: next });
                else editor.setObject({ strokeLineCap: next });
              }}
            />
          ) : null}
          {object.connector ? (
            <>
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
            </>
          ) : null}
          {transparencyControl}
        </InspectorSection>
      ) : isShape || isSvgPart ? (
        <InspectorSection title={isSvgPart ? "Part" : "Shape"} open>
          {typeof object.fill === "string" ? (
            <div className="inspector-color-row color-field">
              <span>Fill</span>
              <ColorPalettePicker
                ariaLabel="Fill color"
                value={normalizePaint(object.fill)}
                onChange={(fill) => editor.setObject({ fill })}
                allowTransparent={isShape}
              />
              <input
                value={normalizePaint(object.fill)}
                onChange={(event) => editor.setObject({ fill: event.target.value })}
                aria-label="Fill color value"
              />
            </div>
          ) : null}
          <div className="inspector-color-row color-field">
            <span>Stroke</span>
            <ColorPalettePicker
              ariaLabel="Stroke color"
              value={normalizePaint(typeof object.stroke === "string" ? object.stroke : "#13367a")}
              onChange={(stroke) => editor.setObject({ stroke })}
              allowTransparent={isShape}
            />
            <input
              value={normalizePaint(typeof object.stroke === "string" ? object.stroke : "#13367a")}
              onChange={(event) => editor.setObject({ stroke: event.target.value })}
              aria-label="Stroke color value"
            />
          </div>
          <label className="inspector-value-range">
            <span>Border width</span>
            <input
              className="compact-value"
              type="number"
              min="0"
              max="40"
              step="0.25"
              value={object.strokeWidth ?? 0}
              onChange={(event) => editor.setObject({ strokeWidth: Number(event.target.value) })}
            />
            <input
              type="range"
              min="0"
              max="20"
              step="0.25"
              value={object.strokeWidth ?? 0}
              onChange={(event) => editor.setObject({ strokeWidth: Number(event.target.value) })}
            />
          </label>
          <label className="inspector-value-range">
            <span>Border dash</span>
            <input
              className="compact-value"
              type="number"
              min="0"
              max="40"
              value={object.strokeDashArray?.[0] ?? 0}
              onChange={(event) => {
                const dash = Number(event.target.value);
                editor.setObject({ strokeDashArray: dash > 0 ? [dash, dash] : null });
              }}
            />
            <input
              type="range"
              min="0"
              max="40"
              value={object.strokeDashArray?.[0] ?? 0}
              onChange={(event) => {
                const dash = Number(event.target.value);
                editor.setObject({ strokeDashArray: dash > 0 ? [dash, dash] : null });
              }}
            />
          </label>
          {transparencyControl}
        </InspectorSection>
      ) : null}
      {object.connector ? (
        <InspectorSection title="Arrow" open>
          <button
            className="inspector-inline-action"
            onClick={() =>
              editor.updateConnector({
                startArrowhead: object.connector!.endArrowhead,
                endArrowhead: object.connector!.startArrowhead
              })
            }
          >
            <FlipHorizontal2 size={14} /> Flip start and end
          </button>
          <div className="field-row two">
            <ConnectorSelect
              label="Start head"
              value={object.connector.startArrowhead}
              values={["none", "triangle", "open", "circle", "open-circle", "bar", "neuron"]}
              onChange={(startArrowhead) => editor.updateConnector({ startArrowhead })}
            />
            <ConnectorSelect
              label="End head"
              value={object.connector.endArrowhead}
              values={["none", "triangle", "open", "circle", "open-circle", "bar", "neuron"]}
              onChange={(endArrowhead) => editor.updateConnector({ endArrowhead })}
            />
          </div>
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
          {(object.connector.routing ?? "direct") === "direct" ? (
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
          ) : null}
        </InspectorSection>
      ) : null}
      {isText && (
        <InspectorSection title="Text" open>
          {typeof object.fill === "string" ? (
            <div className="inspector-color-row color-field">
              <span>Color</span>
              <ColorPalettePicker
                ariaLabel="Text color"
                value={normalizeHex(object.fill)}
                onChange={(fill) => editor.setObject({ fill })}
              />
              <input
                value={normalizeHex(object.fill)}
                onChange={(event) => editor.setObject({ fill: event.target.value })}
                aria-label="Text color value"
              />
            </div>
          ) : null}
          {transparencyControl}
          <UiSelect
            className="field"
            label="Font"
            value={object.fontFamily}
            options={TEXT_FONT_FAMILIES.map((font) => ({ value: font, label: font }))}
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
          <UiSelect
            className="field"
            label="Line spacing"
            value={lineSpacingValue(object.lineHeight)}
            options={[
              ...TEXT_LINE_SPACING_OPTIONS,
              { value: "custom" as const, label: "Custom (fine tune below)" }
            ]}
            onChange={(lineHeight) => {
              if (lineHeight !== "custom") editor.setObject({ lineHeight });
            }}
          />
          <div className="field-row two">
            <NumberField
              label="Custom line height"
              value={object.lineHeight ?? DEFAULT_TEXT_LINE_HEIGHT}
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
      {!assetFamily && !isLineLike && !isShape && !isSvgPart && !isText ? (
        <div className="inspector-section-body inspector-transparency-only">
          {transparencyControl}
        </div>
      ) : null}
      {canAlign ? (
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
              disabled={!canDistribute}
              title={canDistribute ? undefined : "Select at least three objects"}
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
            <button
              onClick={() => editor.distribute("vertical")}
              aria-label="Distribute vertically"
              disabled={!canDistribute}
              title={canDistribute ? undefined : "Select at least three objects"}
            >
              <AlignVerticalDistributeCenter size={15} />
            </button>
          </div>
        </InspectorSection>
      ) : null}
      <InspectorSection title="Object actions">
        <div className="action-grid">
          <button onClick={() => void editor.duplicateSelection()}>
            <Copy size={15} /> Duplicate
          </button>
          {canGroup ? (
            <button onClick={editor.groupSelection}>
              <Group size={15} /> Group
            </button>
          ) : isSvgPart ? (
            <button onClick={editor.selectParentAsset}>
              <CornerUpLeft size={15} /> Done editing
            </button>
          ) : (
            <>
              {canUngroup ? (
                <button onClick={editor.ungroupSelection}>
                  <Ungroup size={15} /> Ungroup
                </button>
              ) : null}
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

export function LayersPanel() {
  const editor = useEditor();
  const [open, setOpen] = useState(false);
  const objects = [...(editor.canvas?.getObjects() ?? [])].reverse();
  return (
    <section className="layers-panel">
      <button className="layers-title" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>
          <ChevronRight size={15} />
          <Layers3 size={15} /> Layers
        </span>
        <small>{objects.length}</small>
      </button>
      <MotionCollapse open={open} className="layers-collapse">
        <div>
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
          {objects.length > 0 ? (
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
          ) : null}
        </div>
      </MotionCollapse>
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
      <button
        className="inspector-section-title"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        {title}
        <ChevronRight size={14} />
      </button>
      <MotionCollapse open={open}>
        <div className="inspector-section-body">{children}</div>
      </MotionCollapse>
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

function normalizeHex(value: string): string {
  const parsed = new Color(value);
  return parsed.isUnrecognised ? "#000000" : `#${parsed.toHex().toLowerCase()}`;
}

function normalizePaint(value: string): string {
  return value.trim().toLowerCase() === "transparent" ? "transparent" : normalizeHex(value);
}
