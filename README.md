# Kadal Deck

**Presentations written in MDX.** Every reveal.js and Slidev feature, a live room so your audience
can follow, react, ask and vote from their phones, interactive islands in any framework, and
export to PDF, PNG and PPTX. Write the talk in the editor you already use; present it in a browser.

[Docs](https://deck.kadal.cc/docs/) · [Hosted Kadal Deck](https://deck.kadal.cc) · [Pricing](https://deck.kadal.cc/pricing/)

## Thirty seconds

```sh
npm create @kadal/deck@latest my-talk
cd my-talk && npm install
npm run dev                 # edit deck.mdx; the page reloads as you type
```

```mdx
# Hello, room

<Clicks>

- Slides split at `---`, vertical ones at `----`
- Code steps line by line, notes follow your clicks

</Clicks>

---

<Poll id="lunch" question="Lunch?" options={["Dosa", "Biryani", "Both"]} />
```

Publish it with a live room: `npx kadal-deck login && npx kadal-deck publish`. Or
`npx kadal-deck build` and put `dist/` on any static host.

## What's in it

- **Authoring** — MDX with clicks, stepping code (Shiki), magic move, KaTeX, Mermaid,
  hand-drawn Excalidraw sketches written in code, glossary term cards, layouts and slots,
  backgrounds (aurora, starfield, a globe…), transitions, auto-animate and motion.
- **Presenting** — presenter view with notes that follow clicks, timer and next slide; a
  frameless share window; overview, search, jump-to, zoom, drawing, blackout; vim keys and
  Vimium-style hints; the same slide at any window size.
- **The live room** — the audience follows on their phones (or roams and catches up with one
  button), reacts, asks and upvotes questions, answers polls, word clouds and timed quizzes.
- **Islands** — components from any framework on a slide, each runtime loaded only when its slide
  appears.
- **Export** — PDF, PNG and PPTX from the same slides (`kadal-deck export`).

## Islands, in any framework

| framework | package | | framework | package |
| --- | --- | --- | --- | --- |
| React | built in | | Qwik | `@kadal/deck-qwik` |
| Web components | built in | | Angular | `@kadal/deck-angular` |
| Vue | `@kadal/deck-vue` | | Fresh | `@kadal/deck-fresh` |
| Svelte | `@kadal/deck-svelte` | | WebAssembly / Rust (Leptos, …) | `@kadal/deck-wasm` |
| Solid | `@kadal/deck-solid` | | Python (Pyodide) | `@kadal/deck-python` |
| Preact | `@kadal/deck-preact` | | | |

`examples/showcase` runs all eleven on one slide.

## Packages

| package | |
| --- | --- |
| [`@kadal/deck`](packages/deck) | the engine: compiler + Vite plugin, React runtime, components, themes, live client, export, and the `kadal-deck` CLI |
| [`@kadal/create-deck`](packages/create-deck) | `npm create @kadal/deck@latest` |
| `@kadal/deck-*` | the framework renderers above |

## Self-hosted or hosted

Everything a single machine can do is free and stays free: writing, presenting, the presenter
view, export, and building a static site. The **live room** needs a server holding a WebSocket
per deck; [deck.kadal.cc](https://deck.kadal.cc) runs one for you with publishing, analytics,
passcodes and teams (there is a free plan). That hosted service is how this engine is funded,
the way Slides.com funds reveal.js.

## Licence

**AGPL-3.0-or-later**, with a commercial licence for anyone who wants to build a hosted or
proprietary product on the engine without publishing their changes. Presenting with it,
self-hosting your own decks or embedding a deck in a site you publish triggers nothing. See
[LICENSING.md](LICENSING.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Security reports: [SECURITY.md](SECURITY.md).
