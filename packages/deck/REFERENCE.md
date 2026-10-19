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

A hand-drawn mark around inline text — underline, circle, box, highlight or strike — drawn on its click.

```mdx
The answer is <Mark type="circle">forty-two</Mark>.
```

| prop | type | default | |
| --- | --- | --- | --- |
| `type` | `"strike" \| "circle" \| "underline" \| "box" \| "highlight"` | `"underline"` |  |
| `color` | `string` | `"var(--deck-accent)"` | CSS colour. |
| `at` | `string \| number` |  | Click step, as for <Click>. |
| `children` | `ReactNode` |  |  |

#### `<Math>` (= `<Tex>`)

Another name for `<Tex>`.

```mdx
<Math tex="\int_0^1 x\,dx" block />
```

#### `<Notes>`

Speaker notes. Lifted out at compile time and shown in the presenter view; `[click]` markers line them up with clicks.

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

A video that plays while its slide is shown.

```mdx
<Video src="/demo.mp4" autoplay loop />
```

| prop | type | default | |
| --- | --- | --- | --- |
| `src` * | `string` |  | Video URL (public/ path or https). |
| `autoplay` | `boolean` |  | Play on arrival. |
| `loop` | `boolean` |  | Loop. |
| `muted` | `boolean` | `true` | Muted. |
| `controls` | `boolean` | `false` | Show controls. |

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

Any lucide icon by name.

```mdx
<Icon name="rocket" size="2em" />
```

| prop | type | default | |
| --- | --- | --- | --- |
| `name` * | `string` |  | lucide icon name, kebab-case or PascalCase. |
| `size` | `string \| number` | `"1em"` | CSS size or px. |
| `color` | `string` |  | CSS colour. |
| `strokeWidth` | `number` | `1.75` |  |

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

### Diagrams

#### `<Mermaid>`

A Mermaid diagram rendered in the browser in the deck's colours. Pass the source as a template string.

```mdx
<Mermaid>{`flowchart LR
  A[Write] --> B[Check] --> C[Present]`}</Mermaid>
```

| prop | type | default | |
| --- | --- | --- | --- |
| `children` | `ReactNode` |  | Mermaid source as a JSX template string. |
| `scale` | `number` | `1` | Scale factor. |

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
| `controlsBackArrows` | `"faded" \| "hidden" \| "visible"` | `"faded"` | How the back arrows look. Values: `faded` `hidden` `visible` |
| `progress` | `boolean` | `true` | The progress bar along the bottom. |
| `slideNumber` | `boolean \| SlideNumberFormat` | `false` | Show slide numbers: true, or a format — "h.v", "h/v", "c" (current), "c/t" (current/total). Values: `h.v` `h/v` `c` `c/t` |
| `showSlideNumber` | `"all" \| "speaker" \| "print"` | `"all"` | Where slide numbers show. Values: `all` `speaker` `print` |
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
| `transition` | `Transition` | `"slide"` | Slide transition (see transitions). Values: `zoom` `none` `fade` `slide` `convex` `concave` `view-transition` |
| `transitionSpeed` | `TransitionSpeed` | `"default"` | default · fast · slow. Values: `default` `fast` `slow` |
| `backgroundTransition` | `Transition` | `"fade"` | Transition for backgrounds. Values: `zoom` `none` `fade` `slide` `convex` `concave` `view-transition` |
| `viewDistance` | `number` | `3` | Slides kept mounted on either side. |
| `mobileViewDistance` | `number` | `2` | The same, on phones. |
| `hideInactiveCursor` | `boolean` | `true` | Hide an idle cursor. |
| `hideCursorTime` | `number` | `5000` | Milliseconds before it hides. |
| `view` | `"slide" \| "scroll"` | `"slide"` | "slide" (the stage) or "scroll" (a page). Values: `slide` `scroll` |
| `scrollProgress` | `boolean \| "auto"` | `"auto"` | The scroll view's progress bar. Values: `auto` |
| `scrollSnap` | `false \| "mandatory" \| "proximity"` | `"mandatory"` | Scroll snapping in the scroll view. Values: `mandatory` `proximity` `false` |
| `scrollActivationWidth` | `number` | `0` | Viewport width under which the scroll view switches on by itself; 0 (the default) never does — a phone gets the same stage, letterboxed, and `?view=scroll` stays an explicit choice. |
| `theme` | `string` | `"minimal"` | The theme: minimal, rla, stack, or one your CSS defines as .theme-<name>. Values: e.g. `minimal` `rla` `stack` |
| `themes` | `string[]` | `["minimal","rla","stack"]` | Themes this deck ships (their CSS is imported by main.tsx); the theme menu lists them. |
| `colorScheme` | `ColorScheme` | `"auto"` | "auto" (follow the system), "light" or "dark". Values: `auto` `light` `dark` |
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
| `drawings` | `{ enabled: boolean; persist: boolean; presenterOnly: boolean; syncAll: boolean; }` | `{"enabled":true,"persist":true,"presenterOnly":false,"syncAll":true}` | Drawing: { enabled, persist, presenterOnly, syncAll }. |
| `glossary` | `GlossaryOptions \| string \| false` | `{"src":"glossary.yaml","repeat":"first","headings":"fallback","skip":[],"delay":700,"sync":false}` | Term cards. The runtime reads `delay` and `sync`; the rest steers the compiler, which sees the headmatter only — set those there. `glossary: false` or a path are shorthands. Values: `false` |
| `reactions` | `boolean` | `true` | Audience reactions in the live room. |
| `qa` | `boolean` | `true` | Audience questions in the live room. |
| `polls` | `boolean` | `true` | Polls and quizzes in the live room. |
| `audienceNotes` | `boolean` | `false` | Show every slide's notes to anyone on the audience page (after the talk, for instance). |
| `slug` | `string` | `""` | The deck's slug on the host, from the Vite base — decks/<slug>. |
| `badge` | `boolean` | `false` | Show the "Made with Kadal Deck" link in the corner (set by the host, see `withHostOverride`). |
| `fonts` | `string[]` | `[]` | Google Fonts families to load, e.g. ["Inter:wght@400;600"]. |
| `seoMeta` | `Record<string, string>` | `{}` | Extra <meta> tags. |
| `aspectRatio` | `number` |  | Slidev spelling: with canvasWidth, sets width and height (16/9 = 1.777…). |
| `canvasWidth` | `number` |  | Slidev spelling: the stage width used with aspectRatio. |

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
| `transition` | `string` |  | This slide's transition (see transitions). Values: e.g. `none` `fade` `slide` `convex` `concave` `zoom` `view-transition` |
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
| `src` | `string` |  | Include the slides of another .mdx file here (a frontmatter-only slide). |

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

## Routes

- `/<slug>/` — The deck. `#/h/v/click` or `#/<slide-id>` addresses a slide and step.
- `/<slug>/presenter` — Presenter view: current + next slide, notes with click markers, timer, tools, the room panel.
- `/<slug>/join` — The audience page (also /audience): follow along, react, ask, vote.
- `/<slug>/remote` — The phone remote: next/back, blackout, focus labels, a slide list, pen, zoom, a laser aimed by touch on a live copy of the slide or by moving the phone, the notes for this step, the timer and a wake lock. Paired from the presenter view's Phone remote QR: `remote#ticket=…` with a room, `remote?pair=CODE` on `kadal-deck dev`. Pass `remote: RemotePage` (from `@kadal/deck/remote`) in `<Deck pages>`.
- `/<slug>/notes` — Every speaker note on one page.
- `/<slug>/stats` — Views, dwell per slide, sessions, questions, reactions.

## Query parameters

- `?print-pdf` — Every slide (and click step) as a printable page; what export drives. Also ?print=pdf.
- `?view=scroll` — Read the deck as a scrolling page (?view=slide forces the stage).
- `?presenter` — Open as presenter.
- `?embedded` — Embedded mode: no global key handling.
- `?projector` — A look-only window for a second screen or a call: follows the presenter, ignores input.
- `?at` — Marks a link as being ABOUT its slide (share links): lands there instead of following.

## The live room

- **Following** — Viewers start in step with the presenter; any move of their own stops following, a pill offers to follow again.
- **Join** — The audience opens /<slug>/join (QR on a slide) — nothing to install. (`<QrJoin>`, `<Presence>`)
- **Reactions** — Emoji reactions float over the presenter's slide and every phone. (`<Reactions>`)
- **Questions** — Questions with upvotes; the presenter marks them answered. (`<Questions>`)
- **Polls** — Choice, multi-choice, rating and word polls, opened from the presenter view. (`<Poll>`, `<WordCloud>`)
- **Quizzes** — Timed questions with points for speed and a leaderboard. (`<Quiz>`, `<Leaderboard>`)
- **Pace and hands** — Slower/faster feedback and raised hands in the presenter's room panel. (`<Pace>`)
- **Shared ink** — The presenter's drawings, confetti and shared term cards reach every screen. (`<Confetti>`, `<Term>`)
- **Phone remote** — The presenter view's Phone remote button shows a QR; the phone that scans it runs commands in that window (the same ones the keyboard runs). With a room it is a presenter socket holding the ticket; on `kadal-deck dev` the dev server relays it (`--host` for the network, `--https` for the air pointer's motion sensors).
- **Turning it on** — `kadal-deck publish` gives a deck a room on deck.kadal.cc; self-hosted, set `live.api` (and run a room server against @kadal/deck/protocol). Offline decks render live components as placeholders.

## The CLI

- `kadal-deck new <dir> [--title t] [--yes] [--no-install] [--pm npm|pnpm|yarn|bun]` — Scaffold a deck (non-interactive). `--json`
- `kadal-deck dev [--https] [vite flags]` — The deck with live reload, and the phone remote's relay. `--host` makes it reachable from a phone on the same network; `--https` serves a self-signed certificate (made with openssl) so the phone's motion sensors work.
- `kadal-deck build [vite flags]` — dist/ for any static host.
- `kadal-deck check [--json] [--no-compile]` — Lint the deck: frontmatter, layouts, backgrounds, MDX, components, includes, assets, glossary, code meta. `--json`
- `kadal-deck info [topic] [--search q] [--json]` — Print the catalog: components, layouts, backgrounds, frontmatter… `--json`
- `kadal-deck screenshot [--slide N|all] [--out dir] [--theme t] [--scheme light|dark] [--width px] [--url u] [--dev] [--json]` — PNG of slides, every click revealed (build + preview, headless Chromium). `--json`
- `kadal-deck export [--png] [--pptx] [--no-pdf] [--vector-pdf] [--out dir] [--scale n] [--url u] [--json]` — PDF/PNG/PPTX into export/. The PDF looks like the web in every viewer: each page is a picture of the slide with its text printed over it as text. --vector-pdf prints with the browser alone. `--json`
- `kadal-deck login [--host url] [--json]` — Sign this machine in (opens the browser). `--json`
- `kadal-deck logout [--json]` — Forget the saved token. `--json`
- `kadal-deck whoami [--json]` — Who is signed in (exit 3 when nobody). `--json`
- `kadal-deck publish [--slug s] [--workspace w] [--title t] [--host url] [--json]` — Build and publish to a host; prints the URL. `--json`
- `kadal-deck mcp [--dir path] [--allow-outside]` — A Model Context Protocol server on stdio, for AI agents.

## Exit codes

- **0** — Success (check: no errors; warnings allowed).
- **1** — The command failed (check found errors, a build failed, the host refused).
- **2** — Usage error: unknown command or flag, bad value, `new` into a folder that is not empty.
- **3** — Not signed in, or the token was rejected: run `kadal-deck login`.
- **4** — Missing prerequisite: no deck.mdx here, dependencies not installed, or Playwright/Chromium missing.
