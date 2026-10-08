import { deck } from "@kadal/deck/vite";
import { deckFreshFiles } from "@kadal/deck-fresh/build";
import { deckPreactFiles } from "@kadal/deck-preact/build";
import { deckQwikDefine, deckQwikFiles } from "@kadal/deck-qwik/build";
import { deckSolidFiles } from "@kadal/deck-solid/build";
import { deckSveltePlugin } from "@kadal/deck-svelte/build";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import solid from "vite-plugin-solid";
import { basename } from "node:path";
import { defineConfig } from "vite";

// The deck's slug is its folder name; the host serves the built deck at /<slug>/ and the same
// path is used in dev so links, the presenter window and the API behave identically.
const slug = basename(import.meta.dirname);

export default defineConfig({
  base: `/${slug}/`,
  // One pair per framework: the framework's own plugin, and the one that tells the deck whose
  // components it just compiled. `deckSveltePlugin` runs `enforce: "post"`, after svelte().
  plugins: [
    deck({ entry: "deck.mdx" }),
    // React and Solid both want .tsx and their JSX transforms are mutually unintelligible, so the
    // deck says which files are whose. One glob, given to both, so the filters cannot drift apart.
    react({
      exclude: [...deckSolidFiles, ...deckPreactFiles, ...deckQwikFiles, ...deckFreshFiles],
    }),
    solid({ include: [...deckSolidFiles] }),
    // Preact and Qwik need no plugin of their own: their files carry a @jsxImportSource pragma and
    // Vite's own esbuild honours it. All the deck has to do is keep React's plugin off them, above.
    // (Qwik's optimizer would be needed for component$; see packages/deck-qwik for why a slide
    // does not want it.)
    svelte({ compilerOptions: { runes: true } }),
    deckSveltePlugin(),
    tailwindcss(),
  ],
  server: {
    port: Number(process.env.PORT ?? 5300),
    // KADAL_DECK_API=http://localhost:8797 proxies /api to a host and switches the room on.
    proxy: process.env.KADAL_DECK_API
      ? { "/api": { target: process.env.KADAL_DECK_API, changeOrigin: true, ws: true } }
      : undefined,
  },
  // Qwik's runtime reads build-time constants its own plugin would substitute; without the
  // optimizer the deck supplies them, or the first render() throws before reaching the slide.
  define: {
    ...deckQwikDefine,
    ...(process.env.KADAL_DECK_API ? { "import.meta.env.VITE_KADAL_DECK_LIVE": JSON.stringify("1") } : {}),
  },
  build: { outDir: "dist", emptyOutDir: true },
});
