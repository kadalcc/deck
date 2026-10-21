import { existsSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import * as vscode from "vscode";

import { type ParsedDeck, parseDeck } from "./core/deck.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DECKS IN THE WORKSPACE, and the active one
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Decks are files matching `kadalDeck.include` (deck.mdx and slides.mdx by default). The active
 * deck is the one being edited — the deck file itself, or a file it includes — else the one
 * chosen, else the first found. It is parsed from the editors' text (unsaved changes included)
 * and from the disk for files no editor has open, again after every change (debounced), and
 * everything else — the tree, the preview, the annotations — listens to `onDidChange`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export class DeckWorkspace implements vscode.Disposable {
  private decks: string[] = [];
  private chosen: string | null = null;
  private current: ParsedDeck | null = null;
  private error: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly changed = new vscode.EventEmitter<ParsedDeck | null>();
  private readonly subscriptions: vscode.Disposable[] = [];
  readonly onDidChange = this.changed.event;

  constructor(private readonly state: vscode.Memento) {
    this.chosen = state.get<string>("kadal-deck.activeDeck") ?? null;
    this.subscriptions.push(
      this.changed,
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (this.touches(e.document.uri.fsPath)) this.schedule();
      }),
      vscode.workspace.onDidSaveTextDocument((d) => {
        if (this.touches(d.uri.fsPath)) this.schedule(0);
      }),
      vscode.window.onDidChangeActiveTextEditor((e) => {
        const file = e?.document.uri.fsPath;
        if (!file) return;
        // Editing another deck makes it the active one.
        if (this.decks.includes(file) && file !== this.entry) this.use(file);
      }),
    );
    const watcher = vscode.workspace.createFileSystemWatcher("**/*.mdx");
    watcher.onDidCreate(() => void this.scan());
    watcher.onDidDelete(() => void this.scan());
    watcher.onDidChange((u) => this.touches(u.fsPath) && this.schedule());
    this.subscriptions.push(watcher);
  }

  /** The active deck's file, or null when the workspace has none. */
  get entry(): string | null {
    const open = vscode.window.activeTextEditor?.document.uri.fsPath;
    if (open && this.decks.includes(open)) return open;
    if (this.chosen && this.decks.includes(this.chosen)) return this.chosen;
    return this.decks[0] ?? null;
  }

  get dir(): string | null {
    const e = this.entry;
    return e ? dirname(e) : null;
  }

  get deck(): ParsedDeck | null {
    return this.current;
  }

  get problem(): string | null {
    return this.error;
  }

  get all(): readonly string[] {
    return this.decks;
  }

  /** Whether `file` is the active deck or one of the files its slides come from. */
  touches(file: string): boolean {
    if (!this.current) return file === this.entry;
    return (
      file === this.current.entry ||
      this.current.slides.some((s) => s.source.file === file || s.includedFrom === file)
    );
  }

  /** A file's text: an open editor's (unsaved changes and all), else the disk's. */
  read = (path: string): string | null => {
    const doc = vscode.workspace.textDocuments.find((d) => d.uri.fsPath === path);
    if (doc) return doc.getText();
    try {
      return existsSync(path) ? readFileSync(path, "utf8") : null;
    } catch {
      return null;
    }
  };

  async scan(): Promise<void> {
    const include = vscode.workspace
      .getConfiguration("kadalDeck")
      .get<string[]>("include", ["**/deck.mdx", "**/slides.mdx"]);
    const found = new Set<string>();
    for (const glob of include) {
      const uris = await vscode.workspace.findFiles(glob, "**/{node_modules,dist,.git}/**", 200);
      for (const u of uris) found.add(u.fsPath);
    }
    this.decks = [...found].sort((a, b) => a.length - b.length || a.localeCompare(b));
    await vscode.commands.executeCommand("setContext", "kadal-deck.hasDeck", this.decks.length > 0);
    this.refresh();
  }

  use(entry: string) {
    this.chosen = entry;
    void this.state.update("kadal-deck.activeDeck", entry);
    this.refresh();
  }

  schedule(delay = 200) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.refresh(), delay);
  }

  refresh() {
    const entry = this.entry;
    if (!entry) {
      this.current = null;
      this.error = null;
      this.changed.fire(null);
      return;
    }
    try {
      this.current = parseDeck(entry, this.read);
      this.error = null;
    } catch (e) {
      // Keep the last good parse on screen; say what is wrong.
      this.error = e instanceof Error ? e.message : String(e);
    }
    this.changed.fire(this.current);
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer);
    for (const d of this.subscriptions) d.dispose();
  }
}
