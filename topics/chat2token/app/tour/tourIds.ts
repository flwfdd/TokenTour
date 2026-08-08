/** Canonical `?tour=` values from blog Try-it CTAs. Invalid ids are ignored. */
export const TOUR_IDS = [
  /** Messages panel: View JSON → edit a message → notice downstream panes. */
  "messages",
  /** Chat Template: find pane → switch family → hover a fragment. */
  "chat-template",
  /** Tokens: find pane → switch tokenizer → hover a token chip. */
  "tokens",
  /** Context × KV Cache: three-color bar → edit early message → switch imaginary architecture. */
  "kv-cache",
] as const;

export type TourId = (typeof TOUR_IDS)[number];

export function isTourId(value: unknown): value is TourId {
  return typeof value === "string" && (TOUR_IDS as readonly string[]).includes(value);
}
