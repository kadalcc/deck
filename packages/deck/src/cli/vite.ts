import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

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
    throw new Error(`Vite isn't installed in ${cwd}. Run \`npm install\` in the deck folder first.`);
  }
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { bin?: string | Record<string, string> };
  const rel = typeof pkg.bin === "string" ? pkg.bin : (pkg.bin?.vite ?? "bin/vite.js");
  const bin = join(dirname(pkgPath), rel);
  if (!existsSync(bin)) throw new Error(`Couldn't find Vite's CLI at ${bin}.`);
  return bin;
}

export function spawnVite(
  cwd: string,
  args: string[],
  stdio: "inherit" | "ignore" | "pipe" = "inherit",
): ChildProcess {
  return spawn(process.execPath, [viteBin(cwd), ...args], { cwd, stdio, env: process.env });
}

export function runVite(cwd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawnVite(cwd, args);
    child.on("error", reject);
    child.on("exit", (code, signal) =>
      code === 0
        ? resolve()
        : reject(new Error(`vite ${args[0] ?? ""} failed (${signal ?? `exit ${code}`})`)),
    );
  });
}
