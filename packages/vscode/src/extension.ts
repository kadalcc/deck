import { basename, dirname } from "node:path";
import * as vscode from "vscode";

import { slideHash } from "./core/deck.ts";
import { cliCommand, localCli } from "./core/tools.ts";
import { DevServer } from "./dev-server.ts";
import { Annotations, Checker, LANGUAGE, register, slideUnderCursor } from "./features.ts";
import { PreviewView } from "./views/preview.ts";
import { SlidesView } from "./views/slides.ts";
import { DeckWorkspace } from "./workspace.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * KADAL DECK FOR VS CODE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   Slides        the active deck's outline: click to go, drag to reorder (views/slides.ts)
 *   Preview       the deck from `kadal-deck dev`, following the cursor (views/preview.ts)
 *   Language      deck.mdx / slides.mdx: separators, frontmatter (YAML) and notes highlighted;
 *                 frontmatter and component completions and hovers from the engine's catalog;
 *                 a fold per slide; each slide's number beside its separator (features.ts)
 *   Problems      `kadal-deck check` on save (and the full check as a command)
 *   Formatting    the deck's @kadal/prettier-plugin (Format Document, or the command)
 *   Commands      dev server, browser, presenter, PDF export, new deck, choose deck
 *   AI            `kadal-deck mcp` offered to VS Code's agents as an MCP server (VS Code 1.101+)
 *
 * Everything that reads or edits a deck is the engine's own code (`@kadal/deck/authoring`,
 * bundled); everything that builds or serves one is the deck's own CLI, so the extension never
 * disagrees with the engine version a deck is using.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export function activate(context: vscode.ExtensionContext) {
  const output = vscode.window.createOutputChannel("Kadal Deck");
  const decks = new DeckWorkspace(context.workspaceState);
  const server = new DevServer(output);
  const checker = new Checker(decks, output);
  const annotations = new Annotations(decks);
  const slides = new SlidesView(decks);
  const tree = vscode.window.createTreeView("kadal-deck.slides", {
    treeDataProvider: slides,
    dragAndDropController: slides,
    showCollapseAll: true,
  });
  const startDev = async () => {
    const dir = decks.dir;
    if (!dir) {
      void vscode.window.showWarningMessage(
        "No deck in this workspace (a folder with a deck.mdx).",
      );
      return;
    }
    await server.ensure(dir);
  };
  const preview = new PreviewView(server, startDev);
  context.subscriptions.push(
    output,
    decks,
    server,
    checker,
    annotations,
    tree,
    vscode.window.registerWebviewViewProvider("kadal-deck.preview", preview, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );
  register(context, decks);

  const follow = () =>
    vscode.workspace.getConfiguration("kadalDeck").get<boolean>("preview.followCursor", true);
  void vscode.commands.executeCommand("setContext", "kadal-deck.followCursor", follow());

  // The cursor's slide: shown in the preview, selected in the tree.
  let lastIndex = -1;
  const sync = (editor = vscode.window.activeTextEditor) => {
    const slide = slideUnderCursor(decks, editor);
    if (!slide) return;
    if (follow()) preview.show(slideHash(slide));
    if (slide.index !== lastIndex && tree.visible) {
      const node = slides.find(slide.index);
      if (node) void tree.reveal(node, { select: true, focus: false });
    }
    lastIndex = slide.index;
  };

  context.subscriptions.push(
    decks.onDidChange(() => {
      annotations.update(vscode.window.activeTextEditor);
      tree.message = decks.problem ? `Last parse failed: ${decks.problem}` : undefined;
      tree.description = decks.entry ? vscode.workspace.asRelativePath(decks.entry) : undefined;
    }),
    vscode.window.onDidChangeTextEditorSelection((e) => {
      if (
        e.textEditor.document.languageId === LANGUAGE ||
        decks.touches(e.textEditor.document.uri.fsPath)
      )
        sync(e.textEditor);
    }),
    vscode.window.onDidChangeActiveTextEditor((e) => {
      annotations.update(e);
      sync(e);
    }),
    vscode.workspace.onDidSaveTextDocument((doc) => {
      const on = vscode.workspace.getConfiguration("kadalDeck").get<boolean>("check.onSave", true);
      if (on && decks.touches(doc.uri.fsPath)) void checker.run(false);
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("kadalDeck.include")) void decks.scan();
      if (e.affectsConfiguration("kadalDeck.annotations"))
        annotations.update(vscode.window.activeTextEditor);
      if (e.affectsConfiguration("kadalDeck.preview.followCursor"))
        void vscode.commands.executeCommand("setContext", "kadal-deck.followCursor", follow());
    }),
  );

  const url = async (path = "") => {
    const dir = decks.dir;
    if (!dir) return null;
    const base = server.state.url ?? (await server.ensure(dir));
    return base ? new URL(path, base).toString() : null;
  };
  const terminal = (name: string, dir: string, command: string) => {
    const t = vscode.window.createTerminal({ name, cwd: dir });
    t.show();
    t.sendText(command);
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("kadal-deck.startDev", startDev),
    vscode.commands.registerCommand("kadal-deck.stopDev", () => {
      if (server.state.url && !server.state.owned)
        void vscode.window.showInformationMessage(
          "This dev server was started outside VS Code; stop it where it runs.",
        );
      server.stop();
    }),
    vscode.commands.registerCommand("kadal-deck.openInBrowser", async () => {
      const slide = slideUnderCursor(decks, vscode.window.activeTextEditor);
      const u = await url(slide ? slideHash(slide) : "");
      if (u) await vscode.env.openExternal(await vscode.env.asExternalUri(vscode.Uri.parse(u)));
    }),
    vscode.commands.registerCommand("kadal-deck.openPresenter", async () => {
      const slide = slideUnderCursor(decks, vscode.window.activeTextEditor);
      const u = await url(`presenter${slide ? slideHash(slide) : ""}`);
      if (u) await vscode.env.openExternal(await vscode.env.asExternalUri(vscode.Uri.parse(u)));
    }),
    vscode.commands.registerCommand("kadal-deck.exportPdf", () => {
      const dir = decks.dir;
      if (dir) terminal("Kadal Deck: export", dir, cliCommand(dir, ["export"]));
    }),
    vscode.commands.registerCommand("kadal-deck.check", async () => {
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Window, title: "Kadal Deck: checking the deck" },
        () => checker.run(true),
      );
      await vscode.commands.executeCommand("workbench.actions.view.problems");
    }),
    vscode.commands.registerCommand("kadal-deck.format", async () => {
      const entry = decks.entry;
      if (!entry) return;
      const doc = await vscode.workspace.openTextDocument(entry);
      await vscode.window.showTextDocument(doc);
      await vscode.commands.executeCommand("editor.action.formatDocument");
    }),
    vscode.commands.registerCommand("kadal-deck.newDeck", async () => {
      const where = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        openLabel: "Create the deck in here",
        defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri,
      });
      if (!where?.[0]) return;
      const name = await vscode.window.showInputBox({
        prompt: "The new deck's folder name",
        value: "my-talk",
        validateInput: (v) =>
          /^[\w.-]+$/.test(v) ? null : "Letters, digits, dots, dashes and underscores",
      });
      if (!name) return;
      const parent = where[0].fsPath;
      const local = localCli(parent);
      terminal(
        "Kadal Deck: new",
        parent,
        local ? `${JSON.stringify(local)} new ${name}` : `npm create @kadal/deck@latest ${name}`,
      );
    }),
    vscode.commands.registerCommand("kadal-deck.chooseDeck", async () => {
      const pick = await vscode.window.showQuickPick(
        decks.all.map((f) => ({
          label: basename(dirname(f)),
          description: vscode.workspace.asRelativePath(f),
          file: f,
        })),
        { placeHolder: "The deck the outline and the preview follow" },
      );
      if (pick) {
        decks.use(pick.file);
        if (server.state.dir && server.state.dir !== dirname(pick.file)) server.stop();
      }
    }),
    vscode.commands.registerCommand("kadal-deck.refresh", () => void decks.scan()),
    vscode.commands.registerCommand("kadal-deck.revealSlide", async (index: number) => {
      const s = decks.deck?.slides[index];
      if (!s) return;
      const doc = await vscode.workspace.openTextDocument(s.source.file);
      const editor = await vscode.window.showTextDocument(doc, { preserveFocus: false });
      const line = Math.min(doc.lineCount - 1, Math.max(0, s.source.bodyLine - 1));
      const pos = new vscode.Position(line, 0);
      editor.selection = new vscode.Selection(pos, pos);
      editor.revealRange(
        new vscode.Range(pos, pos),
        vscode.TextEditorRevealType.InCenterIfOutsideViewport,
      );
      preview.show(slideHash(s));
    }),
    vscode.commands.registerCommand(
      "kadal-deck.showInPreview",
      async (node?: { slide: { index: number } }) => {
        const s = node ? decks.deck?.slides[node.slide.index] : null;
        if (!s) return;
        await vscode.commands.executeCommand("kadal-deck.preview.focus");
        if (!server.state.url) await startDev();
        preview.show(slideHash(s));
      },
    ),
    vscode.commands.registerCommand("kadal-deck.followCursor", () =>
      vscode.workspace
        .getConfiguration("kadalDeck")
        .update("preview.followCursor", true, vscode.ConfigurationTarget.Global),
    ),
    vscode.commands.registerCommand("kadal-deck.unfollowCursor", () =>
      vscode.workspace
        .getConfiguration("kadalDeck")
        .update("preview.followCursor", false, vscode.ConfigurationTarget.Global),
    ),
  );

  registerMcp(context, decks);
  void decks.scan().then(() => sync());
}

/**
 * `kadal-deck mcp` as an MCP server for VS Code's agents (Copilot agent mode and others): 17 tools
 * to read, lint, render, edit and export the active deck. Needs VS Code 1.101+; older versions
 * simply do not offer it.
 */
function registerMcp(context: vscode.ExtensionContext, decks: DeckWorkspace) {
  type McpApi = {
    registerMcpServerDefinitionProvider?: (id: string, provider: unknown) => vscode.Disposable;
  };
  const lm = (vscode as unknown as { lm?: McpApi }).lm;
  const Definition = (
    vscode as unknown as {
      McpStdioServerDefinition?: new (
        label: string,
        command: string,
        args: string[],
        env?: Record<string, string>,
      ) => unknown;
    }
  ).McpStdioServerDefinition;
  if (!lm?.registerMcpServerDefinitionProvider || !Definition) return;
  const changed = new vscode.EventEmitter<void>();
  context.subscriptions.push(
    changed,
    decks.onDidChange(() => changed.fire()),
    lm.registerMcpServerDefinitionProvider("kadal-deck", {
      onDidChangeMcpServerDefinitions: changed.event,
      provideMcpServerDefinitions: () => {
        const dir = decks.dir;
        if (!dir) return [];
        const local = localCli(dir);
        const [command, ...args] = local
          ? [local, "mcp", "--dir", dir]
          : ["npx", "-y", "-p", "@kadal/deck", "kadal-deck", "mcp", "--dir", dir];
        return [new Definition(`Kadal Deck (${basename(dir)})`, command!, args)];
      },
    }),
  );
}

export function deactivate() {}
