export {
  type Frontmatter,
  type RawSlide,
  type SplitOptions,
  type SplitResult,
  levelOf,
  splitDeck,
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
