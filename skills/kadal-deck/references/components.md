<!-- Generated from the engine's catalog by packages/deck/tools/catalog.ts (components). Do not edit: run `bun run catalog` in packages/deck. -->

# Components, clicks and code

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
| `title` | `string` |  | Bold first line. |
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
