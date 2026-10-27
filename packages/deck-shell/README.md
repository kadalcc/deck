# @kadal/deck-shell

> **Build it. Rehearse it. Own the room.** [Kadal Deck](https://deck.kadal.cc) has your back for the whole talk, from the first idea to the last applause. This page shows a deck straight from its `deck.mdx`, compiled in the browser: it is how the builder on deck.kadal.cc previews your slides while you write them.
>
> [Take the tour](https://decks.kadal.cc/@kadal-hq/tour/) · [Docs](https://deck.kadal.cc/docs/)

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
- In `?preview` the shell can also edit in place: after `{type:"edit", on:true}` a click reports
  `located` (where it is in the source) and a double-click lets a heading, paragraph, list item or
  table cell be retyped, reported as `edited` with the file's `from`–`to` offsets, `before` and
  `after`. The shell never changes the deck: apply the edit and post `source` again. Shells that
  can do this say `features: ["edit"]` in `ready`.
- `{type:"chrome", on:false}` hides the deck's own chrome in the preview (the arrows pill, progress
  bar, slide number, theme button) for an editor whose stage has its own; the watermark and ads
  stay. On by default; shells that take it say `"chrome"` in `ready.features`.

Slides compiled this way cannot `import`: they use the engine's components.

**Not on npm yet** (`"private": true`): a new @kadal package needs the one-time npm bootstrap
(stage a placeholder, add the trusted publisher, publish). Hosts build it from this repo
(`bun run build` here → `dist/`) until then; remove `private` once bootstrapped.

## Licence

AGPL-3.0-or-later, like the engine. See
[LICENSING.md](https://github.com/kadalcc/deck/blob/main/LICENSING.md).
