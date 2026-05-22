import type { APIRoute } from "astro";

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
    return ALLOWED_PROVIDERS.some((host) => url.hostname === host || url.hostname.endsWith("." + host));
  } catch {
    return false;
  }
}

export const POST: APIRoute = async ({ request }) => {
  const target = request.headers.get("x-llmvis-target");
  if (!target) {
    return new Response("missing x-llmvis-target", { status: 400 });
  }
  if (!isAllowed(target)) {
    return new Response("provider not in allow-list", { status: 403 });
  }

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("x-llmvis-target");

  const upstream = await fetch(target, {
    method: "POST",
    headers,
    body: await request.arrayBuffer(),
  });
  const respHeaders = new Headers(upstream.headers);
  respHeaders.delete("content-encoding");
  respHeaders.delete("content-length");
  return new Response(upstream.body, {
    status: upstream.status,
    headers: respHeaders,
  });
};
