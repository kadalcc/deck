import { randomBytes } from "node:crypto";
import * as vscode from "vscode";

import type { DevServer } from "../dev-server.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE PREVIEW
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The deck itself, from `kadal-deck dev`, in a frame in the side bar: real rendering, real
 * clicks, the deck's own keys. The frame is told which slide to show by its URL hash — the
 * slide's id (`#/s4`, or its frontmatter `id`), which the deck resolves itself — so following the
 * cursor moves the deck without reloading it. With no dev server yet, the view offers to start
 * one (or attaches to one already running on the port).
 *
 * The page goes through `asExternalUri`, so a remote window (SSH, a container, Codespaces) gets a
 * forwarded address rather than the remote machine's localhost.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export class PreviewView implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | null = null;
  private hash = "";
  private base: string | null = null;

  constructor(
    private readonly server: DevServer,
    private readonly start: () => Promise<void>,
  ) {
    server.onDidChange(() => void this.render());
  }

  resolveWebviewView(view: vscode.WebviewView) {
    this.view = view;
    view.webview.options = { enableScripts: true, enableCommandUris: false };
    view.webview.onDidReceiveMessage((m: { type?: string }) => {
      if (m?.type === "start") void this.start();
      if (m?.type === "browser") void vscode.commands.executeCommand("kadal-deck.openInBrowser");
    });
    view.onDidChangeVisibility(() => {
      if (view.visible && !this.server.state.url && !this.server.state.starting) void this.render();
    });
    void this.render();
  }

  /** Show a slide (its URL hash, `#/<id>`). */
  show(hash: string) {
    if (hash === this.hash) return;
    this.hash = hash;
    void this.view?.webview.postMessage({ type: "goto", hash });
  }

  private async render() {
    const view = this.view;
    if (!view) return;
    const { url, starting } = this.server.state;
    const nonce = randomBytes(16).toString("base64");
    if (!url) {
      this.base = null;
      view.webview.html = page(
        nonce,
        "",
        `<div class="empty">
          <p>${starting ? "Starting <code>kadal-deck dev</code>…" : "The preview shows the deck from <code>kadal-deck dev</code>."}</p>
          ${starting ? "" : `<button id="start" type="button">Start the dev server</button>`}
        </div>`,
      );
      return;
    }
    const external = (await vscode.env.asExternalUri(vscode.Uri.parse(url))).toString(true);
    if (external === this.base) return;
    this.base = external;
    const origin = new URL(external).origin;
    view.webview.html = page(
      nonce,
      origin,
      `<iframe id="deck" title="Deck preview" src="${escapeAttr(external + this.hash)}" allow="clipboard-read; clipboard-write; fullscreen"></iframe>`,
      external,
    );
  }
}

function escapeAttr(s: string) {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function page(nonce: string, frameOrigin: string, body: string, base = ""): string {
  const frame = frameOrigin ? `${frameOrigin} http://localhost:* http://127.0.0.1:*` : "'none'";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src ${frame}; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style nonce="${nonce}">
  html, body { height: 100%; margin: 0; padding: 0; overflow: hidden; background: var(--vscode-sideBar-background); color: var(--vscode-foreground); font: var(--vscode-font-size) var(--vscode-font-family); }
  iframe { border: 0; width: 100%; height: 100%; display: block; background: #000; }
  .empty { padding: 14px 16px; }
  .empty p { margin: 0 0 12px; line-height: 1.45; }
  code { font-family: var(--vscode-editor-font-family); }
  button { font: inherit; color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 0; padding: 6px 12px; border-radius: 2px; cursor: pointer; }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }
</style>
</head>
<body>
${body}
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const base = ${JSON.stringify(base)};
  document.getElementById("start")?.addEventListener("click", () => vscode.postMessage({ type: "start" }));
  window.addEventListener("message", (e) => {
    const m = e.data;
    const frame = document.getElementById("deck");
    // Only the hash changes: the deck moves to the slide without reloading.
    if (m && m.type === "goto" && frame && base) frame.src = base + m.hash;
  });
</script>
</body>
</html>`;
}
