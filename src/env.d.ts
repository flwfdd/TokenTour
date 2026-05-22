/// <reference path="../.astro/types.d.ts" />

declare module "*.jinja?raw" {
  const content: string;
  export default content;
}
