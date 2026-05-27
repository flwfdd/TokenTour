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

    let target: HTMLElement | null = null;
    if (hoverTokenIndex != null) {
      target = container.querySelector(`[data-pos="${hoverTokenIndex}"]`) as HTMLElement | null;
    } else if (hoverMessageId) {
      // Approximate position alignment: when the hover source supplied a
      // within-message fraction, scroll to the same fractional offset inside
      // this pane's tokens for the same message. Lets compare panes (where
      // absolute token indices differ across tokenizers / families) still
      // line up roughly to the same conceptual spot in the message.
      const els = container.querySelectorAll(
        `[data-msgid="${cssEscape(hoverMessageId)}"]`,
      );
      if (els.length === 0) {
        // Fall back to role/segment if the message isn't visible in this pane.
        if (hoverRole) {
          target = container.querySelector(`[data-seg="${cssEscape(hoverRole)}"]`) as HTMLElement | null;
        }
      } else if (hoverMessageFraction != null) {
        const i = Math.min(els.length - 1, Math.max(0, Math.round(hoverMessageFraction * (els.length - 1))));
        target = els[i] as HTMLElement;
      } else {
        target = els[0] as HTMLElement;
      }
    } else if (hoverRole) {
      target = container.querySelector(`[data-seg="${cssEscape(hoverRole)}"]`) as HTMLElement | null;
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
