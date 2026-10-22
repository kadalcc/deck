---
"@kadal/deck": patch
---

Three code-toolkit follow-ups.

**Magic move highlights.** The inner fences of a ````md magic-move block take highlight steps,
Slidev's way: ```` ```ts {*|2|4-5} ```` lights all lines, then line 2, then lines 4–5, a click
each, before the next morph. Lines outside the step dim, on screen, in print (a page per step) and
in PPTX. The morph also animates again: without a `{duration}` the animation's timing was
"undefinedms" and every transition was switched off; it now uses the block's `{duration}`, else
the deck's `magicMoveDuration` (800 ms). Under `prefers-reduced-motion` the steps change at once.

**Code follows the theme menu.** Picking another theme from the menu (T) now recolours code in
that theme's own Shiki pair (`kadal.theme.shiki`): plain blocks, notation marks, TwoSlash, magic
move and Monaco editors, in light and dark, on screen and in exports. The build highlights each
token once with every distinct Shiki theme the menu needs, as CSS variables, plus a few rules in
the deck's stylesheet; a deck whose menu shares one pair (the default menu) builds exactly as
before. A slide that forces a colour scheme now also gets that scheme's code colours (a light
slide in a dark deck used to keep the dark ones). The hosted shell's editors wear the deck's
theme too, not always GitHub's.

**Monaco types for imported packages.** `{monaco}` and `{monaco-run}` editors get the
declarations of the npm packages they import, so hovers, completions and errors are the
package's own: bundled from the deck's node_modules by `kadal-deck build` (offline), else fetched
from jsDelivr (only declaration files, the ones the imports reach, within size limits, cached in
the browser). `monacoTypes: auto | local | cdn | none`, `monacoPackages` (names, or versions to
pin), `monacoTypesIgnore`; Slidev's `monacoTypesSource`, `monacoTypesAdditionalPackages` and
`monacoTypesIgnorePackages` are read too, and the importer carries them over. Offline with
nothing cached, editors behave as before. A `{monaco-run}` bare import (`import { z } from
"zod"`) now loads from esm.sh at the pinned version (`monacoRunImports`: another CDN or template,
or `false` for the old error).
