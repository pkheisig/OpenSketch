import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { MotionPresence } from "@/components/MotionPresence";

export interface UiSelectOption<T extends string | number> {
  value: T;
  label: string;
  disabled?: boolean;
}

interface UiSelectProps<T extends string | number> {
  value: T;
  options: readonly UiSelectOption<T>[];
  onChange: (value: T) => void;
  label?: string;
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
}

interface MenuPosition {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
}

export function UiSelect<T extends string | number>({
  value,
  options,
  onChange,
  label,
  ariaLabel,
  className = "",
  disabled = false
}: UiSelectProps<T>) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value)
  );
  const selected = options[selectedIndex];
  const enabledIndexes = useMemo(
    () =>
      options.map((option, index) => (!option.disabled ? index : -1)).filter((index) => index >= 0),
    [options]
  );

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewportGap = 8;
    const menuGap = 4;
    const availableBelow = window.innerHeight - rect.bottom - viewportGap - menuGap;
    const availableAbove = rect.top - viewportGap - menuGap;
    const desiredHeight = Math.min(options.length * 34 + 8, 280);
    const openAbove =
      availableBelow < Math.min(desiredHeight, 160) && availableAbove > availableBelow;
    const maxHeight = Math.max(
      80,
      Math.min(desiredHeight, openAbove ? availableAbove : availableBelow)
    );
    const width = Math.min(Math.max(rect.width, 148), window.innerWidth - viewportGap * 2);
    const left = Math.min(
      Math.max(viewportGap, rect.left),
      Math.max(viewportGap, window.innerWidth - width - viewportGap)
    );
    setPosition({
      left,
      top: openAbove
        ? Math.max(viewportGap, rect.top - maxHeight - menuGap)
        : rect.bottom + menuGap,
      width,
      maxHeight
    });
  }, [options.length]);

  const close = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const openMenu = (index = selectedIndex) => {
    if (disabled || options.length === 0) return;
    setActiveIndex(options[index]?.disabled ? (enabledIndexes[0] ?? 0) : index);
    setOpen(true);
  };

  const moveActive = (direction: 1 | -1) => {
    if (enabledIndexes.length === 0) return;
    const current = enabledIndexes.indexOf(activeIndex);
    const next =
      current < 0
        ? direction === 1
          ? 0
          : enabledIndexes.length - 1
        : (current + direction + enabledIndexes.length) % enabledIndexes.length;
    setActiveIndex(enabledIndexes[next]);
  };

  const selectActive = () => {
    const option = options[activeIndex];
    if (!option || option.disabled) return;
    onChange(option.value);
    close(true);
  };

  const focusAdjacentControl = (reverse: boolean) => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const root = trigger.closest('[role="dialog"]') ?? document;
    const controls = [
      ...root.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ].filter(
      (control) =>
        !control.closest(".ui-select-menu") &&
        control.getAttribute("aria-hidden") !== "true" &&
        control.getClientRects().length > 0
    );
    const index = controls.indexOf(trigger);
    const nextIndex =
      index < 0 ? 0 : (index + (reverse ? -1 : 1) + controls.length) % Math.max(controls.length, 1);
    const next = controls[nextIndex];
    setOpen(false);
    requestAnimationFrame(() => next?.focus());
  };

  useLayoutEffect(() => {
    if (open) updatePosition();
  }, [open, updatePosition]);

  const menuVisible = open && position !== null;
  useLayoutEffect(() => {
    if (menuVisible) menuRef.current?.focus();
  }, [menuVisible]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target))
        setOpen(false);
    };
    const handlePositionChange = () => updatePosition();
    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("resize", handlePositionChange);
    window.addEventListener("scroll", handlePositionChange, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("resize", handlePositionChange);
      window.removeEventListener("scroll", handlePositionChange, true);
    };
  }, [open, updatePosition]);

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openMenu(event.key === "ArrowUp" ? (enabledIndexes.at(-1) ?? selectedIndex) : selectedIndex);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      openMenu(
        event.key === "Home"
          ? (enabledIndexes[0] ?? selectedIndex)
          : (enabledIndexes.at(-1) ?? selectedIndex)
      );
    }
  };

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const handledKeys = ["ArrowDown", "ArrowUp", "Home", "End", "Enter", " ", "Escape", "Tab"];
    if (handledKeys.includes(event.key)) {
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation();
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setActiveIndex(
        event.key === "Home" ? (enabledIndexes[0] ?? 0) : (enabledIndexes.at(-1) ?? 0)
      );
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectActive();
    } else if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    } else if (event.key === "Tab") {
      event.preventDefault();
      focusAdjacentControl(event.shiftKey);
    } else if (event.key.length === 1) {
      const search = event.key.toLocaleLowerCase();
      const match = options.findIndex(
        (option, index) =>
          !option.disabled &&
          index !== activeIndex &&
          option.label.toLocaleLowerCase().startsWith(search)
      );
      if (match >= 0) setActiveIndex(match);
    }
  };

  return (
    <div className={`ui-select ${className}`.trim()}>
      {label && <span className="ui-select-label">{label}</span>}
      <button
        ref={triggerRef}
        type="button"
        className="ui-select-trigger"
        role="combobox"
        aria-label={ariaLabel ?? label}
        aria-controls={`${id}-listbox`}
        aria-expanded={open}
        aria-haspopup="listbox"
        data-value={String(value)}
        disabled={disabled}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="ui-select-value">{selected?.label ?? String(value)}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {position &&
        createPortal(
          <MotionPresence open={open} exitMs={160}>
            <div
              ref={menuRef}
              id={`${id}-listbox`}
              className="ui-select-menu"
              role="listbox"
              aria-label={ariaLabel ?? label}
              aria-activedescendant={`${id}-option-${activeIndex}`}
              tabIndex={-1}
              style={{
                left: position.left,
                top: position.top,
                width: position.width,
                maxHeight: position.maxHeight
              }}
              onKeyDown={handleMenuKeyDown}
            >
              {options.map((option, index) => (
                <button
                  key={String(option.value)}
                  id={`${id}-option-${index}`}
                  type="button"
                  className={index === activeIndex ? "active" : ""}
                  role="option"
                  aria-selected={option.value === value}
                  disabled={option.disabled}
                  onPointerMove={() => !option.disabled && setActiveIndex(index)}
                  onClick={() => {
                    onChange(option.value);
                    close(true);
                  }}
                >
                  <span>{option.label}</span>
                  {option.value === value && <Check size={14} aria-hidden="true" />}
                </button>
              ))}
            </div>
          </MotionPresence>,
          document.body
        )}
    </div>
  );
}
