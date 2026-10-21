import { writeFileSync } from "node:fs";
import * as vscode from "vscode";

import { type SlideNode, dropSlide, slideLabel, slideTree } from "../core/deck.ts";
import { minimalEdit } from "../core/tools.ts";
import type { DeckWorkspace } from "../workspace.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SLIDES TREE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * One row per slide, numbered as the deck numbers them, titled from the slide's `title` or its
 * first heading; a vertical stack nests under its column's first slide. A row says its layout,
 * whether it is hidden, has notes or comes from another file. Clicking a row puts the cursor on
 * that slide; the eye shows it in the preview.
 *
 * Drag a row onto another and the slide moves there — beside it as a column of its own, or into
 * its stack when the row you drop on is in one. The move is the engine's `moveSlide`
 * (authoring/edit.ts): whole slides, frontmatter and notes with them, every other byte kept. It
 * lands in the editor as one edit (undo puts it back), saved when the file had no unsaved
 * changes, so the preview shows it at once.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const MIME = "application/vnd.code.tree.kadal-deck.slides";

export class SlidesView
  implements vscode.TreeDataProvider<SlideNode>, vscode.TreeDragAndDropController<SlideNode>
{
  readonly dragMimeTypes = [MIME];
  readonly dropMimeTypes = [MIME];
  private readonly changed = new vscode.EventEmitter<SlideNode | undefined>();
  readonly onDidChangeTreeData = this.changed.event;
  private roots: SlideNode[] = [];
  private parents = new Map<SlideNode, SlideNode>();

  constructor(private readonly decks: DeckWorkspace) {
    decks.onDidChange((deck) => {
      this.roots = deck ? slideTree(deck.slides) : [];
      this.parents = new Map();
      for (const r of this.roots) for (const c of r.children) this.parents.set(c, r);
      this.changed.fire(undefined);
    });
  }

  getChildren(node?: SlideNode): SlideNode[] {
    return node ? node.children : this.roots;
  }

  getParent(node: SlideNode): SlideNode | undefined {
    return this.parents.get(node);
  }

  /** The node for slide `index`, for revealing it. */
  find(index: number): SlideNode | undefined {
    for (const r of this.roots) {
      if (r.slide.index === index) return r;
      const c = r.children.find((x) => x.slide.index === index);
      if (c) return c;
    }
    return undefined;
  }

  getTreeItem(node: SlideNode): vscode.TreeItem {
    const s = node.slide;
    const item = new vscode.TreeItem(
      slideLabel(s),
      node.children.length
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.None,
    );
    const bits = [s.layout !== "default" ? s.layout : null, s.hidden ? "hidden" : null];
    if (s.includedFrom) bits.push(vscode.workspace.asRelativePath(s.source.file));
    item.description = bits.filter(Boolean).join(" · ");
    item.id = `slide-${s.index}-${s.id}`;
    item.contextValue = "slide";
    item.iconPath = new vscode.ThemeIcon(
      s.hidden
        ? "eye-closed"
        : node.children.length
          ? "layers"
          : s.v > 0
            ? "arrow-small-down"
            : "preview",
    );
    const tip = new vscode.MarkdownString();
    tip.appendMarkdown(`**${slideLabel(s)}**  \n`);
    tip.appendMarkdown(
      `layout \`${s.layout}\` · id \`${s.id}\` · ${s.clicks} click${s.clicks === 1 ? "" : "s"}`,
    );
    if (s.notes) tip.appendMarkdown(` · notes${s.noteClicks ? ` (${s.noteClicks} [click])` : ""}`);
    if (s.excerpt) tip.appendText(`\n\n${s.excerpt}`);
    item.tooltip = tip;
    item.command = {
      command: "kadal-deck.revealSlide",
      title: "Go to slide",
      arguments: [s.index],
    };
    return item;
  }

  handleDrag(source: readonly SlideNode[], data: vscode.DataTransfer) {
    data.set(MIME, new vscode.DataTransferItem(source.map((n) => n.slide.index)));
  }

  async handleDrop(target: SlideNode | undefined, data: vscode.DataTransfer) {
    const raw = data.get(MIME)?.value as number[] | undefined;
    const entry = this.decks.entry;
    if (!raw?.length || !entry) return;
    const from = raw[0]!;
    // Dropped below the last row: to the end.
    const onto = target ? target.slide.index : (this.decks.deck?.slides.length ?? 1) - 1;
    let result: ReturnType<typeof dropSlide>;
    try {
      result = dropSlide(entry, this.decks.read, from, onto);
    } catch (e) {
      void vscode.window.showWarningMessage(
        `That slide was not moved: ${e instanceof Error ? e.message : String(e)}`,
      );
      return;
    }
    if (!result) return;
    await applyFiles(result.files);
    for (const note of result.notes) void vscode.window.showInformationMessage(note);
    this.decks.refresh();
    if (result.index !== null)
      await vscode.commands.executeCommand("kadal-deck.revealSlide", result.index);
  }
}

/**
 * Write an edit's files: as one minimal edit in an open (or openable) document, so it is one undo
 * step and the cursor keeps its place; straight to disk only when that fails.
 */
export async function applyFiles(files: Record<string, string>) {
  const edit = new vscode.WorkspaceEdit();
  // Documents that were saved before the edit are saved after it, so the dev server sees it.
  const clean: vscode.TextDocument[] = [];
  for (const [path, text] of Object.entries(files)) {
    const uri = vscode.Uri.file(path);
    let doc: vscode.TextDocument;
    try {
      doc = await vscode.workspace.openTextDocument(uri);
    } catch {
      writeFileSync(path, text);
      continue;
    }
    const before = doc.getText();
    // The engine keeps each file's own line endings; VS Code's text is the document's.
    const span = minimalEdit(before, text);
    if (!span) continue;
    if (!doc.isDirty) clean.push(doc);
    edit.replace(
      uri,
      new vscode.Range(doc.positionAt(span.start), doc.positionAt(span.end)),
      span.text,
    );
  }
  if (await vscode.workspace.applyEdit(edit)) for (const doc of clean) await doc.save();
}
