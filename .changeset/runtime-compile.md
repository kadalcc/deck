---
"@kadal/deck": minor
"@kadal/deck-shell": minor
---

Decks without a build. `@kadal/deck/runtime` compiles a deck from its text in the browser —
the same remark/rehype passes, Shiki highlighting, notes, magic move and glossary as the Vite
plugin (both now share `compiler/pipeline.ts`) — and returns diagnostics with lines instead of
throwing. The new `@kadal/deck-shell` package is one prebuilt static page that runs any
`deck.mdx` served beside it, under any path; with `?preview` it is an editor's live iframe,
speaking a small `postMessage` protocol (source in; diagnostics, outline, position, command
results and picked points out). `<Deck base>` sets the URL root explicitly. Slides compiled
this way use the engine's components and cannot `import`.
