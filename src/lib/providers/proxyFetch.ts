/**
 * When `routeThroughProxy` is enabled on a `ChatRequest`, the browser cannot
 * talk to the upstream provider directly (CORS-restricted endpoints like
 * Anthropic or some self-hosted vLLM). Instead we POST to our own
 * `/api/proxy` endpoint and pass the real upstream URL via the
 * `x-tokentour-target` header. The Cloudflare Worker (or Node dev server)
 * forwards the body verbatim and streams the upstream response back.
 *
 * Use this helper from every provider so we don't duplicate the rewrite
 * logic — call sites compute the *real* upstream URL as if calling the
 * provider directly, then pass it through `chatFetch`.
 */
export async function chatFetch(
  upstreamUrl: string,
  init: RequestInit,
  routeThroughProxy: boolean,
): Promise<Response> {
  if (!routeThroughProxy) return fetch(upstreamUrl, init);
  const headers = new Headers(init.headers);
  headers.set("x-tokentour-target", upstreamUrl);
  return fetch("/api/proxy", { ...init, headers });
}
