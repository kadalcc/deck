import { afterAll, describe, expect, test } from "bun:test";
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * A signal sent to the CLI alone (an editor's or a task runner's stop, a parent's `kill`) ended
 * it at once and left its Vite running, holding the port: `dev` handed on SIGTERM and SIGHUP but
 * not SIGINT, and the preview server of `export`, `contrast` and `screenshot` was reaped only on a
 * normal exit, which a signal skips. These run a fake Vite under a small driver, signal the
 * driver only, and look for the fake Vite afterwards.
 */

const here = import.meta.dir;
const vite = pathToFileURL(resolve(here, "vite.ts")).href;
const render = pathToFileURL(resolve(here, "render.ts")).href;
const root = mkdtempSync(join(tmpdir(), "kadal-deck-signals-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

/**
 * Runtimes to drive with: this one, and Node when it runs TypeScript itself (as users run it;
 * render.ts's constructor parameter properties are past Node's type stripping, so only vite.ts).
 */
const runtimes = [process.execPath];
const nodeTs = spawnSync("node", ["-p", "process.features.typescript ?? ''"], { encoding: "utf8" });
if (nodeTs.status === 0 && /strip|transform/.test(nodeTs.stdout)) runtimes.push("node");

let n = 0;
/** A deck folder whose `vite` is a script that says it is up, writes its pid and waits. */
function fakeDeck(): { dir: string; pidFile: string } {
  const dir = join(root, `deck-${++n}`);
  const bin = join(dir, "node_modules", "vite", "bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(dir, "package.json"), '{"name":"deck","private":true}');
  writeFileSync(
    join(dir, "node_modules", "vite", "package.json"),
    '{"name":"vite","version":"0.0.0","bin":{"vite":"bin/vite.js"}}',
  );
  const pidFile = join(dir, "vite.pid");
  writeFileSync(
    join(bin, "vite.js"),
    `require("node:fs").writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
console.log("  Local:   http://127.0.0.1:1/");
setInterval(() => {}, 1000);
`,
  );
  return { dir, pidFile };
}

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

async function until(check: () => boolean, ms: number): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (check()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return check();
}

const exited = (p: ChildProcess) =>
  new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((done) => {
    if (p.exitCode !== null || p.signalCode !== null)
      done({ code: p.exitCode, signal: p.signalCode });
    else p.once("exit", (code, signal) => done({ code, signal }));
  });

/** Start `script` (an ES module) with `runtime`, wait for the fake Vite, signal the script. */
async function signalled(runtime: string, script: string, signal: NodeJS.Signals) {
  const { dir, pidFile } = fakeDeck();
  const file = join(dir, "driver.mjs");
  writeFileSync(file, script.replaceAll("$DIR", JSON.stringify(dir)));
  const driver = spawn(runtime, [file], { stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  driver.stdout!.on("data", (d) => (out += d));
  driver.stderr!.on("data", (d) => (out += d));
  let pid = 0;
  try {
    expect(await until(() => existsSync(pidFile) && /up|started/.test(out), 15_000)).toBe(true);
    pid = Number(readFileSync(pidFile, "utf8"));
    driver.kill(signal);
    const end = await exited(driver);
    const gone = await until(() => !alive(pid), 5_000);
    return { gone, end, out };
  } finally {
    if (pid && alive(pid)) process.kill(pid, "SIGKILL");
    if (driver.exitCode === null && driver.signalCode === null) driver.kill("SIGKILL");
  }
}

for (const runtime of runtimes) {
  const name = runtime === "node" ? "node" : "bun";
  describe(`stopping the CLI stops its Vite (${name})`, () => {
    for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const)
      test(`dev, on ${signal}`, async () => {
        const r = await signalled(
          runtime,
          `import { runVite } from ${JSON.stringify(vite)};
console.log("started");
await runVite($DIR, []);
console.log("resolved");
process.exit(0);
`,
          signal,
        );
        expect(r.gone).toBe(true);
        // `dev` stops as asked rather than failing.
        expect(r.out).toContain("resolved");
        expect(r.end.code).toBe(0);
      }, 30_000);

    if (runtime === process.execPath)
      for (const signal of ["SIGINT", "SIGTERM"] as const)
        test(`a preview server (export, contrast, screenshot), on ${signal}`, async () => {
          const r = await signalled(
            runtime,
            `import { DeckServer } from ${JSON.stringify(render)};
await DeckServer.start($DIR, "dev", { port: 1 });
console.log("up");
setInterval(() => {}, 1000);
`,
            signal,
          );
          expect(r.gone).toBe(true);
          // Nothing else listened, so the process still ends the way the signal says.
          expect(r.end.signal).toBe(signal);
        }, 30_000);
  });
}
