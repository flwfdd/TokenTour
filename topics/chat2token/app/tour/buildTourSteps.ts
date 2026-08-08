import type { DriveStep } from "driver.js";
import type { Lang } from "../locale";
import type { TourId } from "./tourIds";
import { tourCopy } from "./tourCopy";

// Stable selectors — do not rename casually (blog tours depend on them):
// data-tour: view-json | messages-list | message-card | template-family | tokenizer | kv-states | kv-model
// data-pane: "Chat Template" | "Tokens" | "Context × KV Cache"
// Keep step arrays in sync with tourCopy[lang][id].steps length.

function step(
  element: string | undefined,
  copy: { title: string; description: string },
  extra: Partial<DriveStep> = {},
): DriveStep {
  return {
    element,
    popover: {
      title: copy.title,
      description: copy.description,
      side: "bottom",
      align: "start",
    },
    ...extra,
  };
}

export function buildTourSteps(tourId: TourId, lang: Lang): DriveStep[] {
  const c = tourCopy[lang][tourId].steps;

  switch (tourId) {
    case "messages":
      return [
        step('[data-tour="messages-list"]', c[0]!),
        step('[data-tour="view-json"]', c[1]!, {
          // Let the user click through; do not block the control.
          disableActiveInteraction: false,
        }),
        step('[data-tour="message-card"]', c[2]!),
      ];
    case "chat-template":
      return [
        step('[data-pane="Chat Template"]', c[0]!),
        step('[data-tour="template-family"]', c[1]!, {
          disableActiveInteraction: false,
        }),
        step('[data-pane="Chat Template"]', c[2]!),
      ];
    case "tokens":
      return [
        step('[data-pane="Tokens"]', c[0]!),
        step('[data-tour="tokenizer"]', c[1]!, {
          disableActiveInteraction: false,
        }),
        step('[data-pane="Tokens"]', c[2]!),
      ];
    case "kv-cache":
      return [
        step('[data-pane="Context × KV Cache"]', c[0]!),
        step('[data-tour="kv-states"]', c[1]!),
        step('[data-tour="message-card"]', c[2]!, {
          disableActiveInteraction: false,
        }),
        step('[data-tour="kv-model"]', c[3]!, {
          disableActiveInteraction: false,
        }),
      ];
  }
}
