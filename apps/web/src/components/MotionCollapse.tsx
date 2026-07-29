import type { ReactNode } from "react";

export function MotionCollapse({
  open,
  children,
  className = ""
}: {
  open: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`motion-collapse ${open ? "open" : ""} ${className}`.trim()}
      aria-hidden={!open}
      inert={open ? undefined : true}
    >
      <div className="motion-collapse-inner">{children}</div>
    </div>
  );
}
