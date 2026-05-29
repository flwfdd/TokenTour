import type { ReactNode } from "react";
import { useConversation } from "./store";

interface PaneProps {
  title: string;
  subtitle?: ReactNode;
  controls?: ReactNode;
  legend?: ReactNode;
  /** Always-visible bar pinned below the scroll area (e.g. token detail). */
  footer?: ReactNode;
  /**
   * If provided, this pane "owns" the hoverSource named `paneId` whenever the
   * cursor is anywhere inside the section. This is the single source of truth
   * for the "don't auto-scroll the pane I'm currently exploring" guard — having
   * Pane manage it (instead of children) avoids the bug where the listener was
   * on a padded inner element that didn't cover the scroll viewport edges, so
   * a fast cursor move could trigger a self-scroll before hoverSource updated.
   */
  paneId?: string;
  children: ReactNode;
  className?: string;
}

export default function Pane({
  title,
  subtitle,
  controls,
  legend,
  footer,
  paneId,
  children,
  className,
}: PaneProps) {
  const setHoverSource = useConversation((s) => s.setHoverSource);
  return (
    <section
      className={"pg-panel flex flex-col min-h-0 min-w-0 " + (className ?? "")}
      data-pane={title}
      onMouseEnter={paneId ? () => setHoverSource(paneId) : undefined}
      // Re-assert hoverSource on every move so we recover from races where
      // mouseEnter was skipped (e.g. cursor already inside the box on mount).
      onMouseMove={paneId ? () => setHoverSource(paneId) : undefined}
      onMouseLeave={paneId ? () => setHoverSource(null) : undefined}
    >
      <header className="pane-head flex items-center justify-between gap-2 px-3 py-1.5">
        <div className="flex items-baseline gap-2 min-w-0">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider truncate">
            {title}
          </h3>
          {subtitle && (
            <span className="text-[11px] text-(--color-muted) truncate">{subtitle}</span>
          )}
        </div>
        {controls && <div className="flex items-center gap-1.5 shrink-0">{controls}</div>}
      </header>
      {legend && (
        <div className="pane-head px-3 py-1 text-[10px]">
          {legend}
        </div>
      )}
      <div className="flex-1 min-h-0 min-w-0 overflow-auto">{children}</div>
      {footer && <div className="shrink-0">{footer}</div>}
    </section>
  );
}
