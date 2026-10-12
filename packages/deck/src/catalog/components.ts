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
      "A hand-drawn mark around inline text — underline, circle, box, highlight or strike — drawn on its click.",
    example: `The answer is <Mark type="circle">forty-two</Mark>.`,
    props: { at: "Click step, as for <Click>.", color: "CSS colour." },
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
      "Speaker notes. Lifted out at compile time and shown in the presenter view; `[click]` markers line them up with clicks.",
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
    props: { scale: "Scale factor.", children: "Mermaid source as a JSX template string." },
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
    summary: "A video that plays while its slide is shown.",
    example: `<Video src="/demo.mp4" autoplay loop />`,
    props: {
      src: "Video URL (public/ path or https).",
      autoplay: "Play on arrival.",
      loop: "Loop.",
      muted: "Muted.",
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
    summary: "Any lucide icon by name.",
    example: `<Icon name="rocket" size="2em" />`,
    props: {
      name: "lucide icon name, kebab-case or PascalCase.",
      size: "CSS size or px.",
      color: "CSS colour.",
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
};
