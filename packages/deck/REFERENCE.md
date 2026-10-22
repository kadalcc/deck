<!-- Generated from the engine's catalog by packages/deck/tools/catalog.ts (REFERENCE.md). Do not edit: run `bun run catalog` in packages/deck. -->

# Kadal Deck reference

## Layouts

Pick one with `layout: <name>` in a slide's frontmatter.

- **default** — Content from the top left, the theme's padding around it. The default for every slide but the first.
- **center** — Everything centred on both axes.
- **cover** — The title slide: large title, subtitle and author. The first slide's default.
- **intro** — An introduction: who you are and what the talk covers.
- **section** — A section divider: one big heading that starts a part of the talk.
- **end** — The closing slide.
- **fact** — One number or fact, very large, with a line of context.
- **quote** — A quotation, set large, with its source.
- **statement** — One statement, centred and large.
- **full** — Content edge to edge, no padding — for a full-bleed image, map or diagram.
- **none** — No wrapper at all: the slide's MDX is the slide.
- **two-cols** — Two columns: everything before `::right::` on the left, the rest on the right. Slots: `::default::`, `::right::`.
- **two-cols-header** — A header across the top (everything before the first slot), then `::left::` and `::right::` side by side; an optional `::bottom::` spans both again. Slots: `::default::`, `::left::`, `::right::`, `::bottom::`.
- **image** — A full-slide image (frontmatter `image`) with the content over it. Reads: `image`, `backgroundSize`.
- **image-left** — An image filling the left half; content on the right. Reads: `image`, `backgroundSize`.
- **image-right** — Content on the left; an image filling the right half. Reads: `image`, `backgroundSize`.
- **iframe** — A live web page (frontmatter `url`) filling the slide, loaded only while the slide is near. Reads: `url`, `poster`, `posterUrl`, `posterWait`.
- **iframe-left** — A live web page on the left half; content on the right. Reads: `url`, `poster`, `posterUrl`, `posterWait`.
- **iframe-right** — Content on the left; a live web page on the right half. Reads: `url`, `poster`, `posterUrl`, `posterWait`.

Custom layouts: add `"layout:name": Component` to `src/components.tsx`.

## Components

Every component below works in any slide without an import. Your own go in `src/components.tsx`.

### Layout

#### `<Absolute>`

Places a block at stage coordinates (pixels on the 1920 × 1080 stage).

```mdx
<Absolute x={1500} y={80} w={320}><Badge tone="warn">Draft</Badge></Absolute>
```

| prop | type | default | |
| --- | --- | --- | --- |
| `x` | `number` | `0` | Left, px. |
| `y` | `number` | `0` | Top, px. |
| `w` | `number` |  | Width, px. |
| `h` | `number` |  | Height, px. |
| `rotate` | `number` | `0` | Degrees. |
| `children` | `ReactNode` |  |  |

#### `<Center>`

Centres its children horizontally and vertically in the space it has.

```mdx
<Center>

# One big idea

</Center>
```

| prop | type | default | |
| --- | --- | --- | --- |
| `children` | `ReactNode` |  |  |

#### `<Col>`

One column inside `<Cols>` (Markdown inside needs blank lines around it).

```mdx
<Col span={2}>

Wide column

</Col>
```

| prop | type | default | |
| --- | --- | --- | --- |
| `children` | `ReactNode` |  |  |
| `span` | `number` |  | Grid columns to span. |

#### `<Cols>`

Columns: each child (or `<Col>`) is a column. `cols` takes a CSS grid template.

```mdx
<Cols cols="2fr 1fr">
<Col>

The main point, in Markdown.

</Col>
<Col>

![](/figure.png)

</Col>
</Cols>
```

| prop | type | default | |
| --- | --- | --- | --- |
| `cols` | `string` |  | CSS grid-template-columns, e.g. "1fr 1fr" or "2fr 1fr". |
| `n` | `number` |  | Number of equal columns (instead of `cols`). |
| `gap` | `string` | `"2rem"` | CSS gap. |
| `children` | `ReactNode` |  |  |
| `align` | `string` |  | CSS align-items; "start" stops cards in a row from sharing a height. |

#### `<Drag>`

A block you place by hand (Slidev's v-drag). `pos` is "x,y,w,h[,rotation]" in stage pixels (`_` height: automatic) or a name in the slide's `dragPos` frontmatter. In `kadal-deck dev`, double-click it to move, resize, turn and nudge it; the position is saved into deck.mdx. Elsewhere it is simply placed.

```mdx
<Drag pos="1400,120,380,_">

![](/badge.png)

</Drag>
```

| prop | type | default | |
| --- | --- | --- | --- |
| `pos` | `string` |  | "x,y,w,h[,r]" in stage pixels (`_` height: automatic), or a name in the frontmatter's `dragPos`. |
| `at` | `ClickAt` |  | A click step, as `<Click at>`. |
| `hide` | `boolean` |  | Start shown and hide at the step. |
| `effect` | `string` | `"fade-in"` | The reveal effect with `at` (see `<Click effect>`). |
| `as` | `ElementType` |  | The element (div). |
| `children` | `ReactNode` |  |  |

#### `<DragArrow>`

An `<Arrow>` whose ends are dragged into place in `kadal-deck dev` (Slidev's v-drag-arrow). `pos` is "x,y,dx,dy" (from x,y by dx,dy) or a dragPos name.

```mdx
<DragArrow pos="300,700,600,-280" color="var(--deck-accent)" width={4} />
```

| prop | type | default | |
| --- | --- | --- | --- |
| `pos` | `string` |  | "x,y,dx,dy": from (x, y) by (dx, dy), stage pixels — or a frontmatter `dragPos` name. |
| `width` | `number` | `2` | Line width (px). |
| `color` | `string` | `"currentColor"` | CSS colour. |
| `twoWay` | `boolean` | `false` | Heads at both ends. |
| `at` | `ClickAt` |  | A click step. |
| `hide` | `boolean` |  |  |
| `effect` | `string` | `"fade-in"` |  |

#### `<FitText>`

Text as large as fits its box (reveal.js r-fit-text), between `min` and `max` px.

```mdx
<FitText max={260}>42%</FitText>
```

| prop | type | default | |
| --- | --- | --- | --- |
| `children` | `ReactNode` |  |  |
| `max` | `number` | `400` |  |
| `min` | `number` | `12` |  |

#### `<Frame>`

reveal.js's r-frame: a bordered frame around media.

```mdx
<Frame>![](/screenshot.png)</Frame>
```

| prop | type | default | |
| --- | --- | --- | --- |
| `children` | `ReactNode` |  |  |

#### `<Grid>`

A CSS grid of its children.

```mdx
<Grid cols={3} gap="1rem">
<Glass>One</Glass>
<Glass>Two</Glass>
<Glass>Three</Glass>
</Grid>
```

| prop | type | default | |
| --- | --- | --- | --- |
| `cols` | `string \| number` | `3` | Column count or a template. |
| `rows` | `string \| number` |  | Row count or a template. |
| `gap` | `string` | `"1.5rem"` | CSS gap. |
| `children` | `ReactNode` |  |  |

#### `<Spacer>`

Vertical space.

```mdx
<Spacer size="3rem" />
```

| prop | type | default | |
| --- | --- | --- | --- |
| `size` | `string` | `"1rem"` | CSS length. |

#### `<Stack>`

reveal.js's r-stack: children on top of each other in one spot — combine with clicks to swap images in place.

```mdx
<Stack>
<Click at={[1, 2]}>![](/v1.png)</Click>
<Click at={2}>![](/v2.png)</Click>
</Stack>
```

| prop | type | default | |
| --- | --- | --- | --- |
| `children` | `ReactNode` |  |  |

#### `<Stretch>`

reveal.js's r-stretch: grows to fill the slide's remaining height (an image under a heading).

```mdx
## The whole map

<Stretch>![](/map.png)</Stretch>
```

| prop | type | default | |
| --- | --- | --- | --- |
| `children` | `ReactNode` |  |  |

#### `<Transform>`

Scales a block around an origin (Slidev's <Transform>).

```mdx
<Transform scale={0.8}>

A table that is a little too big

</Transform>
```

| prop | type | default | |
| --- | --- | --- | --- |
| `scale` | `number` | `1` |  |
| `origin` | `string` | `"top left"` |  |
| `children` | `ReactNode` |  |  |

### Steps

#### `<After>`

Shows together with the previous click instead of taking a step of its own.

```mdx
<Click>The claim</Click>
<After>…and its footnote, at the same moment</After>
```

| prop | type | default | |
| --- | --- | --- | --- |
| `hide` | `boolean` |  | Start visible and hide at the step instead. |
| `effect` | `ClickEffect` | `"fade-in"` | A reveal effect (see clickEffects) or any CSS class the theme defines. |
| `as` | `ElementType` |  | The element to render; a `span` for inline text, `div` by default. |
| `children` | `ReactNode` |  | What is revealed. |

#### `<Case>`

One case of a `<Switch>`. Without `at` it is one step after the case before; `at={0}` is what the slide starts with; the last case stays unless it has a range.

```mdx
<Switch>
<Case at={0}>Before</Case>
<Case>After one click</Case>
</Switch>
```

| prop | type | default | |
| --- | --- | --- | --- |
| `at` | `string \| number \| [number, number]` |  | When, in the switch's own steps: n, "a-b", or [a, b]. Default: one after the case before. |
| `as` | `ElementType` |  | This case's element. |
| `children` | `ReactNode` |  |  |

#### `<Click>`

One click step (Slidev's v-click, reveal.js's fragment): shows its children from its step on, or hides them with `hide`.

```mdx
<Click>Appears on the first click</Click>
<Click at="+2" effect="fade-up">Two clicks later, sliding up</Click>
```

| prop | type | default | |
| --- | --- | --- | --- |
| `at` | `ClickAt` |  | When: omitted = one after the previous step; "+N" relative ("+0" shares the previous step); a number is absolute (0 = always shown); [from, to] shows it from `from` until `to`. |
| `hide` | `boolean` |  | Start visible and hide at the step instead. |
| `effect` | `ClickEffect` | `"fade-in"` | A reveal effect (see clickEffects) or any CSS class the theme defines. |
| `as` | `ElementType` |  | The element to render; a `span` for inline text, `div` by default. |
| `children` | `ReactNode` |  | What is revealed. |

#### `<ClickCount>`

The click step this slide is at (Slidev's `$clicks`), or with `total` how many it has; with a function child, anything that depends on the count. Never adds a click step itself. Hook: `useClicks()`.

```mdx
Step <ClickCount offset={1} /> of <ClickCount total />

<ClickCount when={(c) => c >= 3}>

**Done.**

</ClickCount>
```

| prop | type | default | |
| --- | --- | --- | --- |
| `total` | `boolean` | `false` | Show the slide's number of clicks rather than the current one. |
| `offset` | `number` | `0` | Add this to the number shown: `offset={1}` counts from 1 ("step 1" before any click). |
| `when` | `((click: number, total: number) => unknown)` |  | Render the children only while this is true of the count: `when={(c) => c >= 2}`. |
| `children` | `ReactNode \| ((click: number, total: number) => ReactNode)` |  | With `when`: what to show. Otherwise a function of the count, for anything that depends on it: `{(c, total) => …}`. Without either, the number is shown in a `<span>`. |

#### `<Clicks>`

Wraps a Markdown list (or any children) so each item is its own click step. Leave blank lines around the list inside it.

```mdx
<Clicks>

- First point
- Second point
- Third point

</Clicks>
```

| prop | type | default | |
| --- | --- | --- | --- |
| `every` | `number` | `1` | Reveal this many items per click. |
| `depth` | `number` | `1` | How deep nested lists take part; 1 means only the outer list. |
| `effect` | `ClickEffect` | `"fade-in"` | The reveal effect for every item. |
| `children` | `ReactNode` |  | A list, or blocks. |

#### `<Fragment>` (= `<Click>`)

reveal.js's name for `<Click>`; identical.

```mdx
<Fragment effect="highlight-red">Same as Click</Fragment>
```

#### `<Switch>`

One child at a time, switched by clicks (Slidev's v-switch): each `<Case>` takes the next step, or `at={n}` / `at="a-b"` in the switch's own steps; the cases share one spot, so nothing below jumps.

```mdx
<Switch transition="slide-up">
<Case>First</Case>
<Case>Then</Case>
<Case at="4-6">Steps 4 and 5</Case>
</Switch>
```

| prop | type | default | |
| --- | --- | --- | --- |
| `at` | `ClickAt` |  | When the switch's first step is: as `<Click at>`. Default one after the previous click. |
| `transition` | `(string & {}) \| "fade" \| "slide-up" \| "slide-left" \| "scale" \| "none"` | `"fade"` | "fade" (default), "slide-up", "slide-left", "scale", or "none". |
| `unmount` | `boolean` | `false` | Leave hidden cases out of the page rather than hidden in it. |
| `as` | `ElementType` |  | The switch's element (`tag` in Slidev); `div` by default. |
| `childAs` | `ElementType` |  | Each case's element (`childTag`); `div` by default. |
| `children` | `ReactNode` |  | `<Case>`s — or any elements, each one step. |

### Markdown

#### `<Anchor>`

The `a` mapping: `[text](#/3)` and other in-deck hash links navigate; external links open in a new tab.

```mdx
[the results slide](#/results) · [docs](https://deck.kadal.cc/docs/)
```

#### `<Li>`

The `li` mapping: a plain item, or a click step inside `<Clicks>`.

```mdx
- each item renders through this
```

#### `<Ol>`

The `ol` mapping behind numbered Markdown lists.

```mdx
1. a numbered list renders through this
```

#### `<Ul>`

The `ul` mapping behind Markdown bullet lists; `<Clicks>` steps its items.

```mdx
- a Markdown list renders through this
```

### Content

#### `<Arrow>`

A straight arrow between two points in stage coordinates.

```mdx
<Arrow x1={300} y1={700} x2={900} y2={420} color="var(--deck-accent)" />
```

| prop | type | default | |
| --- | --- | --- | --- |
| `x1` * | `number` |  |  |
| `y1` * | `number` |  |  |
| `x2` * | `number` |  |  |
| `y2` * | `number` |  |  |
| `width` | `number` | `2` | Stroke width. |
| `color` | `string` | `"currentColor"` | CSS colour. |
| `twoWay` | `boolean` | `false` | Heads at both ends. |

#### `<Badge>`

A small inline label.

```mdx
<Badge tone="good">new</Badge>
```

| prop | type | default | |
| --- | --- | --- | --- |
| `children` | `ReactNode` |  |  |
| `tone` | `"neutral" \| "accent" \| "good" \| "warn" \| "bad"` | `"neutral"` | neutral · accent · good · warn · bad. |

#### `<Callout>`

A boxed aside: info, tip, note, warn or danger, with an optional title.

```mdx
<Callout kind="tip" title="Rule of thumb">

One idea per slide.

</Callout>
```

| prop | type | default | |
| --- | --- | --- | --- |
| `kind` | `"warn" \| "info" \| "tip" \| "danger" \| "note"` | `"info"` | info · tip · note · warn · danger. |
| `title` | `ReactNode` |  | A string, or any content (Comark's `#title` slot arrives as content). |
| `children` | `ReactNode` |  |  |

#### `<Confetti>`

A burst of confetti when the slide (or the given click) arrives.

```mdx
<Confetti at={1} />
```

| prop | type | default | |
| --- | --- | --- | --- |
| `at` | `string \| number` |  | Click step. |
| `count` | `number` | `140` | Pieces. |
| `duration` | `number` | `2200` | Milliseconds. |

#### `<Counter>`

A number that counts up when its slide is shown.

```mdx
<Counter value={12500} prefix="₹" suffix="/mo" />
```

| prop | type | default | |
| --- | --- | --- | --- |
| `value` * | `number` |  | Target number. |
| `from` | `number` | `0` | Start. |
| `duration` | `number` | `1500` | Milliseconds. |
| `decimals` | `number` | `0` | Decimal places. |
| `prefix` | `string` | `""` | Text before. |
| `suffix` | `string` | `""` | Text after. |

#### `<Encrypted>`

Text that resolves out of random glyphs.

```mdx
<Encrypted text="Decoded." />
```

| prop | type | default | |
| --- | --- | --- | --- |
| `text` * | `string` |  | The text. |
| `speed` | `number` | `30` | Milliseconds per glyph. |
| `delay` | `number` | `0` | Milliseconds before it starts. |

#### `<Kbd>`

A keyboard key.

```mdx
Press <Kbd>?</Kbd> for help
```

| prop | type | default | |
| --- | --- | --- | --- |
| `children` | `ReactNode` |  |  |

#### `<LightOrDark>`

One thing in the light colour scheme, another in the dark (the slide's own scheme when its frontmatter forces one): `light`/`dark` props, children marked `slot="light"`/`slot="dark"`, or a function of the scheme.

```mdx
<LightOrDark>
  <div slot="dark">![](/logo-white.svg)</div>
  <div slot="light">![](/logo-black.svg)</div>
</LightOrDark>
```

| prop | type | default | |
| --- | --- | --- | --- |
| `light` | `ReactNode` |  | Shown in the light scheme. |
| `dark` | `ReactNode` |  | Shown in the dark scheme. |
| `children` | `ReactNode \| ((props: { scheme: Scheme; } & Record<string, unknown>) => ReactNode)` |  | Either children marked `slot="light"` / `slot="dark"` (any element: `<div slot="dark">…</div>`), or a function of the scheme and the other props: `{({ scheme }) => …}`. |

#### `<Link>`

A link to another slide by 1-based number, `h.v`, or slide id.

```mdx
<Link to="results">See the results</Link>
```

| prop | type | default | |
| --- | --- | --- | --- |
| `to` * | `string \| number` |  | Slide number (1-based), "h.v", or a slide `id`. |
| `title` | `string` |  | Tooltip. |
| `children` | `ReactNode` |  |  |

#### `<Mark>`

A hand-drawn mark (Slidev's v-mark, rough-notation's types): underline, box, circle, highlight, strike-through, crossed-off or bracket, drawn stroke by stroke on its click. The wobble is seeded from the text, so it looks the same on every screen and in the PDF.

```mdx
The answer is <Mark type="circle">forty-two</Mark>.

<Mark type="bracket" brackets="left right" color="#e11d48" at={2}>Both sides</Mark>
```

| prop | type | default | |
| --- | --- | --- | --- |
| `type` | `"strike" \| MarkType \| "line-through" \| "linethrough" \| "cross" \| "crossed"` | `"underline"` | underline · box · circle · highlight · strike-through · crossed-off · bracket (Slidev's aliases strike, line-through, cross, crossed work too). |
| `color` | `string` | `"var(--deck-accent)"` | Any CSS colour; default the theme's accent. |
| `at` | `ClickAt` |  | When: as `<Click at>` (default: the next click; 0 = always; [a, b] from a until b). |
| `strokeWidth` | `number` |  | Line width in px (default 3; a highlight is as tall as the line). |
| `padding` | `string \| number \| number[]` |  | Space around the text in px: one number, or "top right bottom left" like CSS. Default 5. |
| `iterations` | `number` | `2` | Strokes per line, each a little different (default 2, rough-notation's). |
| `multiline` | `boolean` |  | One mark per line of wrapped text. Default: on for underline, highlight, strike-through, crossed-off. |
| `brackets` | `string \| string[]` | `"right"` | For a bracket: which sides — "left", "right", "top", "bottom", or several. Default "right". |
| `duration` | `number` |  | How long the stroke takes to draw, ms (default 800). |
| `animationDuration` | `number` |  | rough-notation's name for `duration`. |
| `delay` | `number` | `0` | Wait this long after the click before drawing, ms. |
| `animate` | `boolean` | `true` | Turn the drawing animation off: the mark appears whole. |
| `opacity` | `number` |  | 0–1. Default 1 (a highlight: 0.35, so the text shows through). |
| `children` | `ReactNode` |  |  |

#### `<Math>` (= `<Tex>`)

Another name for `<Tex>`.

```mdx
<Math tex="\int_0^1 x\,dx" block />
```

#### `<Notes>`

Speaker notes. Lifted out at compile time and shown in the presenter view; `[click]` markers line them up with clicks. Slidev's spelling works too: HTML comments at the very end of a slide are its notes, and both kinds join.

```mdx
<Notes>
Open with the question. [click] Then reveal the number.
</Notes>
```

| prop | type | default | |
| --- | --- | --- | --- |
| `children` | `ReactNode` |  |  |

#### `<Qr>`

A QR code for any text or URL, rendered locally.

```mdx
<Qr value="https://deck.kadal.cc" size={280} />
```

| prop | type | default | |
| --- | --- | --- | --- |
| `value` * | `string` |  | Text or URL to encode. |
| `size` | `number` | `240` | Pixels. |

#### `<RenderWhen>`

Renders its children only in some places: `main` (the deck and the presenter's current slide), `slide`, `presenter`, `previewNext`, `overview`, `print`/`export`, `audience`, `visible`; `fallback` everywhere else.

```mdx
<RenderWhen context="presenter">Only the speaker sees this.</RenderWhen>

<RenderWhen context={["print", "overview"]} fallback={<Iframe src="https://example.com" />}>![](/still.png)</RenderWhen>
```

| prop | type | default | |
| --- | --- | --- | --- |
| `context` * | `string \| RenderWhenContext[]` |  | Where to render: `main` (the deck and the presenter's current slide — and the audience's phone), `slide`, `presenter`, `previewNext` (the presenter's next box), `overview`, `print` (also `export`), `audience`, `visible` (on screen right now). Several — an array or "presenter overview" — render in any of them; `visible` combined with others must also hold. |
| `fallback` | `ReactNode` | `null` | Rendered where the context does not match. |
| `children` | `ReactNode` |  |  |

#### `<SlideCurrentNo>`

This slide's number (in a global layer: the current slide's).

```mdx
Slide <SlideCurrentNo /> of <SlidesTotal />
```

| prop | type | default | |
| --- | --- | --- | --- |
| `format` | `"c" \| "c/t" \| "h.v" \| "h/v"` | `"c"` | "c" the flat number (default), "h.v" or "h/v" with vertical slides, "c/t" with the total. |

#### `<SlidesTotal>`

How many slides the deck has (hidden ones left out).

```mdx
<SlidesTotal /> slides
```

#### `<Tex>`

KaTeX maths from JSX. In Markdown prefer `$inline$` and `$$display$$`, which render at build time.

```mdx
<Tex tex="E = mc^2" block />
```

| prop | type | default | |
| --- | --- | --- | --- |
| `tex` | `string` |  | LaTeX source. |
| `block` | `boolean` | `false` | Display (centred, own line) instead of inline. |
| `children` | `ReactNode` |  |  |

#### `<Timer>`

A countdown (with `seconds`) or a stopwatch that starts when its slide is shown.

```mdx
<Timer seconds={120} />
```

| prop | type | default | |
| --- | --- | --- | --- |
| `seconds` | `number` |  | Count down from this; omit for a stopwatch. |

#### `<TitleRenderer>`

Another slide's title, by its number or id (no prop: this slide's own).

```mdx
Next up: <TitleRenderer no={3} />
```

| prop | type | default | |
| --- | --- | --- | --- |
| `no` | `string \| number` |  | Slide number, 1-based. |
| `id` | `string` |  | Or the slide's id. |
| `fallback` | `ReactNode` |  | Shown when that slide has no title (or there is no such slide). |
| `as` | `"div" \| "h1" \| "h2" \| "h3" \| "span" \| "strong"` | `"span"` | The element: span (default), h1–h3, strong, div. |

#### `<Toc>`

A table of contents from every slide's title and heading level (`hideInToc` slides skipped).

```mdx
## Agenda

<Toc maxDepth={1} />
```

| prop | type | default | |
| --- | --- | --- | --- |
| `columns` | `number` | `1` | Number of columns. |
| `maxDepth` | `number` | `Number.POSITIVE_INFINITY` | Deepest heading level listed. |
| `minDepth` | `number` | `1` | Shallowest heading level listed. |
| `mode` | `"all" \| "onlyCurrentTree" \| "onlySiblings"` | `"all"` | all · onlyCurrentTree · onlySiblings. |
| `listClass` | `string` |  | Class on the list. |

#### `<Typewriter>`

Text that types itself out when the slide is shown.

```mdx
<Typewriter text="npm create @kadal/deck@latest" />
```

| prop | type | default | |
| --- | --- | --- | --- |
| `text` * | `string` |  | The text. |
| `speed` | `number` | `35` | Milliseconds per character. |
| `cursor` | `boolean` | `true` | Show a cursor. |

### Media

#### `<Audio>`

An audio player.

```mdx
<Audio src="/clip.mp3" />
```

| prop | type | default | |
| --- | --- | --- | --- |
| `src` * | `string` |  | Audio URL. |
| `autoplay` | `boolean` |  | Play on arrival. |
| `loop` | `boolean` |  | Loop. |
| `controls` | `boolean` | `true` | Show controls. |

#### `<BlueSky>`

A Bluesky post, through Bluesky's embed, in the slide's colour scheme; `deck export` captures a poster for each scheme.

```mdx
<BlueSky uri="https://bsky.app/profile/sli.dev/post/3la7gcgfwpe2n" />
```

| prop | type | default | |
| --- | --- | --- | --- |
| `uri` * | `string` |  | The post: its bsky.app address or its AT-URI. |
| `scale` | `string \| number` | `1` | Scale factor. |
| `poster` | `string` |  | Stands in for the post in print, the overview and while it loads. |

#### `<Iframe>`

An embedded page, loaded only while its slide is near, behind a click-to-interact shield; a poster stands in for print and previews.

```mdx
<Iframe src="https://example.com" poster="/posters/example.jpg" scale={0.5} />
```

| prop | type | default | |
| --- | --- | --- | --- |
| `src` * | `string` |  | Page URL. |
| `preload` | `boolean` |  | Load it before its slide is near. |
| `title` | `string` |  | Accessible title. |
| `poster` | `string` |  | Stands in for the page in print, the overview and the next-slide box, and while it loads. |
| `posterSize` | `readonly [number, number]` |  |  |
| `scale` | `number` |  | Render the page larger and shrink it: 0.5 gives a small pane the desktop layout. |

#### `<Image>`

The `img` mapping (every `![alt](src)`), lazy-loaded; also usable as a tag. `preview` opens a lightbox on click.

```mdx
![A map of Chennai](/chennai.png)

<Image src="/chart.png" alt="Revenue by month" preview fit="contain" />
```

| prop | type | default | |
| --- | --- | --- | --- |
| `src` | `string` |  | Image URL; `/x.png` is served from the deck's public/ folder. |
| `alt` | `string` | `""` | Alternative text (always write one). |
| `preview` | `string \| boolean` |  | true, or a larger image's URL, to open a lightbox on click. |
| `fit` | `string` |  | CSS object-fit (cover, contain…). |

#### `<Tweet>`

An embedded post from X/Twitter.

```mdx
<Tweet id="20" />
```

| prop | type | default | |
| --- | --- | --- | --- |
| `id` | `string \| number` |  | Post id. |
| `url` | `string` |  | Or the post URL. |
| `scale` | `number` | `1` | Scale factor. |
| `poster` | `string` |  | Stands in for the post in print, the overview and while it loads. |

#### `<Video>`

A video that knows the slide's clicks (Slidev's SlidevVideo and more): plays on arrival, at a click (`at`), pauses at one (`pauseAt`), jumps or rewinds at others (`steps`), or when the enclosing <Click> reveals it; still at its print frame in print and thumbnails.

```mdx
<Video src="/demo.mp4" at={1} pauseAt={3} steps={{ 2: 42 }} timestamp={5} autoreset="slide" />
```

| prop | type | default | |
| --- | --- | --- | --- |
| `src` | `string` |  | Video URL (public/ path or https), or `<source>` children. |
| `autoplay` | `boolean \| "once"` |  | Play when the slide (or `at`, or the enclosing `<Click>`) arrives; "once": only the first time. |
| `at` | `ClickAt` |  | The click at which it starts playing (as `<Click at>`); implies `autoplay`. |
| `pauseAt` | `ClickAt` |  | The click at which it pauses. |
| `steps` | `Record<string \| number, VideoStep>` |  | What happens at further clicks: `{ 3: "pause", 4: "play", 6: 12.5, 8: "rewind" }` (absolute clicks). |
| `autoreset` | `"slide" \| "click"` |  | "slide": back to `timestamp` whenever the slide is left; "click": whenever the deck steps back before `at`. |
| `timestamp` | `string \| number` |  | Start here, in seconds. |
| `loop` | `boolean` |  | Loop. |
| `muted` | `boolean` | `true` | Muted (default true). |
| `controls` | `boolean` | `false` | Show controls. |
| `poster` | `string` |  | Poster image. |
| `printPoster` | `string` |  | The poster in print, the overview and the next-slide box (default `poster`). |
| `printTimestamp` | `string \| number` |  | The frame shown in print and previews: seconds, or "last". Default `timestamp`. |
| `children` | `ReactNode` |  | `<source>` elements, captions (`<track>`), fallback text. |

#### `<Youtube>`

A YouTube embed by id or URL.

```mdx
<Youtube id="dQw4w9WgXcQ" start={42} />
```

| prop | type | default | |
| --- | --- | --- | --- |
| `id` | `string` |  | Video id. |
| `url` | `string` |  | Or the full URL. |
| `autoplay` | `boolean` |  | Play on arrival. |
| `start` | `number` |  | Start at second. |
| `poster` | `string` |  | Stands in for the player in print, the overview and while it loads. |

### Background

#### `<Background>`

A registered component background (by `name`) or custom children as an animated layer behind this slide's content. Usually you set `background:` in frontmatter instead.

```mdx
<Background name="aurora" opacity={0.6} />
```

| prop | type | default | |
| --- | --- | --- | --- |
| `name` | `string` |  | A registered background name (see backgrounds). |
| `children` | `ReactNode` |  |  |
| `opacity` | `number` | `1` | 0–1. |

### Bling

#### `<Blob>`

A soft organic colour blob for decoration.

```mdx
<Blob color="var(--deck-accent-2)" x="80%" y="20%" />
```

| prop | type | default | |
| --- | --- | --- | --- |
| `color` | `string` |  | CSS colour. |
| `x` | `string` | `"50%"` | CSS left. |
| `y` | `string` | `"50%"` | CSS top. |
| `size` | `string` | `"40%"` | CSS size. |
| `rotate` | `number` | `0` | Degrees. |
| `opacity` | `number` | `0.5` | 0–1. |

#### `<Chip>`

A pill with an optional lucide icon.

```mdx
<Chip tone="good" icon="check">Shipped</Chip>
```

| prop | type | default | |
| --- | --- | --- | --- |
| `children` | `ReactNode` |  |  |
| `tone` | `Tone` | `"neutral"` | One of: accent, accent-2, good, warn, bad, info, neutral, purple, pink, amber, teal. |
| `icon` | `string` |  | A lucide icon name (kebab-case). |

#### `<Divider>`

A horizontal rule with an optional centred label.

```mdx
<Divider label="Part two" />
```

| prop | type | default | |
| --- | --- | --- | --- |
| `label` | `ReactNode` |  |  |

#### `<Glass>`

A frosted card. Cards that share a row share a height.

```mdx
<Glass tone="accent" glow>

**42 ms** p95

</Glass>
```

| prop | type | default | |
| --- | --- | --- | --- |
| `children` | `ReactNode` |  |  |
| `tone` | `Tone` | `"neutral"` | One of: accent, accent-2, good, warn, bad, info, neutral, purple, pink, amber, teal. |
| `pad` | `string` | `"1em"` | CSS padding. |
| `glow` | `boolean` | `false` | Coloured glow. |

#### `<Glow>`

A soft blurred light behind the content.

```mdx
<Glow color="var(--deck-accent)" x="70%" y="30%" />
```

| prop | type | default | |
| --- | --- | --- | --- |
| `color` | `string` |  | CSS colour. |
| `size` | `string` | `"60%"` | CSS size. |
| `x` | `string` | `"50%"` | CSS left. |
| `y` | `string` | `"50%"` | CSS top. |
| `opacity` | `number` | `0.35` | 0–1. |

#### `<GradientText>`

Text filled with a gradient (theme accents by default).

```mdx
# <GradientText>Ship it.</GradientText>
```

| prop | type | default | |
| --- | --- | --- | --- |
| `children` | `ReactNode` |  |  |
| `from` | `string` |  | Start colour. |
| `to` | `string` |  | End colour. |
| `angle` | `number` | `90` | Degrees. |
| `as` | `"h1" \| "h2" \| "h3" \| "span" \| "strong"` | `"span"` | Element. |

#### `<Halo>`

A ring of light around an icon or emoji.

```mdx
<Halo tone="accent"><Icon name="sparkles" /></Halo>
```

| prop | type | default | |
| --- | --- | --- | --- |
| `children` | `ReactNode` |  |  |
| `tone` | `Tone` | `"accent"` | One of: accent, accent-2, good, warn, bad, info, neutral, purple, pink, amber, teal. |
| `size` | `string` | `"3.2em"` | CSS size. |

#### `<Icon>`

A Lucide icon by name, or any Iconify icon as `set:name` (`mdi:account`, `logos:vue`). Slidev's tag form `<mdi-account />` compiles to this. Built decks bundle the drawings from the deck's installed `@iconify-json/<set>` (or `@iconify/json`); the hosted shell, or a set not installed, fetches them from the Iconify API once and keeps them.

```mdx
<Icon name="rocket" size="2em" /> <Icon name="mdi:account-circle" color="tomato" /> <logos-react class="text-3xl" />
```

| prop | type | default | |
| --- | --- | --- | --- |
| `name` * | `string` |  | A Lucide name (`rocket`), or any Iconify icon as `set:name` (`mdi:account`, `logos:vue`). |
| `size` | `string \| number` | `"1em"` | Height: CSS size or px (the width follows the icon's proportions). Tag form: 1.2em. |
| `color` | `string` |  | CSS colour (monochrome icons). |
| `strokeWidth` | `number` | `1.75` | Lucide icons only. |
| `class` | `string` |  | Slidev's spelling of `className`. |
| `title` | `string` |  | An accessible name; without one the icon is decorative. |

#### `<Ribbon>`

A corner ribbon on the slide.

```mdx
<Ribbon tone="warn">Beta</Ribbon>
```

| prop | type | default | |
| --- | --- | --- | --- |
| `children` | `ReactNode` |  |  |
| `tone` | `Tone` | `"accent"` | One of: accent, accent-2, good, warn, bad, info, neutral, purple, pink, amber, teal. |
| `corner` | `"left" \| "right"` | `"right"` | left · right. |

#### `<Shimmer>`

Text with a light sweeping across it.

```mdx
## <Shimmer>Now live</Shimmer>
```

| prop | type | default | |
| --- | --- | --- | --- |
| `children` | `ReactNode` |  |  |
| `as` | `"h1" \| "h2" \| "span" \| "strong"` | `"span"` |  |

#### `<Tilt>`

A card that tilts toward the pointer.

```mdx
<Tilt><Glass>Hover me</Glass></Tilt>
```

| prop | type | default | |
| --- | --- | --- | --- |
| `children` | `ReactNode` |  |  |
| `max` | `number` | `8` | Maximum tilt in degrees. |

### Code

#### `<Code>`

The `pre` mapping behind fenced code blocks: Shiki highlighting, line-highlight steps, titles. Write a fence, not this tag.

````mdx
```ts {1|2-3|all} [app.ts]
const a = 1;
const b = 2;
export { a, b };
```
````

#### `<CodeGroup>`

Code blocks as tabs, each named by its fence's `[title]` with a file-type badge. Usually written as Slidev's `::code-group` … `::` around the fences (`:::` works too); ←/→ move between tabs. `clicks` turns tabs on each click; `print="all"` prints every tab.

````mdx
::code-group

```sh [npm]
npm i @kadal/deck
```

```sh [bun]
bun add @kadal/deck
```

::
````

| prop | type | default | |
| --- | --- | --- | --- |
| `children` | `ReactNode` |  | The fenced code blocks, one per tab (blank lines around them inside the tag). |
| `clicks` | `boolean` |  | Open the next tab on each click of the slide, from the group's own step on. |
| `at` | `string \| number` |  | With `clicks`: when the first turn happens, like `<Click at>` (`"+1"`, an absolute step). |
| `active` | `number` | `0` | The tab open at first (0-based). Default 0. |
| `print` | `"active" \| "all"` |  | What print and export show: the open tab (default) or every tab. |

#### `<MagicMove>`

Shiki Magic Move: code that morphs between versions, one per click. Written as a ````md magic-move fence holding one code fence per step.

`````mdx
````md magic-move
```ts
let n = 1
```
```ts
const n = 1
```
````
`````

### Diagrams

#### `<KatexLines>`

Display maths whose lines light up one step per click: what `$$ {1|3|all}` compiles to (Slidev's katex-lines). Write the `$$` block, not this tag.

```mdx
$$ {1|2|all}
\begin{aligned}
a &= b + c \\
d &= e
\end{aligned}
$$
```

#### `<Mermaid>`

A Mermaid diagram rendered in the browser in the deck's colours. Pass the source as a template string.

```mdx
<Mermaid>{`flowchart LR
  A[Write] --> B[Check] --> C[Present]`}</Mermaid>
```

| prop | type | default | |
| --- | --- | --- | --- |
| `children` | `ReactNode` |  | Mermaid source as a JSX template string. |
| `code` | `string` |  | The diagram's source, when it is not the children. |
| `scale` | `number` | `1` | Scale factor. |
| `theme` | `string` |  | A Mermaid theme for this diagram: default, neutral, dark, forest, base. |
| `config` | `Record<string, unknown>` |  | Mermaid configuration for this diagram (themeVariables, look, flowchart…). |
| `alt` | `string` |  | What the diagram shows, for screen readers (Slidev's fence `alt`); default its first line. |

#### `<Sketch>`

An Excalidraw drawing in the deck's colours: from the sketch DSL (`scene`), an .excalidraw file (`src`), or Mermaid (children); `steps` tours its regions one click at a time.

```mdx
<Sketch>{`flowchart LR; idea --> slide --> talk`}</Sketch>

<Sketch src="/diagrams/flow.excalidraw" height="600px" />
```

| prop | type | default | |
| --- | --- | --- | --- |
| `scene` | `SketchScene` |  | A scene built with `sketch()` from @kadal/deck/sketch (import it in src/components.tsx or the slide). |
| `src` | `string \| ExcalidrawFile` |  | Path to an .excalidraw file in public/. |
| `mermaid` | `string` |  | Mermaid source to convert. |
| `children` | `ReactNode` |  |  |
| `steps` | `SketchStep[]` | `[]` | Regions to light up, one per click, after the whole diagram has shown. |
| `caption` | `ReactNode` |  | Shown under the diagram when no step's caption is. |
| `width` | `string` |  | CSS size limits for the drawing. |
| `height` | `string` |  | CSS max height. |
| `fontSize` | `number` |  | Font size for Mermaid conversions. |
| `zoomable` | `boolean` | `true` | Show the button that opens it in Excalidraw's viewer. |

### Live

#### `<Leaderboard>` · live room

The quiz leaderboard.

```mdx
<Leaderboard top={5} />
```

| prop | type | default | |
| --- | --- | --- | --- |
| `top` | `number` | `8` | How many places. |

#### `<Pace>` · live room

A gauge of the audience's slower/faster feedback.

```mdx
<Pace />
```

#### `<Poll>` · live room

A poll the presenter opens; the audience answers from their phones. Kinds: choice, multi, rating, words.

```mdx
<Poll id="lunch" question="Lunch?" options={["Dosa", "Biryani", "Both"]} />
```

| prop | type | default | |
| --- | --- | --- | --- |
| `id` * | `string` |  | Stable id, unique in the deck (results are keyed by it). |
| `question` * | `string` |  | The question. |
| `options` | `string[]` | `[]` | Answers (choice and multi). |
| `kind` | `PollKind` | `"choice"` | choice · multi · rating · words. |
| `scale` | `number` | `5` | Points on a rating scale. |
| `liveResults` | `boolean` | `true` | Show results as they come, or only once closed. |

#### `<Presence>` · live room

How many people are following.

```mdx
<Presence />
```

#### `<QrJoin>` · live room

The QR code and short link for the audience page — put it on the title or first slide.

```mdx
<QrJoin size={300} />
```

| prop | type | default | |
| --- | --- | --- | --- |
| `size` | `number` | `260` | Pixels. |
| `caption` | `string` | `"Scan to follow along, react and ask"` | Text under the code. |

#### `<Questions>` · live room

The audience's questions, most upvoted first.

```mdx
## Questions?

<Questions limit={5} />
```

| prop | type | default | |
| --- | --- | --- | --- |
| `limit` | `number` | `6` | How many to show. |
| `children` | `ReactNode` |  |  |

#### `<Quiz>` · live room

A timed quiz question with points for speed; feeds the leaderboard.

```mdx
<Quiz id="q1" question="2 + 2?" options={["3", "4", "5"]} correct={1} seconds={15} />
```

| prop | type | default | |
| --- | --- | --- | --- |
| `id` * | `string` |  | Stable id, unique in the deck. |
| `question` * | `string` |  | The question. |
| `options` * | `string[]` |  | Answers. |
| `correct` * | `number` |  | 0-based index of the right answer. |
| `seconds` | `number` | `20` | Time limit. |

#### `<Reactions>` · live room

A reaction bar on the slide (the audience page always has one).

```mdx
<Reactions />
```

#### `<WordCloud>` · live room

The audience answers in a word or two; the words grow as they repeat.

```mdx
<WordCloud id="one-word" question="One word for this talk?" />
```

| prop | type | default | |
| --- | --- | --- | --- |
| `id` * | `string` |  | Stable id, unique in the deck. |
| `question` * | `string` |  | The prompt. |

### Motion

#### `<Motion>`

Animates a block with motion (framer-motion): `initial` → `enter` on arrival, `leave` on exit, and per-click targets (Slidev's v-motion).

```mdx
<Motion initial={{ opacity: 0, x: -80 }} enter={{ opacity: 1, x: 0 }} clicks={{ "click-1": { scale: 1.2 } }}>

Slides in from the left

</Motion>
```

| prop | type | default | |
| --- | --- | --- | --- |
| `initial` | `TargetAndTransition` | `{ opacity: 0, y: 24 }` | Motion target before arrival. |
| `enter` | `TargetAndTransition` | `{ opacity: 1, y: 0 }` | Motion target on arrival. |
| `leave` | `TargetAndTransition` |  | Motion target on exit. |
| `clicks` | `Record<string, TargetAndTransition>` | `{}` | Apply from a click on: `{ "click-1": { x: 40 }, "click-2": { y: 60 } }`. |
| `at` | `string \| number` |  | Tie the whole thing to a click step (like `v-click` + `v-motion`). |
| `transition` | `Transition<any>` |  | motion transition options. |
| `children` | `ReactNode` |  |  |
| `as` | `"div" \| "h1" \| "h2" \| "h3" \| "img" \| "li" \| "p" \| "span"` | `"div"` | Element to render. |

### Terms

#### `<Term>`

A glossary term card by hand: the entry named by its text or `id`, or a one-off with `def`. The compiler links first mentions from glossary.yaml automatically.

```mdx
<Term>UTM</Term> · <Term id="utm">projected metres</Term> · <Term def="Root-mean-square error." tag="Statistics">RMSE</Term>
```

| prop | type | default | |
| --- | --- | --- | --- |
| `id` | `string` |  | The glossary entry (its id, name or alias). Without it the children's text is looked up. |
| `def` | `string` |  | A one-off definition (inline Markdown). With it, the glossary is not consulted. |
| `more` | `string` |  |  |
| `title` | `string` |  | The card's title for a one-off; defaults to the children's text. |
| `full` | `string` |  | An abbreviation's expansion. |
| `tag` | `string` |  | Category chip. |
| `link` | `string` |  | Source URL. |
| `auto` | `boolean` |  | Internal (set by the compiler). |
| `children` | `ReactNode` |  |  |

#### `<TermReadout>`

The open term's definition as page content, for a page whose slide is too small for a card (custom audience pages).

```mdx
<TermReadout />
```

#### `<Terms>`

Links glossary mentions inside a plain string at render time — for words that arrive as a prop, which the compiler cannot see.

```mdx
<small><Terms>{"GNSS accuracy in UTM metres"}</Terms></small>
```

| prop | type | default | |
| --- | --- | --- | --- |
| `children` | `string \| null` |  |  |

## Backgrounds

`background: <name>` in frontmatter, `{ component: <name>, ...props }` for props, or `<Background name>` in the slide. Colours are CSS strings; `rgba()` sets their weight. With a component, `color` is its stroke and `fill`/`tint` washes the layer.

### Ambient

- **gradient-mesh** (also mesh) — Slow, drifting, blurred colour blobs. Props: `colors=["#3b82f6", "#8b5cf6", "#06b6d4", "#f59e0b"]`, `speed=1`. `background: { component: gradient-mesh, speed: 1 }`
- **aurora** — Soft northern-lights bands. Props: `colors=["#22d3ee", "#a78bfa", "#34d399"]`, `speed=1`. `background: { component: aurora, speed: 1 }`
- **waves** — Layered noise waves. Props: `colors=["#38bdf8", "#818cf8", "#c084fc", "#e879f9", "#22d3ee"]`, `speed=1`, `blur=10`. `background: { component: waves, speed: 1 }`
- **lines** — Flowing gradient lines. Props: `colors=["#1d4ed8", "#3b82f6", "#06b6d4"]`, `count=18`, `speed=0.3`. `background: { component: lines, count: 18 }`
- **beams** — Thin beams of light falling. Props: `color="#60a5fa"`, `count=7`. `background: { component: beams, color: "#60a5fa" }`
- **sparkles** — A twinkling particle field. Props: `color="#3b82f6"`, `density=400`, `size=1.6`. `background: { component: sparkles, color: "#3b82f6" }`
- **starfield** — Stars drifting slowly. Props: `color="#ffffff"`, `count=240`. `background: { component: starfield, color: "#ffffff" }`
- **grid** — A fine grid fading at the edges. Props: `color="rgba(127,127,127,0.25)"`, `size=48`. `background: { component: grid, size: 48 }`
- **dots** — A dot matrix. Props: `color="rgba(127,127,127,0.35)"`, `size=28`. `background: { component: dots, size: 28 }`
- **noise** — Film grain. Props: `opacity=0.12`. `background: { component: noise, opacity: 0.12 }`
- **spotlight** — A soft radial glow at a point. Props: `color="rgba(59,130,246,0.35)"`, `x=50`, `y=40`. `background: { component: spotlight, x: 50 }`

### Quiet

- **topo** (also contours) — Topographic contour lines with index lines. Props: `color="rgba(127,127,127,0.5)"`, `levels=14`, `speed=0.15`, `spacing=26`, `width=1`, `index=4`. `background: { component: topo, levels: 14 }`
- **glows** — Large slow glows of colour. Props: `colors=["#059669", "#3b82f6", "#f59e0b"]`, `opacity=0.35`, `speed=1`. `background: { component: glows, opacity: 0.35 }`
- **graticule** — A latitude/longitude graticule. Props: `color="rgba(127,127,127,0.28)"`, `size=40`, `major=5`. `background: { component: graticule, size: 40 }`
- **hex** — A hexagonal grid. Props: `color="rgba(127,127,127,0.25)"`, `size=28`. `background: { component: hex, size: 28 }`
- **constellation** — Points joined to their near neighbours, drifting. Props: `color="#3b82f6"`, `count=70`, `reach=140`. `background: { component: constellation, color: "#3b82f6" }`
- **vignette** — A darkened edge. Props: `color="rgba(0,0,0,1)"`, `strength=0.35`. `background: { component: vignette, strength: 0.35 }`
- **rays** — Light rays from a point. Props: `color="rgba(255,255,255,0.35)"`, `x=20`, `y=-10`, `opacity=0.5`. `background: { component: rays, x: 20 }`
- **stripes** — Diagonal stripes. Props: `color="rgba(127,127,127,0.12)"`, `size=14`, `angle=45`. `background: { component: stripes, size: 14 }`
- **sweep** — A slow animated gradient sweep across two or three colours. Props: `colors=["#0f172a", "#1e3a8a", "#0f766e"]`, `speed=1`, `angle=120`. `background: { component: sweep, speed: 1 }`

### Map

- **globe** — A wire globe off to one side, turning slowly, with day and night sides. Props: `color="rgba(127,127,127,0.55)"`, `x=0.82`, `y=0.45`, `radius=0.62`, `tilt=23`, `speed=6`, `step=15`, `opacity=1`. `background: { component: globe, x: 0.82 }`
- **lattice** — A grid that keeps zooming into one of its cells, three levels deep. Props: `color="rgba(127,127,127,0.35)"`, `accent="rgba(124,58,237,0.9)"`, `size=96`, `sub=4`, `period=9`. `background: { component: lattice, size: 96 }`
- **thiessen** (also voronoi) — Seeds drifting under their Voronoi (Thiessen) polygons. Props: `color="rgba(127,127,127,0.5)"`, `accent="rgba(13,148,136,0.9)"`, `count=22`, `speed=5`. `background: { component: thiessen, count: 22 }`
- **cells** — Reports landing on a lattice: cells light up, ripple and go dark. Props: `color="rgba(127,127,127,0.3)"`, `accent="rgba(219,39,119,0.9)"`, `size=30`, `rate=0.9`, `life=7`. `background: { component: cells, size: 30 }`
- **compass** — A compass rose with its degree ring turning. Props: `color="rgba(127,127,127,0.5)"`, `accent="rgba(220,38,38,0.85)"`, `x=0.84`, `y=0.52`, `radius=0.42`, `speed=3`. `background: { component: compass, x: 0.84 }`
- **neatline** — A map sheet's frame: neatline, coordinate ticks, north arrow, scale bar. Props: `color="rgba(127,127,127,0.55)"`, `inset=0.045`, `step=48`, `lat=13.0`, `lon=80.1`. `background: { component: neatline, inset: 0.045 }`
- **scan** — A graticule swept by a satellite pass. Props: `color="rgba(127,127,127,0.35)"`, `accent="rgba(59,130,246,0.9)"`, `size=48`, `major=5`, `speed=40`. `background: { component: scan, size: 48 }`
- **track** — A GPS trail wandering, with a pulsing head. Props: `color="rgba(127,127,127,0.6)"`, `accent="rgba(5,150,105,0.9)"`, `speed=1`, `width=2`. `background: { component: track, speed: 1 }`
- **raster** (also choropleth) — A choropleth of cells classed by a drifting field, with its legend. Props: `color="rgba(5,150,105,1)"`, `size=40`, `classes=6`, `speed=0.05`, `opacity=0.55`. `background: { component: raster, size: 40 }`
- **plane** (also floor) — A dotted ground plane in oblique projection for exploded figures; locks onto `data-plane="origin"`/`"unit"` marks in the slide. Props: `color="rgba(100,116,139,0.55)"`, `accent="rgba(13,148,136,0.9)"`, `size=36`, `shear=0.62`, `rise=0.3`, `major=4`, `x=0.05`, `y=0.9`, `horizon=0.24`, `focus=0.3`, `speed=11`. `background: { component: plane, size: 36 }`

### Sign

- **signer** — A landmark skeleton signing, with a fading wrist trail. Props: `color="rgba(13,148,136,0.55)"`, `accent="rgba(124,58,237,0.75)"`, `x=0.78`, `y=0.42`, `scale=0.16`, `speed=1`, `zones`, `trail`. `background: { component: signer, x: 0.78 }`
- **variants** — One signer drawn as several synthetic variants at once. Props: `color="rgba(5,150,105,0.5)"`, `accent="rgba(124,58,237,0.7)"`, `x=0.78`, `y=0.4`, `scale=0.15`, `count=4`, `speed=1`. `background: { component: variants, x: 0.78 }`
- **handshapes** — A calm field of hands morphing through handshapes. Props: `color="rgba(13,148,136,0.4)"`, `accent="rgba(124,58,237,0.6)"`, `cols=7`, `rows=4`, `size=0.075`, `speed=1`, `top=0`. `background: { component: handshapes, cols: 7 }`
- **trails** — Wrist paths through signing space; `align` adds a time-warped copy (DTW). Props: `color="rgba(13,148,136,0.55)"`, `accent="rgba(124,58,237,0.8)"`, `count=4`, `speed=1`, `align`, `area="0,0,1,1"`. `background: { component: trails, count: 4 }`
- **window** — Frames scrolling past a hopping 64-frame recogniser window. Props: `color="rgba(37,99,235,0.45)"`, `accent="rgba(5,150,105,0.8)"`, `speed=1`, `y=0.93`. `background: { component: window, speed: 1 }`
- **embedding** — Word clusters around prototypes and a query finding its nearest. Props: `color="rgba(124,58,237,0.45)"`, `accent="rgba(5,150,105,0.85)"`, `count=9`, `speed=1`. `background: { component: embedding, count: 9 }`

### Not components

- **color** — A flat colour (any CSS colour). `background: "#0f172a"`
- **gradient** — A CSS gradient. `background: "linear-gradient(135deg, #0f172a, #1e3a8a)"`
- **image** — An image (public/ path or URL), cover by default. `background: /photo.jpg`
- **video** — A looping muted video (.mp4/.webm/.mov/.ogv). `background: /loop.mp4`
- **iframe** — A web page behind the slide. `background: { iframe: https://example.com, interactive: false }`
- **tint** — A soft diagonal wash of one colour (`fill:` or `tint:`), alone or under a component background whose `color` is its stroke. `background: { component: topo, color: "rgba(5,150,105,0.55)", fill: "rgba(5,150,105,0.12)" }`

## Themes

- **minimal** (light) — The default: black on white, a wide sans serif, one accent. Dark mode inverts. CSS: `@kadal/deck/themes/minimal.css`
- **rla** (dark) — Zinc-950 with a blue→violet ramp, dot-matrix headings, made for the animated backgrounds. CSS: `@kadal/deck/themes/rla.css`
- **stack** (light) — An emerald accent on warm neutrals, Inter, product-like. CSS: `@kadal/deck/themes/stack.css`

Theme and addon packages: `theme: seriph` finds @kadal/theme-seriph, then kadal-theme-seriph, then the package `seriph`; `theme: ./theme` is a folder beside deck.mdx; `addons: [qr]` the same with addon-. The Vite plugin imports their CSS and modules; their layouts, components and layers merge in under the deck's own; `themeConfig` keys become `--theme-<kebab>` CSS variables. `kadal-deck info themes` lists the ones installed, `kadal-deck new --theme <name>` makes one, `kadal-deck theme eject` copies one into the deck. The contract: THEMES.md in @kadal/deck.

First-party theme packages (install one, then `theme: <name>`; the prebuilt shell has them all):

- **classic** (light and dark) — Slidev's default theme: Avenir Next, light headings, square bullets, dashed links, a cyan primary; a dimmed picture under the cover. `@kadal/theme-classic`, from Slidev's `default`. Adds layouts `cover`.
- **seriph** (light and dark) — Slidev's seriph: PT Serif throughout, headings in the primary colour (themeConfig.primary, slate teal), a centred cover. `@kadal/theme-seriph`, from Slidev's `seriph`. Adds layouts `cover`.
- **crisp** (light and dark) — Plain black on white: Helvetica Neue, bold titles under a bold subtitle, pictures set in a margin. `@kadal/theme-crisp`, from Slidev's `apple-basic`. Adds layouts `intro-image`, `intro-image-right`, `image-right`, `3-images`, `bullets`.
- **bricks** (light) — Slidev's bricks: building blocks in coral, butter, rose and sky on a cream page, Sigmar One headings. Light only. `@kadal/theme-bricks`, from Slidev's `bricks`. Adds layouts `items`, `blank`; components `Polygon1`, `Polygon2`, `Polygon3`, `Polygon4`, `Polygon5`, `Polygon6`, `Polygon7`, `Polygon8`, `Polygon9`, `Polygon10`, `Polygon11`.
- **shibainu** (dark) — Slidev's shibainu: soft blobs in a shiba's browns, Titillium Web, a different arrangement for each of fourteen layouts. Dark only. `@kadal/theme-shibainu`, from Slidev's `shibainu`. Adds layouts `default-2`, `default-3`, `default-4`, `default-5`, `default-6`, `default-7`, `right`, `section-2`, `section-3`.
- **brand** (light and dark) — A corporate theme branded from themeConfig alone — primary and secondary colours, a logo (and a dark one), the company and a footer line — on a white page with Plus Jakarta Sans and calm cards. `@kadal/theme-brand`. Adds layouts `title-logo`, `agenda`, `metrics`; components `Metric`, `Logo`.
- **crayon** (light and dark) — A playful pastel theme for workshops and classrooms: Fredoka and Nunito, cream paper and plum ink, chunky outlines, callouts as tilted stickers, a blockquote as a speech bubble. `@kadal/theme-crayon`. Adds layouts `activity`, `cards`; components `Sticker`, `Bubble`.
- **folio** (light and dark) — An editorial theme for essays and keynotes: warm paper and ink, Playfair Display over Newsreader, booktabs tables, an asterism for a rule, a drop cap, generous margins. `@kadal/theme-folio`. Adds layouts `pull-quote`, `essay`, `chapter`; components `Byline`, `Lede`.
- **lecture** (light and dark) — An academic theme: the Source family, numbered sections, a footer with the course, author, section and page, definition / theorem / proof blocks, citations and a references slide; prints on white. `@kadal/theme-lecture`. Adds layouts `section`, `definition`, `theorem`, `references`; components `Definition`, `Theorem`, `Lemma`, `Corollary`, `Proposition`, `Proof`, `Example`, `Remark`, `Cite`.
- **neon** (dark) — A dark synthwave theme for meetups and launches: a striped sunset over a running grid, Orbitron and Space Grotesk, glows that keep the letters near white, a solid print fallback. Dark only. `@kadal/theme-neon`. Adds layouts `launch`, `horizon`; components `Glow`.
- **ocean** (light and dark) — Kadal's own theme: the sea's palette, sunlit shallows in light and midnight water in dark, calm gradients, Catamaran, Night Owl code; a wave cover and depth-gauge section openers. `@kadal/theme-ocean`. Adds layouts `waves`, `depth`; components `Wave`.
- **swiss** (light and dark) — The International Typographic Style: huge Inter Tight headings flush left on a twelve-column grid, heavy rules, one signal red, a running header with the section and page. `@kadal/theme-swiss`. Adds layouts `poster`, `index`, `grid`; components `Rule`.
- **terminal** (light and dark) — A developer theme for code-heavy talks: JetBrains Mono headings, code blocks as editor windows, line numbers and a lit active line, Ayu colours; dark first with a light variant. `@kadal/theme-terminal`. Adds layouts `code`, `shell`; components `Terminal`.

## Transitions

- `none` — Cut straight to the next slide.
- `fade` — Cross-fade.
- `slide` — Slide horizontally (vertically within a stack). The default.
- `convex` — Slide with a convex 3D turn.
- `concave` — Slide with a concave 3D turn.
- `zoom` — Zoom into the next slide.
- `view-transition` — The browser's View Transitions API: elements with matching view-transition-name morph.

## Transition speeds

- `default` — 0.6 s.
- `fast` — 0.3 s.
- `slow` — 1 s.

## Click effects

- `fade-in` — Fade in (the default).
- `fade-out` — Start visible, fade out.
- `fade-up` — Fade in moving up.
- `fade-down` — Fade in moving down.
- `fade-left` — Fade in moving left.
- `fade-right` — Fade in moving right.
- `fade-in-then-out` — Fade in, then out at the next step.
- `fade-in-then-semi-out` — Fade in, then dim at the next step.
- `current-visible` — Visible only during its own step.
- `grow` — Scale up.
- `shrink` — Scale down.
- `strike` — Strike through.
- `semi-fade-out` — Dim to half opacity.
- `highlight-red` — Turn red.
- `highlight-green` — Turn green.
- `highlight-blue` — Turn blue.
- `highlight-current-red` — Red only during its own step.
- `highlight-current-green` — Green only during its own step.
- `highlight-current-blue` — Blue only during its own step.

## Click timing (`at`)

- `(omitted)` — One step after the previous click element — the usual case.
- `"+N"` — N steps after the previous element; "+0" shares its step (same as <After>).
- `N` — Absolute step N; 0 means always shown and takes no step.
- `[from, to]` — Visible from step `from` until step `to`, hidden again from `to` on.
- `hide` — With `hide`, the element starts visible and disappears at its step.
- `clicks: N` — Slide frontmatter: force the slide's total number of steps.

## Code blocks

- `` ```ts `` — Highlighted with Shiki at build time (light and dark themes).

````mdx
```ts
const a = 1
```
````

- `{2-3|5|all}` — Line highlights, one set per click step: ranges, commas, `all`/`*`, `none`. N sets = N-1 clicks.

````mdx
```ts {1|2-3|all}
const a = 1
const b = 2
const c = 3
```
````

- `{hide|…}` — Hide the whole block until its first step.

````mdx
```ts {hide|1|2}
a
b
```
````

- `[file.ts]` — A title bar with a file name.

````mdx
```ts [app.ts]
export {}
```
````

- `{lines:true}` — Options object after the steps: lines (line numbers), startLine, maxHeight (CSS; scrolls beyond).

````mdx
```ts {2}{lines:true,startLine:10,maxHeight:'300px'}
a
b
```
````

- `data-line-numbers="3-5|8"` — reveal.js's attribute spelling: line numbers on, with optional steps; data-ln-start-from sets the first number.

````mdx
```js data-line-numbers="1|2"
a
b
```
````

- `// [!code ++]` — Shiki notation comments, at the end of a line (any comment style): `[!code ++]` / `[!code --]` added and removed lines, `[!code highlight]` (or `highlight:3` for 3 lines), `[!code focus]` blurs the rest until hover, `[!code error]` / `[!code warning]`, `[!code word:name]` marks every `name`. The comment is removed. Works with click steps; `deck({ shiki: { transformers } })` adds your own transformers.

````mdx
```ts
const a = 1 // [!code --]
const a = 2 // [!code ++]
const b = a // [!code highlight]
```
````

- `::code-group` — Fences between `::code-group` and `::` (or `:::`) become tabs (`<CodeGroup>`), named by each fence's `[title]`. Options after the opener: `{clicks:true}` turns tabs on clicks, `{print:'all'}` prints every tab.

````mdx
::code-group

```sh [npm]
npm i @kadal/deck
```

```sh [bun]
bun add @kadal/deck
```

::
````

- `<<< @/snippets/file.ts#region` — Import code from a file (`@` = the deck's folder; `./x` relative to the slide's file), optionally one `#region` (marked `// #region name` … `// #endregion` in any comment style). A language word and any fence meta may follow: `<<< @/a.js ts {2|4}{lines:true} [a.ts]`. Watched in dev; in the hosted shell the file must be published beside deck.mdx.

```mdx
<<< @/snippets/tide.ts#ask {2-3} [tide.ts]
```

- `twoslash` — TypeScript type information rendered at build time: hover (or Tab to) a name for its type, errors underlined with the compiler's message, `// ^?` pins a type under the token above. Needs `typescript` installed; the hosted shell renders the block plain.

````mdx
```ts twoslash
const tide = { height: 6.1 }
//    ^?
```
````

- `{monaco}` — A Monaco editor on the slide (lazy-loaded; print, export and the phone remote show the highlighted code). Options: height (CSS or 'auto' to grow), lines, editorOptions (Monaco IEditorOptions), readonly. Esc gives the keys back to the deck.

````mdx
```ts {monaco}{height:'auto'}
const greeting = 'hello'
```
````

- `{monaco-diff}` — A Monaco diff editor: the original code, a line of `~~~`, then the modified code. Print shows a unified line diff. `{sideBySide:false}` for inline.

````mdx
```ts {monaco-diff}
const tide = 6.1
~~~
const tide = 6.4
```
````

- `{monaco-run}` — An editor with a Run button (Ctrl/⌘+Enter) and the output under it: JS/TS run in a Web Worker (console captured, timeouts), Python in Pyodide; other languages through `registerCodeRunner` or setup/code-runners.ts. Options: autorun (default true, re-runs on edit), showOutputAt (a click, e.g. '+1'), outputHeight, outputPosition ('bottom' | 'right'), timeout (ms), runnerOptions.

````mdx
```ts {monaco-run}{showOutputAt:'+1'}
console.log([1, 2, 3].map((n) => n * 2))
```
````

- `{monaco-write}` — An editor whose edits are saved back to the source in `kadal-deck dev` (the imported file with `<<<`, else the fence in deck.mdx); read-only in a build and in the hosted shell.

```mdx
<<< @/snippets/tide.ts#ask {monaco-write}
```

- `` ````md magic-move `` — A 4-backtick md fence holding one code fence per step: the code morphs between them on each click.

`````mdx
````md magic-move
```ts
let x = 1
```
```ts
const x = 1
```
````
`````

## Deck frontmatter (headmatter)

The YAML block at the very top of deck.mdx. It configures the deck and is also the first slide's frontmatter. `deck.config.ts` overrides it.

| key | type | default | |
| --- | --- | --- | --- |
| `title` | `string` | `"Untitled deck"` | The deck's title (browser tab, table of contents, publish). |
| `author` | `string` | `""` | Who gives the talk. |
| `info` | `string` | `""` | A line about the deck (Markdown). |
| `width` | `number` | `1920` | The authored size; the stage scales uniformly to fit any viewport. |
| `height` | `number` | `1080` | The authored height in px; with width, the stage every screen scales. |
| `margin` | `number` | `0` | Fraction of the viewport left empty around the stage. 0 by default: a 16:9 window shows the slide edge to edge, any other shape gets bars on two sides — the content never reflows. |
| `minScale` | `number` | `0.2` | Smallest scale the stage may shrink to. |
| `maxScale` | `number` | `2` | Largest scale the stage may grow to. |
| `center` | `boolean` | `true` | Vertically centre each slide's content. |
| `controls` | `boolean \| "speaker"` | `true` | Show the navigation arrows; "speaker" shows them only in the presenter view. Values: `speaker` |
| `controlsLayout` | `"bottom-right" \| "edges"` | `"bottom-right"` | Where the arrows sit. Values: `bottom-right` `edges` |
| `controlsTutorial` | `boolean` | `true` | Hint at vertical slides the first time. |
| `controlsBackArrows` | `"visible" \| "faded" \| "hidden"` | `"faded"` | How the back arrows look. Values: `visible` `faded` `hidden` |
| `progress` | `boolean` | `true` | The progress bar along the bottom. |
| `slideNumber` | `boolean \| SlideNumberFormat` | `false` | Show slide numbers: true, or a format — "h.v", "h/v", "c" (current), "c/t" (current/total). Values: `c` `c/t` `h.v` `h/v` |
| `showSlideNumber` | `"all" \| "print" \| "speaker"` | `"all"` | Where slide numbers show. Values: `all` `print` `speaker` |
| `hash` | `boolean` | `true` | Keep the URL hash in step with the slide. |
| `hashOneBasedIndex` | `boolean` | `false` | 1-based slide numbers in the hash. |
| `history` | `boolean` | `false` | Push a history entry per slide (Back walks the slides). |
| `keyboard` | `boolean \| Record<string, KeyAction \| null>` | `true` | Keyboard navigation on. |
| `overview` | `boolean` | `true` | The overview grid (O / Esc). |
| `touch` | `boolean` | `true` | Swipe navigation. |
| `loop` | `boolean` | `false` | Wrap from the last slide to the first. |
| `rtl` | `boolean` | `false` | Right-to-left. |
| `navigationMode` | `NavigationMode` | `"default"` | "default", "linear" (arrows walk every slide) or "grid" (columns stay aligned). Values: `grid` `default` `linear` |
| `shuffle` | `boolean` | `false` | Shuffle the slides on load. |
| `fragments` | `boolean` | `true` | Clicks/fragments on; off shows every step at once. |
| `fragmentInURL` | `boolean` | `true` | Include the click step in the hash. |
| `embedded` | `boolean` | `false` | The deck lives inside another page. |
| `help` | `boolean` | `true` | The ? keyboard help. |
| `pause` | `boolean` | `true` | B / . blacks the screen out. |
| `showNotes` | `boolean \| "separate-page"` | `false` | Print notes with the slides: true (in a box) or "separate-page". Values: `separate-page` |
| `autoPlayMedia` | `boolean \| null` | `null` | Autoplay media on every slide (null = per element). |
| `autoAnimate` | `boolean` | `true` | Allow auto-animate between slides that set `autoAnimate`. |
| `autoAnimateEasing` | `string` | `"ease"` | CSS easing for auto-animate. |
| `autoAnimateDuration` | `number` | `1` | Seconds. |
| `autoAnimateUnmatched` | `boolean` | `true` | Fade in elements without a match. |
| `autoSlide` | `number` | `0` | Milliseconds between automatic steps; 0 disables. |
| `autoSlideStoppable` | `boolean` | `true` | Any input stops auto-slide. |
| `defaultTiming` | `number \| null` | `null` | Seconds per slide for the pacing timer, or null. |
| `totalTime` | `number \| null` | `null` | Total seconds for the pacing timer, or null. |
| `mouseWheel` | `boolean` | `false` | Scroll-wheel navigation. |
| `previewLinks` | `boolean` | `false` | Open links in an overlay. |
| `transition` | `Transition` | `"slide"` | Slide transition (see transitions), or one of your own from `transitions` (or CSS on `.deck-stage[data-transition="name"]` setting `--deck-anim-in` / `--deck-anim-out`). Values: `slide` `fade` `none` `zoom` `convex` `concave` `view-transition` |
| `transitionSpeed` | `TransitionSpeed` | `"default"` | default · fast · slow. Values: `default` `fast` `slow` |
| `backgroundTransition` | `Transition` | `"fade"` | Transition for backgrounds. Values: `slide` `fade` `none` `zoom` `convex` `concave` `view-transition` |
| `viewDistance` | `number` | `3` | Slides kept mounted on either side. |
| `mobileViewDistance` | `number` | `2` | The same, on phones. |
| `hideInactiveCursor` | `boolean` | `true` | Hide an idle cursor. |
| `hideCursorTime` | `number` | `5000` | Milliseconds before it hides. |
| `view` | `"slide" \| "scroll"` | `"slide"` | "slide" (the stage) or "scroll" (a page). Values: `slide` `scroll` |
| `scrollProgress` | `boolean \| "auto"` | `"auto"` | The scroll view's progress bar. Values: `auto` |
| `scrollSnap` | `false \| "mandatory" \| "proximity"` | `"mandatory"` | Scroll snapping in the scroll view. Values: `mandatory` `proximity` `false` |
| `scrollActivationWidth` | `number` | `0` | Viewport width under which the scroll view switches on by itself; 0 (the default) never does — a phone gets the same stage, letterboxed, and `?view=scroll` stays an explicit choice. |
| `theme` | `string` | `"minimal"` | The theme: a built-in (minimal, rla, stack, none), a package (`seriph` finds @kadal/theme-seriph, then kadal-theme-seriph, then a package of that name), a folder (`./theme`), or a class your own CSS defines (.theme-<name>). The Vite plugin imports a package's CSS and module for you; `kadal-deck theme eject` copies it into the deck. Values: e.g. `minimal` `rla` `stack` |
| `themes` | `string[]` | `["minimal","rla","stack"]` | The themes the theme menu offers, besides `theme`: built-ins, packages or folders, resolved like `theme` (the Vite plugin imports their CSS), or classes main.tsx's CSS defines. |
| `colorScheme` | `ColorScheme` | `"auto"` | "auto" (follow the system), "light" or "dark". Values: `light` `dark` `auto` |
| `pdfSeparateFragments` | `boolean` | `true` | A page per click step in print/PDF. |
| `pdfMaxPagesPerSlide` | `number` | `1` | Pages a tall slide may spill onto. |
| `jumpToSlide` | `boolean` | `true` | `:12` / g jumps. |
| `search` | `boolean` | `true` | / searches the deck. |
| `zoom` | `boolean` | `true` | Alt+click zooms into a point; Esc zooms back out. |
| `wakeLock` | `boolean` | `true` | Keep the screen awake while presenting. |
| `selectable` | `boolean` | `true` | Text can be selected. |
| `lineNumbers` | `boolean` | `false` | Line numbers on every code block. |
| `autoFit` | `boolean` | `true` | Scale a slide whose content overflows so it fits (measured after render). |
| `magicMoveDuration` | `number` | `800` | Milliseconds per magic-move morph. |
| `live` | `{ api: string \| null; room: string \| null; turnstile: string \| null; verify?: string \| null; }` | `{"api":"/api","room":null,"turnstile":null}` | Live room: the backend base (same origin `/api` on the host), or null for an offline deck. `verify` is a host page that checks a viewer (Turnstile) and sends them back with a pass — how a host that serves decks sandboxed keeps the check, since Turnstile can't run in an opaque origin. Set by the host (`window.__KADAL_DECK__.verify`), never by a deck. |
| `drawings` | `DrawingsConfig` | `{"enabled":true,"persist":true,"presenterOnly":false,"syncAll":true,"perClick":false}` | Drawing: { enabled: true \| false \| "dev", persist: true (browser storage) \| "files" (drawings/<slide>.svg beside deck.mdx, written on `kadal-deck dev`, bundled into the build, printed into every export) \| false, presenterOnly, syncAll, perClick (a stroke shows from the click step it was drawn on) }. Files in drawings/ are always shown under the live strokes. |
| `narration` | `NarrationConfig \| boolean` | `{"enabled":"auto","engine":"auto","voice":"af_heart","rate":1,"gap":600,"silent":"estimate","model":"onnx-community/Kokoro-82M-v1.0-ONNX","dtype":"auto"}` | Narration (autoplay rehearsal: the notes read aloud, each `[click]` part at its step, the pages turning by themselves): { enabled ("auto" = when some slide has notes; false turns it off), engine ("auto" · "baked" · "kokoro" · "browser" · "silent"), voice (Kokoro id, default af_heart), rate (0.5–3), gap (ms between steps), silent (a slide without notes: "estimate", "skip" or ms), model (Hugging Face id), dtype ("auto" · fp32 · fp16 · q8 · q4 · q4f16) }. The bar is in the presenter view; on the deck, `?narrate` or R. Kokoro needs `kokoro-js` installed (`kadal-deck narrate --setup`); without it the browser's own voice reads. `kadal-deck narrate` bakes clips. |
| `glossary` | `GlossaryOptions \| string \| false` | `{"src":"glossary.yaml","repeat":"first","headings":"fallback","skip":[],"delay":700,"sync":false}` | Term cards. The runtime reads `delay` and `sync`; the rest steers the compiler, which sees the headmatter only — set those there. `glossary: false` or a path are shorthands. Values: `false` |
| `reactions` | `boolean` | `true` | Audience reactions in the live room. |
| `qa` | `boolean` | `true` | Audience questions in the live room. |
| `polls` | `boolean` | `true` | Polls and quizzes in the live room. |
| `audienceNotes` | `boolean` | `false` | Show every slide's notes to anyone on the audience page (after the talk, for instance). |
| `slug` | `string` | `""` | The deck's slug on the host, from the Vite base — decks/<slug>. |
| `badge` | `boolean` | `false` | Show the "Made with Kadal Deck" link in the corner (set by the host, see `withHostOverride`). |
| `ads` | `boolean` | `false` | Frame the first and last slides with the host's ads (set by the host, see `withHostOverride` and core/ads.ts). Only the play view shows them. |
| `download` | `string \| boolean` | `false` | A Download button beside the theme menu. `true` offers the PDF that `kadal-deck build --download` puts beside the deck (`deck.pdf`), or the browser exporter (/export) when there is none; a URL links that file instead. A host may switch it off, or on, for the decks it serves (`window.__KADAL_DECK__.download`). See core/download.ts. |
| `fonts` | `FontsInput` | `[]` | Web fonts: Google Fonts families as written (`["Inter:wght@400;600"]`), or Slidev's object — `{ sans, heading, serif, mono, weights, italic, provider: google\|bunny\|none, local, fallbacks }` — which also points the theme's font tokens at them (theming/fonts.ts). |
| `seoMeta` | `Record<string, string>` | `{}` | The link preview and search tags (core/head.ts), by Slidev's (unhead's) names: `ogImage` (`auto` photographs slide 1 into og-image.png at build; a path or URL uses that), `ogUrl`, `ogTitle`, `ogDescription`, `twitterCard`, `twitterSite`, `canonical`, `themeColor`, and any other key as a meta tag of its own. Written into the built index.html. |
| `lang` | `string` | `""` | The page's language: `<html lang>` and og:locale. Empty leaves index.html's. |
| `favicon` | `string` | `""` | The tab icon: a file in public/ (`/logo.svg`) or a URL. The PWA's icon, when it is local. |
| `pwa` | `boolean \| Record<string, string>` | `false` | `kadal-deck build` makes the deck an installable web app that presents offline: a web manifest, icons, and a service worker that precaches the build (vite/pwa.ts). Never in dev; `kadal-deck publish` leaves it out unless `--pwa`. An object sets { name, shortName, themeColor, backgroundColor, display }. |
| `bundleRemoteAssets` | `boolean` | `false` | At build, download the remote images, media, fonts (Google Fonts' CSS and its files) and CSS `url()`s the deck names into dist/remote-assets/ and point the deck at the copies, so it presents with no network (vite/remote-assets.ts). Cached in .kadal-deck/cache. |
| `defaults` | `Frontmatter` | `{}` | Frontmatter every slide gets unless it sets the key itself (Slidev's `defaults`), e.g. `{ layout: center, transition: fade }`. A theme's defaults sit beneath it. |
| `plantUmlServer` | `string` | `"https://www.plantuml.com/plantuml"` | The PlantUML server ```plantuml fences render with: `<server>/svg/<encoded source>`. |
| `comark` | `boolean` | `false` | Comark (formerly MDC) syntax in the slides: `:badge[New]{tone="good"}`, `[text]{.class}`, `::callout{type="warn"}` … `::` blocks with `#slot` sections (compiler/remark-comark.ts). |
| `notesAutoRuby` | `Record<string, string>` | `{}` | Words in the speaker notes and their reading, shown as ruby: `{ 日本語: "ni hon go" }`. |
| `katex` | `{ [option: string]: unknown; macros?: Record<string, string>; }` | `{}` | KaTeX options for every formula, e.g. `{ macros: { "\\RR": "\\mathbb{R}" } }`. |
| `mermaid` | `Record<string, unknown>` | `{}` | Mermaid configuration for every diagram (theme, themeVariables, look, flowchart…). |
| `transitions` | `Record<string, TransitionDefinition>` | `{}` | Named custom transitions: `{ flip: { in: "flip-in", out: "flip-out", back: {…} } }`, the keyframes defined in the theme's CSS or a `<style global>` (core/transitions.ts). |
| `addons` | `string[]` | `[]` | Addon packages: `@kadal/addon-<name>`, `kadal-addon-<name>`, a package name or a folder. |
| `themeConfig` | `Record<string, unknown>` | `{}` | The theme's knobs: each key becomes a `--theme-<kebab-key>` custom property on the deck root (`primary: "#0f766e"` → `--theme-primary`), over the theme's own defaults. |
| `layers` | `{ presenter: boolean; overview: boolean; }` | `{"presenter":true,"overview":false}` | Where the global and slide layers draw besides the deck, print and export. |
| `timer` | `"stopwatch" \| "countdown"` | `"stopwatch"` | The presenter's timer: "stopwatch" counts up, "countdown" counts down from `duration` (Slidev's `timer:`). Both pause, resume and reset, show a progress bar when the talk has a length, and go into overtime past it; the pacing badge (ahead/behind) works with either. Values: `stopwatch` `countdown` |
| `duration` | `string \| number \| null ("30min", "1h", "90s", "25:00", or minutes)` | `null` | How long the talk is, in seconds once read: `30min`, `1h`, `1h30m`, `90s`, `25:00`, or a number of minutes (Slidev's `duration:`). The countdown runs from it and the progress bar fills to it; pacing spreads it over the slides when there is no `totalTime`. Null: the planned length is `totalTime`, else the slides' `timing` added up, else (for a countdown) thirty minutes. |
| `contextMenu` | `boolean \| "dev" \| "build"` | `true` | The right-click menu on the slides: true (always), false (never), "dev" (only under `kadal-deck dev`) or "build" (only in a built deck). Shift + right-click always gives the browser's own menu. Values: `dev` `build` |
| `aspectRatio` | `number` |  | Slidev spelling: with canvasWidth, sets width and height (16/9 = 1.777…). |
| `canvasWidth` | `number` |  | Slidev spelling: the stage width used with aspectRatio. |
| `mdc` | `boolean` |  | Slidev's older spelling of `comark` (MDC is Comark's former name). |
| `remoteAssets` | `boolean \| "build"` |  | Slidev spelling of bundleRemoteAssets (true or "build"; "dev" does nothing). |

## Slide frontmatter

YAML right after a slide's `---` separator, closed by another `---`.

| key | type | default | |
| --- | --- | --- | --- |
| `layout` | `string` |  | The slide's layout (see layouts). Default: cover for the first slide, default after. Values: e.g. `default` `center` `cover` `intro` `section` `end` `fact` `quote` |
| `class` | `string \| string[]` |  | Extra CSS classes on the slide. |
| `id` | `string` |  | A stable id: `#/<id>` links here and <Link to> finds it. |
| `routeAlias` | `string` |  | Slidev's spelling of `id` for links. |
| `title` | `string` |  | The title the table of contents and search use (default: the first heading). |
| `level` | `number` |  | Heading level for the table of contents (default: the first heading's depth). |
| `hide` | `boolean` |  | Leave the slide out of the talk (still in the file). |
| `disabled` | `boolean` |  | Same as hide. |
| `visibility` | `"hidden" \| "uncounted"` |  | "hidden" leaves it out; "uncounted" shows it without a number. Values: `hidden` `uncounted` |
| `hideInToc` | `boolean` |  | Keep the slide out of <Toc>. |
| `transition` | `string` |  | This slide's transition (see transitions): a built-in, or a name from the headmatter's `transitions` / `registerTransition` / your CSS. `zoom-in fade-out` names each half. Values: e.g. `none` `fade` `slide` `convex` `concave` `zoom` `view-transition` |
| `transitionSpeed` | `"default" \| "fast" \| "slow"` |  | This slide's transition speed. Values: `default` `fast` `slow` |
| `backgroundTransition` | `string` |  | This slide's background transition. Values: e.g. `none` `fade` `slide` `convex` `concave` `zoom` `view-transition` |
| `autoAnimate` | `boolean \| { id: string }` |  | Animate matching elements (same text or data-id) from the previous auto-animate slide. |
| `autoAnimateId` | `string` |  | Only auto-animate between slides with the same id. |
| `autoAnimateRestart` | `boolean` |  | Break the auto-animate chain here. |
| `autoSlide` | `number` |  | Milliseconds before this slide advances on its own. |
| `autoslide` | `number` |  | reveal.js spelling of autoSlide. |
| `clicks` | `number` |  | Force the number of click steps. |
| `clicksStart` | `number` |  | The step the slide opens at. |
| `preload` | `boolean` | `true` | Load the slide's module ahead of time (default true). |
| `timing` | `number` |  | Seconds planned for this slide (the presenter's pacing timer). |
| `state` | `string \| string[]` |  | Adds state-<name> classes while the slide shows (CSS hooks). |
| `colorScheme` | `"light" \| "dark"` |  | Force light or dark tokens on this slide (dark background under a light theme). Values: `light` `dark` |
| `zoom` | `number` |  | Scale the slide's content (0.8 fits more). |
| `background` | `string \| object` |  | A background: a registered name (aurora…), a colour, a gradient, an image or video path/URL, or { component, ...props } / { image, size, position, opacity } / { iframe, interactive } / { fill \| tint }. |
| `backgroundColor` | `string` |  | reveal.js: flat background colour. |
| `backgroundGradient` | `string` |  | reveal.js: a CSS gradient. |
| `backgroundImage` | `string` |  | reveal.js: an image URL. |
| `backgroundSize` | `string` |  | CSS background-size for the image (also the image layouts). |
| `backgroundPosition` | `string` |  | CSS background-position. |
| `backgroundRepeat` | `string` |  | CSS background-repeat. |
| `backgroundOpacity` | `number` |  | 0–1. |
| `backgroundVideo` | `string` |  | reveal.js: a video URL. |
| `backgroundVideoLoop` | `boolean` |  | Loop the background video. |
| `backgroundVideoMuted` | `boolean` |  | Mute the background video (default true). |
| `backgroundIframe` | `string` |  | reveal.js: a page behind the slide. |
| `backgroundInteractive` | `boolean` |  | Let the background page take input. |
| `image` | `string` |  | The image for the image, image-left and image-right layouts. |
| `url` | `string` |  | The page for the iframe, iframe-left and iframe-right layouts. |
| `poster` | `string` |  | A picture that stands in for the iframe in print, previews and while it loads. |
| `posterUrl` | `string` |  | Capture the poster from this address instead of `url`. |
| `posterWait` | `number` |  | Milliseconds to let the page settle before the poster capture, counted once its network has gone quiet (default 5000). |
| `terms` | `boolean \| { skip: string[] }` |  | false: link no glossary terms automatically on this slide; { skip: [GIS] } leaves some out. |
| `src` | `string` |  | Include the slides of another .mdx file here (a frontmatter-only slide). `#2-5`, `#1,3,5-7` or `#4-` includes only those slides (1-based); the slide's other keys merge into the first of them. |
| `say` | `string` |  | What the narrator says on this slide instead of its notes (`[click]` splits it into steps); an empty string keeps it silent. |
| `narration` | `false` |  | false: the narrator says nothing here (the slide dwells as `narration.silent` says). In the headmatter, false switches narration off for the deck. |
| `dragPos` | `Record<string, string>` |  | Named positions for `<Drag pos="name">` / `<DragArrow pos="name">` (Slidev's v-drag): "x,y,w,h[,rotation]" in stage pixels, `_` for an automatic height. `kadal-deck dev` writes them when an element is dragged. |

## Keyboard

- `Space J N` — Next step or slide, through vertical stacks
- `K P Shift Space` — Previous step or slide
- `→ L` — Next step, then the next column
- `← H` — Previous step, then the previous column
- `↓` — Slide beneath
- `↑` — Slide above
- `Shift →` — Next slide, skipping steps
- `Shift ←` — Previous slide, skipping steps
- `gg Home` — First slide
- `G End` — Last slide
- `Esc O` — Overview
- `F` — Focus: label every link, control and embedded page — type a label to use it
- `Shift F` — Fullscreen
- `B .` — Pause: black out the screen
- `S` — Open the presenter view
- `?` — This help
- `: g` — Jump to a slide by number (:12), or gg for the first
- `/ Ctrl Shift F` — Search the deck
- `A` — Pause or resume auto-slide
- `C` — Draw on the slide
- `X` — Laser pointer
- `Shift C` — Clear the slide's drawing
- `Ctrl Z` — Undo the last stroke
- `D` — Dark or light
- `T` — Theme and light or dark
- `R` — Read the notes aloud and turn the pages (narration), or pause it
- `,` — Display settings: brightness, contrast, colour for a projector
- `Shift F10` — The context menu (or right-click a slide)
- `V` — Your camera in a bubble on the slide (drag to move, drag its corner to resize)

## Routes

- `/<slug>/` — The deck. `#/h/v/click` or `#/<slide-id>` addresses a slide and step.
- `/<slug>/presenter` — Presenter view: current + next slide, notes with click markers (click one to jump to its step; Edit under `kadal-deck dev`), a stopwatch or countdown timer with pause, reset, progress and pacing, tools, the room panel.
- `/<slug>/join` — The audience page (also /audience): follow along, react, ask, vote.
- `/<slug>/remote` — The phone remote: next/back, blackout, focus labels, a slide list, pen, zoom, a laser aimed by touch on a live copy of the slide or by moving the phone, the notes for this step, the timer and a wake lock. Paired from the presenter view's Phone remote QR, a one-time code that changes every 30 seconds: `remote#pair=CODE` with a room, `remote?pair=CODE` on `kadal-deck dev`. One phone at a time; the newest to scan takes over. Pass `remote: RemotePage` (from `@kadal/deck/remote`) in `<Deck pages>`.
- `/<slug>/notes` — Every speaker note on one page, following the presenter: the current part marked, markers jump to their step; editable per slide under `kadal-deck dev`.
- `/<slug>/notes-edit` — The batch notes editor: every slide's notes as Markdown on one scrolling page, saved into deck.mdx as you type (`kadal-deck dev`, or a host's `notesEditor`; read-only elsewhere).
- `/<slug>/overview` — Every slide in order with a slider through its click steps and its notes beside it (editable under `kadal-deck dev`); a thumbnail opens the deck at that step.
- `/<slug>/export` — The browser exporter, on every deck (hosted ones too; no Playwright): PDF through the browser's print of the print view, a zip of PNGs, an image-per-slide PowerPoint file with the notes, or Markdown with the PNGs. Range, a page per click step, colour scheme, notes, picture size and a transparent background, with a live preview, progress and Cancel.
- `/<slug>/stats` — Views, dwell per slide, sessions, questions, reactions.
- `/<slug>/<your-path>` — A page of the deck's own (Slidev's `setup/routes.ts`): `routes.tsx` beside deck.mdx (or src/routes.tsx, setup/routes.ts) exporting `defineRoutes([{ path: "handout", component: Handout }, { path: "q/:id", load: () => import("./Q.tsx"), title }])`, `<Deck routes>`, or a theme's or addon's `routes` / `api.addRoute()`. Drawn inside the deck's providers with `{ path, params, route }`; the engine's pages win a clash; the build copies index.html to each plain path for static hosts.
- `/<slug>/__kadal/drawings` — `kadal-deck dev` only: GET every `drawings/*.svg`; PUT `{ file, svg }` writes one (same origin, JSON; the SVG is re-serialised, never written as sent) and tells every open page. Used by `drawings.persist: "files"`.

## Query parameters

- `?print-pdf` — Every slide (and click step) as a printable page; what export drives. Also ?print=pdf.
- `?range=1,3-5` — With ?print-pdf: only those slides (1-based, in play order; `8-` runs to the end).
- `?clicks=0|1` — With ?print-pdf: a page per click step (1) or one per slide at its last step (0); overrides pdfSeparateFragments.
- `?notes=0|1|page` — With ?print-pdf: notes off, in a box on each slide, or on pages of their own; overrides showNotes.
- `?omit-background` — With ?print-pdf: no page colour and no background layer (transparent PNGs).
- `?scheme=light|dark` — Open in that colour scheme (also ?dark), without changing the viewer's remembered choice.
- `?view=scroll` — Read the deck as a scrolling page (?view=slide forces the stage).
- `?presenter` — Open as presenter.
- `?embedded` — Embedded mode: no global key handling.
- `?projector` — A look-only window for a second screen or a call: follows the presenter, ignores input.
- `?narrate` — Show the narration bar on the deck itself, to rehearse on the main screen (R does too).
- `?at` — Marks a link as being ABOUT its slide (share links): lands there instead of following.

## The live room

- **Following** — Viewers start in step with the presenter; any move of their own stops following, a pill offers to follow again.
- **Join** — The audience opens /<slug>/join (QR on a slide) — nothing to install. (`<QrJoin>`, `<Presence>`)
- **Reactions** — Emoji reactions float over the presenter's slide and every phone. (`<Reactions>`)
- **Questions** — Questions with upvotes; the presenter marks them answered. (`<Questions>`)
- **Polls** — Choice, multi-choice, rating and word polls, opened from the presenter view. (`<Poll>`, `<WordCloud>`)
- **Quizzes** — Timed questions with points for speed and a leaderboard. (`<Quiz>`, `<Leaderboard>`)
- **Pace and hands** — Slower/faster feedback and raised hands in the presenter's room panel. (`<Pace>`)
- **Shared ink** — The presenter's drawings (pen, highlighter, line, arrow, rectangle, ellipse; erasing, undo and redo), confetti and shared term cards reach every screen. Without a room, the deck's windows in one browser share the drawing and the camera bubble over the window bus. (`<Confetti>`, `<Term>`)
- **Phone remote** — The presenter view's Phone remote button shows a QR; the phone that scans it runs commands in that window (the same ones the keyboard runs). One phone at a time: the QR's code works once and changes every 30 seconds, the newest phone to scan takes over, and a paired phone reconnects with its lease. With a room the room pairs it; on `kadal-deck dev` the dev server relays it (`--host` for the network, `--https` for the air pointer's motion sensors).
- **Turning it on** — `kadal-deck publish` gives a deck a room on deck.kadal.cc; self-hosted, set `live.api` (and run a room server against @kadal/deck/protocol). Offline decks render live components as placeholders.

## The CLI

- `kadal-deck new <dir> [--title t] [--yes] [--no-install] [--pm npm|pnpm|yarn|bun] [--ci host[,host]] · kadal-deck new --theme <name> [dir] · kadal-deck new --addon <name> [dir]` — Scaffold a deck (non-interactive); with --theme or --addon, a package ready to publish: package.json per the contract, a stylesheet with every token and layout class in light and dark, a layout, a layer, a README and a preview deck. `--json`
- `kadal-deck theme eject [--dir ./theme] [--force] [--theme name] [-C deck] [--json]` — Copy the deck's theme (a package, or a built-in as a package-shaped folder) into the deck and point the headmatter at it, to change it there. `--json`
- `kadal-deck import slidev <slides.md | folder> [--out dir] [--force] [--install] [--pm npm|pnpm|yarn|bun] [--json]` — Convert a Slidev deck into a new Kadal deck folder (made as `new` makes one): deck.mdx, `src:` includes as pages/*.mdx, the project's .vue components, layouts and global layers as TSX, styles/, public/ and snippets/, the theme's package and icon sets in package.json, src/slidev.css with the UnoCSS utilities the slides use at Kadal's scale, and IMPORT-REPORT.md listing what did not carry over, slide by slide. Then it runs `check`. Nothing in the Slidev project is changed or run; --out defaults to <folder>-kadal and must be empty unless --force. The converter is `convertSlidev` in @kadal/deck/import. `--json`
- `kadal-deck dev [--https] [--tunnel] [--remote [password]] [vite flags]` — The deck with live reload, and the phone remote's relay. `--host` makes it reachable from a phone on the same network; `--https` serves a self-signed certificate (made with openssl) so the phone's motion sensors work. `--tunnel` puts it on the internet through a Cloudflare Quick Tunnel (needs `cloudflared`; prints the https address and a QR, and the phone remote pairs through it; always password-guarded, with a password made up and printed unless `--remote <password>` gives one). `--remote [password]` serves on the network like `--host`, and with a password the presenter, notes, notes-edit and overview pages and the dev endpoints ask anyone not on this computer for it. In the browser, E (or `view.editor`) opens the side editor: the current slide's source beside it, saved back into the deck file with Cmd/Ctrl+S.
- `kadal-deck build [deck files…] [--base /path/] [--out dir] [--without-notes] [--download] [--pwa | --no-pwa] [--bundle-remote-assets] [--port n] [vite flags]` — dist/ for any static host. `--base /talks/x/` builds for that address (every route, the Excalidraw fonts, the workers and the narrator follow it); `--out` (Vite's --outDir) names the folder. Several deck files (`build a.mdx b.mdx`) build into dist/a/ and dist/b/ at <base>a/ and <base>b/, with a page listing them. The head comes from the headmatter (title, info, lang, favicon, seoMeta: Open Graph, Twitter, canonical; `ogImage: auto` photographs slide 1 into og-image.png). Each route also gets an index.html copy, plus 404.html and _redirects, so GitHub Pages, S3 and nginx serve /presenter without rewrites. `--without-notes` leaves the speaker notes out (no notes modules; the presenter and narrator have none). --download (or `download: true`) also prints dist/deck.pdf for the deck's Download button; --no-download skips it. --pwa (or `pwa: true`) makes it an installable app that presents offline; --bundle-remote-assets (or `bundleRemoteAssets: true`) downloads the remote images, media and fonts into it.
- `kadal-deck serve [folder] [--port n] [--host addr] [--base /path/] [--json]` — Serve a built deck (dist/ by default) as a static host would: at the base it was built for (read from the build, or --base), every route answered by the deck's page, Range requests for video, a CDN's cache headers. For checking a build, the PWA offline, or a container (--host 0.0.0.0). Ctrl+C stops it. `--json`
- `kadal-deck ci <github-pages|netlify|vercel|cloudflare|docker>[,…] [--force] [-C deck] [--json]` — Write what a host needs to build and serve the deck, for its package manager and its folder in the repository: a GitHub Pages workflow (.github/workflows/deploy-deck.yml, --base /<repo>/), netlify.toml, vercel.json, wrangler.jsonc (Workers static assets), or a Dockerfile with nginx.conf. A deck whose build needs Chromium (download, ogImage: auto, pwa) gets the step that installs it. --force replaces existing files. `--json`
- `kadal-deck check [--json] [--no-compile]` — Lint the deck: frontmatter, layouts, backgrounds, MDX, components, includes, assets, glossary, code meta. `--json`
- `kadal-deck format [files…] [--check] [--json]` — Format deck files with @kadal/prettier-plugin (default: deck.mdx and the files it includes): `---`/`----` separators and frontmatter normalised, the YAML through Prettier with its comments and key order kept, each slide's Markdown through Prettier — code fences, notes, magic-move, `<style>`, maths, `::slot::` markers, code groups and `<<<` imports left byte for byte. Every formatted slide is checked to mean the same, or keeps its text (and the command says why). The deck's own Prettier config applies. `--check` writes nothing and exits 1 when a file would change. `--json`
- `kadal-deck info [topic] [--search q] [--json]` — Print the catalog: components, layouts, backgrounds, frontmatter… `info themes` adds the theme and addon packages the deck can see, with their layouts. `--json`
- `kadal-deck screenshot [--slide N|all] [--out dir] [--theme t] [--scheme light|dark] [--width px] [--url u] [--dev] [--json]` — PNG of slides, every click revealed (build + preview, headless Chromium). `--json`
- `kadal-deck export [--format pdf,png,pptx,pptx-editable,md] [--png] [--pptx] [--pptx-editable] [--md] [--no-pdf] [--vector-pdf] [--range 1,3-5] [--dark | --scheme light|dark] [--with-clicks | --no-with-clicks] [--omit-background] [--no-with-toc] [--per-slide] [--out dir] [--output name] [--scale n] [--timeout ms] [--wait ms] [--wait-until networkidle|load|domcontentloaded|none] [--executable-path path] [--url u] [--port n] [--json]` — PDF/PNG/PPTX/Markdown into export/. The PDF looks like the web in every viewer (each page a picture of the slide with its text printed over it as text), with bookmarks from the slide titles and levels (--no-with-toc for none) and the deck's metadata; --vector-pdf prints with the browser alone. --format pptx-editable rebuilds the slides as native PowerPoint text, lists, shapes, pictures and tables (what cannot be, it places as a picture where it stood) with the notes. --format md writes a .md file of the PNGs with each slide's notes. --range picks slides, --dark the dark scheme, --no-with-clicks one page per slide, --omit-background transparent pages, --per-slide one page load per slide. `--json`
- `kadal-deck login [--host url] [--json]` — Sign this machine in (opens the browser). `--json`
- `kadal-deck logout [--json]` — Forget the saved token. `--json`
- `kadal-deck whoami [--json]` — Who is signed in (exit 3 when nobody). `--json`
- `kadal-deck publish [--slug s] [--workspace w] [--title t] [--host url] [--without-notes] [--pwa] [--json]` — Build and publish to a host; prints the URL. `--without-notes` publishes the deck without its speaker notes. The host routes the deck itself, so the build has no static-host fallbacks, and no service worker unless --pwa (for a self-run host that serves decks on a real origin: deck.kadal.cc sandboxes them, and an opaque origin gets no worker; the live room and the host's API are never cached either way). `--json`
- `kadal-deck narrate [--voice id] [--dtype fp32|fp16|q8|q4|q4f16] [--force] [--setup] [--json]` — Bake the narration: every notes segment spoken by Kokoro into public/narration/ (MP3 or Opus with ffmpeg, else WAV) and public/narration.json; skips clips that exist. --setup installs kokoro-js. `--json`
- `kadal-deck mcp [--dir path] [--allow-outside]` — A Model Context Protocol server on stdio, for AI agents.

## Exit codes

- **0** — Success (check: no errors; warnings allowed).
- **1** — The command failed (check found errors, a build failed, the host refused).
- **2** — Usage error: unknown command or flag, bad value, `new` into a folder that is not empty.
- **3** — Not signed in, or the token was rejected: run `kadal-deck login`.
- **4** — Missing prerequisite: no deck.mdx here, dependencies not installed, or Playwright/Chromium missing.
