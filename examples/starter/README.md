# My Kadal Deck

A presentation made with [Kadal Deck](https://deck.kadal.cc). The whole talk is `deck.mdx`.

```sh
npm install
npm run dev          # http://localhost:5173: edit deck.mdx and the slide you're on updates
```

In the deck, press `?` for every key, `S` for the presenter view (notes, a timer and the next
slide) and `Esc` for the overview.

## What's here

| file | |
| --- | --- |
| `deck.mdx` | the slides: Markdown split at `---`, with components where you need them |
| `deck.config.ts` | engine settings in code; they override the headmatter at the top of `deck.mdx` |
| `src/components.tsx` | your own React components, usable on any slide |
| `src/styles.css` | Tailwind, and any styles of your own |
| `AGENTS.md` | how a coding agent should work on this deck |

## Ship it

```sh
npm run build                                    # dist/: a static site for any host, works offline
npx kadal-deck export                            # a PDF in export/ (add --png or --pptx)
npx kadal-deck ci github-pages                   # or netlify, vercel, cloudflare, docker: the host's deploy files
npx kadal-deck login && npx kadal-deck publish   # a URL on deck.kadal.cc, with a live room for the audience
```

`npx kadal-deck check` lints the deck, and `npx kadal-deck format` tidies it.

## Learn more

- [Docs](https://deck.kadal.cc/docs/): writing slides, clicks, code, themes, the live room and the CLI
- [The tour](https://decks.kadal.cc/@pmithunish/tour/): every feature on one deck
- [Themes](https://deck.kadal.cc/themes/): set `theme:` in the headmatter
- [VS Code extension](https://marketplace.visualstudio.com/items?itemName=kadal.kadal-deck): a
  preview that follows your cursor, and an outline of the slides
