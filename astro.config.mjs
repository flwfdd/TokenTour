// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import cloudflare from "@astrojs/cloudflare";
import tailwindcss from "@tailwindcss/vite";

// We ship one static page (`src/pages/index.astro`, explicitly prerendered)
// plus one Worker-rendered endpoint (`src/pages/api/proxy.ts`). The
// Cloudflare adapter writes prerendered pages to `dist/` as static assets
// and the SSR entry to `dist/_worker.js/`; Wrangler picks both up via the
// config in `wrangler.jsonc`.
export default defineConfig({
  output: "server",
  adapter: cloudflare({
    // `nodejs_compat` is set in wrangler.jsonc — needed for a few transitive
    // dependencies (`@huggingface/jinja` etc.) that touch `node:*` APIs at
    // module load time even though our own code is platform-neutral.
    //
    // `platformProxy` is intentionally left off: it spins up a Wrangler dev
    // proxy during `astro dev` to expose CF bindings via `Astro.locals`,
    // but TokenTour doesn't use any (KV / D1 / R2 / etc.), and enabling it
    // makes the build fail when `wrangler.jsonc`'s `main` path doesn't yet
    // exist on a clean checkout.
  }),
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      // Pulled in by the client-side tokenizer loader; keep it out of the
      // dev pre-bundle to avoid bundling its heavy ONNX backend.
      exclude: ["@huggingface/transformers"],
    },
    ssr: {
      noExternal: ["@huggingface/jinja"],
    },
  },
  server: {
    port: 4321,
    host: true,
  },
});
