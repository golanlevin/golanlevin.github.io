import { createRequire } from "node:module";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const requireFromWeb = createRequire(new URL("../puppetry/web/package.json", import.meta.url));
const esbuild = requireFromWeb("esbuild");

const wasmGlue = path.join(here, "pkg", "arap2d.js");
const wasmBinary = path.join(here, "pkg", "arap2d_bg.wasm");
const bundledCore = path.join(here, "pkg", "arap-p5-core.bundle.js");
const outputJs = path.join(here, "arap-p5.js");
const outputWasm = path.join(here, "arap2d_bg.wasm");

await mkdir(path.join(here, "pkg"), { recursive: true });

await esbuild.build({
  entryPoints: [path.join(here, "src", "arap-p5-core.js")],
  bundle: true,
  format: "iife",
  globalName: "ArapP5",
  outfile: bundledCore,
  platform: "browser",
  target: ["es2020"],
  nodePaths: [path.join(here, "../puppetry/web/node_modules")],
});

const glue = await readFile(wasmGlue, "utf8");
const core = await readFile(bundledCore, "utf8");
const header = [
  "/*",
  " * ArapP5",
  " * p5.js wrapper for Kyle McDonald's clean-room ARAP 2D solver.",
  " * Load this file, serve arap2d_bg.wasm beside it, then use ArapP5.ArapShape.",
  " */",
  "",
].join("\n");

await writeFile(outputJs, `${header}${glue}\n\nglobalThis.wasm_bindgen = wasm_bindgen;\n\n${core}\n`, "utf8");
await copyFile(wasmBinary, outputWasm);
await rm(bundledCore, { force: true });

console.log(`Wrote ${path.relative(process.cwd(), outputJs)}`);
console.log(`Wrote ${path.relative(process.cwd(), outputWasm)}`);
