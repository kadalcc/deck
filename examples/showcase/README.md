# The tour

The engine's own feature deck — live at [decks.kadal.cc/@pmithunish/tour](https://decks.kadal.cc/@pmithunish/tour/). Every
layout, component, background, transition, click effect, code option and view of
[@kadal/deck](../../packages/deck) is on a slide here, and every slide says how it was written and
carries speaker notes.

`deck.mdx` holds the cover, the contents and the end; each chapter is its own file, pulled in with
`src:` (which is itself one of the features):

| File | Chapter |
| --- | --- |
| `slides/01-writing.mdx` | the format, slots, a custom layout, all nineteen layouts, the glossary, the tools around a deck |
| `slides/02-clicks.mdx` | `<Clicks>` and its options, all twenty click effects, `at` / ranges / `hide` / `clicks:` / `clicksStart`, direction, marks and moving words |
| `slides/03-code.mdx` | stepped code, every fence option and notation mark, code groups, TwoSlash, Monaco, magic move, maths, Mermaid, sketches |
| `slides/04-looks.mdx` | all sixteen themes in light and dark, per-slide schemes, every background (and colour, gradient, image, video, page, wash, the long-hand keys), bling in every tone, building blocks |
| `slides/05-motion.mdx` | every transition, `-in`/`-out`, three speeds, a transition of the deck's own, auto-animate, `<Motion>`, `autoSlide` |
| `slides/06-media.mdx` | image layouts, the lightbox, Markdown images, video, audio, embeds, YouTube and X, QR |
| `slides/07-islands.mdx` | eleven runtimes on one slide, and how a renderer is written |
| `slides/08-live.mdx` | joining, reactions, polls, the word cloud, the quiz, questions and pace |
| `slides/09-presenting.mdx` | the presenter view, the keys, pen and laser, the camera, the phone remote, narration, commands, every view, per-slide options, export |
| `slides/10-slidev.mdx` | Slidev's Markdown as it is: the importer, comment notes, YAML frontmatter, scoped styles, diagram fences, maths lines, `src:` ranges (`slides/extras.mdx`), `defaults`, layers, routes, the build, Comark, `$clicks` |
| `slides/11-components.mdx` | icons, marks and their options, switches, dragged elements, pieces that know their context |

The headmatter in `deck.mdx` lists all sixteen themes under `themes:`, so the theme menu (T) offers every one; `slide-top.tsx`, `custom-nav-controls.tsx` and `routes.tsx` beside it are the deck's own layer, buttons and page.

Its pictures, video, sound and the page it embeds are in `public/`, so the tour works offline
except for the YouTube and X embeds and the Python island (Pyodide comes from a CDN). Those two
embeds still print and preview offline: `public/posters/` holds the stills `bun run export
--posters` captured of them. The video is *Big Buck Bunny* (© Blender Foundation, CC BY 3.0,
peach.blender.org); its poster is a frame of the film as YouTube's player shows it.

```sh
bun run dev        # http://localhost:5300/showcase/
bun run build      # dist/
bun run export     # PDF into export/ (add --png --pptx)
```

From the repository root, `node tools/showcase-check.mjs` builds the tour and drives it in a
headless Chromium: every slide and click in light and dark, the three built-in themes, the keys and
tools, the pen, typing in fields, transitions, deep links, the presenter, notes, audience and scroll
views, print, and `kadal-deck export`.
Screenshots land in `check-output/` (gitignored).
