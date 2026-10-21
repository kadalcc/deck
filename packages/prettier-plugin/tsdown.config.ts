import { defineConfig } from "tsdown";

/** One ESM file per module, every bare import external: Prettier and the remark parsers resolve once. */
export default defineConfig({
  entry: { index: "src/index.ts" },
  format: "esm",
  platform: "node",
  target: "es2023",
  unbundle: true,
  dts: true,
  clean: true,
  fixedExtension: false,
  deps: { neverBundle: [/^[^./]/] },
});
