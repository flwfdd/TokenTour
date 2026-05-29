import { useEffect, type RefObject } from "react";
import { useConversation } from "./store";

/**
 * Scroll the first child element that matches the current hover (token /
 * message / role) into view, only when the user is NOT hovering inside this
 * same pane. This prevents the lens you're currently exploring from
 * auto-scrolling under the cursor and stealing the element you were aiming at.
 *
 * Children must carry one of these attributes:
 * - `data-pos="<number>"`   (token position; required for hoverTokenIndex match)
 * - `data-msgid="<id>"`    (message id; required for hoverMessageId match)
 * - `data-seg="<segment>"` (segment / role; required for hoverRole match)
 *
 * Priority: token > message > role.
 *
 * Uses native `scrollIntoView({ block: "nearest" })` so the browser scrolls
 * the nearest scrollable ancestor only when actually needed — the ref does
 * not have to be the scroll container.
 */
export function useScrollMatchIntoView({
  containerRef,
  paneId,
  enabled = true,
  hoverTokenIndex,
  hoverMessageId,
  hoverRole,
}: {
  containerRef: RefObject<HTMLElement | null>;
  /** Identifier of this pane; if equal to the active `hoverSource`, do not scroll. */
  paneId?: string;
  enabled?: boolean;
  hoverTokenIndex: number | null;
  hoverMessageId: string | null;
  hoverRole: string | null;
}) {
  const hoverSource = useConversation((s) => s.hoverSource);
  const hoverMessageFraction = useConversation((s) => s.hoverMessageFraction);

  useEffect(() => {
    if (!enabled) return;
    if (paneId && hoverSource === paneId) return;
    const container = containerRef.current;
    if (!container) return;

    // Pick the element at `frac` (0..1) across a node list, or the first one
    // when no fraction is supplied. Lets compare panes — whose absolute token
    // indices differ across tokenizers / families — line up to roughly the
    // same conceptual spot inside the same message *or* segment.
    const pick = (els: NodeListOf<Element>, frac: number | null): HTMLElement | null => {
      if (els.length === 0) return null;
      if (frac == null) return els[0] as HTMLElement;
      const i = Math.min(els.length - 1, Math.max(0, Math.round(frac * (els.length - 1))));
      return els[i] as HTMLElement;
    };

    let target: HTMLElement | null = null;
    if (hoverTokenIndex != null) {
      target = container.querySelector(`[data-pos="${hoverTokenIndex}"]`) as HTMLElement | null;
    } else if (hoverMessageId) {
      const els = container.querySelectorAll(`[data-msgid="${cssEscape(hoverMessageId)}"]`);
      // Fall back to role/segment if the message isn't visible in this pane.
      target =
        els.length === 0
          ? hoverRole
            ? pick(container.querySelectorAll(`[data-seg="${cssEscape(hoverRole)}"]`), hoverMessageFraction)
            : null
          : pick(els, hoverMessageFraction);
    } else if (hoverRole) {
      // Segment-only hover (tools_schema / generation / control / system
      // prefix — none carry a messageId). Align by the SAME within-segment
      // fraction so hovering deep inside a big tools-schema block no longer
      // snaps the other pane back to that block's start (the "鬼畜" jump).
      target = pick(
        container.querySelectorAll(`[data-seg="${cssEscape(hoverRole)}"]`),
        hoverMessageFraction,
      );
    }
    if (!target) return;

    // Center the matched element in its scrollable ancestor. We only get here
    // when the hover came from a *different* pane (the `hoverSource !== paneId`
    // guard above filters out self-hover), so centering won't yank the element
    // out from under the user's cursor.
    target.scrollIntoView({ block: "center", behavior: "smooth", inline: "nearest" });
  }, [
    enabled,
    paneId,
    hoverSource,
    hoverTokenIndex,
    hoverMessageId,
    hoverMessageFraction,
    hoverRole,
    containerRef,
  ]);
}

function cssEscape(s: string): string {
  if (typeof CSS !== "undefined" && (CSS as any).escape) return (CSS as any).escape(s);
  return s.replace(/["\\]/g, (m) => `\\${m}`);
}
