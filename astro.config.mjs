// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import node from "@astrojs/node";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
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
