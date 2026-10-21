/**
 * Monaco for the shell's `{monaco…}` blocks: the editor, every worker its language services use,
 * and Shiki's grammars and themes on demand. A lazy chunk — main.tsx registers a loader that
 * imports this module the first time an editor is on the slide being presented — so the shell's
 * eager bundle does not grow by a byte of Monaco, and a deck without an editor never fetches it.
 * Bundled here (not fetched from a CDN), so a hosted deck's editors work wherever the shell does.
 */
import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/editor/editor.worker.js?worker";
import CssWorker from "monaco-editor/language/css/css.worker.js?worker";
import HtmlWorker from "monaco-editor/language/html/html.worker.js?worker";
import JsonWorker from "monaco-editor/language/json/json.worker.js?worker";
import TsWorker from "monaco-editor/language/typescript/ts.worker.js?worker";
import { bundledGrammar, bundledThemes, createMonacoHost } from "@kadal/deck/monaco";

export default function loadMonaco() {
  return createMonacoHost({
    monaco: monaco as never,
    workers: {
      editor: () => new EditorWorker({ name: "monaco-editor" }),
      typescript: () => new TsWorker({ name: "monaco-typescript" }),
      json: () => new JsonWorker({ name: "monaco-json" }),
      css: () => new CssWorker({ name: "monaco-css" }),
      html: () => new HtmlWorker({ name: "monaco-html" }),
    },
    grammar: bundledGrammar,
    // The runtime compiler's default Shiki themes (runtime/compile.ts).
    themes: bundledThemes("github-light", "github-dark"),
    // A hosted deck has no dev server to save to: `{monaco-write}` editors are read-only here.
    writeEndpoint: null,
  });
}
