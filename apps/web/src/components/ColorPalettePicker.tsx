import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent
} from "react";
import { createPortal } from "react-dom";
import { Check, Pipette } from "lucide-react";
import { MotionPresence } from "@/components/MotionPresence";

const THEME_COLUMNS = [
  ["#ffffff", "#f2f2f2", "#d9d9d9", "#bfbfbf", "#7f7f7f", "#3f3f3f"],
  ["#000000", "#e6e6e6", "#b3b3b3", "#808080", "#4d4d4d", "#1a1a1a"],
  ["#e7e6e6", "#d0cece", "#aeabab", "#757171", "#3a3838", "#171616"],
  ["#17365d", "#d9e2f3", "#a9c2e5", "#5b9bd5", "#2f5597", "#203864"],
  ["#1f4e78", "#d9eaf7", "#9dc3e6", "#5b9bd5", "#2e75b6", "#1f4e78"],
  ["#ed7d31", "#fce4d6", "#f8cbad", "#f4b183", "#c65911", "#843c0c"],
  ["#1f7a3f", "#e2f0d9", "#a9d18e", "#70ad47", "#548235", "#375623"],
  ["#12a8d4", "#d9eaf7", "#9ddbf0", "#44b3d5", "#0070c0", "#005b96"],
  ["#a02b93", "#eadcf0", "#d5a6d1", "#c55ac3", "#843c7a", "#60205b"],
  ["#4ea72e", "#e2f0d9", "#b7df9c", "#70ad47", "#3b7d23", "#275317"]
] as const;

const STANDARD_COLORS = [
  "#c00000",
  "#ff0000",
  "#ffc000",
  "#ffff00",
  "#92d050",
  "#00b050",
  "#00b0f0",
  "#0070c0",
  "#002060",
  "#7030a0"
] as const;

const normalizeHex = (value: string) => {
  const normalized = value.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : "#000000";
};

type PickerTab = "palette" | "spectrum";
type SpectrumAxis = "saturation-value" | "hue";

interface HsvColor {
  hue: number;
  saturation: number;
  value: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function hexToHsv(value: string): HsvColor {
  const normalized = normalizeHex(value);
  const red = Number.parseInt(normalized.slice(1, 3), 16) / 255;
  const green = Number.parseInt(normalized.slice(3, 5), 16) / 255;
  const blue = Number.parseInt(normalized.slice(5, 7), 16) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;

  if (delta > 0) {
    if (max === red) hue = 60 * (((green - blue) / delta + (green < blue ? 6 : 0)) % 6);
    else if (max === green) hue = 60 * ((blue - red) / delta + 2);
    else hue = 60 * ((red - green) / delta + 4);
  }

  return {
    hue,
    saturation: max === 0 ? 0 : delta / max,
    value: max
  };
}

function hsvToHex({ hue, saturation, value }: HsvColor): string {
  const normalizedHue = ((hue % 360) + 360) % 360;
  const chroma = value * saturation;
  const segment = normalizedHue / 60;
  const second = chroma * (1 - Math.abs((segment % 2) - 1));
  const match = value - chroma;
  let red = 0;
  let green = 0;
  let blue = 0;

  if (segment < 1) [red, green] = [chroma, second];
  else if (segment < 2) [red, green] = [second, chroma];
  else if (segment < 3) [green, blue] = [chroma, second];
  else if (segment < 4) [green, blue] = [second, chroma];
  else if (segment < 5) [red, blue] = [second, chroma];
  else [red, blue] = [chroma, second];

  const channel = (value: number) =>
    Math.round((value + match) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(red)}${channel(green)}${channel(blue)}`;
}

interface EyeDropperResult {
  sRGBHex: string;
}

interface EyeDropperInstance {
  open(options?: { signal?: AbortSignal }): Promise<EyeDropperResult>;
}

type EyeDropperConstructor = new () => EyeDropperInstance;

function getEyeDropperConstructor(): EyeDropperConstructor | null {
  if (typeof window === "undefined") return null;
  const candidate = (window as Window & { EyeDropper?: unknown }).EyeDropper;
  return typeof candidate === "function" ? (candidate as EyeDropperConstructor) : null;
}

function isAbortError(reason: unknown): boolean {
  return (
    (typeof DOMException !== "undefined" &&
      reason instanceof DOMException &&
      reason.name === "AbortError") ||
    (reason instanceof Error && reason.name === "AbortError")
  );
}

interface ColorPalettePickerProps {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  allowTransparent?: boolean;
  disabled?: boolean;
  className?: string;
  showValue?: boolean;
}

export function ColorPalettePicker({
  value,
  onChange,
  ariaLabel,
  allowTransparent = false,
  disabled = false,
  className = "",
  showValue = false
}: ColorPalettePickerProps) {
  const pickerId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const screenPickerAbortRef = useRef<AbortController | null>(null);
  const spectrumRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const spectrumDragRef = useRef<SpectrumAxis | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({});
  const [screenPickError, setScreenPickError] = useState("");
  const [screenPicking, setScreenPicking] = useState(false);
  const [activeTab, setActiveTab] = useState<PickerTab>("palette");
  const normalizedValue =
    allowTransparent && value.trim().toLowerCase() === "transparent"
      ? "transparent"
      : normalizeHex(value);
  const initialHsv = hexToHsv(normalizedValue === "transparent" ? "#000000" : normalizedValue);
  const [draft, setDraft] = useState(
    normalizedValue === "transparent" ? "#000000" : normalizedValue
  );
  const [hsv, setHsv] = useState<HsvColor>(initialHsv);
  const hsvRef = useRef(initialHsv);
  const [spectrumDragging, setSpectrumDragging] = useState<SpectrumAxis | null>(null);

  useEffect(
    () => setDraft(normalizedValue === "transparent" ? "#000000" : normalizedValue),
    [normalizedValue]
  );

  useEffect(() => {
    const next = hexToHsv(normalizedValue === "transparent" ? "#000000" : normalizedValue);
    hsvRef.current = next;
    setHsv(next);
  }, [normalizedValue]);

  useEffect(
    () => () => {
      screenPickerAbortRef.current?.abort();
    },
    []
  );

  useLayoutEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const trigger = triggerRef.current?.getBoundingClientRect();
      if (!trigger) return;
      const width = Math.min(312, window.innerWidth - 16);
      const left = Math.min(Math.max(8, trigger.left), Math.max(8, window.innerWidth - width - 8));
      const roomBelow = window.innerHeight - trigger.bottom;
      const estimatedHeight = activeTab === "spectrum" ? 430 : 340;
      setPosition({
        position: "fixed",
        width,
        left,
        top: roomBelow >= estimatedHeight ? trigger.bottom + 6 : undefined,
        bottom: roomBelow < estimatedHeight ? window.innerHeight - trigger.top + 6 : undefined
      });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [activeTab, open]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const choose = (color: string) => {
    const nextColor = color.toLowerCase();
    const next = hexToHsv(nextColor === "transparent" ? "#000000" : nextColor);
    hsvRef.current = next;
    setHsv(next);
    onChange(nextColor);
    setDraft(nextColor);
    setScreenPickError("");
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const updateSpectrumValue = (next: HsvColor, commit: boolean) => {
    const nextColor = hsvToHex(next);
    hsvRef.current = next;
    setHsv(next);
    setDraft(nextColor);
    if (commit) choose(nextColor);
  };

  const updateSpectrumFromPoint = (
    axis: SpectrumAxis,
    clientX: number,
    clientY: number,
    commit: boolean
  ) => {
    const target = axis === "hue" ? hueRef.current : spectrumRef.current;
    if (!target) return;
    const bounds = target.getBoundingClientRect();
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
      if (commit) updateSpectrumValue(hsvRef.current, true);
      return;
    }
    const xRatio = clamp((clientX - bounds.left) / Math.max(bounds.width, 1), 0, 1);
    const yRatio = clamp((clientY - bounds.top) / Math.max(bounds.height, 1), 0, 1);
    const current = hsvRef.current;
    const next =
      axis === "hue"
        ? { ...current, hue: Math.min(359.999, yRatio * 360) }
        : { ...current, saturation: xRatio, value: 1 - yRatio };
    updateSpectrumValue(next, commit);
  };

  const beginSpectrumPointer = (axis: SpectrumAxis, event: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    spectrumDragRef.current = axis;
    setSpectrumDragging(axis);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    updateSpectrumFromPoint(axis, event.clientX, event.clientY, false);
  };

  const moveSpectrumPointer = (axis: SpectrumAxis, event: ReactPointerEvent<HTMLDivElement>) => {
    if (spectrumDragRef.current !== axis) return;
    updateSpectrumFromPoint(axis, event.clientX, event.clientY, false);
  };

  const endSpectrumPointer = (
    axis: SpectrumAxis,
    event: ReactPointerEvent<HTMLDivElement>,
    commit: boolean
  ) => {
    if (spectrumDragRef.current !== axis) return;
    if (commit) updateSpectrumFromPoint(axis, event.clientX, event.clientY, true);
    spectrumDragRef.current = null;
    setSpectrumDragging(null);
  };

  const onSpectrumKeyDown = (axis: SpectrumAxis, event: KeyboardEvent<HTMLDivElement>) => {
    const current = hsvRef.current;
    let next: HsvColor | null = null;
    if (axis === "hue") {
      if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
        next = { ...current, hue: Math.max(0, current.hue - 5) };
      } else if (event.key === "ArrowDown" || event.key === "ArrowRight") {
        next = { ...current, hue: Math.min(360, current.hue + 5) };
      } else if (event.key === "Home") next = { ...current, hue: 0 };
      else if (event.key === "End") next = { ...current, hue: 360 };
    } else if (event.key === "ArrowLeft") {
      next = { ...current, saturation: clamp(current.saturation - 0.02, 0, 1) };
    } else if (event.key === "ArrowRight") {
      next = { ...current, saturation: clamp(current.saturation + 0.02, 0, 1) };
    } else if (event.key === "ArrowUp") {
      next = { ...current, value: clamp(current.value + 0.02, 0, 1) };
    } else if (event.key === "ArrowDown") {
      next = { ...current, value: clamp(current.value - 0.02, 0, 1) };
    }

    if (next) {
      event.preventDefault();
      updateSpectrumValue(next, false);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(hsvToHex(current));
    }
  };

  const pickFromScreen = async () => {
    const EyeDropper = getEyeDropperConstructor();
    if (!EyeDropper) {
      setScreenPickError("Screen picking is unavailable in this browser.");
      return;
    }

    const controller = new AbortController();
    screenPickerAbortRef.current = controller;
    setScreenPickError("");
    setScreenPicking(true);
    setOpen(false);
    try {
      const result = await new EyeDropper().open({ signal: controller.signal });
      const pickedColor = result.sRGBHex.trim();
      if (/^#[0-9a-f]{6}$/i.test(pickedColor)) {
        choose(pickedColor);
      } else {
        setScreenPickError("That screen color could not be read.");
        setOpen(true);
      }
    } catch (reason) {
      if (!isAbortError(reason)) {
        setScreenPickError("Screen picking is unavailable in this browser.");
        setOpen(true);
      }
    } finally {
      if (screenPickerAbortRef.current === controller) screenPickerAbortRef.current = null;
      setScreenPicking(false);
    }
  };

  const applyDraft = () => {
    if (!/^#[0-9a-f]{6}$/i.test(draft.trim())) {
      setDraft(normalizedValue === "transparent" ? "#000000" : normalizedValue);
      return;
    }
    choose(draft.trim());
  };

  const onHexKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") applyDraft();
  };

  const spectrumColor = hsvToHex(hsv);
  const hueColor = hsvToHex({ hue: hsv.hue, saturation: 1, value: 1 });
  const paletteTabId = `${pickerId}-palette`;
  const spectrumTabId = `${pickerId}-spectrum`;

  return (
    <span className={`palette-color-picker ${className}`.trim()}>
      <button
        ref={triggerRef}
        type="button"
        className="palette-color-trigger"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <span
          className={`palette-color-current ${
            normalizedValue === "transparent" ? "transparent" : ""
          }`.trim()}
          style={
            normalizedValue === "transparent" ? undefined : { backgroundColor: normalizedValue }
          }
        />
        {showValue ? <span className="palette-color-value">{normalizedValue}</span> : null}
      </button>
      {createPortal(
        <MotionPresence open={open} exitMs={160}>
          <div
            ref={popoverRef}
            className="color-palette-popover"
            style={position}
            role="dialog"
            aria-label={`${ariaLabel} palette`}
          >
            <div
              className="color-palette-tabs"
              role="tablist"
              aria-label={`${ariaLabel} color modes`}
            >
              <button
                type="button"
                role="tab"
                id={`${paletteTabId}-tab`}
                aria-controls={paletteTabId}
                aria-selected={activeTab === "palette"}
                className={activeTab === "palette" ? "active" : ""}
                onClick={() => setActiveTab("palette")}
              >
                Palette
              </button>
              <button
                type="button"
                role="tab"
                id={`${spectrumTabId}-tab`}
                aria-controls={spectrumTabId}
                aria-selected={activeTab === "spectrum"}
                className={activeTab === "spectrum" ? "active" : ""}
                onClick={() => setActiveTab("spectrum")}
              >
                Spectrum
              </button>
            </div>
            {activeTab === "palette" ? (
              <div
                id={paletteTabId}
                className="color-palette-tab-panel"
                role="tabpanel"
                aria-labelledby={`${paletteTabId}-tab`}
              >
                <section>
                  <h3>Theme colors</h3>
                  <div className="theme-color-grid">
                    {THEME_COLUMNS.flatMap((column, columnIndex) =>
                      column.map((color, shadeIndex) => (
                        <ColorSwatch
                          key={`${columnIndex}-${shadeIndex}`}
                          color={color}
                          selected={color.toLowerCase() === normalizedValue}
                          onChoose={choose}
                        />
                      ))
                    )}
                  </div>
                </section>
                <section>
                  <h3>Standard colors</h3>
                  <div
                    className={`standard-color-grid ${
                      allowTransparent ? "with-transparent" : ""
                    }`.trim()}
                  >
                    {allowTransparent ? (
                      <ColorSwatch
                        color="transparent"
                        selected={normalizedValue === "transparent"}
                        onChoose={choose}
                      />
                    ) : null}
                    {STANDARD_COLORS.map((color) => (
                      <ColorSwatch
                        key={color}
                        color={color}
                        selected={color.toLowerCase() === normalizedValue}
                        onChoose={choose}
                      />
                    ))}
                  </div>
                </section>
              </div>
            ) : (
              <div
                id={spectrumTabId}
                className="color-palette-tab-panel spectrum-panel"
                role="tabpanel"
                aria-labelledby={`${spectrumTabId}-tab`}
              >
                <div className="spectrum-editor">
                  <div
                    ref={spectrumRef}
                    className={`spectrum-saturation-value ${
                      spectrumDragging === "saturation-value" ? "dragging" : ""
                    }`.trim()}
                    style={{ "--spectrum-hue": hueColor } as CSSProperties}
                    role="slider"
                    tabIndex={0}
                    aria-label={`${ariaLabel} saturation and brightness`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(hsv.saturation * 100)}
                    aria-valuetext={`Saturation ${Math.round(
                      hsv.saturation * 100
                    )}%, brightness ${Math.round(hsv.value * 100)}%`}
                    onPointerDown={(event) => beginSpectrumPointer("saturation-value", event)}
                    onPointerMove={(event) => moveSpectrumPointer("saturation-value", event)}
                    onPointerUp={(event) => endSpectrumPointer("saturation-value", event, true)}
                    onPointerCancel={(event) =>
                      endSpectrumPointer("saturation-value", event, false)
                    }
                    onKeyDown={(event) => onSpectrumKeyDown("saturation-value", event)}
                  >
                    <span
                      className="spectrum-picker-handle"
                      style={{
                        left: `${hsv.saturation * 100}%`,
                        top: `${(1 - hsv.value) * 100}%`
                      }}
                    />
                  </div>
                  <div
                    ref={hueRef}
                    className={`spectrum-hue-slider ${
                      spectrumDragging === "hue" ? "dragging" : ""
                    }`.trim()}
                    role="slider"
                    tabIndex={0}
                    aria-label={`${ariaLabel} hue`}
                    aria-valuemin={0}
                    aria-valuemax={360}
                    aria-valuenow={Math.round(hsv.hue)}
                    aria-valuetext={`Hue ${Math.round(hsv.hue)} degrees`}
                    onPointerDown={(event) => beginSpectrumPointer("hue", event)}
                    onPointerMove={(event) => moveSpectrumPointer("hue", event)}
                    onPointerUp={(event) => endSpectrumPointer("hue", event, true)}
                    onPointerCancel={(event) => endSpectrumPointer("hue", event, false)}
                    onKeyDown={(event) => onSpectrumKeyDown("hue", event)}
                  >
                    <span
                      className="spectrum-hue-handle"
                      style={{ top: `${(hsv.hue / 360) * 100}%` }}
                    />
                  </div>
                </div>
                <div className="spectrum-readout">
                  <span
                    className="spectrum-readout-swatch"
                    style={{ backgroundColor: spectrumColor }}
                  />
                  <span>
                    <strong>{spectrumColor}</strong>
                    <small>
                      H {Math.round(hsv.hue)}° · S {Math.round(hsv.saturation * 100)}% · V{" "}
                      {Math.round(hsv.value * 100)}%
                    </small>
                  </span>
                </div>
              </div>
            )}
            <div className="palette-screen-picker">
              <button
                type="button"
                className="palette-screen-picker-button"
                aria-label={`Pick ${ariaLabel.toLowerCase()} from screen`}
                disabled={disabled || screenPicking}
                title={
                  getEyeDropperConstructor()
                    ? "Pick a color from anywhere on screen"
                    : "Screen color picking is unavailable in this browser"
                }
                onClick={() => void pickFromScreen()}
              >
                <Pipette size={14} aria-hidden="true" />
                <span>{screenPicking ? "Click a color on screen…" : "Pick from screen"}</span>
              </button>
              {screenPickError ? (
                <p className="palette-screen-picker-status" role="status">
                  {screenPickError}
                </p>
              ) : null}
            </div>
            <label className="palette-hex-field">
              Custom
              <span>
                <input
                  value={draft}
                  aria-label={`${ariaLabel} hex value`}
                  spellCheck={false}
                  maxLength={7}
                  onChange={(event) => setDraft(event.target.value)}
                  onBlur={applyDraft}
                  onKeyDown={onHexKeyDown}
                />
                <button type="button" onClick={applyDraft}>
                  Apply
                </button>
              </span>
            </label>
          </div>
        </MotionPresence>,
        document.body
      )}
    </span>
  );
}

function ColorSwatch({
  color,
  selected,
  onChoose
}: {
  color: string;
  selected: boolean;
  onChoose: (color: string) => void;
}) {
  return (
    <button
      type="button"
      className={`color-palette-swatch ${color === "transparent" ? "transparent" : ""} ${
        selected ? "selected" : ""
      }`.trim()}
      style={color === "transparent" ? undefined : { backgroundColor: color }}
      aria-label={color === "transparent" ? "Transparent" : color}
      aria-pressed={selected}
      onClick={() => onChoose(color)}
    >
      {selected ? <Check size={12} /> : null}
    </button>
  );
}
