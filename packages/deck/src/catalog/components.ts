import type { ComponentCategory } from "./types.ts";

/**
 * What the generator cannot read from the source: what each built-in component is for, how it
 * is written in a slide, and the prop notes the engine's types leave implicit. Keyed by the
 * exported name; the catalog test fails when a component is added to the engine without an entry
 * here, or an entry outlives its component.
 */
export interface ComponentMeta {
  category: ComponentCategory;
  summary: string;
  example: string;
  mapping?: boolean;
  live?: boolean;
  /** Read the props of another component (a wrapper whose type the generator cannot see). */
  propsFrom?: { name: string; omit?: string[] };
  /** Descriptions for props the source leaves undocumented. */
  props?: Record<string, string>;
}

const TONES = "accent, accent-2, good, warn, bad, info, neutral, purple, pink, amber, teal";

export const COMPONENT_META: Record<string, ComponentMeta> = {
  // ── steps ────────────────────────────────────────────────────────────────────────────────
  Click: {
    category: "steps",
    summary:
      "One click step (Slidev's v-click, reveal.js's fragment): shows its children from its step on, or hides them with `hide`.",
    example: `<Click>Appears on the first click</Click>\n<Click at="+2" effect="fade-up">Two clicks later, sliding up</Click>`,
    props: {
      at: 'When: omitted = one after the previous step; "+N" relative ("+0" shares the previous step); a number is absolute (0 = always shown); [from, to] shows it from `from` until `to`.',
      hide: "Start visible and hide at the step instead.",
      effect: "A reveal effect (see clickEffects) or any CSS class the theme defines.",
      className: "Extra classes.",
      style: "Inline style (JSX object).",
      children: "What is revealed.",
    },
  },
  After: {
    category: "steps",
    summary: "Shows together with the previous click instead of taking a step of its own.",
    example: `<Click>The claim</Click>\n<After>…and its footnote, at the same moment</After>`,
    propsFrom: { name: "Click", omit: ["at"] },
  },
  Clicks: {
    category: "steps",
    summary:
      "Wraps a Markdown list (or any children) so each item is its own click step. Leave blank lines around the list inside it.",
    example: `<Clicks>\n\n- First point\n- Second point\n- Third point\n\n</Clicks>`,
    props: { effect: "The reveal effect for every item.", children: "A list, or blocks." },
  },
  Fragment: {
    category: "steps",
    summary: "reveal.js's name for `<Click>`; identical.",
    example: `<Fragment effect="highlight-red">Same as Click</Fragment>`,
  },
  Ul: {
    category: "markdown",
    summary: "The `ul` mapping behind Markdown bullet lists; `<Clicks>` steps its items.",
    example: "- a Markdown list renders through this",
    mapping: true,
  },
  Ol: {
    category: "markdown",
    summary: "The `ol` mapping behind numbered Markdown lists.",
    example: "1. a numbered list renders through this",
    mapping: true,
  },
  Li: {
    category: "markdown",
    summary: "The `li` mapping: a plain item, or a click step inside `<Clicks>`.",
    example: "- each item renders through this",
    mapping: true,
  },
  ul: {
    category: "markdown",
    summary: "MDX element mapping for `ul` (same as Ul).",
    example: "- item",
    mapping: true,
  },
  ol: {
    category: "markdown",
    summary: "MDX element mapping for `ol` (same as Ol).",
    example: "1. item",
    mapping: true,
  },
  li: {
    category: "markdown",
    summary: "MDX element mapping for `li` (same as Li).",
    example: "- item",
    mapping: true,
  },
  Anchor: {
    category: "markdown",
    summary:
      "The `a` mapping: `[text](#/3)` and other in-deck hash links navigate; external links open in a new tab.",
    example: "[the results slide](#/results) · [docs](https://deck.kadal.cc/docs/)",
    mapping: true,
  },
  Image: {
    category: "media",
    summary:
      "The `img` mapping (every `![alt](src)`), lazy-loaded; also usable as a tag. `preview` opens a lightbox on click.",
    example: `![A map of Chennai](/chennai.png)\n\n<Image src="/chart.png" alt="Revenue by month" preview fit="contain" />`,
    props: {
      src: "Image URL; `/x.png` is served from the deck's public/ folder.",
      alt: "Alternative text (always write one).",
      preview: "true, or a larger image's URL, to open a lightbox on click.",
      fit: "CSS object-fit (cover, contain…).",
    },
  },
  Code: {
    category: "code",
    summary:
      "The `pre` mapping behind fenced code blocks: Shiki highlighting, line-highlight steps, titles. Write a fence, not this tag.",
    example: "```ts {1|2-3|all} [app.ts]\nconst a = 1;\nconst b = 2;\nexport { a, b };\n```",
    mapping: true,
  },
  CodeGroup: {
    category: "code",
    summary:
      "Code blocks as tabs, each named by its fence's `[title]` with a file-type badge. Usually written as Slidev's `::code-group` … `::` around the fences (`:::` works too); ←/→ move between tabs. `clicks` turns tabs on each click; `print=\"all\"` prints every tab.",
    example:
      "::code-group\n\n```sh [npm]\nnpm i @kadal/deck\n```\n\n```sh [bun]\nbun add @kadal/deck\n```\n\n::",
    props: {
      children: "The fenced code blocks, one per tab (blank lines around them inside the tag).",
      clicks: "Open the next tab on each click of the slide.",
      at: "With `clicks`: the step of the first turn, like `<Click at>`.",
      active: "The tab open at first (0-based).",
      print: '"active" (default) prints the open tab; "all" prints every tab with its name.',
      className: "Extra classes.",
    },
  },
  MagicMove: {
    category: "code",
    summary:
      "Shiki Magic Move: code that morphs between versions, one per click. Written as a ````md magic-move fence holding one code fence per step.",
    example: "````md magic-move\n```ts\nlet n = 1\n```\n```ts\nconst n = 1\n```\n````",
    mapping: true,
  },

  // ── layout ───────────────────────────────────────────────────────────────────────────────
  Cols: {
    category: "layout",
    summary: "Columns: each child (or `<Col>`) is a column. `cols` takes a CSS grid template.",
    example: `<Cols cols="2fr 1fr">\n<Col>\n\nThe main point, in Markdown.\n\n</Col>\n<Col>\n\n![](/figure.png)\n\n</Col>\n</Cols>`,
    props: {
      cols: 'CSS grid-template-columns, e.g. "1fr 1fr" or "2fr 1fr".',
      n: "Number of equal columns (instead of `cols`).",
      gap: "CSS gap.",
      align: 'CSS align-items; "start" stops cards in a row from sharing a height.',
    },
  },
  Col: {
    category: "layout",
    summary: "One column inside `<Cols>` (Markdown inside needs blank lines around it).",
    example: `<Col span={2}>\n\nWide column\n\n</Col>`,
    props: { span: "Grid columns to span." },
  },
  Grid: {
    category: "layout",
    summary: "A CSS grid of its children.",
    example: `<Grid cols={3} gap="1rem">\n<Glass>One</Glass>\n<Glass>Two</Glass>\n<Glass>Three</Glass>\n</Grid>`,
    props: {
      cols: "Column count or a template.",
      rows: "Row count or a template.",
      gap: "CSS gap.",
    },
  },
  Center: {
    category: "layout",
    summary: "Centres its children horizontally and vertically in the space it has.",
    example: `<Center>\n\n# One big idea\n\n</Center>`,
  },
  Stack: {
    category: "layout",
    summary:
      "reveal.js's r-stack: children on top of each other in one spot — combine with clicks to swap images in place.",
    example: `<Stack>\n<Click at={[1, 2]}>![](/v1.png)</Click>\n<Click at={2}>![](/v2.png)</Click>\n</Stack>`,
  },
  Stretch: {
    category: "layout",
    summary:
      "reveal.js's r-stretch: grows to fill the slide's remaining height (an image under a heading).",
    example: `## The whole map\n\n<Stretch>![](/map.png)</Stretch>`,
  },
  Absolute: {
    category: "layout",
    summary: "Places a block at stage coordinates (pixels on the 1920 × 1080 stage).",
    example: `<Absolute x={1500} y={80} w={320}><Badge tone="warn">Draft</Badge></Absolute>`,
    props: { x: "Left, px.", y: "Top, px.", w: "Width, px.", h: "Height, px.", rotate: "Degrees." },
  },
  Spacer: {
    category: "layout",
    summary: "Vertical space.",
    example: `<Spacer size="3rem" />`,
    props: { size: "CSS length." },
  },
  Transform: {
    category: "layout",
    summary: "Scales a block around an origin (Slidev's <Transform>).",
    example: `<Transform scale={0.8}>\n\nA table that is a little too big\n\n</Transform>`,
  },
  FitText: {
    category: "layout",
    summary: "Text as large as fits its box (reveal.js r-fit-text), between `min` and `max` px.",
    example: `<FitText max={260}>42%</FitText>`,
  },
  Frame: {
    category: "layout",
    summary: "reveal.js's r-frame: a bordered frame around media.",
    example: `<Frame>![](/screenshot.png)</Frame>`,
  },

  // ── content ──────────────────────────────────────────────────────────────────────────────
  Callout: {
    category: "content",
    summary: "A boxed aside: info, tip, note, warn or danger, with an optional title.",
    example: `<Callout kind="tip" title="Rule of thumb">\n\nOne idea per slide.\n\n</Callout>`,
    props: { kind: "info · tip · note · warn · danger.", title: "Bold first line." },
  },
  Badge: {
    category: "content",
    summary: "A small inline label.",
    example: `<Badge tone="good">new</Badge>`,
    props: { tone: "neutral · accent · good · warn · bad." },
  },
  Kbd: {
    category: "content",
    summary: "A keyboard key.",
    example: `Press <Kbd>?</Kbd> for help`,
  },
  Mark: {
    category: "content",
    summary:
      "A hand-drawn mark (Slidev's v-mark, rough-notation's types): underline, box, circle, highlight, strike-through, crossed-off or bracket, drawn stroke by stroke on its click. The wobble is seeded from the text, so it looks the same on every screen and in the PDF.",
    example: `The answer is <Mark type="circle">forty-two</Mark>.\n\n<Mark type="bracket" brackets="left right" color="#e11d48" at={2}>Both sides</Mark>`,
    props: {
      type: "underline · box · circle · highlight · strike-through · crossed-off · bracket (Slidev's aliases strike, line-through, cross, crossed work too).",
      at: "Click step, as for <Click> (0: always; [a, b]: from a until b).",
      color: "CSS colour (default the theme's accent).",
      strokeWidth: "Line width in px (default 3; a highlight is as tall as the line).",
      padding: 'Space around the text in px: 5, or "top right bottom left".',
      iterations: "Strokes per line (default 2).",
      multiline: "Mark each wrapped line on its own (default on for the line-shaped types).",
      brackets: 'Sides for a bracket: "left", "right" (default), "top", "bottom", or several.',
      duration: "Drawing time in ms (default 800).",
      animationDuration: "rough-notation's name for duration.",
      delay: "Wait after the click, ms.",
      animate: "false: appear whole.",
      opacity: "0–1 (a highlight defaults to 0.35).",
    },
  },
  Link: {
    category: "content",
    summary: "A link to another slide by 1-based number, `h.v`, or slide id.",
    example: `<Link to="results">See the results</Link>`,
    props: { to: 'Slide number (1-based), "h.v", or a slide `id`.', title: "Tooltip." },
  },
  Toc: {
    category: "content",
    summary:
      "A table of contents from every slide's title and heading level (`hideInToc` slides skipped).",
    example: `## Agenda\n\n<Toc maxDepth={1} />`,
    props: {
      columns: "Number of columns.",
      maxDepth: "Deepest heading level listed.",
      minDepth: "Shallowest heading level listed.",
      mode: "all · onlyCurrentTree · onlySiblings.",
      listClass: "Class on the list.",
    },
  },
  Counter: {
    category: "content",
    summary: "A number that counts up when its slide is shown.",
    example: `<Counter value={12500} prefix="₹" suffix="/mo" />`,
    props: {
      value: "Target number.",
      from: "Start.",
      duration: "Milliseconds.",
      decimals: "Decimal places.",
      prefix: "Text before.",
      suffix: "Text after.",
    },
  },
  Typewriter: {
    category: "content",
    summary: "Text that types itself out when the slide is shown.",
    example: `<Typewriter text="npm create @kadal/deck@latest" />`,
    props: { text: "The text.", speed: "Milliseconds per character.", cursor: "Show a cursor." },
  },
  Encrypted: {
    category: "content",
    summary: "Text that resolves out of random glyphs.",
    example: `<Encrypted text="Decoded." />`,
    props: {
      text: "The text.",
      speed: "Milliseconds per glyph.",
      delay: "Milliseconds before it starts.",
    },
  },
  Timer: {
    category: "content",
    summary: "A countdown (with `seconds`) or a stopwatch that starts when its slide is shown.",
    example: `<Timer seconds={120} />`,
    props: { seconds: "Count down from this; omit for a stopwatch." },
  },
  Qr: {
    category: "content",
    summary: "A QR code for any text or URL, rendered locally.",
    example: `<Qr value="https://deck.kadal.cc" size={280} />`,
    props: { value: "Text or URL to encode.", size: "Pixels." },
  },
  Confetti: {
    category: "content",
    summary: "A burst of confetti when the slide (or the given click) arrives.",
    example: `<Confetti at={1} />`,
    props: { at: "Click step.", count: "Pieces.", duration: "Milliseconds." },
  },
  Arrow: {
    category: "content",
    summary: "A straight arrow between two points in stage coordinates.",
    example: `<Arrow x1={300} y1={700} x2={900} y2={420} color="var(--deck-accent)" />`,
    props: { width: "Stroke width.", color: "CSS colour.", twoWay: "Heads at both ends." },
  },
  Notes: {
    category: "content",
    summary:
      "Speaker notes. Lifted out at compile time and shown in the presenter view; `[click]` markers line them up with clicks. Slidev's spelling works too: HTML comments at the very end of a slide are its notes, and both kinds join.",
    example: `<Notes>\nOpen with the question. [click] Then reveal the number.\n</Notes>`,
  },
  Tex: {
    category: "content",
    summary:
      "KaTeX maths from JSX. In Markdown prefer `$inline$` and `$$display$$`, which render at build time.",
    example: `<Tex tex="E = mc^2" block />`,
    props: { tex: "LaTeX source.", block: "Display (centred, own line) instead of inline." },
  },
  Math: {
    category: "content",
    summary: "Another name for `<Tex>`.",
    example: `<Math tex="\\int_0^1 x\\,dx" block />`,
  },

  // ── diagrams ─────────────────────────────────────────────────────────────────────────────
  Mermaid: {
    category: "diagrams",
    summary:
      "A Mermaid diagram rendered in the browser in the deck's colours. Pass the source as a template string.",
    example: "<Mermaid>{`flowchart LR\n  A[Write] --> B[Check] --> C[Present]`}</Mermaid>",
    props: {
      scale: "Scale factor.",
      children: "Mermaid source as a JSX template string.",
      code: "The source as a prop (what a ```mermaid fence compiles to).",
      theme: "A Mermaid theme for this diagram: default, neutral, dark, forest, base.",
      config: "Mermaid configuration for this diagram, over the deck's `mermaid:`.",
      alt: "What the diagram shows, for screen readers (a fence's `{alt: '…'}`, Slidev's spelling); default its first line.",
    },
  },
  KatexLines: {
    category: "diagrams",
    summary:
      "Display maths whose lines light up one step per click: what `$$ {1|3|all}` compiles to (Slidev's katex-lines). Write the `$$` block, not this tag.",
    example: "$$ {1|2|all}\n\\begin{aligned}\na &= b + c \\\\\nd &= e\n\\end{aligned}\n$$",
    mapping: true,
    props: {
      steps: "The steps, as in the fence: `1|3|all`.",
      at: "The click the steps start at (a number, or `+n`).",
      finally: "Lines shown once the slide's clicks pass the last step (default: the last step).",
      startLine: "The number of the first line (default 1).",
      children: "The rendered formula.",
    },
  },
  Sketch: {
    category: "diagrams",
    summary:
      "An Excalidraw drawing in the deck's colours: from the sketch DSL (`scene`), an .excalidraw file (`src`), or Mermaid (children); `steps` tours its regions one click at a time.",
    example:
      '<Sketch>{`flowchart LR; idea --> slide --> talk`}</Sketch>\n\n<Sketch src="/diagrams/flow.excalidraw" height="600px" />',
    props: {
      scene:
        "A scene built with `sketch()` from @kadal/deck/sketch (import it in src/components.tsx or the slide).",
      src: "Path to an .excalidraw file in public/.",
      mermaid: "Mermaid source to convert.",
      steps:
        'Regions to light up, one per click: a region id, `{ focus, caption }`, or null for "all".',
      caption: "Shown under the drawing.",
      width: "CSS max width.",
      height: "CSS max height.",
      fontSize: "Font size for Mermaid conversions.",
      zoomable: "Show the button that opens it in Excalidraw's viewer.",
    },
  },

  // ── media ────────────────────────────────────────────────────────────────────────────────
  Video: {
    category: "media",
    summary:
      "A video that knows the slide's clicks (Slidev's SlidevVideo and more): plays on arrival, at a click (`at`), pauses at one (`pauseAt`), jumps or rewinds at others (`steps`), or when the enclosing <Click> reveals it; still at its print frame in print and thumbnails.",
    example: `<Video src="/demo.mp4" at={1} pauseAt={3} steps={{ 2: 42 }} timestamp={5} autoreset="slide" />`,
    props: {
      src: "Video URL (public/ path or https), or `<source>` children.",
      autoplay: 'Play on arrival (or at `at`, or when its <Click> shows it); "once": not again after it has played.',
      at: "The click at which it starts playing (implies autoplay).",
      pauseAt: "The click at which it pauses.",
      steps: '{ click: "play" | "pause" | "rewind" | seconds } — what happens at further clicks.',
      autoreset: '"slide": back to `timestamp` when the slide is left; "click": when the deck steps back before `at`.',
      timestamp: "Start here, seconds.",
      printTimestamp: 'The frame shown in print and previews: seconds, or "last".',
      poster: "Poster image.",
      printPoster: "Poster in print and previews (default poster).",
      loop: "Loop.",
      muted: "Muted (default true).",
      controls: "Show controls.",
    },
  },
  Audio: {
    category: "media",
    summary: "An audio player.",
    example: `<Audio src="/clip.mp3" />`,
    props: {
      src: "Audio URL.",
      autoplay: "Play on arrival.",
      loop: "Loop.",
      controls: "Show controls.",
    },
  },
  Iframe: {
    category: "media",
    summary:
      "An embedded page, loaded only while its slide is near, behind a click-to-interact shield; a poster stands in for print and previews.",
    example: `<Iframe src="https://example.com" poster="/posters/example.jpg" scale={0.5} />`,
    props: {
      src: "Page URL.",
      preload: "Load it before its slide is near.",
      title: "Accessible title.",
    },
  },
  Youtube: {
    category: "media",
    summary: "A YouTube embed by id or URL.",
    example: `<Youtube id="dQw4w9WgXcQ" start={42} />`,
    props: {
      id: "Video id.",
      url: "Or the full URL.",
      autoplay: "Play on arrival.",
      start: "Start at second.",
    },
  },
  Tweet: {
    category: "media",
    summary: "An embedded post from X/Twitter.",
    example: `<Tweet id="20" />`,
    props: { id: "Post id.", url: "Or the post URL.", scale: "Scale factor." },
  },

  // ── motion ───────────────────────────────────────────────────────────────────────────────
  Motion: {
    category: "motion",
    summary:
      "Animates a block with motion (framer-motion): `initial` → `enter` on arrival, `leave` on exit, and per-click targets (Slidev's v-motion).",
    example: `<Motion initial={{ opacity: 0, x: -80 }} enter={{ opacity: 1, x: 0 }} clicks={{ "click-1": { scale: 1.2 } }}>\n\nSlides in from the left\n\n</Motion>`,
    props: {
      initial: "Motion target before arrival.",
      enter: "Motion target on arrival.",
      leave: "Motion target on exit.",
      transition: "motion transition options.",
      as: "Element to render.",
    },
  },

  // ── terms ────────────────────────────────────────────────────────────────────────────────
  Term: {
    category: "terms",
    summary:
      "A glossary term card by hand: the entry named by its text or `id`, or a one-off with `def`. The compiler links first mentions from glossary.yaml automatically.",
    example: `<Term>UTM</Term> · <Term id="utm">projected metres</Term> · <Term def="Root-mean-square error." tag="Statistics">RMSE</Term>`,
    props: {
      full: "An abbreviation's expansion.",
      tag: "Category chip.",
      link: "Source URL.",
      auto: "Internal (set by the compiler).",
    },
  },
  Terms: {
    category: "terms",
    summary:
      "Links glossary mentions inside a plain string at render time — for words that arrive as a prop, which the compiler cannot see.",
    example: `<small><Terms>{"GNSS accuracy in UTM metres"}</Terms></small>`,
  },
  TermReadout: {
    category: "terms",
    summary:
      "The open term's definition as page content, for a page whose slide is too small for a card (custom audience pages).",
    example: `<TermReadout />`,
  },

  // ── bling ────────────────────────────────────────────────────────────────────────────────
  GradientText: {
    category: "bling",
    summary: "Text filled with a gradient (theme accents by default).",
    example: `# <GradientText>Ship it.</GradientText>`,
    props: { from: "Start colour.", to: "End colour.", angle: "Degrees.", as: "Element." },
  },
  Glass: {
    category: "bling",
    summary: "A frosted card. Cards that share a row share a height.",
    example: `<Glass tone="accent" glow>\n\n**42 ms** p95\n\n</Glass>`,
    props: { tone: `One of: ${TONES}.`, pad: "CSS padding.", glow: "Coloured glow." },
  },
  Glow: {
    category: "bling",
    summary: "A soft blurred light behind the content.",
    example: `<Glow color="var(--deck-accent)" x="70%" y="30%" />`,
    props: {
      color: "CSS colour.",
      size: "CSS size.",
      x: "CSS left.",
      y: "CSS top.",
      opacity: "0–1.",
    },
  },
  Chip: {
    category: "bling",
    summary: "A pill with an optional lucide icon.",
    example: `<Chip tone="good" icon="check">Shipped</Chip>`,
    props: { tone: `One of: ${TONES}.`, icon: "A lucide icon name (kebab-case)." },
  },
  Icon: {
    category: "bling",
    summary:
      "A Lucide icon by name, or any Iconify icon as `set:name` (`mdi:account`, `logos:vue`). Slidev's tag form `<mdi-account />` compiles to this. Built decks bundle the drawings from the deck's installed `@iconify-json/<set>` (or `@iconify/json`); the hosted shell, or a set not installed, fetches them from the Iconify API once and keeps them.",
    example: `<Icon name="rocket" size="2em" /> <Icon name="mdi:account-circle" color="tomato" /> <logos-react class="text-3xl" />`,
    props: {
      name: "lucide name (kebab-case or PascalCase), or an Iconify `set:name`.",
      size: "Height: CSS size or px (the width follows the icon's proportions). Tag form: 1.2em.",
      color: "CSS colour (monochrome icons).",
      strokeWidth: "Lucide icons only.",
      class: "Slidev's spelling of className (`text-3xl`, `mx-2`).",
      style: "An object, or a CSS string.",
      title: "An accessible name; without one the icon is decorative.",
    },
  },
  Divider: {
    category: "bling",
    summary: "A horizontal rule with an optional centred label.",
    example: `<Divider label="Part two" />`,
  },
  Ribbon: {
    category: "bling",
    summary: "A corner ribbon on the slide.",
    example: `<Ribbon tone="warn">Beta</Ribbon>`,
    props: { tone: `One of: ${TONES}.`, corner: "left · right." },
  },
  Halo: {
    category: "bling",
    summary: "A ring of light around an icon or emoji.",
    example: `<Halo tone="accent"><Icon name="sparkles" /></Halo>`,
    props: { tone: `One of: ${TONES}.`, size: "CSS size." },
  },
  Shimmer: {
    category: "bling",
    summary: "Text with a light sweeping across it.",
    example: `## <Shimmer>Now live</Shimmer>`,
  },
  Blob: {
    category: "bling",
    summary: "A soft organic colour blob for decoration.",
    example: `<Blob color="var(--deck-accent-2)" x="80%" y="20%" />`,
    props: {
      color: "CSS colour.",
      x: "CSS left.",
      y: "CSS top.",
      size: "CSS size.",
      rotate: "Degrees.",
      opacity: "0–1.",
    },
  },
  Tilt: {
    category: "bling",
    summary: "A card that tilts toward the pointer.",
    example: `<Tilt><Glass>Hover me</Glass></Tilt>`,
    props: { max: "Maximum tilt in degrees." },
  },
  Background: {
    category: "background",
    summary:
      "A registered component background (by `name`) or custom children as an animated layer behind this slide's content. Usually you set `background:` in frontmatter instead.",
    example: `<Background name="aurora" opacity={0.6} />`,
    props: { name: "A registered background name (see backgrounds).", opacity: "0–1." },
  },

  // ── live room ────────────────────────────────────────────────────────────────────────────
  Poll: {
    category: "live",
    live: true,
    summary:
      "A poll the presenter opens; the audience answers from their phones. Kinds: choice, multi, rating, words.",
    example: `<Poll id="lunch" question="Lunch?" options={["Dosa", "Biryani", "Both"]} />`,
    props: {
      id: "Stable id, unique in the deck (results are keyed by it).",
      question: "The question.",
      options: "Answers (choice and multi).",
      kind: "choice · multi · rating · words.",
      scale: "Points on a rating scale.",
    },
  },
  Quiz: {
    category: "live",
    live: true,
    summary: "A timed quiz question with points for speed; feeds the leaderboard.",
    example: `<Quiz id="q1" question="2 + 2?" options={["3", "4", "5"]} correct={1} seconds={15} />`,
    props: {
      id: "Stable id, unique in the deck.",
      question: "The question.",
      options: "Answers.",
      correct: "0-based index of the right answer.",
      seconds: "Time limit.",
    },
  },
  WordCloud: {
    category: "live",
    live: true,
    summary: "The audience answers in a word or two; the words grow as they repeat.",
    example: `<WordCloud id="one-word" question="One word for this talk?" />`,
    props: { id: "Stable id, unique in the deck.", question: "The prompt." },
  },
  Questions: {
    category: "live",
    live: true,
    summary: "The audience's questions, most upvoted first.",
    example: `## Questions?\n\n<Questions limit={5} />`,
    props: { limit: "How many to show." },
  },
  Reactions: {
    category: "live",
    live: true,
    summary: "A reaction bar on the slide (the audience page always has one).",
    example: `<Reactions />`,
  },
  Leaderboard: {
    category: "live",
    live: true,
    summary: "The quiz leaderboard.",
    example: `<Leaderboard top={5} />`,
    props: { top: "How many places." },
  },
  Pace: {
    category: "live",
    live: true,
    summary: "A gauge of the audience's slower/faster feedback.",
    example: `<Pace />`,
  },
  Presence: {
    category: "live",
    live: true,
    summary: "How many people are following.",
    example: `<Presence />`,
  },
  QrJoin: {
    category: "live",
    live: true,
    summary:
      "The QR code and short link for the audience page — put it on the title or first slide.",
    example: `<QrJoin size={300} />`,
    props: { size: "Pixels.", caption: "Text under the code." },
  },
  // ── Slidev parity: context, placement, clicks ──────────────────────────────────────────────
  LightOrDark: {
    category: "content",
    summary:
      "One thing in the light colour scheme, another in the dark (the slide's own scheme when its frontmatter forces one): `light`/`dark` props, children marked `slot=\"light\"`/`slot=\"dark\"`, or a function of the scheme.",
    example: `<LightOrDark>\n  <div slot="dark">![](/logo-white.svg)</div>\n  <div slot="light">![](/logo-black.svg)</div>\n</LightOrDark>`,
    props: {
      light: "Shown in the light scheme.",
      dark: "Shown in the dark scheme.",
      children: 'Elements with slot="light" / slot="dark", or ({ scheme }) => …',
    },
  },
  RenderWhen: {
    category: "content",
    summary:
      "Renders its children only in some places: `main` (the deck and the presenter's current slide), `slide`, `presenter`, `previewNext`, `overview`, `print`/`export`, `audience`, `visible`; `fallback` everywhere else.",
    example: `<RenderWhen context="presenter">Only the speaker sees this.</RenderWhen>\n\n<RenderWhen context={["print", "overview"]} fallback={<Iframe src="https://example.com" />}>![](/still.png)</RenderWhen>`,
    props: {
      context: 'A context, several ("presenter overview" or an array): main, slide, presenter, previewNext, overview, print, export, audience, visible.',
      fallback: "Rendered where the context does not match.",
    },
  },
  SlideCurrentNo: {
    category: "content",
    summary: "This slide's number (in a global layer: the current slide's).",
    example: `Slide <SlideCurrentNo /> of <SlidesTotal />`,
    props: { format: '"c" (default), "c/t", "h.v" or "h/v".' },
  },
  SlidesTotal: {
    category: "content",
    summary: "How many slides the deck has (hidden ones left out).",
    example: `<SlidesTotal /> slides`,
  },
  ClickCount: {
    category: "steps",
    summary:
      "The click step this slide is at (Slidev's `$clicks`), or with `total` how many it has; with a function child, anything that depends on the count. Never adds a click step itself. Hook: `useClicks()`.",
    example: `Step <ClickCount offset={1} /> of <ClickCount total />\n\n<ClickCount when={(c) => c >= 3}>\n\n**Done.**\n\n</ClickCount>`,
    props: {
      total: "Show the slide's number of clicks instead of the current one.",
      offset: "Added to the number shown (`offset={1}` counts from 1).",
      when: '`(click, total) => boolean`: render the children only while it is true (Slidev\'s `v-if="$clicks > 2"`).',
      children:
        "With `when`, what to show; otherwise a function `(click, total) => …` rendered instead of the number.",
    },
  },
  TitleRenderer: {
    category: "content",
    summary: "Another slide's title, by its number or id (no prop: this slide's own).",
    example: `Next up: <TitleRenderer no={3} />`,
    props: {
      no: "Slide number, 1-based.",
      id: "Or the slide's id.",
      fallback: "Shown when that slide has no title.",
      as: "The element: span (default), h1–h3, strong, div.",
    },
  },
  BlueSky: {
    category: "media",
    summary:
      "A Bluesky post, through Bluesky's embed, in the slide's colour scheme; `deck export` captures a poster for each scheme.",
    example: `<BlueSky uri="https://bsky.app/profile/sli.dev/post/3la7gcgfwpe2n" />`,
    props: {
      uri: "The post's bsky.app address or its AT-URI.",
      scale: "Scale factor.",
      poster: "Stands in for the post in print, the overview and while it loads.",
    },
  },
  Switch: {
    category: "steps",
    summary:
      "One child at a time, switched by clicks (Slidev's v-switch): each `<Case>` takes the next step, or `at={n}` / `at=\"a-b\"` in the switch's own steps; the cases share one spot, so nothing below jumps.",
    example: `<Switch transition="slide-up">\n<Case>First</Case>\n<Case>Then</Case>\n<Case at="4-6">Steps 4 and 5</Case>\n</Switch>`,
    props: {
      at: "When the switch's first step is, as <Click at>.",
      transition: "fade (default), slide-up, slide-left, scale, none.",
      unmount: "Leave hidden cases out of the page.",
      as: "The switch's element (div).",
      childAs: "Each case's element (div).",
    },
  },
  Case: {
    category: "steps",
    summary:
      "One case of a `<Switch>`. Without `at` it is one step after the case before; `at={0}` is what the slide starts with; the last case stays unless it has a range.",
    example: `<Switch>\n<Case at={0}>Before</Case>\n<Case>After one click</Case>\n</Switch>`,
    props: { at: 'A step (n), a range ("a-b" or [a, b]).', as: "This case's element.", className: "Extra classes." },
  },
  Drag: {
    category: "layout",
    summary:
      "A block you place by hand (Slidev's v-drag). `pos` is \"x,y,w,h[,rotation]\" in stage pixels (`_` height: automatic) or a name in the slide's `dragPos` frontmatter. In `kadal-deck dev`, double-click it to move, resize, turn and nudge it; the position is saved into deck.mdx. Elsewhere it is simply placed.",
    example: `<Drag pos="1400,120,380,_">\n\n![](/badge.png)\n\n</Drag>`,
    props: {
      pos: '"x,y,w,h[,r]" or a dragPos name; omitted: where it lies, until the first drag writes one.',
      at: "A click step, as <Click at>.",
      hide: "Start shown and hide at the step.",
      effect: "The reveal effect with at.",
      as: "The element (div).",
    },
  },
  DragArrow: {
    category: "layout",
    summary:
      "An `<Arrow>` whose ends are dragged into place in `kadal-deck dev` (Slidev's v-drag-arrow). `pos` is \"x,y,dx,dy\" (from x,y by dx,dy) or a dragPos name.",
    example: `<DragArrow pos="300,700,600,-280" color="var(--deck-accent)" width={4} />`,
    props: {
      pos: '"x,y,dx,dy" or a dragPos name (default 100,100,300,300).',
      width: "Line width.",
      color: "CSS colour.",
      twoWay: "Heads at both ends.",
      at: "A click step.",
    },
  },
};
