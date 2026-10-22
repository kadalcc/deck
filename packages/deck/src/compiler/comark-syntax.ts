import type {
  Code,
  Construct,
  Effects,
  Extension,
  State,
  Token,
  TokenizeContext,
} from "micromark-util-types";

import { parseComarkAttributes } from "./comark-attributes.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * COMARK SYNTAX FOR MICROMARK  —  the tokenizer half of remark-comark.ts
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * MDX reads `{` as the start of a JavaScript expression, so Comark's `{.class}` cannot be found
 * after parsing: by then MDX has failed on it. These constructs run inside the parser instead,
 * ahead of MDX's own for the same characters, and each one either reads a whole Comark form or
 * steps aside and leaves the text to Markdown and MDX exactly as it was:
 *
 *   text   :name  :name[label]  :name{attrs}  :name[label]{attrs}    comarkText
 *          [label]{attrs}                                           comarkSpan
 *          **x**{attrs}  `x`{attrs}  [x](y){attrs}  ![](z){attrs}     comarkAttributes (attached
 *                                                                   to what is before it later)
 *   flow   ::name{attrs}   (two or more colons)                       comarkBlock (an opener)
 *          ---  …YAML…  --- (straight after an opener: its props)   comarkBlockYaml
 *          ::               (the colons alone on the line)          comarkBlock (a closer)
 *
 * Openers and closers are separate tokens, paired up later (remark-comark.ts), so the Markdown
 * between them is parsed as the document it is in — lists, fences, quotes, other components.
 *
 * What steps aside, by design:
 *   - `:name` after a letter, digit or colon (`a:b`, `10:30`, `https://`), followed by a colon
 *     (`:smile:`), or with a space after the colon (`Note: …`);
 *   - `::name::` (Kadal's slot markers, compiler/slots.ts) and `::: tip` (a space before the name);
 *   - braces that are not an attribute list (`{props.x}`, `{1 + 1}`, `{" "}`): MDX's;
 *   - `[label]` without `{` straight after it: a link, a reference, or text, as before.
 * Code spans, fences and maths are tokenized before any of this is tried, so nothing in them is
 * ever read as Comark.
 * ─────────────────────────────────────────────────────────────────────────────
 */

declare module "micromark-util-types" {
  interface TokenTypeMap {
    comarkText: "comarkText";
    comarkTextMarker: "comarkTextMarker";
    comarkName: "comarkName";
    comarkLabel: "comarkLabel";
    comarkLabelMarker: "comarkLabelMarker";
    comarkLabelString: "comarkLabelString";
    comarkAttributes: "comarkAttributes";
    comarkAttributesMarker: "comarkAttributesMarker";
    comarkAttributesValue: "comarkAttributesValue";
    comarkSpan: "comarkSpan";
    comarkAfter: "comarkAfter";
    comarkBlock: "comarkBlock";
    comarkBlockMarker: "comarkBlockMarker";
    comarkBlockYaml: "comarkBlockYaml";
    comarkBlockYamlFence: "comarkBlockYamlFence";
    comarkBlockYamlValue: "comarkBlockYamlValue";
  }
}

const COLON = 58;
const LEFT_BRACKET = 91;
const RIGHT_BRACKET = 93;
const BACKSLASH = 92;
const LEFT_BRACE = 123;
const RIGHT_BRACE = 125;
const DASH = 45;
const UNDERSCORE = 95;
const QUOTE = 34;
const APOSTROPHE = 39;

const eol = (c: Code) => c !== null && c < -2;
const space = (c: Code) => c === -2 || c === -1 || c === 32;
const alpha = (c: Code) => c !== null && ((c >= 65 && c <= 90) || (c >= 97 && c <= 122));
const digit = (c: Code) => c !== null && c >= 48 && c <= 57;
const nameChar = (c: Code) => alpha(c) || digit(c) || c === DASH || c === UNDERSCORE;

/** A label longer than this is not a label (the same bound micromark puts on link labels). */
const LABEL_MAX = 999;
/** Nor is an attribute list longer than this. */
const ATTRS_MAX = 2000;

// ── pieces: a label and an attribute list ───────────────────────────────────────────────────

/** `[…]`, balanced, its inside parsed as Markdown text (emphasis, code, links, components). */
const label: Construct = { tokenize: tokenizeLabel, partial: true };

function tokenizeLabel(this: TokenizeContext, effects: Effects, ok: State, nok: State): State {
  let size = 0;
  let balance = 0;
  let previous: Token | undefined;
  return start;

  function start(code: Code): State | undefined {
    if (code !== LEFT_BRACKET) return nok(code);
    effects.enter("comarkLabel");
    effects.enter("comarkLabelMarker");
    effects.consume(code);
    effects.exit("comarkLabelMarker");
    return afterOpen;
  }
  function afterOpen(code: Code): State | undefined {
    if (code === RIGHT_BRACKET) return close(code);
    effects.enter("comarkLabelString");
    return chunkStart(code);
  }
  function chunkStart(code: Code): State | undefined {
    if (code === RIGHT_BRACKET && !balance) {
      effects.exit("comarkLabelString");
      return close(code);
    }
    const token = effects.enter("chunkText", { contentType: "text", previous });
    if (previous) previous.next = token;
    previous = token;
    return data(code);
  }
  function data(code: Code): State | undefined {
    if (code === null || size > LABEL_MAX) return nok(code);
    if (code === LEFT_BRACKET) balance++;
    if (code === RIGHT_BRACKET) {
      if (!balance) {
        effects.exit("chunkText");
        effects.exit("comarkLabelString");
        return close(code);
      }
      balance--;
    }
    if (eol(code)) {
      effects.consume(code);
      effects.exit("chunkText");
      size++;
      return chunkStart;
    }
    effects.consume(code);
    size++;
    return code === BACKSLASH ? escape : data;
  }
  function escape(code: Code): State | undefined {
    if (code === LEFT_BRACKET || code === RIGHT_BRACKET || code === BACKSLASH) {
      effects.consume(code);
      size++;
      return data;
    }
    return data(code);
  }
  function close(code: Code): State | undefined {
    effects.enter("comarkLabelMarker");
    effects.consume(code);
    effects.exit("comarkLabelMarker");
    effects.exit("comarkLabel");
    return ok;
  }
}

/**
 * `{…}` on one line, quotes respected, that `parseComarkAttributes` accepts. `allowEmpty`: `{}`
 * counts (after a component name); elsewhere an empty pair stays MDX's.
 */
function attributes(allowEmpty: boolean): Construct {
  return {
    partial: true,
    tokenize(effects, ok, nok) {
      let text = "";
      let quote: number | null = null;
      return start;

      function start(code: Code): State | undefined {
        if (code !== LEFT_BRACE) return nok(code);
        effects.enter("comarkAttributes");
        effects.enter("comarkAttributesMarker");
        effects.consume(code);
        effects.exit("comarkAttributesMarker");
        return first;
      }
      function first(code: Code): State | undefined {
        if (code === RIGHT_BRACE) return allowEmpty ? close(code) : nok(code);
        effects.enter("comarkAttributesValue");
        return value(code);
      }
      function value(code: Code): State | undefined {
        if (code === null || eol(code) || text.length > ATTRS_MAX) return nok(code);
        if (quote === null && code === RIGHT_BRACE) {
          effects.exit("comarkAttributesValue");
          return parseComarkAttributes(text) ? close(code) : nok(code);
        }
        if (quote === null && code === LEFT_BRACE) return nok(code);
        if (code === quote) quote = null;
        else if (quote === null && (code === QUOTE || code === APOSTROPHE)) quote = code;
        text += code < 0 ? (code === -2 ? "\t" : " ") : String.fromCharCode(code);
        effects.consume(code);
        if (code === BACKSLASH && quote !== null) return escaped;
        return value;
      }
      function escaped(code: Code): State | undefined {
        if (code === null || eol(code)) return nok(code);
        text += code < 0 ? " " : String.fromCharCode(code);
        effects.consume(code);
        return value;
      }
      function close(code: Code): State | undefined {
        effects.enter("comarkAttributesMarker");
        effects.consume(code);
        effects.exit("comarkAttributesMarker");
        effects.exit("comarkAttributes");
        return ok;
      }
    },
  };
}

const attrsAny = attributes(true);
const attrsSome = attributes(false);

// ── text: :name[label]{attrs} ───────────────────────────────────────────────────────────────

const inlineComponent: Construct = {
  name: "comarkText",
  tokenize: tokenizeInlineComponent,
  previous: notAfterWord,
};

/** Not straight after a letter, a digit, a colon or a non-ASCII character (a word in a script). */
function notAfterWord(this: TokenizeContext, code: Code): boolean {
  return (
    code === null || code < 0 || (code < 128 && !alpha(code) && !digit(code) && code !== COLON)
  );
}

function tokenizeInlineComponent(
  this: TokenizeContext,
  effects: Effects,
  ok: State,
  nok: State,
): State {
  return start;

  function start(code: Code): State | undefined {
    effects.enter("comarkText");
    effects.enter("comarkTextMarker");
    effects.consume(code);
    effects.exit("comarkTextMarker");
    return nameStart;
  }
  function nameStart(code: Code): State | undefined {
    if (!alpha(code)) return nok(code);
    effects.enter("comarkName");
    effects.consume(code);
    return name;
  }
  function name(code: Code): State | undefined {
    if (nameChar(code)) {
      effects.consume(code);
      return name;
    }
    effects.exit("comarkName");
    // `:smile:`, `:a::b`: an emoji shortcode or a slot-ish marker, not a component.
    if (code === COLON) return nok(code);
    if (code === LEFT_BRACKET) return effects.attempt(label, afterLabel, done)(code);
    if (code === LEFT_BRACE) return effects.attempt(attrsAny, done, done)(code);
    return done(code);
  }
  function afterLabel(code: Code): State | undefined {
    if (code === LEFT_BRACE) return effects.attempt(attrsAny, done, done)(code);
    return done(code);
  }
  function done(code: Code): State | undefined {
    effects.exit("comarkText");
    return ok(code);
  }
}

// ── text: [label]{attrs} ────────────────────────────────────────────────────────────────────

const span: Construct = { name: "comarkSpan", tokenize: tokenizeSpan, add: "before" };

function tokenizeSpan(this: TokenizeContext, effects: Effects, ok: State, nok: State): State {
  return start;

  function start(code: Code): State | undefined {
    effects.enter("comarkSpan");
    return effects.attempt(label, afterLabel, nok)(code);
  }
  function afterLabel(code: Code): State | undefined {
    if (code !== LEFT_BRACE) return nok(code);
    return effects.attempt(attrsSome, done, nok)(code);
  }
  function done(code: Code): State | undefined {
    effects.exit("comarkSpan");
    return ok(code);
  }
}

// ── text: {attrs} after an element ──────────────────────────────────────────────────────────

/** `)` ends a link or an image, `*` `_` emphasis, a backtick code, `~` a strikethrough, `]` a reference. */
const AFTER = new Set([41, 42, 95, 96, 126, RIGHT_BRACKET]);

const after: Construct = {
  name: "comarkAfter",
  tokenize: tokenizeAfter,
  previous: (code) => code !== null && AFTER.has(code),
  add: "before",
};

function tokenizeAfter(this: TokenizeContext, effects: Effects, ok: State, nok: State): State {
  return start;
  function start(code: Code): State | undefined {
    effects.enter("comarkAfter");
    return effects.attempt(attrsSome, done, nok)(code);
  }
  function done(code: Code): State | undefined {
    effects.exit("comarkAfter");
    return ok(code);
  }
}

// ── flow: ::name{attrs} … :: ────────────────────────────────────────────────────────────────

const block: Construct = { name: "comarkBlock", tokenize: tokenizeBlock };

/** Openers are marked on their token, so the YAML props after one can tell. */
type BlockToken = Token & { _comarkOpener?: boolean };

/** Is the last thing this flow tokenized an opener (only line endings and indents since)? */
function afterOpener(self: TokenizeContext): boolean {
  for (let i = self.events.length - 1; i >= 0; i--) {
    const [kind, token] = self.events[i]!;
    if (token.type === "lineEnding" || token.type === "linePrefix" || token.type === "whitespace")
      continue;
    return kind === "exit" && token.type === "comarkBlock" && !!(token as BlockToken)._comarkOpener;
  }
  return false;
}

/** A next line that belongs to this container (not a lazy continuation). */
const nonLazyLine: Construct = { tokenize: tokenizeNonLazyLine, partial: true };

function tokenizeNonLazyLine(
  this: TokenizeContext,
  effects: Effects,
  ok: State,
  nok: State,
): State {
  // An arrow keeps the tokenizer's `this` (the parser's state: which lines are lazy).
  const lineStart = (code: Code): State | undefined =>
    this.parser.lazy[this.now().line] ? nok(code) : ok(code);
  return start;
  function start(code: Code): State | undefined {
    if (!eol(code)) return nok(code);
    effects.enter("lineEnding");
    effects.consume(code);
    effects.exit("lineEnding");
    return lineStart;
  }
}

/** `---` alone on a line (spaces after it allowed). */
function yamlFence(effects: Effects, ok: State, nok: State): State {
  let dashes = 0;
  return start;
  function start(code: Code): State | undefined {
    if (code !== DASH) return nok(code);
    effects.enter("comarkBlockYamlFence");
    return sequence(code);
  }
  function sequence(code: Code): State | undefined {
    if (code === DASH) {
      dashes++;
      effects.consume(code);
      return sequence;
    }
    if (dashes !== 3) return nok(code);
    effects.exit("comarkBlockYamlFence");
    return trailing(code);
  }
  function trailing(code: Code): State | undefined {
    if (space(code)) {
      effects.enter("whitespace");
      return spaces(code);
    }
    return code === null || eol(code) ? ok(code) : nok(code);
  }
  function spaces(code: Code): State | undefined {
    if (space(code)) {
      effects.consume(code);
      return spaces;
    }
    effects.exit("whitespace");
    return code === null || eol(code) ? ok(code) : nok(code);
  }
}

/**
 * An opener's YAML props: a `---` line straight after it, YAML lines, a `---` line. Concrete
 * (like a code fence: a YAML list item is not a Markdown list), and like a fence it is not taken
 * back once started — props left open run to the end of what they are in, and say so.
 */
const yamlProps: Construct = {
  name: "comarkBlockYaml",
  tokenize: tokenizeYamlProps,
  concrete: true,
  add: "before",
};

function tokenizeYamlProps(this: TokenizeContext, effects: Effects, ok: State, nok: State): State {
  const opener = afterOpener(this);
  return start;
  function start(code: Code): State | undefined {
    if (!opener) return nok(code);
    effects.enter("comarkBlockYaml");
    return yamlFence(effects, lineEnd, nok)(code);
  }
  function lineEnd(code: Code): State | undefined {
    if (code === null) return done(code);
    return effects.check(nonLazyLine, nextLine, done)(code);
  }
  function nextLine(code: Code): State | undefined {
    effects.enter("lineEnding");
    effects.consume(code);
    effects.exit("lineEnding");
    return lineStart;
  }
  function lineStart(code: Code): State | undefined {
    if (code === DASH) return effects.attempt(closeFence, done, content)(code);
    return content(code);
  }
  function content(code: Code): State | undefined {
    if (code === null || eol(code)) return lineEnd(code);
    effects.enter("comarkBlockYamlValue");
    return value(code);
  }
  function value(code: Code): State | undefined {
    if (code === null || eol(code)) {
      effects.exit("comarkBlockYamlValue");
      return lineEnd(code);
    }
    effects.consume(code);
    return value;
  }
  function done(code: Code): State | undefined {
    effects.exit("comarkBlockYaml");
    return ok(code);
  }
}

const closeFence: Construct = {
  partial: true,
  tokenize(effects, ok, nok) {
    return yamlFence(effects, ok, nok);
  },
};

function tokenizeBlock(this: TokenizeContext, effects: Effects, ok: State, nok: State): State {
  let colons = 0;
  let token: BlockToken;
  return start;

  function start(code: Code): State | undefined {
    token = effects.enter("comarkBlock");
    effects.enter("comarkBlockMarker");
    return marker(code);
  }
  function marker(code: Code): State | undefined {
    if (code === COLON) {
      colons++;
      effects.consume(code);
      return marker;
    }
    if (colons < 2) return nok(code);
    effects.exit("comarkBlockMarker");
    if (alpha(code)) {
      token._comarkOpener = true;
      effects.enter("comarkName");
      effects.consume(code);
      return name;
    }
    // A closer: the colons alone on the line. Whether anything is open is not knowable here (a
    // list between the two starts a flow of its own), so a stray one is put back as the text
    // it was when the blocks are paired (remark-comark.ts).
    return trailing(code);
  }
  function name(code: Code): State | undefined {
    if (nameChar(code)) {
      effects.consume(code);
      return name;
    }
    effects.exit("comarkName");
    // `::right::` is a slot marker (compiler/slots.ts), never a component.
    if (code === COLON) return nok(code);
    if (code === LEFT_BRACE) return effects.attempt(attrsAny, opened, nok)(code);
    return opened(code);
  }
  function opened(code: Code): State | undefined {
    if (space(code)) {
      effects.enter("whitespace");
      return openedSpace(code);
    }
    return openedEnd(code);
  }
  function openedSpace(code: Code): State | undefined {
    if (space(code)) {
      effects.consume(code);
      return openedSpace;
    }
    effects.exit("whitespace");
    return openedEnd(code);
  }
  function openedEnd(code: Code): State | undefined {
    return code === null || eol(code) ? end(code) : nok(code);
  }
  function trailing(code: Code): State | undefined {
    if (space(code)) {
      effects.enter("whitespace");
      return trailingSpace(code);
    }
    return code === null || eol(code) ? end(code) : nok(code);
  }
  function trailingSpace(code: Code): State | undefined {
    if (space(code)) {
      effects.consume(code);
      return trailingSpace;
    }
    effects.exit("whitespace");
    return code === null || eol(code) ? end(code) : nok(code);
  }
  function end(code: Code): State | undefined {
    effects.exit("comarkBlock");
    return ok(code);
  }
}

/** The micromark extension: Comark's text and flow constructs, ahead of MDX's for `{` and `[`. */
export function comarkSyntax(): Extension {
  return {
    text: { [COLON]: inlineComponent, [LEFT_BRACKET]: span, [LEFT_BRACE]: after },
    flow: { [COLON]: block, [DASH]: yamlProps },
  };
}
