import { defineConfig } from "tsdown";

/**
 * One CommonJS file for VS Code: the extension and everything it uses from @kadal/deck (the
 * authoring layer and the catalog) bundled in, `vscode` left to the editor. The .vsix then
 * carries no node_modules (`vsce package --no-dependencies`).
 */
export default defineConfig({
  entry: { extension: "src/extension.ts" },
  format: "cjs",
  platform: "node",
  target: "node20",
  outExtensions: () => ({ js: ".cjs" }),
  dts: false,
  clean: true,
  minify: true,
  sourcemap: false,
  deps: { neverBundle: ["vscode"], alwaysBundle: [/./] },
});
