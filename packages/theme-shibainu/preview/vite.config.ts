import { deck } from "@kadal/deck/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({ plugins: [deck(), react()] });
