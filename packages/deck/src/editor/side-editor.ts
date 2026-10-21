import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { yaml, yamlFrontmatter } from "@codemirror/lang-yaml";
import {
  HighlightStyle,
  LanguageDescription,
  bracketMatching,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import { EditorState } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

import type { SideEditorHandle, SideEditorOptions } from "../core/side-editor.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SIDE EDITOR'S EDITOR: CodeMirror 6, for `kadal-deck dev` only
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The panel (react/SideEditor.tsx) is in the engine; this module is not. The manifest imports
 * it lazily under the dev server (`sideEditor`, vite/source-dev.ts), so a built deck carries no
 * CodeMirror at all, and a dev session pays for it the first time the editor opens.
 *
 * It knows nothing of the deck: a text in, changes and save requests out. The slide source is
 * Markdown with a YAML frontmatter block at the top (`---` … `---`, which is how a slide's source
 * starts) and fenced code in JS/TS/JSX, CSS, HTML and YAML highlighted inside it. Colours come
 * from the deck's own tokens (`--deck-*`), so the editor follows the theme and its dark mode.
 *
 * Its styles — the editor's and the panel's — are injected when this module loads, for the same
 * reason: nothing of the side editor reaches a build.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type { SideEditorHandle, SideEditorOptions };

const fenceLanguages = [
  LanguageDescription.of({
    name: "javascript",
    alias: ["js", "jsx", "mjs", "cjs", "ts", "tsx", "typescript", "mts"],
    load: async () => javascript({ jsx: true, typescript: true }),
  }),
  LanguageDescription.of({ name: "css", alias: ["scss", "postcss"], load: async () => css() }),
  LanguageDescription.of({
    name: "html",
    alias: ["vue", "svelte", "xml"],
    load: async () => html(),
  }),
  LanguageDescription.of({ name: "yaml", alias: ["yml"], load: async () => yaml() }),
];

/** Token colours from the deck's palette, with readable fallbacks in either scheme. */
const highlight = HighlightStyle.define([
  {
    tag: [t.heading1, t.heading2, t.heading3, t.heading4],
    fontWeight: "700",
    color: "var(--kse-heading)",
  },
  { tag: t.heading, fontWeight: "700" },
  { tag: t.strong, fontWeight: "700" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: [t.link, t.url], color: "var(--kse-link)", textDecoration: "underline" },
  { tag: [t.monospace, t.string, t.special(t.string)], color: "var(--kse-string)" },
  { tag: [t.keyword, t.operatorKeyword, t.modifier], color: "var(--kse-keyword)" },
  { tag: [t.propertyName, t.attributeName, t.definition(t.propertyName)], color: "var(--kse-key)" },
  { tag: [t.typeName, t.tagName, t.className], color: "var(--kse-tag)" },
  { tag: [t.number, t.bool, t.null, t.atom], color: "var(--kse-number)" },
  {
    tag: [t.comment, t.lineComment, t.blockComment],
    color: "var(--kse-muted)",
    fontStyle: "italic",
  },
  {
    tag: [t.processingInstruction, t.contentSeparator, t.meta, t.quote],
    color: "var(--kse-muted)",
  },
  { tag: t.list, color: "var(--kse-keyword)" },
  { tag: t.invalid, color: "var(--kse-error)" },
]);

const theme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "13px",
    color: "var(--deck-fg, #1f2328)",
    backgroundColor: "transparent",
  },
  ".cm-scroller": {
    fontFamily: "var(--deck-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace)",
    lineHeight: "1.55",
  },
  ".cm-content": { caretColor: "var(--kse-accent)", padding: "10px 0" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--kse-accent)" },
  "&.cm-focused": { outline: "none" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "var(--kse-selection) !important",
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    color: "var(--kse-muted)",
    border: "none",
    borderRight: "1px solid var(--kse-border)",
  },
  ".cm-activeLine": { backgroundColor: "var(--kse-active)" },
  ".cm-activeLineGutter": { backgroundColor: "var(--kse-active)", color: "var(--deck-fg)" },
  ".cm-matchingBracket": { outline: "1px solid var(--kse-accent)", backgroundColor: "transparent" },
  ".cm-searchMatch": { backgroundColor: "var(--kse-match)" },
  ".cm-panels": {
    backgroundColor: "var(--deck-bg, #fff)",
    color: "var(--deck-fg, #1f2328)",
    borderColor: "var(--kse-border)",
  },
  ".cm-panels input, .cm-panels button": { font: "inherit", fontSize: "12px" },
});

/**
 * The panel's and the editor's palette, and the panel's layout (react/SideEditor.tsx renders it).
 * Light and dark follow the deck root's `data-color-scheme`, which the theme switch sets.
 */
const PANEL_CSS = `
.deck-side-editor {
  --kse-border: var(--deck-border, color-mix(in srgb, var(--deck-fg, #1f2328) 14%, transparent));
  --kse-muted: var(--deck-muted, color-mix(in srgb, var(--deck-fg, #1f2328) 55%, transparent));
  --kse-active: color-mix(in srgb, var(--deck-fg, #1f2328) 5%, transparent);
  --kse-selection: color-mix(in srgb, var(--kse-accent) 24%, transparent);
  --kse-match: color-mix(in srgb, #f59e0b 30%, transparent);
  --kse-accent: var(--deck-accent, #2563eb);
  --kse-heading: var(--deck-fg, #1f2328);
  --kse-link: var(--deck-accent, #2563eb);
  --kse-string: #0a7c4a;
  --kse-keyword: #8a3ffc;
  --kse-key: #0b62c4;
  --kse-tag: #b4235a;
  --kse-number: #b45309;
  --kse-error: #dc2626;
  position: fixed;
  z-index: 110;
  top: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  min-width: 0;
  border-left: 1px solid var(--kse-border);
  background: var(--deck-bg, #fff);
  color: var(--deck-fg, #1f2328);
  font: 13px/1.35 var(--deck-body-font, system-ui, sans-serif);
  box-shadow: -10px 0 30px rgba(0, 0, 0, 0.12);
}
[data-color-scheme="dark"] .deck-side-editor, .deck-side-editor[data-scheme="dark"] {
  --kse-string: #7ee2a8;
  --kse-keyword: #c4a5ff;
  --kse-key: #7cc4ff;
  --kse-tag: #ff8fb8;
  --kse-number: #ffc277;
  --kse-error: #ff7b7b;
  box-shadow: -10px 0 30px rgba(0, 0, 0, 0.45);
}
.deck-side-editor-grip {
  position: absolute;
  left: -4px;
  top: 0;
  bottom: 0;
  width: 8px;
  cursor: col-resize;
  touch-action: none;
}
.deck-side-editor-grip:hover, .deck-side-editor-grip:focus-visible, .deck-side-editor-grip[data-dragging] {
  background: color-mix(in srgb, var(--kse-accent) 45%, transparent);
  outline: none;
}
.deck-side-editor-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px 8px 14px;
  border-bottom: 1px solid var(--kse-border);
}
.deck-side-editor-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.deck-side-editor-title b { font-weight: 650; }
.deck-side-editor-title span { color: var(--kse-muted); margin-left: 6px; }
.deck-side-editor button {
  font: inherit;
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 7px;
  border: 1px solid var(--kse-border);
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.deck-side-editor button:hover:not(:disabled) { background: var(--kse-active); }
.deck-side-editor button:focus-visible { outline: 2px solid var(--kse-accent); outline-offset: 1px; }
.deck-side-editor button:disabled { opacity: 0.45; cursor: default; }
.deck-side-editor button[data-primary] {
  background: var(--kse-accent);
  border-color: var(--kse-accent);
  color: var(--deck-bg, #fff);
}
.deck-side-editor button[data-primary]:hover:not(:disabled) {
  background: color-mix(in srgb, var(--kse-accent) 85%, #000);
}
.deck-side-editor-body { flex: 1; min-height: 0; overflow: hidden; }
.deck-side-editor-body > .cm-editor { height: 100%; }
.deck-side-editor-banner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--kse-border);
  background: color-mix(in srgb, #f59e0b 14%, transparent);
}
.deck-side-editor-banner[data-kind="error"] { background: color-mix(in srgb, var(--kse-error) 14%, transparent); }
.deck-side-editor-banner p { margin: 0; flex: 1 1 100%; }
.deck-side-editor-foot {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 14px;
  border-top: 1px solid var(--kse-border);
  color: var(--kse-muted);
  font-size: 12px;
}
.deck-side-editor kbd {
  font: 11px/1 var(--deck-mono-font, ui-monospace, monospace);
  padding: 2px 4px;
  border-radius: 4px;
  border: 1px solid var(--kse-border);
}
@media (max-width: 720px) {
  .deck-side-editor { left: 0; width: auto !important; border-left: none; }
  .deck-side-editor-grip { display: none; }
}
@media (prefers-reduced-motion: no-preference) {
  .deck-side-editor { animation: kse-in 160ms ease-out; }
  @keyframes kse-in { from { transform: translateX(24px); opacity: 0; } }
}
@media print { .deck-side-editor { display: none; } }
`;

let styled = false;
function injectStyles() {
  if (styled || typeof document === "undefined") return;
  styled = true;
  const el = document.createElement("style");
  el.dataset.kadalSideEditor = "";
  el.textContent = PANEL_CSS;
  document.head.append(el);
}
injectStyles();

export function createSideEditor(
  parent: HTMLElement,
  options: SideEditorOptions,
): SideEditorHandle {
  const extensions = [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightActiveLine(),
    drawSelection(),
    history(),
    indentOnInput(),
    bracketMatching(),
    highlightSelectionMatches(),
    search({ top: true }),
    EditorView.lineWrapping,
    yamlFrontmatter({
      content: markdown({ base: markdownLanguage, codeLanguages: fenceLanguages }),
    }),
    syntaxHighlighting(highlight),
    theme,
    EditorView.contentAttributes.of({ "aria-label": options.label }),
    keymap.of([
      {
        key: "Mod-s",
        preventDefault: true,
        run: () => {
          options.onSave();
          return true;
        },
      },
      {
        key: "Escape",
        run: (view) => {
          // A selection collapses first, as everywhere; then the deck gets its keys back.
          const sel = view.state.selection.main;
          if (!sel.empty) {
            view.dispatch({ selection: { anchor: sel.head } });
            return true;
          }
          options.onEscape();
          return true;
        },
      },
      ...searchKeymap,
      ...historyKeymap,
      ...defaultKeymap,
      indentWithTab,
    ]),
    EditorView.updateListener.of((u) => {
      if (u.docChanged) options.onChange(u.state.doc.toString());
    }),
  ];
  const state = (text: string) => EditorState.create({ doc: text, extensions });
  const view = new EditorView({ state: state(options.text), parent });
  return {
    getText: () => view.state.doc.toString(),
    setText: (text) => view.setState(state(text)),
    focus: () => view.focus(),
    destroy: () => view.destroy(),
  };
}
