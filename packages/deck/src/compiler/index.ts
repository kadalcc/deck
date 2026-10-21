export {
  type Frontmatter,
  type RawSlide,
  type SplitOptions,
  type SplitResult,
  type SlideRange,
  fencedRanges,
  levelOf,
  notesBlocks,
  parseSlideRange,
  splitDeck,
  splitSrc,
  titleOf,
} from "./split.ts";
export {
  type CodeMeta,
  type LineSet,
  deserialiseSteps,
  parseCodeMeta,
  parseLineSet,
  serialiseSteps,
} from "./code-meta.ts";
export { type MagicMoveBlock, type MagicMoveStep, findMagicMoves } from "./magic-move.ts";
export { rehypeDeckCode } from "./rehype-code.ts";
export { type RehypeGlossaryOptions, rehypeGlossary } from "./rehype-glossary.ts";
export { type ParsedGlossary, parseGlossary } from "../glossary/parse.ts";
export { applySlots } from "./slots.ts";
export { blankHtmlComments, htmlComments } from "./comments.ts";
export {
  type SlideStyle,
  deckStylesheet,
  extractStyles,
  scopeCss,
  slideScope,
} from "./slide-style.ts";
export { encodePlantUml, plantUmlUrl, DEFAULT_PLANTUML_SERVER } from "./plantuml.ts";
export { parseLoose } from "./loose-object.ts";
export { remarkDeckFences } from "./remark-fences.ts";
export { rehypeAutoRuby } from "./rehype-ruby.ts";
export {
  type DeckSetup,
  type KatexOptions,
  katexOptions,
  mermaidConfig,
  slideDefaults,
  withDefaults,
} from "./setup.ts";
