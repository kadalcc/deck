import { exec } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import * as vscode from "vscode";

import { slideAtLine, slideLabel } from "./core/deck.ts";
import {
  componentDocs,
  componentInfo,
  componentSnippet,
  components,
  contextAt,
  keyDocs,
  keyInfo,
  keysFor,
  valuesFor,
} from "./core/intellisense.ts";
import { cliCommand, minimalEdit, parseCheck } from "./core/tools.ts";
import type { DeckWorkspace } from "./workspace.ts";

/**
 * The language features: problems from `kadal-deck check`, formatting with the deck's own
 * @kadal/prettier-plugin, frontmatter and component completions and hovers, a fold per slide, and
 * each slide's number and title beside its separator.
 */

export const LANGUAGE = "kadal-deck";
const selector: vscode.DocumentSelector = [{ language: LANGUAGE }];

/* ── problems ─────────────────────────────────────────────────────────────── */

export class Checker implements vscode.Disposable {
  readonly collection = vscode.languages.createDiagnosticCollection("kadal-deck");
  private running: Promise<void> | null = null;

  constructor(
    private readonly decks: DeckWorkspace,
    private readonly output: vscode.OutputChannel,
  ) {}

  /** Run `kadal-deck check --json` in the active deck's folder and show what it says. */
  run(compile: boolean): Promise<void> {
    const dir = this.decks.dir;
    if (!dir) return Promise.resolve();
    if (this.running) return this.running;
    const command = cliCommand(dir, ["check", "--json", ...(compile ? [] : ["--no-compile"])]);
    this.running = new Promise<void>((resolve) => {
      exec(command, { cwd: dir, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
        this.running = null;
        const found = parseCheck(stdout, dir);
        if (!found.size && error && !stdout.trim()) {
          this.output.appendLine(`kadal-deck check could not run: ${stderr || error.message}`);
          return resolve();
        }
        this.collection.clear();
        for (const [file, list] of found) {
          this.collection.set(
            vscode.Uri.file(file),
            list.map((d) => {
              const range = new vscode.Range(d.line, d.column, d.line, Number.MAX_SAFE_INTEGER);
              const diag = new vscode.Diagnostic(
                range,
                d.hint ? `${d.message}\n${d.hint}` : d.message,
                d.severity === "error"
                  ? vscode.DiagnosticSeverity.Error
                  : d.severity === "warning"
                    ? vscode.DiagnosticSeverity.Warning
                    : vscode.DiagnosticSeverity.Information,
              );
              diag.source = "kadal-deck";
              diag.code = d.code;
              return diag;
            }),
          );
        }
        resolve();
      });
    });
    return this.running;
  }

  dispose() {
    this.collection.dispose();
  }
}

/* ── formatting ───────────────────────────────────────────────────────────── */

type FormatDeck = (
  source: string,
  prettier: unknown,
  options: Record<string, unknown>,
) => Promise<{ text: string; kept: Array<{ slide: number; reason: string }> }>;

/**
 * The deck's own Prettier and @kadal/prettier-plugin (a dependency of @kadal/deck), so the
 * editor formats exactly as `kadal-deck format` does in that deck.
 */
async function loadFormatter(
  deckDir: string,
): Promise<{
  prettier: { resolveConfig: (f: string, o: object) => Promise<Record<string, unknown> | null> };
  formatDeck: FormatDeck;
} | null> {
  const bases = [join(deckDir, "package.json")];
  try {
    bases.push(createRequire(join(deckDir, "package.json")).resolve("@kadal/deck/package.json"));
  } catch {
    /* not installed: the deck folder alone */
  }
  for (const base of bases) {
    if (!existsSync(dirname(base))) continue;
    const req = createRequire(base);
    try {
      const prettierPath = req.resolve("prettier");
      const pluginPath = req.resolve("@kadal/prettier-plugin");
      const [prettier, plugin] = await Promise.all([
        import(pathToFileURL(prettierPath).href),
        import(pathToFileURL(pluginPath).href),
      ]);
      return { prettier, formatDeck: plugin.formatDeck as FormatDeck };
    } catch {
      /* the next place */
    }
  }
  return null;
}

export function formatter(decks: DeckWorkspace): vscode.DocumentFormattingEditProvider {
  return {
    async provideDocumentFormattingEdits(doc) {
      const dir = dirname(doc.uri.fsPath);
      const f = await loadFormatter(
        decks.dir && doc.uri.fsPath.startsWith(decks.dir) ? decks.dir : dir,
      );
      if (!f) {
        void vscode.window.showWarningMessage(
          "Formatting a deck needs @kadal/deck 0.4 or later installed in the deck (it brings Prettier and @kadal/prettier-plugin).",
        );
        return [];
      }
      const config = (await f.prettier.resolveConfig(doc.uri.fsPath, { editorconfig: true })) ?? {};
      const text = doc.getText();
      const result = await f.formatDeck(text, f.prettier, {
        ...config,
        bodies: config.kadalDeckBodies !== false,
      });
      for (const k of result.kept.slice(0, 3))
        void vscode.window.showInformationMessage(
          `Slide ${k.slide + 1} kept as written: ${k.reason}`,
        );
      const eol = doc.eol === vscode.EndOfLine.CRLF ? "\r\n" : "\n";
      const span = minimalEdit(text, eol === "\n" ? result.text : result.text.replace(/\n/g, eol));
      if (!span) return [];
      return [
        vscode.TextEdit.replace(
          new vscode.Range(doc.positionAt(span.start), doc.positionAt(span.end)),
          span.text,
        ),
      ];
    },
  };
}

/* ── completions and hovers ───────────────────────────────────────────────── */

export function completions(decks: DeckWorkspace): vscode.CompletionItemProvider {
  return {
    provideCompletionItems(doc, pos) {
      const deck = decks.deck && decks.deck.entry === doc.uri.fsPath ? decks.deck : null;
      const ctx = contextAt(doc.getText(), deck, pos.line, pos.character);
      if (!ctx) return [];
      if (ctx.kind === "key") {
        return keysFor(ctx.scope)
          .filter((k) => !ctx.present.includes(k.name))
          .map((k) => {
            const item = new vscode.CompletionItem(k.name, vscode.CompletionItemKind.Property);
            item.detail = `${k.scope === "deck" ? "deck" : "slide"} · ${k.type.text}`;
            item.documentation = new vscode.MarkdownString(keyDocs(k));
            item.insertText = new vscode.SnippetString(`${k.name}: $0`);
            item.sortText = `${k.scope === "deck" && ctx.scope === "head" ? "0" : "1"}${k.name}`;
            item.command = { command: "editor.action.triggerSuggest", title: "Values" };
            return item;
          });
      }
      if (ctx.kind === "value") {
        return valuesFor(ctx.key, ctx.scope).map((v) => {
          const item = new vscode.CompletionItem(v.value, vscode.CompletionItemKind.Value);
          if (v.detail) item.documentation = new vscode.MarkdownString(v.detail);
          return item;
        });
      }
      return components().map((c) => {
        const item = new vscode.CompletionItem(c.name, vscode.CompletionItemKind.Class);
        item.detail = c.category;
        item.documentation = new vscode.MarkdownString(componentDocs(c));
        item.insertText = new vscode.SnippetString(componentSnippet(c));
        return item;
      });
    },
  };
}

export function hovers(decks: DeckWorkspace): vscode.HoverProvider {
  return {
    provideHover(doc, pos) {
      const line = doc.lineAt(pos.line).text;
      const deck = decks.deck && decks.deck.entry === doc.uri.fsPath ? decks.deck : null;
      const key = /^([A-Za-z_][\w.-]*)\s*:/.exec(line);
      if (key && pos.character <= key[1]!.length) {
        const ctx = contextAt(doc.getText(), deck, pos.line, key[0].length);
        if (ctx?.kind === "value") {
          const info = keyInfo(key[1]!, ctx.scope);
          if (info) return new vscode.Hover(new vscode.MarkdownString(keyDocs(info)));
        }
      }
      const range = doc.getWordRangeAtPosition(pos, /<\/?[A-Z][\w.]*/);
      if (range) {
        const name = doc.getText(range).replace(/^<\/?/, "");
        const c = componentInfo(name);
        if (c) return new vscode.Hover(new vscode.MarkdownString(componentDocs(c)), range);
      }
      return null;
    },
  };
}

/* ── a fold per slide, and the slide's number at its separator ───────────── */

export function folding(decks: DeckWorkspace): vscode.FoldingRangeProvider {
  return {
    provideFoldingRanges(doc) {
      const deck = decks.deck;
      if (!deck) return [];
      const file = doc.uri.fsPath;
      return deck.slides
        .filter((s) => s.source.file === file)
        .map(
          (s) =>
            new vscode.FoldingRange(
              s.source.startLine - 1,
              Math.max(s.source.startLine - 1, s.source.endLine - 1),
            ),
        )
        .filter((r) => r.end > r.start);
    },
  };
}

export class Annotations implements vscode.Disposable {
  private readonly type = vscode.window.createTextEditorDecorationType({
    after: { color: new vscode.ThemeColor("editorCodeLens.foreground"), margin: "0 0 0 1.5em" },
  });

  constructor(private readonly decks: DeckWorkspace) {}

  update(editor: vscode.TextEditor | undefined) {
    if (!editor) return;
    const on = vscode.workspace.getConfiguration("kadalDeck").get<boolean>("annotations", true);
    const deck = this.decks.deck;
    const file = editor.document.uri.fsPath;
    if (!on || !deck || !this.decks.touches(file)) return editor.setDecorations(this.type, []);
    const items: vscode.DecorationOptions[] = [];
    for (const s of deck.slides) {
      if (s.source.file !== file) continue;
      const line = s.source.startLine - 1;
      if (line >= editor.document.lineCount) continue;
      const end = editor.document.lineAt(line).range.end;
      items.push({
        range: new vscode.Range(end, end),
        renderOptions: {
          after: {
            contentText: `${s.v > 0 ? "↳ " : ""}${slideLabel(s)}${s.hidden ? " (hidden)" : ""}`,
          },
        },
      });
    }
    editor.setDecorations(this.type, items);
  }

  dispose() {
    this.type.dispose();
  }
}

/** The slide under the cursor of `editor`, when it is in the active deck. */
export function slideUnderCursor(decks: DeckWorkspace, editor: vscode.TextEditor | undefined) {
  const deck = decks.deck;
  if (!editor || !deck) return null;
  return slideAtLine(deck, editor.document.uri.fsPath, editor.selection.active.line);
}

export function register(context: vscode.ExtensionContext, decks: DeckWorkspace) {
  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider(selector, formatter(decks)),
    vscode.languages.registerCompletionItemProvider(selector, completions(decks), ":", " ", "<"),
    vscode.languages.registerHoverProvider(selector, hovers(decks)),
    vscode.languages.registerFoldingRangeProvider(selector, folding(decks)),
  );
}
