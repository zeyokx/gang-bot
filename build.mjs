import { build } from "esbuild";
import { rm } from "fs/promises";

await rm("./dist", { recursive: true, force: true });

await build({
  entryPoints: ["src/index.ts"],
  platform: "node",
  bundle: true,
  format: "esm",
  outdir: "dist",
  outExtension: { ".js": ".mjs" },
  external: ["*.node", "bufferutil", "utf-8-validate"],
  sourcemap: "linked",
  banner: {
    js: `import { createRequire as __cr } from 'node:module';
import __path from 'node:path';
import __url from 'node:url';
globalThis.require = __cr(import.meta.url);
globalThis.__filename = __url.fileURLToPath(import.meta.url);
globalThis.__dirname = __path.dirname(globalThis.__filename);
`
  },
  logLevel: "info",
});
