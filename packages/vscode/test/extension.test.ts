import { beforeAll, describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import * as fake from "./fake-vscode.ts";

// The extension, activated against the fake API with the starter deck (a real deck, with
// @kadal/deck installed, so formatting runs the deck's own Prettier plugin).
mock.module("vscode", () => fake);

const starter = join(import.meta.dir, "..", "..", "..", "examples", "starter");
const entry = join(starter, "deck.mdx");

beforeAll(async () => {
  fake.recorded.files = [entry];
  const { activate } = await import("../src/extension.ts");
  activate({
    subscriptions: [],
    workspaceState: { get: () => undefined, update: async () => {} },
  } as never);
  // Activation scans the workspace and parses the deck.
  await new Promise((r) => setTimeout(r, 50));
});

describe("the extension, activated", () => {
  test("registers its commands and views", () => {
    for (const id of [
      "kadal-deck.startDev",
      "kadal-deck.stopDev",
      "kadal-deck.openInBrowser",
      "kadal-deck.openPresenter",
      "kadal-deck.exportPdf",
      "kadal-deck.check",
      "kadal-deck.format",
      "kadal-deck.newDeck",
      "kadal-deck.chooseDeck",
      "kadal-deck.revealSlide",
      "kadal-deck.followCursor",
    ])
      expect(fake.recorded.commands.has(id)).toBe(true);
    // Every command the manifest declares is registered.
    const manifest = JSON.parse(readFileSync(join(import.meta.dir, "..", "package.json"), "utf8"));
    for (const c of manifest.contributes.commands)
      expect(fake.recorded.commands.has(c.command)).toBe(true);
    expect(fake.recorded.trees.has("kadal-deck.slides")).toBe(true);
    expect(fake.recorded.webviews.has("kadal-deck.preview")).toBe(true);
    expect(fake.recorded.context.get("kadal-deck.hasDeck")).toBe(true);
  });

  test("the slides tree: columns, the stack nested, labels", () => {
    const tree = fake.recorded.trees.get("kadal-deck.slides")!.treeDataProvider as {
      getChildren(n?: unknown): Array<{ slide: { index: number }; children: unknown[] }>;
      getTreeItem(n: unknown): fake.TreeItem;
    };
    const roots = tree.getChildren();
    expect(roots.length).toBeGreaterThan(3);
    expect(tree.getTreeItem(roots[0]).label).toBe("1. My first Kadal Deck");
    const stack = roots.find((r) => r.children.length > 0)!;
    expect(stack).toBeTruthy();
    expect(tree.getTreeItem(stack.children[0]).label).toMatch(/^3\. Below the section/);
  });

  test("completions and hovers in the headmatter and in a body", async () => {
    const doc = await fake.workspace.openTextDocument(entry);
    const completion = fake.recorded.providers.completion as {
      provideCompletionItems(d: unknown, p: fake.Position): fake.CompletionItem[];
    };
    const keys = completion
      .provideCompletionItems(doc, new fake.Position(1, 0))
      .map((i) => i.label);
    expect(keys).toContain("transition");
    expect(keys).not.toContain("author"); // already there
    const values = completion
      .provideCompletionItems(doc, new fake.Position(4, "theme: ".length))
      .map((i) => i.label);
    expect(values).toContain("minimal");
    const hover = (
      fake.recorded.providers.hover as {
        provideHover(d: unknown, p: fake.Position): fake.Hover | null;
      }
    ).provideHover(doc, new fake.Position(4, 2));
    expect(hover?.contents.value).toContain("**theme**");
  });

  test("a fold per slide", async () => {
    const doc = await fake.workspace.openTextDocument(entry);
    const folds = (
      fake.recorded.providers.folding as {
        provideFoldingRanges(d: unknown): fake.FoldingRange[];
      }
    ).provideFoldingRanges(doc);
    expect(folds.length).toBeGreaterThan(3);
    expect(folds[0]!.start).toBe(0);
  });

  test("formatting through the deck's own @kadal/prettier-plugin", async () => {
    const doc = new fake.TextDocument(entry, "---\ntitle:   x\n---\n# A\n* b\n---   \n* c\n");
    const edits = await (
      fake.recorded.providers.format as {
        provideDocumentFormattingEdits(d: unknown): Promise<Array<{ newText: string }>>;
      }
    ).provideDocumentFormattingEdits(doc);
    expect(edits.length).toBe(1);
    const e = edits[0] as unknown as { range: fake.Range; newText: string };
    const text = doc.getText();
    const out =
      text.slice(0, doc.offsetAt(e.range.start)) +
      e.newText +
      text.slice(doc.offsetAt(e.range.end));
    expect(out).toBe("---\ntitle: x\n---\n\n# A\n\n- b\n\n---\n\n- c\n");
  });

  test("drag and drop moves a slide with one minimal edit", async () => {
    const tree = fake.recorded.trees.get("kadal-deck.slides")!;
    const dnd = tree.dragAndDropController as {
      handleDrag(s: unknown[], d: fake.DataTransfer): void;
      handleDrop(t: unknown, d: fake.DataTransfer): Promise<void>;
    };
    const provider = tree.treeDataProvider as {
      getChildren(n?: unknown): Array<{ slide: { index: number; title: string | null } }>;
    };
    const roots = provider.getChildren();
    const last = roots[roots.length - 1]!;
    const data = new fake.DataTransfer();
    dnd.handleDrag([last], data);
    const before = (await fake.workspace.openTextDocument(entry)).getText();
    await dnd.handleDrop(roots[1], data);
    const doc = await fake.workspace.openTextDocument(entry);
    expect(fake.recorded.edits.length).toBe(1);
    expect(doc.getText()).not.toBe(before);
    expect(doc.getText().length).toBe(before.length);
    // The deck re-parses: the last slide is now the second.
    await new Promise((r) => setTimeout(r, 250));
    const after = provider.getChildren();
    expect(after[1]!.slide.title).toBe(last.slide.title);
  });
});
