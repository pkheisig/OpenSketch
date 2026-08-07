import {
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode
} from "react";

type PresenceProps = {
  className?: string;
  "aria-hidden"?: boolean;
  inert?: boolean;
  style?: CSSProperties;
};

export function MotionPresence({
  open,
  children,
  exitMs = 180
}: {
  open: boolean;
  children: ReactNode;
  exitMs?: number;
}) {
  const lastChild = useRef<ReactElement | null>(null);
  if (isValidElement(children)) lastChild.current = children;
  const [present, setPresent] = useState(open);

  useEffect(() => {
    if (open) {
      setPresent(true);
      return;
    }
    if (!present) return;
    const timer = window.setTimeout(() => setPresent(false), exitMs);
    return () => window.clearTimeout(timer);
  }, [exitMs, open, present]);

  if (!open && !present) return null;
  const child = open && isValidElement(children) ? children : lastChild.current;
  if (!child) return null;
  const typedChild = child as ReactElement<PresenceProps>;
  const className =
    typeof typedChild.props.className === "string" ? typedChild.props.className : "";
  return cloneElement(typedChild, {
    className: `${className} ${open ? "motion-presence-open" : "motion-presence-closing"}`.trim(),
    "aria-hidden": open ? typedChild.props["aria-hidden"] : true,
    inert: open ? typedChild.props.inert : true,
    style: {
      ...typedChild.props.style,
      "--motion-presence-exit": `${exitMs}ms`
    } as CSSProperties
  });
}
