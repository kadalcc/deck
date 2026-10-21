# Authoring a Kadal Deck

## The folder

| file | what it is |
| --- | --- |
| `deck.mdx` | the slides |
| `deck.config.ts` | `export const config: DeckConfigInput = {…}` — engine settings; **overrides the headmatter** |
| `src/main.tsx` | mounts `<Deck>`; imports the theme stylesheets the deck can switch between |
| `src/components.tsx` | `export const components = { Name: Component, "layout:name": Layout }` — usable in every slide without imports |
| `src/styles.css` | the deck's own CSS (tokens, utility classes; Tailwind v4 is set up) |
| `public/` | images, videos, `.excalidraw` files — referenced as `/file.png` |
| `glossary.yaml` | optional: terms whose first mention per slide gets a definition card |
| `AGENTS.md` | conventions for agents working in the deck |

## Slides and frontmatter

- A line `---` starts a new slide; `----` (four or more) starts a slide **beneath** the previous
  one (a vertical stack — detail the presenter may skip).
- YAML directly after a separator, closed by `---`, is that slide's frontmatter:

  ```mdx
  ---
  layout: two-cols
  background: { component: aurora, speed: 0.5 }
  class: text-left
  ---
  ```

- The YAML at the very top of the file is the **headmatter**: deck settings (`title`, `author`,
  `theme`, `transition`, `slideNumber`, `colorScheme`, `fonts`, `glossary`…) *and* the first
  slide's frontmatter (so `layout:`/`background:` there style the title slide).
- Precedence: engine defaults < headmatter < `deck.config.ts`. A key set in `deck.config.ts`
  cannot be changed from the headmatter (`kadal-deck check` warns).
- From the second slide on, a bare ```` ```yaml ```` fence as the very first thing in the body is
  that slide's frontmatter too (Slidev's block frontmatter). ```` ```yaml [file.yml] ```` (a title,
  or highlights) is code to show instead.
- `defaults:` in the headmatter is frontmatter for every slide that does not set the key:
  `defaults: { layout: center, transition: fade }`.
- `src: ./part.mdx` as the only content of a slide includes that file's slides there;
  `src: ./part.mdx#2-5` (or `#1,3,5-7`, `#4-`) only those slides, 1-based. The slide's other keys
  merge into the first included slide.
- Every key, its type and default: `npx kadal-deck info slide`, `info deck`, or the JSON Schema
  at `@kadal/deck/schema/frontmatter.json`.

## MDX rules that bite

- Leave a **blank line** between JSX tags and Markdown inside them, or the Markdown is not parsed:
  `<Col>⏎⏎- a list⏎⏎</Col>`.
- `{` `}` and `<` are syntax. In prose write them in backticks, or escape: `\{`, `&lt;`.
- JSX attributes: `className` (not `class`), `style={{ fontSize: 48 }}`, numbers and arrays in
  braces: `at={2}`, `options={["A", "B"]}`. Strings in quotes.
- Close every tag; self-close empty ones (`<QrJoin />`).
- HTML comments at the **end** of a slide are its speaker notes (Slidev's way); any other
  `<!-- … -->` is dropped. For a comment that is only a comment, `{/* comment */}`.
- `<style>` in a slide styles that slide only (`html.dark h1 {…}` still means the dark scheme;
  `:scope {…}` is the slide itself); `<style global>` styles the whole deck.
- Components are Capitalised. Unknown names fail the slide — check `kadal-deck info components`.

## Clicks (steps)

- `<Click>…</Click>` reveals on the next click; `<After>` with the previous one; `<Clicks>`
  around a list reveals item by item. `at="+2"`, `at={3}`, `at={[2, 4]}`, `hide`,
  `effect="fade-up"` (see the click effects in references/components.md).
- Code steps: ```` ```ts {1|2-3|all} ```` highlights those lines, one set per click.
- `<Notes>` text (or a trailing `<!-- … -->`) with `[click]` markers: the presenter view shows the part for the current click,
  and the narrator (R, or the presenter's narration bar) reads that part aloud at that step. Write
  notes as sentences meant to be heard. `say: "…"` in a slide's frontmatter replaces what is read;
  `narration: false` keeps the slide quiet. `kadal-deck narrate` bakes the speech into
  `public/narration/` (Kokoro; `--setup` installs `kokoro-js` first).
- `[click:3]` starts the part for step 3 exactly (Slidev's spelling). In the presenter, /notes and
  /overview the current part is lit and every marker is a button to its step. Under
  `kadal-deck dev` notes are editable there and on `/notes-edit` (saved into deck.mdx, in place) —
  when the user asks to change notes, editing the file is still the right move for an agent.
- Direction-aware styles: the deck root carries `data-nav-direction="forward|backward"`; the
  starter's Tailwind has `forward:` / `backward:` variants (`class="forward:delay-300"`), and
  without Tailwind `deck-instant-back` (snap back when stepping backward), `deck-delay-forward`,
  `deck-forward-only` / `deck-backward-only`, and `--deck-nav-sign` (1 or -1) for your own CSS.

## Presenting

- Headmatter `timer: stopwatch | countdown` and `duration: 30min` (`1h`, `90s`, `25:00`, or minutes)
  set the presenter's timer; it pauses, resets, shows progress and overtime, and the pacing badge
  compares with `totalTime`/`duration` or each slide's `timing` (default `defaultTiming`).
- `contextMenu: true | false | "dev" | "build"`: the right-click menu on slides.
- Pages: `/presenter`, `/notes`, `/notes-edit` (batch notes editor, dev), `/overview` (every slide
  with a step slider and its notes), `/remote`. `,` opens display settings (brightness, contrast,
  saturation, sepia, hue, invert for a projector).
- In main.tsx, `<Deck shortcuts={[{ keys: ["KeyQ"], command: "view.overview", description: "…" }]}>`
  adds keys (a function gets the defaults and returns the whole list: `defineShortcuts`);
  `contextMenu={(items) => [...items, { id, label, command }]}` adds menu items;
  `keyboard: { KeyD: null }` in the headmatter unbinds a single key.

## Layouts and slots

`layout: two-cols` splits at a line `::right::`; `layout: two-cols-header` puts what comes first in a
header across the slide, then `::left::` and `::right::` side by side. Image layouts read `image:`; iframe layouts read
`url:`. All layouts: references/layouts-and-backgrounds.md. A custom layout is a component in
`src/components.tsx` under the key `"layout:name"`, receiving `{ frontmatter, options, children }`.

## Code, maths, diagrams

- Fenced code is highlighted at build time (Shiki). Meta: `{lines:true}`, `[file.ts]` title,
  `{2|4-6}` steps, `{maxHeight:'400px'}`. A ````md magic-move fence morphs between the code fences
  it contains, one per click.
- Marks at a line's end: `// [!code ++]`, `[!code --]`, `[!code highlight]`, `[!code focus]`,
  `[!code error]`, `[!code word:name]` (any comment style; the comment is removed).
- Tabs: `::code-group` … `::` around fences titled `[npm]`, `[bun]`… (`{clicks:true}` turns them
  on clicks). Real files: `<<< @/snippets/x.ts#region {2|4} [x.ts]` (`@` = the deck folder;
  `// #region name` … `// #endregion`); keep code that also lives in the repo this way.
- ```ts twoslash: type hovers and compiler errors at build time; `// ^?` pins a type.
- Live code: ```ts {monaco} (editor), {monaco-diff} (original, a `~~~` line, modified),
  {monaco-run} (Run button, output below; JS/TS/Python built in; `{autorun:false}`,
  `{showOutputAt:'+1'}`), `<<< ./x.ts {monaco-write}` (saves to the file in dev). Esc hands the
  keys back to the deck. Keep editors to a few lines: they are for showing, not writing apps.
- Maths: `$inline$` and `$$display$$` (KaTeX at build time). `$$ {1|3|all}` on the opening line
  lights those lines of an `aligned`/`array` one step per click (`{at: 2}`, `{finally: 'all'}`
  in a second group). `katex: { macros: { "\\RR": "\\mathbb{R}" } }` in the headmatter.
- Diagrams: a ```` ```mermaid {scale: 0.8, theme: 'neutral'} ```` fence or
  `<Mermaid>{`flowchart LR; A --> B`}</Mermaid>` (`mermaid:` in the headmatter configures every
  diagram); ```` ```plantuml ```` renders on `plantUmlServer` (public server by default); hand-drawn
  `<Sketch>{`flowchart LR; A --> B`}</Sketch>` or `<Sketch src="/diagram.excalidraw" />`.

## Images, video, embeds

- Put files in `public/` and write `![Alt text](/photo.jpg)` or `<Image src="/photo.jpg" alt="…" preview />`.
  A path that is not in `public/` works in `dev` but is missing from the build (`check` flags it).
- `background: /photo.jpg` (or a video `.mp4`) fills the slide; `layout: image-right` + `image:` splits it.
- `<Iframe src="https://…" />` / `layout: iframe` embed pages; they load only near their slide and
  print as a poster (`kadal-deck export --posters` captures them, and those for `<Youtube>` and
  `<Tweet>` too).

## Look and feel

- Themes: `theme: minimal | rla | stack` in the headmatter, or a package — `theme: seriph` finds
  `@kadal/theme-seriph`, then `kadal-theme-seriph` (install it first) — or a folder, `theme: ./theme`.
  The Vite plugin brings in its CSS, layouts and components; `kadal-deck info themes` lists what is
  installed with each theme's layouts. `themeConfig: { primary: "#0f766e" }` sets the theme's knobs
  (its README says which). `addons: [name]` adds addon packages the same way.
  `colorScheme: dark` on one slide forces dark tokens there.
- Something on every slide (a footer with the page number, a logo): a `global-bottom.tsx` (or
  `global-top`, `slide-top`, `slide-bottom`) beside deck.mdx exporting a component; it gets
  `{ page, total, layout, click, slide }` as props.
- Fonts: `fonts: { sans: Inter, mono: Fira Code }` loads them (Google) and points the theme at them;
  `provider: bunny | none`, `local: [...]`, `weights`, `italic` as in Slidev.
- Theme tokens for your CSS: `--deck-bg`, `--deck-fg`, `--deck-muted`, `--deck-accent`,
  `--deck-accent-2`, `--deck-surface`, `--deck-border`, `--deck-radius`, `--deck-pad`,
  `--deck-base-size`, `--deck-heading-font`, `--deck-body-font`, `--deck-mono-font`. Use them
  instead of hard-coded colours so dark mode and theme switching keep working.
- The stage is 1920 × 1080 and scales to any screen; size things in px or em against that.
  Overflowing content is shrunk to fit (`autoFit`), which makes text small — cut instead.

## Glossary terms

`glossary.yaml` beside `deck.mdx`:

```yaml
GNSS: Satellite positioning — GPS, NavIC, Galileo and the rest.
UTM:
  full: Universal Transverse Mercator
  def: Sixty projections that turn latitude and longitude into **metres**.
  aliases: [UTM zone 44N]
```

The first mention of each term on a slide becomes a hover card. `<Term>UTM</Term>` links one by
hand; `terms: false` in a slide's frontmatter turns automatic linking off there.

## Your own components

```tsx
// src/components.tsx
import type { ComponentType } from "react";

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="deck-card">
      <strong style={{ fontSize: "2.4em" }}>{value}</strong>
      <div>{label}</div>
    </div>
  );
}

export const components: Record<string, ComponentType<any>> = { Stat };
```

Then `<Stat value="93%" label="coverage" />` in any slide. Hooks from `@kadal/deck`
(`useSlide`, `useClick`, `useConfig`) give a component its slide, click step and settings;
`useSlideEnter(fn)` / `useSlideLeave(fn)` (alias `onSlideEnter` / `onSlideLeave`) run when the
slide becomes / stops being the current one — not on mount, never in previews, the overview or
print; an enter may return a cleanup. `useNavDirection()` says "forward" or "backward".
Components from other frameworks (Vue, Svelte, Solid…) go in as islands via `@kadal/deck-*`.

## Icons, marks, placed elements (Slidev's components)

- Icons: `<Icon name="rocket" />` is Lucide (bundled). Any Iconify icon is `<Icon name="mdi:account" />`
  or Slidev's tag `<mdi-account />` / `<logos-vue class="text-3xl" />` (only empty tags whose prefix is
  an Iconify set become icons). Install the set to bundle it: `bun add -d @iconify-json/mdi`; without it
  the icon is fetched from the Iconify API at run time. `kadal-deck check` warns `icon-unknown`,
  `icon-set-missing`, `icon-set-unknown`.
- `<Mark type="underline|box|circle|highlight|strike-through|crossed-off|bracket" at={n}>`: drawn on its click.
- `<Drag pos="x,y,w,h[,r]">` (stage px, `_` = auto height) or `pos="name"` + frontmatter
  `dragPos: { name: "…" }`; `<DragArrow pos="x,y,dx,dy" />`. Positions are written by `kadal-deck dev`
  when the author drags; write them by hand only to place something exactly.
- `<Switch>` + `<Case at>` swap one block per click; `<Video at pauseAt steps autoreset>` follows clicks.
- `<RenderWhen context="presenter">` (also previewNext, overview, print, main, visible), `<LightOrDark>`,
  `<SlideCurrentNo />`, `<SlidesTotal />`, `<TitleRenderer no={n} />`, `<BlueSky uri="…" />`.
