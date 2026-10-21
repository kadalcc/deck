import { type ChildProcess, spawn } from "node:child_process";
import * as vscode from "vscode";

import { devCommand, localUrl } from "./core/tools.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * `kadal-deck dev` FOR THE PREVIEW
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * One dev server, for the active deck, on `kadalDeck.port` (3030). Before starting one it looks
 * for one already there — `kadal-deck dev` run in a terminal — by asking the port for the deck's
 * slide-source endpoint (`/__kadal/source`, which only a Kadal Deck dev server answers), and
 * attaches to it instead. A server it started writes to the "Kadal Deck" output channel and stops
 * with the window (or the stop button); one it attached to is never stopped from here.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface DevState {
  /** The deck's URL (http://localhost:3030/), once it answers. */
  url: string | null;
  /** Started from here (and stoppable), or found running. */
  owned: boolean;
  /** The deck folder it serves. */
  dir: string | null;
  starting: boolean;
}

export class DevServer implements vscode.Disposable {
  private child: ChildProcess | null = null;
  private readonly emitter = new vscode.EventEmitter<DevState>();
  readonly onDidChange = this.emitter.event;
  state: DevState = { url: null, owned: false, dir: null, starting: false };

  constructor(private readonly output: vscode.OutputChannel) {}

  private set(next: Partial<DevState>) {
    this.state = { ...this.state, ...next };
    void vscode.commands.executeCommand(
      "setContext",
      "kadal-deck.devRunning",
      !!this.state.url || this.state.starting,
    );
    this.emitter.fire(this.state);
  }

  private get port(): number {
    return vscode.workspace.getConfiguration("kadalDeck").get<number>("port", 3030);
  }

  /** Whether a Kadal Deck dev server answers on `url`. */
  static async probe(url: string): Promise<boolean> {
    try {
      const r = await fetch(new URL("__kadal/source?slide=0", url), {
        signal: AbortSignal.timeout(1500),
        headers: { Accept: "application/json" },
      });
      if (r.status !== 200 && r.status !== 404) return false;
      const body = (await r.json().catch(() => null)) as {
        version?: unknown;
        error?: unknown;
      } | null;
      return !!body && (typeof body.version === "string" || typeof body.error === "string");
    } catch {
      return false;
    }
  }

  /** Attach to a running server, or start one for `dir`. Resolves with the URL, or null. */
  async ensure(dir: string): Promise<string | null> {
    if (this.state.url && this.state.dir === dir) return this.state.url;
    if (this.state.dir && this.state.dir !== dir) this.stop();
    const url = `http://localhost:${this.port}/`;
    if (await DevServer.probe(url)) {
      this.output.appendLine(`Found a Kadal Deck dev server at ${url}; using it.`);
      this.set({ url, owned: false, dir, starting: false });
      return url;
    }
    return this.start(dir);
  }

  private start(dir: string): Promise<string | null> {
    const template = vscode.workspace.getConfiguration("kadalDeck").get<string>("devCommand", "");
    const command = devCommand(dir, this.port, template);
    this.output.appendLine(`$ ${command}   (in ${dir})`);
    this.set({ url: null, owned: true, dir, starting: true });
    const child = spawn(command, {
      cwd: dir,
      shell: true,
      // Its own process group, so stopping it stops Vite too, not only the shell.
      detached: process.platform !== "win32",
      env: { ...process.env, FORCE_COLOR: "0", BROWSER: "none" },
    });
    this.child = child;
    return new Promise((resolve) => {
      let seen = "";
      let done = false;
      const finish = (url: string | null) => {
        if (done) return;
        done = true;
        resolve(url);
      };
      const onData = (chunk: Buffer) => {
        const text = chunk.toString();
        this.output.append(text);
        if (this.state.url) return;
        seen += text;
        const url = localUrl(seen);
        if (url) {
          this.set({ url, starting: false });
          finish(url);
        }
      };
      child.stdout?.on("data", onData);
      child.stderr?.on("data", onData);
      child.on("error", (e) => {
        this.output.appendLine(`Could not start it: ${e.message}`);
        finish(null);
      });
      child.on("exit", (code) => {
        if (this.child === child) {
          this.child = null;
          this.set({ url: null, owned: false, starting: false });
        }
        this.output.appendLine(`The dev server stopped (${code ?? "signal"}).`);
        if (!done) {
          void vscode.window
            .showErrorMessage(
              "The Kadal Deck dev server did not start. See the output.",
              "Show output",
            )
            .then((pick) => pick && this.output.show());
          finish(null);
        }
      });
      setTimeout(() => finish(this.state.url), 60_000);
    });
  }

  stop() {
    if (this.child) {
      this.output.appendLine("Stopping the dev server.");
      killTree(this.child);
      this.child = null;
    }
    this.set({ url: null, owned: false, dir: null, starting: false });
  }

  dispose() {
    if (this.child) killTree(this.child);
    this.emitter.dispose();
  }
}

/** Stop a server started here and everything it started (the shell, the CLI, Vite). */
function killTree(child: ChildProcess) {
  if (!child.pid) return;
  try {
    if (process.platform === "win32")
      spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
    else process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill();
  }
}
