---
"@kadal/deck": minor
---

The developer-talk code toolkit:

- **Notation marks.** `// [!code ++]`, `[!code --]`, `[!code highlight]`, `[!code focus]`, `[!code error]` / `[!code warning]` and `[!code word:x]` at the end of a line mark it, in light and dark, alongside click-stepped highlights. `deck({ shiki: { transformers } })` adds your own Shiki transformers, in the Vite plugin and in the browser compiler.
- **Code groups.** `::code-group` … `::` (or `<CodeGroup>`) turns titled fences into tabs with file-type badges, keyboard and screen-reader friendly; `{clicks:true}` turns tabs on clicks, `{print:'all'}` prints every tab.
- **Snippet imports.** `<<< @/snippets/x.ts#region {2|4} [x.ts]` puts a file, or one `#region` of it, on a slide; the file is watched in dev, and the hosted shell fetches it from beside deck.mdx.
- **TwoSlash.** ```` ```ts twoslash ```` shows type hovers (also by keyboard), compiler errors and `// ^?` queries, computed at build time (needs `typescript`); the hosted shell renders such blocks plain.
- **Monaco.** `{monaco}` editors, `{monaco-diff}` diffs, `{monaco-run}` with a Run button and the output on the slide (JavaScript and TypeScript in a Web Worker with a timeout, Python in Pyodide, any language through `registerCodeRunner` or `setup/code-runners.ts`), and `{monaco-write}` that saves edits back to the file in `kadal-deck dev`. Monaco is a lazy chunk, bundled (no CDN), never in the main bundle; print, export and the phone remote show the highlighted code and the run's output.
- `kadal-deck check` knows all of the above: missing snippet files and regions, unknown code options, a diff without its `~~~`, a run block with no runner.
- Fix: the pause curtain and the confetti layer no longer swallow pointer events over the whole slide.
