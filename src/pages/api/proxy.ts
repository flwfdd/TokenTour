import type { APIRoute } from "astro";

// Cloudflare builds keep this as a runtime forwarder. Static GitHub Pages
// mirrors prerender a tiny placeholder because there is no Worker runtime.
export const prerender = process.env.TOKENTOUR_STATIC === "1";

function parseTarget(target: string): URL | null {
  try {
    const url = new URL(target);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

/**
 * Generic BYOK forwarder. The client (see `topics/chat2token/app/lib/providers/proxyFetch.ts`)
 * supplies the real upstream URL via the `x-tokentour-target` header so custom
 * OpenAI-compatible providers can be used without baking provider routes into
 * the worker. The Authorization / x-api-key headers travel through untouched.
 *
 * Runs identically under `@astrojs/node` (dev) and `@astrojs/cloudflare`
 * (deploy) because we only use standard Web `fetch` / `Request` /
 * `Response`.
 */
export const POST: APIRoute = async ({ request }) => {
  const target = request.headers.get("x-tokentour-target");
  if (!target) {
    return new Response("missing x-tokentour-target", { status: 400 });
  }
  const targetUrl = parseTarget(target);
  if (!targetUrl) {
    return new Response("target must be an http(s) URL", { status: 400 });
  }

  const headers = new Headers(request.headers);
  // Strip hop-by-hop / routing metadata before forwarding upstream.
  headers.delete("host");
  headers.delete("x-tokentour-target");
  headers.delete("cf-connecting-ip");
  headers.delete("cf-ray");
  headers.delete("cf-visitor");

  const upstream = await fetch(targetUrl.href, {
    method: "POST",
    headers,
    body: request.body,
    // @ts-expect-error — `duplex: 'half'` is required by Node 18+ / Workers
    //                    when forwarding a streaming Request body.
    duplex: "half",
  });

  const respHeaders = new Headers(upstream.headers);
  respHeaders.delete("content-encoding");
  respHeaders.delete("content-length");
  return new Response(upstream.body, {
    status: upstream.status,
    headers: respHeaders,
  });
};

export const GET: APIRoute = async () =>
  new Response("TokenTour static mirror: /api/proxy is unavailable.", { status: 404 });
