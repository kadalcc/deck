import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { deck, deckPackages } from "@kadal/deck/vite";
import { defineConfig } from "vite";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
  version: string;
};

// Served from wherever the deck lives (/@you/talk/), so every URL is relative. The deck() plugin
// is here only for its Excalidraw fonts copy: the shell never imports virtual:deck.
//
// deckPackages() generates `virtual:kadal-packages` (imported by src/main.tsx): every first-party
// theme and addon in packages/theme-* and packages/addon-*, registered with the in-browser
// compiler behind a lazy import. A new theme package is in the next shell build, no edit here.
// KADAL_SHELL_PACKAGES (folders, comma-separated) adds more, for trying a theme in the shell.
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: "./",
  plugins: [
    deck({ entry: "__none__.mdx" }),
    deckPackages({
      dirs: [fileURLToPath(new URL("..", import.meta.url))],
      match: /^(theme|addon)-/,
      packages: (process.env.KADAL_SHELL_PACKAGES ?? "").split(",").filter(Boolean),
    }),
  ],
  define: { __KADAL_DECK_VERSION__: JSON.stringify(pkg.version) },
  build: {
    outDir: process.env.KADAL_SHELL_OUT_DIR ?? "dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000,
  },
  logLevel: "warn",
});
