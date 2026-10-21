# Third-party notices

Kadal Deck is AGPL-3.0-or-later (see [`LICENSE`](./LICENSE) and [`LICENSING.md`](./LICENSING.md)).
This file records third-party software and models that a feature of the engine **reaches for but
does not ship**, where their licences are worth knowing before you turn the feature on. The
ordinary npm dependencies of `@kadal/deck` carry their own licence files in `node_modules`.

## Narration (Kokoro text-to-speech)

The narrator (`narration` in the deck config, the R key, `kadal-deck narrate`) can speak notes with
the Kokoro-82M model. None of the pieces below is inside the `@kadal/deck` npm package:

- `kokoro-js` is an **optional peer dependency**. It is installed into a deck only when its author
  asks for it (`kadal-deck narrate --setup`, or `npm install kokoro-js`). Without it the narrator
  uses the browser's own `speechSynthesis` and pre-rendered clips, and none of this code is built.
- The **model weights are downloaded at run time** from the Hugging Face Hub
  (`onnx-community/Kokoro-82M-v1.0-ONNX`) — by the browser on the first press of play (kept in
  its Cache Storage), or by `kadal-deck narrate` on the machine that runs it. They are never
  redistributed by this project.

When a deck has `kokoro-js` installed, its **build output** contains a Web Worker bundle with
kokoro-js, transformers.js, onnxruntime-web (and its `.wasm`) and phonemizer.js, including
espeak-ng compiled to WebAssembly. Whoever publishes that build distributes those components and
should keep this notice with it.

| Component | Version checked | Licence | Source | Where it runs |
| --- | --- | --- | --- | --- |
| Kokoro-82M (model weights), by hexgrad | v1.0 | Apache-2.0 | https://huggingface.co/hexgrad/Kokoro-82M · ONNX export: https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX | downloaded at run time |
| kokoro-js | 1.2.1 | Apache-2.0 | https://github.com/hexgrad/kokoro (`kokoro.js/`) · https://www.npmjs.com/package/kokoro-js | browser worker, `kadal-deck narrate` |
| @huggingface/transformers (transformers.js) | 3.8.1 (via kokoro-js `^3.5.1`) | Apache-2.0 | https://github.com/huggingface/transformers.js | browser worker, `kadal-deck narrate` |
| onnxruntime-web | 1.22.0-dev (pinned by transformers.js 3.8.1) | MIT | https://github.com/microsoft/onnxruntime | browser worker (its `.wasm` lands in the deck's `dist/assets/`) |
| onnxruntime-node | 1.21.0 | MIT | https://github.com/microsoft/onnxruntime | `kadal-deck narrate` only |
| phonemizer (phonemizer.js), by Xenova | 1.2.1 | Apache-2.0 (the JavaScript wrapper) | https://github.com/xenova/phonemizer.js | browser worker, `kadal-deck narrate` |
| eSpeak NG (compiled into phonemizer.js) | as bundled by phonemizer 1.2.1 | **GPL-3.0-or-later** | https://github.com/espeak-ng/espeak-ng (licence: `COPYING`, README "License Information") | browser worker, `kadal-deck narrate` |
| sharp / libvips (pulled in by transformers.js on Node; not used by narration) | sharp 0.34, libvips 1.2 | Apache-2.0 / LGPL-3.0-or-later | https://github.com/lovell/sharp · https://github.com/libvips/libvips | installed with `kokoro-js` on Node; never bundled for the browser |

### eSpeak NG and the AGPL

phonemizer.js is published under Apache-2.0, but the eSpeak NG engine it compiles in is
**GPL-3.0-or-later**, so a build that contains phonemizer.js carries eSpeak NG's terms.

That is compatible with this engine's licence. The GNU AGPL v3 and the GNU GPL v3 each have a
section 13 written for exactly this pairing: GPLv3 §13 ("Use with the GNU Affero General Public
License") permits linking or combining GPLv3-covered work with AGPLv3-covered work into a single
combined work and conveying the result, and AGPLv3 §13 ("Remote Network Interaction; Use with the
GNU General Public License") says the same from the other side. Each part keeps its own licence:
eSpeak NG stays GPL-3.0-or-later, the engine stays AGPL-3.0-or-later.

What that means for you:

- **Self-hosting an AGPL deck with Kokoro:** nothing beyond what the AGPL already asks; keep this
  notice and the eSpeak NG source link with the published build.
- **Under a commercial licence of Kadal Deck:** the commercial licence covers Kadal Deck only; it
  cannot relicense eSpeak NG. If you ship a build that includes the Kokoro worker, that worker's
  eSpeak NG part remains under the GPL (corresponding source:
  https://github.com/espeak-ng/espeak-ng and https://github.com/xenova/phonemizer.js). Use baked
  clips or the browser's voice instead if that does not suit you — a deck without `kokoro-js`
  installed contains none of it.
- **Baked audio** (`kadal-deck narrate` output: MP3/Opus/WAV files) is the output of the model,
  not a copy of eSpeak NG; the Kokoro weights' Apache-2.0 licence places no restriction on it.

## Slidev (ported code) and the PlantUML server

- **Slidev** (MIT, Copyright (c) 2020 Anthony Fu, https://github.com/slidevjs/slidev). The KaTeX
  line selectors in `src/components/KatexLines.tsx` (`.mtable > [class*=col-align]` and the
  `vlist` path to each row's `.mord`) follow Slidev's `packages/client/builtin/katex-lines.ts`.
  The rest of the Slidev syntax the compiler reads (comment notes, block frontmatter, `src`
  ranges, scoped `<style>`, diagram fences) is Kadal's own implementation of Slidev's documented
  behaviour.

  > Permission is hereby granted, free of charge, to any person obtaining a copy of this software
  > and associated documentation files (the "Software"), to deal in the Software without
  > restriction, including without limitation the rights to use, copy, modify, merge, publish,
  > distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the
  > Software is furnished to do so, subject to the following conditions: The above copyright
  > notice and this permission notice shall be included in all copies or substantial portions of
  > the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.

- **PlantUML**: a ```` ```plantuml ```` fence becomes an image the deck's `plantUmlServer`
  (default https://www.plantuml.com/plantuml) draws from the diagram's source, which is encoded
  into the image's address. The diagram source therefore leaves the browser for that server;
  point `plantUmlServer` at your own (the `plantuml/plantuml-server` image) for private decks.
  No PlantUML code is in the package.

## Export

The exporters use three ordinary dependencies of `@kadal/deck`. Two of them can end up inside a
deck's **build output**, in chunks that load only when someone exports from the browser (`/export`)
or makes a picture of a slide:

| Component | Version checked | Licence | Source | Where it runs |
| --- | --- | --- | --- | --- |
| pptxgenjs | 3.12.0 | MIT | https://github.com/gitbrent/PptxGenJS | `kadal-deck export` (PPTX, editable PPTX); the browser exporter's PowerPoint (a lazy chunk in `dist/assets/`) |
| JSZip (bundled by pptxgenjs) | 3.10.2 | MIT (dual-licensed MIT or GPL-3.0; used under MIT) | https://github.com/Stuk/jszip | with pptxgenjs |
| modern-screenshot | 4.7.0 | MIT | https://github.com/qq15725/modern-screenshot | the browser exporter and `export.thumbnail` (lazy chunks) |
| pdf-lib | 1.17.1 | MIT | https://github.com/Hopding/pdf-lib | `kadal-deck export` only (PDF bookmarks, metadata, `--per-slide` merging); never bundled for the browser |

The command-line flags of `kadal-deck export` (`--format`, `--range`, `--with-clicks`,
`--with-toc`, `--omit-background`, `--per-slide`, `--wait-until`, `--executable-path`) and the shape
of the Markdown export follow Slidev's (MIT, https://github.com/slidevjs/slidev) so that a
Slidev user's habits carry over; no Slidev code is copied.

## The code toolkit (Monaco, TwoSlash, runners)

`{monaco…}` code blocks, `twoslash` blocks and `{monaco-run}` use the packages below. They are
ordinary npm dependencies of `@kadal/deck` (TypeScript is an optional peer), all under permissive
licences; none of their code is copied into the engine's source. A deck's **build output**
contains Monaco, its workers and the runner pieces only when one of its slides has a `{monaco…}`
block, as lazy chunks fetched when such a slide is shown. Whoever publishes that build
distributes them and should keep this notice (and Monaco's `ThirdPartyNotices.txt`, shipped in
the `monaco-editor` package) with it.

| Component | Version checked | Licence | Source | Where it runs |
| --- | --- | --- | --- | --- |
| monaco-editor | 0.57.0 | MIT | https://github.com/microsoft/monaco-editor | browser (lazy chunk + workers) |
| @shikijs/monaco | 3.23.0 | MIT | https://github.com/shikijs/shiki | browser (with Monaco) |
| @shikijs/transformers | 3.23.0 | MIT | https://github.com/shikijs/shiki | build (and the hosted shell's compiler) |
| @shikijs/twoslash, twoslash | 3.23.0, 0.3.9 | MIT | https://github.com/shikijs/shiki · https://github.com/twoslashes/twoslash | build only (Node) |
| typescript (optional peer, for TwoSlash) | 5.5+ | Apache-2.0 | https://github.com/microsoft/TypeScript | build only (Node) |
| sucrase | 3.35.1 | MIT | https://github.com/alangpierce/sucrase | browser (TS → JS for the runner) |
| dompurify | 3.4.16 | MPL-2.0 OR Apache-2.0 (used under Apache-2.0) | https://github.com/cure53/DOMPurify | browser (runner HTML output) |
| Pyodide (CPython for WebAssembly) | 0.28.3 | MPL-2.0 | https://github.com/pyodide/pyodide | **downloaded at run time** from jsDelivr by a Python `{monaco-run}` block; never redistributed by this project |

The CSS for TwoSlash's popups and the notation marks is written for this engine (it uses the class
names TwoSlash and Shiki's transformers emit); no stylesheet of theirs is copied.

## Themes ported from Slidev (`@kadal/theme-classic`, `-seriph`, `-crisp`, `-bricks`, `-shibainu`)

Five first-party theme packages are ports of Slidev's official themes. They are separate npm
packages, not part of `@kadal/deck`, and each is MIT-licensed with this notice in its LICENSE:
the look, the layouts (their names, slots and frontmatter), the bricks block drawings and the
shibainu background drawings come from the originals; the stylesheets and the React layouts were
rewritten for Kadal Deck, and the SVG drawings are copied with only their wrappers changed
(shibainu's lifted out of their Vue templates; bricks' without the clip-path group, which an
inlined data: URL cannot resolve).

| Kadal package | ported from | version read | licence | source |
|---|---|---|---|---|
| `@kadal/theme-classic` | `@slidev/theme-default` | 0.25.0 | MIT, Copyright (c) 2021 Slidev.js Team | https://github.com/slidevjs/themes |
| `@kadal/theme-seriph` | `@slidev/theme-seriph` | 0.25.0 | MIT, Copyright (c) 2021 Slidev.js Team | https://github.com/slidevjs/themes |
| `@kadal/theme-crisp` | `@slidev/theme-apple-basic` | 0.25.1 | MIT, Copyright (c) 2021 Slidev.js Team | https://github.com/slidevjs/themes |
| `@kadal/theme-bricks` | `@slidev/theme-bricks` | 0.25.0 | MIT, Copyright (c) 2021 Slidev.js Team | https://github.com/slidevjs/themes |
| `@kadal/theme-shibainu` | `@slidev/theme-shibainu` | 0.25.0 | MIT, Copyright (c) 2021 Slidev.js Team | https://github.com/slidevjs/themes |

The prebuilt shell (`@kadal/deck-shell`) bundles all five, so its build carries these notices
too. The fonts the themes name (Nunito Sans, PT Serif, PT Mono, Fira Code, Signika Negative,
Sigmar One, Titillium Web) are fetched from Google Fonts at run time under the SIL Open Font
License, never bundled.

## The side editor and the formatter

`kadal-deck dev`'s side editor (press E) is CodeMirror 6; `kadal-deck format` is Prettier with
`@kadal/prettier-plugin`. All are ordinary dependencies of `@kadal/deck`, used as they are:
CodeMirror is served to the browser by the dev server only, and is **never in a built deck**;
Prettier runs in Node only.

| Package | Version | Licence | Source | Where it runs |
|---|---|---|---|---|
| @codemirror/state, view, commands, language, search, lang-markdown, lang-yaml, lang-javascript, lang-css, lang-html | 6.43.15 (view) | MIT | https://github.com/codemirror | the dev server's browser page (lazy, dev only) |
| @lezer/highlight | 1.x | MIT | https://github.com/lezer-parser/highlight | with CodeMirror |
| prettier | 3.9.10 | MIT | https://github.com/prettier/prettier | Node (`kadal-deck format`) |

## The Slidev importer (`kadal-deck import slidev`, `@kadal/deck/import`)

The converter reads a Slidev project and writes Kadal's own syntax; it runs nothing from the
project and ships no Slidev code. Three things in it come from elsewhere:

- **Slidev's click-animation presets** (`v-click.fade`, `.up`, `.scale`…): the CSS the importer
  writes into an imported deck's `src/slidev.css` follows Slidev's `packages/client/styles/vclick.css`
  (MIT, Copyright (c) 2020 Anthony Fu), at Kadal's scale. Slidev's shortcut names (`abs-br`,
  `border-main`, `slidev-icon-btn`…) are read from its `uno.config.ts` the same way.
- **Tailwind CSS's colour palette** (MIT, Copyright (c) Tailwind Labs, Inc.,
  https://github.com/tailwindlabs/tailwindcss): `src/import/uno-palette.ts` holds the OKLCH values
  of tailwindcss 4.3's `theme.css`, which the utility classes of an imported deck resolve against
  (Slidev's UnoCSS uses the same palette).
- **Test fixtures**: `test/fixtures/slidev/` holds Slidev's starter template (create-slidev
  53.0.0), the first part of the "Composable Vue" demo talk and `@slidev/theme-apple-basic`'s
  example deck, as Slidev wrote them (MIT, Copyright (c) 2020 Anthony Fu and Copyright (c) 2021
  Slidev.js Team). They are inputs to the tests, not part of the npm package.
