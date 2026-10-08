import { defineConfig } from "tsdown";

/**
 * The build every framework renderer shares: one ESM file + .d.ts per source module, every bare
 * import external (the deck's own bundler resolves the framework once), and `./build` kept apart
 * from the renderer so a Vite config can import it without loading the framework in Node.
 */
export function rendererConfig(extra: Record<string, string> = {}, withBuild = true) {
  return defineConfig({
    entry: { index: "src/index.ts", ...(withBuild ? { build: "src/build.ts" } : {}), ...extra },
    format: "esm",
    platform: "neutral",
    target: "es2023",
    unbundle: true,
    dts: true,
    clean: true,
    fixedExtension: false,
    deps: { neverBundle: [/^[^./]/] },
  });
}
