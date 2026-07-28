import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent
} from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";

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

interface ColorPalettePickerProps {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  disabled?: boolean;
  className?: string;
  showValue?: boolean;
}

export function ColorPalettePicker({
  value,
  onChange,
  ariaLabel,
  disabled = false,
  className = "",
  showValue = false
}: ColorPalettePickerProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({});
  const normalizedValue = normalizeHex(value);
  const [draft, setDraft] = useState(normalizedValue);

  useEffect(() => setDraft(normalizedValue), [normalizedValue]);

  useLayoutEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const trigger = triggerRef.current?.getBoundingClientRect();
      if (!trigger) return;
      const width = Math.min(312, window.innerWidth - 16);
      const left = Math.min(
        Math.max(8, trigger.left),
        Math.max(8, window.innerWidth - width - 8)
      );
      const roomBelow = window.innerHeight - trigger.bottom;
      setPosition({
        position: "fixed",
        width,
        left,
        top: roomBelow >= 340 ? trigger.bottom + 6 : undefined,
        bottom: roomBelow < 340 ? window.innerHeight - trigger.top + 6 : undefined
      });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

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
    onChange(color.toLowerCase());
    setDraft(color.toLowerCase());
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const applyDraft = () => {
    if (!/^#[0-9a-f]{6}$/i.test(draft.trim())) {
      setDraft(normalizedValue);
      return;
    }
    choose(draft.trim());
  };

  const onHexKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") applyDraft();
  };

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
        <span className="palette-color-current" style={{ backgroundColor: normalizedValue }} />
        {showValue ? <span className="palette-color-value">{normalizedValue}</span> : null}
      </button>
      {open
        ? createPortal(
            <div
              ref={popoverRef}
              className="color-palette-popover"
              style={position}
              role="dialog"
              aria-label={`${ariaLabel} palette`}
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
                <div className="standard-color-grid">
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
            </div>,
            document.body
          )
        : null}
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
      className={`color-palette-swatch ${selected ? "selected" : ""}`}
      style={{ backgroundColor: color }}
      aria-label={color}
      aria-pressed={selected}
      onClick={() => onChoose(color)}
    >
      {selected ? <Check size={12} /> : null}
    </button>
  );
}
