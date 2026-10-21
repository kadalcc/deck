# @kadal/prettier-plugin

```sh
npm install --save-dev prettier @kadal/prettier-plugin
```

Part of [Kadal Deck](https://deck.kadal.cc/docs/). Prettier for decks: `deck.mdx` (and `slides.mdx`) formatted the way the engine reads them.

```json
// .prettierrc
{ "plugins": ["@kadal/prettier-plugin"] }
```

That is all: with the plugin loaded, a file named `deck.mdx` or `slides.mdx` is formatted as a deck. Other deck files ask for it by parser:

```json
{
  "plugins": ["@kadal/prettier-plugin"],
  "overrides": [{ "files": ["slides/*.mdx", "talks/**/*.mdx"], "options": { "parser": "kadal-deck" } }]
}
```

`kadal-deck format` (in `@kadal/deck`) runs the same formatter without any setup.

## What it does

- **Separators**: exactly `---` between slides and `----` for a slide beneath (a vertical stack), with one blank line around each. Pieces the engine skips (nothing in them) go.
- **Headmatter and frontmatter**: the YAML through Prettier's YAML printer. Comments stay, keys stay in the order you wrote them, and the values are checked to be unchanged. A ```` ```yaml ```` block frontmatter stays a block.
- **Slide bodies**: Prettier's Markdown printer (`-` bullets, `_emphasis_`, aligned tables, one blank line between blocks). Left exactly as written:
  - code fences (with their `{2|3}` steps, `{monaco}`, titles), magic-move blocks
  - `<Notes>` and the HTML-comment notes at the end of a slide
  - `<style>` blocks
  - `$$ … $$` maths
  - `::right::` slot markers, `::code-group` … `::`, `<<< @/snippet` imports
  - JSX and expressions
- A thematic break is written `***`, since `---` would start a new slide.

## Safety

Prettier's Markdown printer reads MDX the way MDX 1 did; the engine compiles MDX 3. So every formatted slide is parsed again (CommonMark, and MDX 3 when the slide is valid MDX 3) and compared with the original as a syntax tree. A slide whose meaning would change keeps its text as written. The whole deck is then cut again and checked to have the same slides, stacked the same way, with the same frontmatter. If it does not, the formatter throws instead of writing.

A slide containing `prettier-ignore` is left alone.

## Options

| Option | Default | |
|---|---|---|
| `kadalDeckBodies` | `true` | `false` formats the separators and the frontmatter only |

`printWidth`, `tabWidth`, `useTabs`, `proseWrap`, `singleQuote`, `bracketSpacing` and `endOfLine` reach the YAML and Markdown printers as usual.

## API

```ts
import * as prettier from "prettier";
import { formatDeck } from "@kadal/prettier-plugin";

const { text, changed, kept } = await formatDeck(source, prettier, { proseWrap: "preserve" });
// kept: [{ slide, line, reason }] for each part left as written, and why
```

## Licence

AGPL-3.0-or-later, like the engine (see [LICENSING.md](https://github.com/kadalcc/deck/blob/main/LICENSING.md)).
