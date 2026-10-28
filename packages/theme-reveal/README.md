# @kadal/theme-reveal

> **Build it. Rehearse it. Own the room.** [Kadal Deck](https://deck.kadal.cc) has your back for the whole talk, from the first idea to the last applause. A theme is how your talk looks on the day, on the projector and on every phone in the room.
>
> [Take the tour](https://decks.kadal.cc/@kadal-hq/tour/) · [Docs](https://deck.kadal.cc/docs/)

**Reveal**, a theme for [Kadal Deck](https://deck.kadal.cc): reveal.js's twelve themes in one,
picked with `themeConfig.variant`. Their fonts, colours, heading case, weights and shadows, type
sizes and spacing, and reveal's centred slide in its 960 × 700 box. Every variant draws light and
dark.

[All themes](https://deck.kadal.cc/themes/) · [Themes and backgrounds](https://deck.kadal.cc/docs/themes-and-backgrounds/) · [Writing a theme](https://deck.kadal.cc/docs/writing-a-theme/) · [Source](https://github.com/kadalcc/deck/tree/main/packages/theme-reveal)

@kadal/deck ships this theme, so `theme: reveal` works with nothing else installed. Install the
package only to give the deck a copy of its own, at a version you pick:

```bash
npm install @kadal/theme-reveal
```

```yaml
---
theme: reveal
themeConfig:
  variant: moon        # black (the default) · white · league · beige · night · serif · simple
                       # · solarized · moon · dracula · sky · blood
colorScheme: dark      # the variant's own scheme; D switches to its counterpart
center: true           # reveal centres every slide vertically
margin: 0.04           # reveal's margin around the slide
---
```

`kadal-deck import reveal` writes all of this from the theme the reveal.js page links.

## The variants

| variant | scheme | type | the other scheme |
| --- | --- | --- | --- |
| `black` | dark | Source Sans Pro, bold capitals | white |
| `white` | light | Source Sans Pro, bold capitals | black |
| `league` | dark, a grey radial wash | League Gothic over Lato, an embossed title | light grey, the same wash |
| `beige` | light, a cream radial wash | Source Sans Pro, an embossed title | dark brown |
| `night` | dark | Montserrat over Open Sans, amber links | light grey |
| `serif` | light | Palatino throughout, brown links | dark olive |
| `simple` | light | News Cycle over Lato, navy links | black |
| `solarized` | light | League Gothic over Lato | moon |
| `moon` | dark | League Gothic over Lato | solarized |
| `dracula` | dark | the system face, purple headings, coloured bold, italics and code | Alucard, Dracula's light |
| `sky` | light, a blue radial wash | Quicksand over Open Sans | deep blue |
| `blood` | dark | Ubuntu, red links, shadowed words | light grey |

A variant's own scheme is reveal's, colour for colour, except where a colour fails WCAG on its
background: blood's links are a lighter red on #222 than reveal's #a23. The other scheme keeps the
variant's type. reveal's `--r-*` custom properties are set under their own names, so a stylesheet
written for reveal (`color: var(--r-link-color)`) still reads them.

`themeConfig.width` and `height` (reveal's `width` and `height`, which the importer copies when a
deck had its own) size reveal's box on Kadal's 1920 × 1080 stage; 960 × 700 by default.

Code blocks use Shiki's `monokai`, the look of reveal's highlight plugin, in both schemes. Fonts
load through the fonts mechanism (`config.fonts` in package.json) from Google Fonts; Palatino and
the dracula system face are the reader's own.

Every Kadal layout is styled, in reveal's type. The variant is written on the deck root by a
`global-bottom` layer of this package (`data-reveal-variant`), so a deck that hides that layer
shows black.

## Develop

```bash
npm run dev      # the preview deck (preview/deck.mdx): reveal.js's demo slides
npm run check    # lint it
```

## Licence and attribution

MIT. The looks are [reveal.js](https://github.com/hakimel/reveal.js)'s themes (`css/theme`),
MIT License, Copyright (C) 2011-2026 Hakim El Hattab and reveal.js contributors; serif and simple
by Owen Versteeg, blood by Walther, the Dracula colours by Zeno Rocha. The stylesheet was
rewritten for Kadal Deck from their variables. The full notice is in
[LICENSE](https://github.com/kadalcc/deck/blob/main/packages/theme-reveal/LICENSE).
