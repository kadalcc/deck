import { deck } from "@kadal/deck/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/",
  plugins: [deck({ entry: "deck.mdx" }), react()],
  build: { outDir: "dist", emptyOutDir: true },
});
