# Writing a Kadal Deck theme or addon

A **theme** is a look: CSS scoped under `.theme-<name>` that sets the `--deck-*` tokens and styles
the `.deck-layout-*` classes, plus, if it wants, layouts, components and layers of its own. An
**addon** is a feature any theme can use: components, layouts, layers, CSS and a `setup(api)`.
Both are npm packages (or plain folders) of the same shape. The source of truth is
`src/theming/contract.ts`; this page is the readable version.

Fastest start: `kadal-deck new --theme <name>` (or `npm create @kadal/deck -- --theme <name>`)
writes a package that already follows everything below, with a preview deck. `--addon` does the
same for an addon. `kadal-deck theme eject` copies an existing theme (a built-in too) into a deck.

## 1. The package

```jsonc
{
  "name": "@kadal/theme-seriph",          // or kadal-theme-seriph (community), or anything
  "keywords": ["kadal-theme"],             // "kadal-addon" for an addon
  "type": "module",
  "exports": {
    "./style.css": "./style.css",          // required for a theme
    ".": "./index.tsx",                    // optional: the module (TSX source is fine)
    "./package.json": "./package.json"
  },
  "kadal": {
    "theme": {                             // "addon": { name, title?, description?, defaults?, layouts?, components? }
      "name": "seriph",                    // the CSS class (.theme-seriph) and the menu's name
      "title": "Seriph",                   // optional display name
      "colorScheme": "both",               // "both" | "light" | "dark" (one scheme = the deck's default)
      "swatch": ["#5d8392", "#4d7534"],    // the menu's swatch: accent, second accent
      "defaults": { "class": "…" },        // slide frontmatter defaults (lowest layer)
      "config": { "transition": "fade", "fonts": { "sans": "Inter" } }, // headmatter defaults
      "themeConfig": { "primary": "#5d8392" },  // defaults for --theme-* variables
      "shiki": { "light": "min-light", "dark": "min-dark" },          // code colours
      "layouts": ["hero"],                 // names the module adds (for check, info, agents)
      "components": ["Badge"]
    }
  },
  "peerDependencies": { "@kadal/deck": "^0.4.0", "react": "^19.2.0" }
}
```

`swatch` is the two colours the theme menu paints for the theme (its `--deck-accent` and
`--deck-accent-2` in the light scheme). Every deck's menu lists every first-party theme, most of
them before their stylesheet has loaded, so the menu takes the colours from here; a theme without
a swatch gets one from its stylesheet once that has loaded.

First-party themes live in `packages/theme-<name>` as `@kadal/theme-<name>`. They need no build
step and almost no edit anywhere else: the prebuilt shell's `deckPackages()` plugin finds every
`packages/theme-*` and `packages/addon-*` and registers it (lazily) with the in-browser compiler,
and @kadal/deck's build copies each one into its own `dist/themes/<name>`
(`tools/bundle-themes.mjs`). The one edit: add the name to `FIRST_PARTY_THEMES` in
`src/theming/contract.ts`, the list every theme menu offers (a test fails until you do).

## 2. The module (optional)

```tsx
import type { LayerProps, LayoutProps, SetupApi } from "@kadal/deck";
import { useDeck } from "@kadal/deck";

function Hero({ children, frontmatter }: LayoutProps) {
  return <div className="deck-layout deck-layout-hero">{children}</div>;
}
function Footer({ page, total, layout }: LayerProps) {
  return layout === "cover" ? null : <footer className="seriph-footer">{page} / {total}</footer>;
}
export default {
  layouts: { hero: Hero },                 // `layout: hero`; a built-in name replaces it
  components: { Badge },                   // usable in any slide by name
  layers: { "slide-bottom": Footer },      // global-top · global-bottom · slide-top · slide-bottom
                                           //   · custom-nav-controls (buttons beside the controls)
  routes: [{ path: "handout", component: Handout }],  // pages of its own at <base>handout
  setup(api: SetupApi) {                   // optional; may return a cleanup
    api.shortcut("shift+k", () => api.deck.actions.toast("hi"));
  },
};
```

Named exports (`export const layouts = …`) work as well as a default export. A layout wraps its
children in `.deck-layout` plus a class of its own; it receives `frontmatter` and `options`.

**Merge order.** Components and layouts: the deck's own `components` > addons (a later one over an
earlier one) > the theme. Layers are stacked, not replaced: the theme's lowest, then the addons',
then the deck's (`<Deck layers>` or `global-top.tsx`… beside deck.mdx); the deck can hide one with
`layers={{ "global-bottom": false }}`. Config: theme `config` < headmatter < deck.config.ts.
Slide frontmatter: theme `defaults` < addon `defaults` < headmatter `defaults` < the slide.
When a viewer picks another theme from the menu, its layouts, layers and fonts (its `config.fonts`,
unless the deck chose its own) apply; the deck's own theme's *components* stay available so no
slide breaks.

**`setup(api)`** gets `deck` (the live runtime), `commands` (register commands), `panels`
(presenter sidebar tabs), `registerRenderer`/`registerLazyRenderer` (islands),
`registerBackground`, `shortcut(combo, fn)`, `addRoute(route)` (a page at `<base><path>`, gone
with the package; react/routes.tsx), and whatever other engine modules added with
`extendSetupApi(name, value)`. It runs once per deck mount (and again for a theme picked from the
menu); a returned function is called when the package goes.

**Layer props** (also `useLayer()`): `layer`, `slide`, `index` (0-based), `page` (1-based),
`total`, `h`, `v`, `click`, `clicks`, `layout`, `frontmatter`, `view` (play, presenter, print…),
`print` (true on a still copy: a printed page, an overview tile, a thumbnail, the presenter's
next-slide box). Global layers draw once on the stage and once per page in print; read
`props.slide`, not the navigation. A layer covers the slide with `pointer-events: none`; links,
buttons and `[data-interactive]` inside it take the pointer back.

**`custom-nav-controls`** (Slidev's name) is not drawn on the slide: its components are extra
buttons in the deck's controls — a row at the bottom-left of the play view, faint until hovered
or focused, and the end of the presenter view's toolbar (`view` says which). Never printed,
never on a projector. Act with `useActions()` (`next`, `prev`, `toggleOverview`…) and read with
`useNav()`; plain `<button>`s and `<a>`s get the deck's pill look, a class of your own wins.

```tsx
// custom-nav-controls.tsx beside deck.mdx, or a package's layers["custom-nav-controls"]
import { type LayerProps, useActions } from "@kadal/deck";
export default function Extra({ view }: LayerProps) {
  const { next } = useActions();
  return view === "presenter" ? null : <button aria-label="Next" onClick={next}>→</button>;
}
```

**Routes.** `routes` (a list, or a function of the routes so far, Slidev's `defineRoutesSetup`)
adds pages at `<base><path>`, drawn inside the deck's providers: `{ path: "q/:id", load: () =>
import("./Question.tsx"), title: "Question" }` — the page gets `{ path, params, route }`. The
engine's own pages always win a clash. A package's routes appear once its module has loaded.

## 3. The stylesheet

Everything is scoped under `.theme-<name>`; nothing global (other themes sit on the same page).

### Tokens (set every one, in light and dark)

| token | for |
|---|---|
| `--deck-bg` | the slide's background |
| `--deck-fg` | text |
| `--deck-muted` | secondary text: subtitles, captions, the slide number |
| `--deck-accent` | links, highlights, the progress bar, active controls |
| `--deck-accent-2` | a second accent: gradients, the second series |
| `--deck-surface` | cards, callouts, inline code: a faint layer over the background |
| `--deck-border` | hairlines: tables, cards, rules |
| `--deck-heading-font` | headings |
| `--deck-body-font` | body text |
| `--deck-mono-font` | code |
| `--deck-serif-font` | the serif face (`fonts.serif`; Tailwind's `font-serif`) |
| `--deck-code-bg` | code block background |
| `--deck-code-fg` | code block text without a Shiki colour |
| `--deck-code-active` | the highlighted line's wash |
| `--deck-radius` | corner radius of cards, code, images |
| `--deck-pad` | the slide's padding |
| `--deck-base-size` | the slide's base font size (1em on a slide; slides are 1920×1080) |
| `--deck-live` | the live room's accent (reactions, polls) |
| `--deck-transition` | the slide transition's length |
| `--deck-controls-color` | (optional) the arrows' colour |

### Dark mode

```css
.theme-seriph { --deck-bg: #fff; /* … light … */ }
.theme-seriph[data-color-scheme="dark"] { --deck-bg: #111; /* … dark … */ }
```

The deck root carries both the class and `data-color-scheme`; so does a slide that forces its
own scheme (`colorScheme: dark` in its frontmatter), which is why the dark block must be written
exactly as `.theme-<name>[data-color-scheme="dark"]`, never `.dark .theme-…` or a media query.
A single-scheme theme sets `"colorScheme": "dark"` in its metadata and puts its dark tokens on
`.theme-<name>` itself.

### Layout classes (style each one)

`.deck-layout-default` · `-center` · `-cover` · `-intro` · `-section` · `-end` · `-fact` ·
`-quote` · `-statement` · `-full` · `-two-cols` · `-two-cols-header` · `-image` · `-image-left` ·
`-image-right` · `-iframe` · `-iframe-left` · `-iframe-right` (`none` has no wrapper).

Inner parts: `.deck-layout-image-pane`, `.deck-layout-image-content`,
`.deck-layout-iframe-pane`, `.deck-layout-iframe-content`; slots (`::name::` in a slide) are
`.deck-slot.deck-slot-<name>`: two-cols places `default` and `right` (and `bottom`),
two-cols-header places `default` as the header, `left`, `right`, then `bottom`.

Every slide is `section.deck-slide.layout-<name>` with the layout's `.deck-layout` inside; style
content as `.theme-x .deck-slide h1`, `… blockquote`, `… a`, `… table`. Other classes themes
commonly touch: `.deck-progress span`, `.deck-controls`, `.deck-slide-number`, `.deck-callout`,
`.deck-badge`, `.deck-code-block`, `.deck-code-title`, `.deck-kbd`, `.deck-toc`, `.deck-counter`.
A theme's own layout or layer classes should be prefixed with its name.

### themeConfig

Each key of the theme's `themeConfig` (and the deck's, over it) arrives on the deck root as
`--theme-<kebab-key>`: `primary` → `--theme-primary`, `primaryColor` → `--theme-primary-color`,
`cover: { image }` → `--theme-cover-image`; arrays become comma lists, booleans 1/0. Always read
them with a fallback: `--deck-accent: var(--theme-primary, #5d8392);`. A layer or layout can read
the raw values from `useDeck().config.themeConfig`.

### Fonts

Put families in the tokens; load them with the metadata's `config.fonts` (Slidev's object:
`{ sans, heading, serif, mono, weights, italic, provider: google|bunny|none, local, fallbacks }`)
rather than an `@import` (exports wait for `fonts`; an `@import` they cannot see).

### Checklist

Light and dark; every layout class, two-cols-header included; print (`?print-pdf`) and the
presenter view; a phone-width scroll view (`?view=scroll`); contrast of `--deck-muted` on
`--deck-bg`; `prefers-reduced-motion` for anything that moves; no global selectors.

## 4. Resolution and where it runs

`theme: seriph` → a built-in (minimal · rla · stack · none) → `@kadal/theme-seriph` →
`kadal-theme-seriph` → the package `seriph` → for a first-party name, the copy @kadal/deck ships.
`./theme`, `../shared/theme`, `/abs/theme` are folders beside deck.mdx. `addons: [qr]` → `@kadal/addon-qr` → `kadal-addon-qr` → `qr`. A bare name the deck's
own CSS defines (`.theme-mine`) still works as before.

`theme`, `themes` and `addons` are read from the headmatter: that is where packages are resolved
(deck.config.ts may still pick among the themes already there). A theme's package.json is watched,
so editing its metadata in a folder or a linked package reloads the deck (node_modules is not
watched).

- **Vite (`kadal-deck dev/build`)**: resolved from the deck's folder; the plugin imports the CSS
  of every listed theme and addon, the active theme's and the addons' modules eagerly, the other
  themes' modules lazily; `global-top.tsx` (and the other three) beside deck.mdx or in `src/` are
  picked up. A missing package fails the build with what was tried and the install command.
- **The menu's other themes**: after the themes the deck lists, the theme menu offers every
  first-party theme it did not list (`FIRST_PARTY_THEMES`: the deck's own install of
  `@kadal/theme-<name>`, else the engine's copy). Their stylesheet and module load together, only
  when the theme is picked, so they add nothing to the first paint; their code keeps the deck's
  Shiki colours. Listing a theme in `themes:` moves it up, loads its CSS with the deck and gives
  its code its own colours. A third-party theme or a folder appears only when the deck lists it.
- **The prebuilt shell / runtime compiler**: resolves against the packages the page bundled
  (`registerTheme`, or the generated `virtual:kadal-packages`); an unknown theme falls back to
  minimal with a dismissible notice and a console warning. Its menu adds the first-party themes
  the page registered, the same way.

## 5. Testing

`npm run dev` in a scaffolded package runs its preview deck (`theme: ../`). In this repository,
`test/fixtures/kadal-theme-fixture` and `kadal-addon-fixture` exercise every part of the contract
(see `src/theming/theming.test.ts`). To try a theme in the shell:
`KADAL_SHELL_PACKAGES=/path/to/theme KADAL_SHELL_OUT_DIR=/tmp/shell bunx vite build` in
`packages/deck-shell`.

## 6. First-party themes, and Slidev's

Name one (`theme: <name>`): @kadal/deck ships all fourteen packages, and every deck's theme menu
offers them; `npm i @kadal/theme-<name>` gives a deck a copy of its own. The prebuilt shell has
them all. Five are ports of Slidev's official themes, with the same layouts, layout names,
frontmatter, slots, components, `themeConfig` keys, colour schemes and Shiki themes, so a Slidev
deck (or `kadal-deck import slidev`) only changes the theme's name:

| Slidev `theme:` | Slidev package | Kadal `theme:` | Kadal package | schemes | its own layouts and components |
|---|---|---|---|---|---|
| `default` | `@slidev/theme-default` | `classic` | `@kadal/theme-classic` | light, dark | `cover` (dims a picture `background`) |
| `seriph` | `@slidev/theme-seriph` | `seriph` | `@kadal/theme-seriph` | light, dark | `cover`; `themeConfig.primary` colours the headings |
| `apple-basic` | `@slidev/theme-apple-basic` | `crisp` | `@kadal/theme-crisp` | light, dark | `intro-image`, `intro-image-right`, `image-right`, `3-images`, `bullets` |
| `bricks` | `@slidev/theme-bricks` | `bricks` | `@kadal/theme-bricks` | light | `items` (`cols`, `::items::`), `blank`; `<Polygon1>`–`<Polygon11>` |
| `shibainu` | `@slidev/theme-shibainu` | `shibainu` | `@kadal/theme-shibainu` | dark | `default-2`…`default-7`, `right`, `section-2`, `section-3` |

`theme: default` is not a Kadal theme (Kadal's default is `minimal`): a converter maps Slidev's
`default` to `classic`.
Slidev's `none` is Kadal's `none`. Every other layout these themes use (`intro`, `section`,
`statement`, `fact`, `quote`, `image-left`, `two-cols`…) is the engine's, restyled by the
theme. Sizes are Slidev's exactly: each port measures in a "Slidev rem" worked out from
`--deck-base-size` (Slidev's 980px canvas scaled to Kadal's 1920px), so the proportions match and
a deck that changes the base size scales the whole theme. The catalog lists them as
`THEME_PACKAGES` (`kadal-deck info themes`); the ported code is MIT, with the notice in each
package's LICENSE and in THIRD_PARTY_NOTICES.md.

**reveal.js's themes** are one package, `@kadal/theme-reveal` (`theme: reveal`), with reveal's
twelve looks as `themeConfig.variant`: `black` (the default), `white`, `league`, `beige`, `night`,
`serif`, `simple`, `solarized`, `moon`, `dracula`, `sky`, `blood`. Each draws its own scheme as
reveal does and a counterpart for the other, and sizes everything in reveal pixels of its 960 × 700
slide (`themeConfig.width` / `height` for a deck of another size). `kadal-deck import reveal`
writes `theme: reveal` with the variant the page linked. A selector cannot read a themeConfig
value, so the package's `global-bottom` layer copies the variant onto the deck root as
`data-reveal-variant`, and the stylesheet keys each variant on it (the same pattern serves any
theme with variants). reveal.js is MIT; the notice is in the package's LICENSE and in
THIRD_PARTY_NOTICES.md.

For the first-party themes (`packages/theme-*`), `bun tools/theme-lint.ts packages/theme-<name>`
checks the contract statically (each package's `bun test` runs it), and
`node tools/theme-shots.mjs [names]` runs every preview deck in Chromium: a PNG of each slide in
light and dark, WCAG contrast of the resolved tokens, anything that overflows or that the
auto-fit had to shrink, the presenter, print and phone views, and contact sheets.

Decoration that reaches past the slide's padding (a ground, a wave along the foot) belongs on
the slide, `.theme-x .deck-slide.layout-cover::after`, or on an element with the `deck-absolute`
class: anything hung off `.deck-layout` past its box counts as overflow, and the engine's
auto-fit shrinks the whole slide to make room for it.
