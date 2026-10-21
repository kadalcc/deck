import {
  transformerNotationDiff,
  transformerNotationErrorLevel,
  transformerNotationFocus,
  transformerNotationHighlight,
  transformerNotationWordHighlight,
} from "@shikijs/transformers";
import type { ShikiTransformer } from "shiki";

/**
 * Shiki's notation transformers, on for every code block: a comment at the end of a line marks it,
 * and the comment itself is taken out of what the audience sees.
 *
 *   console.log("old") // [!code --]        a removed line (red, with a −)
 *   console.log("new") // [!code ++]        an added line (green, with a +)
 *   const x = 1        // [!code highlight] a lit line; `highlight:3` lights this one and the next two
 *   const y = 2        // [!code focus]     every other line blurs until the block is hovered
 *   throw oops         // [!code error]     an error line (also `warning`)
 *   // [!code word:tide]                    every `tide` in the block, or `word:tide:2` for the next 2 lines
 *
 * The comment can be any comment the language has (`#`, `--`, `<!-- -->`…). "v3" matching means a
 * marker on a line of its own applies to the line below it, which is what people expect. The marks
 * are classes (`.diff.add`, `.highlighted`, `.focused`, `.highlighted-word`) styled in code.css, in
 * light and dark, so they sit on top of the click-stepped highlights rather than fighting them.
 *
 * This module is imported by the Vite plugin directly and by the runtime compiler lazily, so the
 * prebuilt shell only pays for it once a deck is compiled.
 */
export function notationTransformers(): ShikiTransformer[] {
  return [
    transformerNotationDiff({ matchAlgorithm: "v3" }),
    transformerNotationHighlight({ matchAlgorithm: "v3" }),
    transformerNotationFocus({ matchAlgorithm: "v3" }),
    transformerNotationErrorLevel({ matchAlgorithm: "v3" }),
    transformerNotationWordHighlight({ matchAlgorithm: "v3" }),
  ];
}
