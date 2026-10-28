# @kadal/theme-terminal

> **Build it. Rehearse it. Own the room.** [Kadal Deck](https://deck.kadal.cc) has your back for the whole talk, from the first idea to the last applause. A theme is how your talk looks on the day, on the projector and on every phone in the room.
>
> [Take the tour](https://decks.kadal.cc/@kadal-hq/tour/) · [Docs](https://deck.kadal.cc/docs/)

**Terminal**, a theme for [Kadal Deck](https://deck.kadal.cc). A developer theme for code-heavy talks. Mono-forward: JetBrains Mono for headings, labels and code, IBM Plex Sans for reading text. Dark first (a deck starts dark unless it says `colorScheme: light`) with a light variant made to the same standard; the palette is Ayu's, so the slide and the code colours agree. Code blocks are editor windows: a bar with three lights, line numbers, a lit active line, a clear dim. Headings keep their markdown (`#`), lists use `›`, the table of contents prints like `tree`, callouts read like log lines.

<p>
  <img src="https://deck.kadal.cc/themes/terminal-light-1.webp" alt="Terminal: the cover, light" width="49%">
  <img src="https://deck.kadal.cc/themes/terminal-dark-2.webp" alt="Terminal: a content slide, dark" width="49%">
</p>

[All 17 themes](https://deck.kadal.cc/themes/) · [Themes and backgrounds](https://deck.kadal.cc/docs/themes-and-backgrounds/) · [Writing a theme](https://deck.kadal.cc/docs/writing-a-theme/) · [Source](https://github.com/kadalcc/deck/tree/main/packages/theme-terminal)

## Use it

@kadal/deck ships this theme, so `theme: terminal` works with nothing else installed. Install the
package only to give the deck a copy of its own, at a version you pick:

```bash
npm install @kadal/theme-terminal
```

```yaml
---
theme: terminal
themeConfig:            # all optional
  cursor: true
  accent: "#aad94c"
  accentLight: "#477a0b"
---
```

The deck plugin brings the stylesheet and the module in; nothing to import. The prebuilt shell (the hosted builder, published decks) bundles this theme already. Schemes: light and dark. Fonts: JetBrains Mono (headings and code), IBM Plex Sans (text), loaded through the theme's `config.fonts`. Code colours: Shiki's ayu-light / ayu-dark. Every deck's theme menu (<kbd>T</kbd>) offers it already; list it (`themes: [terminal, minimal]`) to put it near the top, load its stylesheet with the deck, and give code its own colours when it is picked.

## themeConfig

Every key arrives on the deck root as a CSS variable (`accentDark` → `--theme-accent-dark`); the theme reads them with fallbacks, so set only what you change.

| key | type | default | what it does |
| --- | --- | --- | --- |
| `cursor` | boolean | `true` | The blinking block cursor after the cover's and the last slide's title (still under `prefers-reduced-motion` and in print). |
| `accent` | colour | `#aad94c` | The dark scheme's prompt green. |
| `accentLight` | colour | `#477a0b` | The light scheme's. Without it, a set `accent` is darkened for the light page. |

## Layouts

Every built-in layout is styled (`default`, `center`, `cover`, `intro`, `section`, `end`, `fact`, `quote`, `statement`, `full`, `two-cols`, `two-cols-header`, `image`, `image-left`, `image-right`, `iframe`, `iframe-left`, `iframe-right`), and the theme adds:

| layout | what |
| --- | --- |
| `code` | The heading small and the code block as tall as the slide allows; a `::side::` slot puts notes in a column beside it. |
| `shell` | The whole slide is a terminal window (`title:` names its bar, default `zsh`); the slide's markdown and code run inside it, in mono. |

## Components

| component | what |
| --- | --- |
| `<Terminal title lines prompt />` | A session, line by line: `$ ` starts a command, `# ` a comment, `! ` an error, `✓ ` a success, anything else is output. Lines come from `lines` or the children, one per line. |

## Preview

`preview/deck.mdx` walks through every layout and component (`theme: ../`). In this repository:

```bash
bun run --filter @kadal/theme-terminal dev       # the preview deck, live
node tools/theme-shots.mjs terminal               # screenshots in light and dark, contrast and overflow checks
```

## Accessibility and print

Body and muted text meet WCAG AA (4.5:1) on the page and on cards in every scheme the theme draws (checked by `tools/theme-shots.mjs`). Anything that moves stands still under `prefers-reduced-motion` and on a still copy; printed pages and exports drop shadows and glows.

## Licence

AGPL-3.0-or-later, like the engine (see LICENSE); a commercial licence is available — see [LICENSING](https://github.com/kadalcc/deck/blob/main/LICENSING.md).
