import { type ChildProcess, type StdioOptions, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

/** A prerequisite is missing (Vite, Playwright, Chromium): exit code 4, with what to run. */
export class MissingDependencyError extends Error {}

/**
 * The deck's own Vite, run with whatever runtime is running us (Node or Bun). Resolved from the
 * deck folder, so a deck uses the Vite version it installed rather than one we brought along.
 */
export function viteBin(cwd: string): string {
  const req = createRequire(join(cwd, "package.json"));
  let pkgPath: string;
  try {
    pkgPath = req.resolve("vite/package.json");
  } catch {
    throw new MissingDependencyError(
      `Vite isn't installed in ${cwd}. Run \`npm install\` in the deck folder first.`,
    );
  }
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
    bin?: string | Record<string, string>;
  };
  const rel = typeof pkg.bin === "string" ? pkg.bin : (pkg.bin?.vite ?? "bin/vite.js");
  const bin = join(dirname(pkgPath), rel);
  if (!existsSync(bin)) throw new MissingDependencyError(`Couldn't find Vite's CLI at ${bin}.`);
  return bin;
}

/**
 * Where children's output goes when it is not captured: normally the terminal. When our own
 * stdout is a protocol — `--json`, the MCP server's JSON-RPC — it has to stay clean, so Vite's
 * chatter goes to stderr instead.
 */
let inherit: StdioOptions = "inherit";
export function keepStdoutClean(): void {
  inherit = ["ignore", process.stderr, process.stderr];
}

export function spawnVite(
  cwd: string,
  args: string[],
  stdio: "inherit" | "ignore" | "pipe" = "inherit",
): ChildProcess {
  return spawn(process.execPath, [viteBin(cwd), ...args], {
    cwd,
    stdio: stdio === "inherit" ? inherit : stdio,
    env: process.env,
  });
}

export function runVite(cwd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawnVite(cwd, args);
    // Stopping this process stops Vite too (and with it a `dev --tunnel`'s cloudflared): a
    // terminal's Ctrl+C reaches both anyway, a `kill` from elsewhere reaches only this one.
    let stopped = false;
    const forward = (signal: NodeJS.Signals) => () => {
      stopped = true;
      if (child.exitCode === null) child.kill(signal);
    };
    const handlers = (["SIGTERM", "SIGHUP"] as const).map((sig) => {
      const fn = forward(sig);
      process.on(sig, fn);
      return () => process.off(sig, fn);
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      for (const off of handlers) off();
      if (code === 0 || (stopped && args[0] !== "build")) resolve();
      else reject(new Error(`vite ${args[0] ?? ""} failed (${signal ?? `exit ${code}`})`));
    });
  });
}
