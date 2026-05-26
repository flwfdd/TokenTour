import type { APIRoute } from "astro";

// Must NOT be statically prerendered: this is a runtime forwarder.
export const prerender = false;

const ALLOWED_PROVIDERS = [
  "api.openai.com",
  "api.anthropic.com",
  "api.deepseek.com",
  "api.siliconflow.cn",
  "dashscope.aliyuncs.com",
  "openrouter.ai",
];

function isAllowed(target: string): boolean {
  try {
    const url = new URL(target);
    return ALLOWED_PROVIDERS.some(
      (host) => url.hostname === host || url.hostname.endsWith("." + host),
    );
  } catch {
    return false;
  }
}

/**
 * Generic BYOK forwarder. The client (see `src/lib/providers/proxyFetch.ts`)
 * supplies the real upstream URL via the `x-tokentour-target` header so we
 * don't bake provider routes into the worker. The Authorization / x-api-key
 * headers travel through untouched.
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
  if (!isAllowed(target)) {
    return new Response("provider not in allow-list", { status: 403 });
  }

  const headers = new Headers(request.headers);
  // Strip hop-by-hop / routing metadata before forwarding upstream.
  headers.delete("host");
  headers.delete("x-tokentour-target");
  headers.delete("cf-connecting-ip");
  headers.delete("cf-ray");
  headers.delete("cf-visitor");

  const upstream = await fetch(target, {
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
