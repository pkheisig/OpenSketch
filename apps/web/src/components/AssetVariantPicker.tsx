import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import type { AssetFamily } from "@workspace/editor-core";

export function AssetVariantPicker({
  family,
  value,
  onChange
}: {
  family: AssetFamily;
  value: string;
  onChange: (id: string) => void;
}) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{
    left: number;
    top: number;
    width: number;
    maxHeight: number;
    gridTemplateColumns: string;
  } | null>(null);
  const selectedIndex = Math.max(
    0,
    family.variants.findIndex((variant) => variant.id === value)
  );
  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const gap = 10;
    const edge = 16;
    const columns = family.variants.length > 6 ? 4 : 3;
    const targetWidth = columns === 4 ? 360 : 292;
    const width = Math.min(targetWidth, window.innerWidth - edge * 2);
    const rows = Math.ceil(family.variants.length / columns);
    const gridContentWidth = width - 14 - Math.max(0, columns - 1) * 6;
    const cardWidth = gridContentWidth / columns;
    const desiredHeight = rows * (cardWidth + 24) + Math.max(0, rows - 1) * 6 + 14;
    const availableBelow = window.innerHeight - rect.bottom - edge - gap;
    const availableAbove = rect.top - edge - gap;
    const openAbove = desiredHeight > availableBelow && availableAbove > availableBelow;
    const maxHeight = Math.max(
      120,
      Math.min(desiredHeight, openAbove ? availableAbove : availableBelow)
    );
    setPosition({
      left: Math.min(Math.max(edge, rect.left), window.innerWidth - width - edge),
      top: openAbove ? Math.max(edge, rect.top - maxHeight - gap) : rect.bottom + gap,
      width,
      maxHeight,
      gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`
    });
  }, [family.variants.length]);
  useLayoutEffect(() => {
    if (open) updatePosition();
  }, [open, updatePosition]);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const reposition = () => updatePosition();
    document.addEventListener("pointerdown", closeOutside);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, updatePosition]);
  return (
    <div className="asset-variant-picker">
      <button
        ref={triggerRef}
        type="button"
        className="asset-variant-trigger"
        role="combobox"
        aria-label={`${family.title} variant`}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={`${id}-variants`}
        onClick={() => setOpen((current) => !current)}
      >
        <span>Variant {selectedIndex + 1}</span>
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      {open &&
        position &&
        createPortal(
          <div
            ref={menuRef}
            id={`${id}-variants`}
            className="asset-variant-menu"
            role="listbox"
            aria-label={`${family.title} variants`}
            style={position}
            tabIndex={-1}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setOpen(false);
                triggerRef.current?.focus();
              }
            }}
          >
            {family.variants.map((variant, index) => (
              <button
                key={variant.id}
                type="button"
                className={variant.id === value ? "selected" : ""}
                role="option"
                aria-selected={variant.id === value}
                aria-label={`Select ${family.title} variant ${index + 1}`}
                onClick={() => {
                  onChange(variant.id);
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
              >
                <span className="asset-variant-preview">
                  <img src={variant.assetPath} alt="" loading="lazy" />
                  {variant.id === value && <Check size={14} aria-hidden="true" />}
                </span>
                <span>Variant {index + 1}</span>
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}
