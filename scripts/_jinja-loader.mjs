/**
 * Node module loader hook: intercepts `*.jinja?raw` imports and turns them
 * into ES modules that export the file content as a string. Mirrors what
 * Vite's `?raw` suffix does, so tsx test scripts can import the same
 * `chatTemplates.ts` module the app uses without errors.
 *
 * Activate with: `node --import ./scripts/_jinja-loader.mjs script.mts`
 *           or:  `tsx --import ./scripts/_jinja-loader.mjs script.mts`
 */
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { register } from "node:module";

if (typeof register === "function") {
  register("./_jinja-loader.mjs", import.meta.url);
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.endsWith(".jinja?raw")) {
    const cleanSpec = specifier.slice(0, -"?raw".length);
    const resolved = await nextResolve(cleanSpec, context);
    return {
      url: resolved.url + "?raw",
      shortCircuit: true,
      format: "module",
    };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.endsWith(".jinja?raw")) {
    const filePath = fileURLToPath(url.slice(0, -"?raw".length));
    const content = readFileSync(filePath, "utf8");
    return {
      format: "module",
      source: `export default ${JSON.stringify(content)};`,
      shortCircuit: true,
    };
  }
  return nextLoad(url, context);
}
