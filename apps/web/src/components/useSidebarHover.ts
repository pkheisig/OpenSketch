import { useCallback, useEffect, useRef, useState } from "react";

const SIDEBAR_HOVER_LEAVE_DELAY_MS = 90;

export function useSidebarHover(collapsed: boolean) {
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const closeTimer = useRef<number | null>(null);

  const cancelClose = useCallback(() => {
    if (closeTimer.current === null) return;
    window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }, []);

  const show = useCallback(() => {
    if (!collapsed) return;
    cancelClose();
    setHoverExpanded(true);
  }, [cancelClose, collapsed]);

  const scheduleHide = useCallback(() => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null;
      setHoverExpanded(false);
    }, SIDEBAR_HOVER_LEAVE_DELAY_MS);
  }, [cancelClose]);

  const hideNow = useCallback(() => {
    cancelClose();
    setHoverExpanded(false);
  }, [cancelClose]);

  useEffect(() => cancelClose, [cancelClose]);

  return { hoverExpanded, show, scheduleHide, hideNow };
}
