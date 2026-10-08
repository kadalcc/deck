import { defineConfig } from "tsdown";

/**
 * One file in dist/ per file in src/ (unbundled), so lazy `import()`s stay lazy for the deck's
 * own bundler, and every bare import stays external — the consumer's Vite resolves React,
 * Excalidraw, Shiki and the rest exactly once. The stylesheets ship as written (copied).
 */
export default defineConfig({
  entry: {
    index: "src/index.ts",
    "vite/index": "src/vite/index.ts",
    "compiler/index": "src/compiler/index.ts",
    "live/index": "src/live/index.ts",
    "live/protocol": "src/live/protocol.ts",
    "presenter/index": "src/presenter/index.tsx",
    "audience/index": "src/audience/index.tsx",
    "backgrounds/index": "src/backgrounds/index.tsx",
    "renderers/index": "src/renderers/index.ts",
    "renderers/contract": "src/renderers/contract.ts",
    "sketch/index": "src/sketch/index.ts",
    "export/index": "src/export/index.ts",
    "cli/index": "src/cli/index.ts",
  },
  format: "esm",
  platform: "neutral",
  target: "es2023",
  unbundle: true,
  dts: true,
  clean: true,
  fixedExtension: false,
  deps: { neverBundle: [/^[^./]/] },
  copy: [{ from: "src/themes", to: "dist" }],
});
