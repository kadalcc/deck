# @kadal/deck-shell

One static page that runs any [Kadal Deck](https://deck.kadal.cc) presentation from its
`deck.mdx`, compiled in the browser by `@kadal/deck/runtime`. For hosts and editors; decks built
with `kadal-deck build` do not need it.

[Self-hosting](https://deck.kadal.cc/docs/self-hosting/) · [Docs](https://deck.kadal.cc/docs/) · [Source](https://github.com/kadalcc/deck/tree/main/packages/deck-shell)

Serve `dist/` with a deck's `deck.mdx` (and any files
it includes) beside it, under any path:

```
/@you/talk/index.html      ← dist/index.html
/@you/talk/assets/…        ← dist/assets/…
/@you/talk/deck.mdx        ← the deck
```

- `/presenter`, `/join`, `/notes` and `/stats` under the same path serve the same `index.html`.
- A host can inject `window.__KADAL_DECK__ = { api, room, base, files }` into `index.html` to
  turn the live room on, fix the base path, and list the files to fetch beside `deck.mdx`.
- `?preview` makes it an editor's iframe: it waits for the parent to post the deck's text and
  answers with diagnostics, the outline and the viewer's position (see `@kadal/deck/runtime`'s
  `ToPreview` / `FromPreview`).

Slides compiled this way cannot `import`: they use the engine's components.

**Not on npm yet** (`"private": true`): a new @kadal package needs the one-time npm bootstrap
(stage a placeholder, add the trusted publisher, publish). Hosts build it from this repo
(`bun run build` here → `dist/`) until then; remove `private` once bootstrapped.

## Licence

AGPL-3.0-or-later, like the engine. See
[LICENSING.md](https://github.com/kadalcc/deck/blob/main/LICENSING.md).
