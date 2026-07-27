import { useEffect, useRef } from "react";

const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useModalDialog(open: boolean, onClose: () => void) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const restoreVisibleFocus = previous?.matches(":focus-visible") ?? false;
    const focusable = () => [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)];
    (focusable()[0] ?? dialog).focus();
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = items[0];
      const last = items.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", keyDown);
    return () => {
      document.removeEventListener("keydown", keyDown);
      previous?.focus({ preventScroll: true });
      if (previous && !restoreVisibleFocus && document.activeElement === previous) {
        previous.blur();
      }
    };
  }, [open]);

  return dialogRef;
}
