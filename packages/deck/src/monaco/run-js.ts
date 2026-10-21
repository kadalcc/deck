import type { CodeOutput, CodeRunner, CodeRunnerContext } from "./runners.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE JAVASCRIPT / TYPESCRIPT RUNNER
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Each run gets a fresh module Web Worker, made from a blob: no DOM, no access to the deck's own
 * state, and — the reason it is a worker and not an iframe — `terminate()` stops it whatever it
 * is doing, so `while (true) {}` costs a timeout, not the presentation.
 *
 * In the worker, `console.*` is replaced with one that posts each call back, formatted the way a
 * console shows values (strings bare at the top level, objects as `{ a: 1 }`, Maps, Sets,
 * errors, cycles). The code runs as a module, so top-level `await` and `import` from a URL work.
 * Timers are followed: the run counts as finished when the module has evaluated and no timer is
 * left pending; one still ticking at the timeout is stopped and said so. Errors — syntax errors
 * from the type stripper included — come back with their line in the block.
 *
 * TypeScript is made JavaScript by Sucrase (types removed, nothing else: line numbers stay
 * where they were), loaded with this module, in the same lazy chunk.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Runs inside the worker. Self-contained: it is shipped as its own source text. */
function workerMain() {
  const post = (m: unknown) => (self as unknown as Worker).postMessage(m);
  const show = (v: unknown, depth: number, seen: WeakSet<object>): string => {
    if (typeof v === "string") return depth === 0 ? v : JSON.stringify(v);
    if (typeof v === "number") return Object.is(v, -0) ? "-0" : String(v);
    if (typeof v === "bigint") return `${v}n`;
    if (typeof v === "symbol") return v.toString();
    if (typeof v === "undefined") return "undefined";
    if (typeof v === "boolean") return String(v);
    if (typeof v === "function") {
      const src = Function.prototype.toString.call(v);
      return /^class\b/.test(src)
        ? `[class ${v.name || "(anonymous)"}]`
        : `[Function ${v.name || "(anonymous)"}]`;
    }
    if (v === null) return "null";
    const o = v as object;
    if (seen.has(o)) return "[Circular]";
    if (o instanceof Error) return `${o.name}: ${o.message}`;
    if (o instanceof Date) return Number.isNaN(o.getTime()) ? "Invalid Date" : o.toISOString();
    if (o instanceof RegExp) return o.toString();
    if (o instanceof Promise) return "Promise { … }";
    if (depth > 3) return Array.isArray(o) ? "[Array]" : "[Object]";
    seen.add(o);
    const inner = (x: unknown) => show(x, depth + 1, seen);
    const wrap = (open: string, parts: string[], close: string, prefix = "") => {
      const one = `${prefix}${open}${parts.length ? ` ${parts.join(", ")} ` : ""}${close}`;
      if (one.length <= 72 && !one.includes("\n")) return one;
      const pad = "  ".repeat(depth + 1);
      return `${prefix}${open}\n${parts.map((p) => pad + p).join(",\n")}\n${"  ".repeat(depth)}${close}`;
    };
    let out: string;
    if (Array.isArray(o)) {
      const parts = o.slice(0, 100).map(inner);
      if (o.length > 100) parts.push(`… ${o.length - 100} more`);
      out = parts.length ? wrap("[", parts, "]").replace(/^\[ /, "[").replace(/ \]$/, "]") : "[]";
    } else if (o instanceof Map) {
      out = wrap(
        "{",
        [...o].slice(0, 100).map(([k, x]) => `${inner(k)} => ${inner(x)}`),
        "}",
        `Map(${o.size}) `,
      );
    } else if (o instanceof Set) {
      out = wrap("{", [...o].slice(0, 100).map(inner), "}", `Set(${o.size}) `);
    } else if (ArrayBuffer.isView(o)) {
      const arr = Array.from(o as unknown as ArrayLike<number>).slice(0, 100);
      out = `${o.constructor.name}(${(o as unknown as ArrayLike<number>).length}) [${arr.join(", ")}]`;
    } else {
      const name = (o as { constructor?: { name?: string } }).constructor?.name;
      const keys = Object.keys(o);
      const parts = keys.map((k) => {
        const key = /^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k);
        return `${key}: ${inner((o as Record<string, unknown>)[k])}`;
      });
      out = keys.length
        ? wrap("{", parts, "}", name && name !== "Object" ? `${name} ` : "")
        : name && name !== "Object"
          ? `${name} {}`
          : "{}";
    }
    seen.delete(o);
    return out;
  };
  const line = (err: unknown): number | null => {
    const stack = err instanceof Error ? (err.stack ?? "") : "";
    const m = /blob:[^\s)]*:(\d+):\d+/.exec(stack);
    return m ? Number(m[1]) : null;
  };
  const report = (err: unknown) => {
    const where = line(err);
    const text =
      err instanceof Error
        ? `${err.name}: ${err.message}`
        : `Uncaught ${show(err, 1, new WeakSet())}`;
    post({ type: "out", level: "error", text: where ? `${text}  (line ${where})` : text });
  };
  for (const level of ["log", "info", "warn", "error", "debug"] as const) {
    (console as unknown as Record<string, unknown>)[level] = (...args: unknown[]) =>
      post({ type: "out", level, text: args.map((a) => show(a, 0, new WeakSet())).join(" ") });
  }
  console.dir = (v: unknown) => console.log(v);
  console.table = (v: unknown) => console.log(v);
  console.assert = (ok: unknown, ...args: unknown[]) => {
    if (!ok) console.error("Assertion failed", ...args);
  };
  const counts = new Map<string, number>();
  console.count = (label = "default") => {
    const n = (counts.get(label) ?? 0) + 1;
    counts.set(label, n);
    console.log(`${label}: ${n}`);
  };
  const times = new Map<string, number>();
  console.time = (label = "default") => void times.set(label, performance.now());
  console.timeEnd = (label = "default") => {
    const t = times.get(label);
    if (t !== undefined) console.log(`${label}: ${(performance.now() - t).toFixed(3)} ms`);
    times.delete(label);
  };

  // Timers, followed: the run is over when the module has evaluated and none is pending.
  const pending = new Set<unknown>();
  const g = self as unknown as Record<string, unknown>;
  const setT = setTimeout;
  const clearT = clearTimeout;
  const setI = setInterval;
  const clearI = clearInterval;
  let evaluated = false;
  let doneSent = false;
  const settle = () => {
    if (!evaluated || doneSent || pending.size) return;
    setT(() => {
      if (!pending.size && !doneSent) {
        doneSent = true;
        post({ type: "done" });
      }
    }, 0);
  };
  g.setTimeout = (fn: unknown, ms?: number, ...args: unknown[]) => {
    const id = setT(() => {
      pending.delete(id);
      try {
        if (typeof fn === "function") fn(...args);
      } catch (e) {
        report(e);
      }
      settle();
    }, ms);
    pending.add(id);
    return id;
  };
  g.clearTimeout = (id: unknown) => {
    pending.delete(id);
    clearT(id as number);
    settle();
  };
  g.setInterval = (fn: unknown, ms?: number, ...args: unknown[]) => {
    const id = setI(() => {
      try {
        if (typeof fn === "function") fn(...args);
      } catch (e) {
        report(e);
      }
    }, ms);
    pending.add(id);
    return id;
  };
  g.clearInterval = (id: unknown) => {
    pending.delete(id);
    clearI(id as number);
    settle();
  };
  self.addEventListener("unhandledrejection", (e) => {
    e.preventDefault();
    report((e as PromiseRejectionEvent).reason);
  });
  self.addEventListener("error", (e) => {
    e.preventDefault();
    report((e as ErrorEvent).error ?? (e as ErrorEvent).message);
  });
  // Not a literal `import()`: this function is shipped as its own source text, and a bundler
  // rewrites literal dynamic imports into calls to a helper that does not exist in the worker.
  const load = new Function("u", "return import(u)") as (u: string) => Promise<unknown>;
  self.onmessage = async (e: MessageEvent<{ code: string }>) => {
    const url = URL.createObjectURL(new Blob([e.data.code], { type: "text/javascript" }));
    try {
      await load(url);
    } catch (err) {
      report(err);
    } finally {
      URL.revokeObjectURL(url);
    }
    evaluated = true;
    post({ type: "evaluated", pending: pending.size });
    settle();
  };
}

let workerUrl: string | null = null;
const workerSource = () => {
  workerUrl ??= URL.createObjectURL(
    new Blob([`(${workerMain.toString()})();`], { type: "text/javascript" }),
  );
  return workerUrl;
};

/** Bare imports cannot resolve in a worker: say so before the browser's less helpful error. */
function bareImport(code: string): string | null {
  for (const m of code.matchAll(/(?:^|[;\n])\s*import\s+(?:[^'"]*?\s+from\s+)?["']([^"']+)["']/g)) {
    const spec = m[1]!;
    if (!/^(https?:|data:|blob:|\.{0,2}\/)/.test(spec)) return spec;
  }
  for (const m of code.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) {
    const spec = m[1]!;
    if (!/^(https?:|data:|blob:|\.{0,2}\/)/.test(spec)) return spec;
  }
  return null;
}

async function toJavaScript(code: string, typescript: boolean): Promise<string | CodeOutput> {
  if (!typescript) return code;
  try {
    const { transform } = await import("sucrase");
    return transform(code, { transforms: ["typescript"], disableESTransforms: true }).code;
  } catch (err) {
    const e = err as Error & { loc?: { line: number; column: number } };
    const where = e.loc ? `  (line ${e.loc.line})` : "";
    return { error: `SyntaxError: ${e.message.replace(/\s*\(\d+:\d+\)$/, "")}${where}` };
  }
}

function run(code: string, ctx: CodeRunnerContext, typescript: boolean): Promise<void> {
  return (async () => {
    const js = await toJavaScript(code, typescript);
    if (typeof js !== "string") {
      ctx.write(js);
      return;
    }
    const bare = bareImport(js);
    if (bare) {
      ctx.write({
        error: `Cannot import "${bare}" here: the runner has no node_modules. Import it from a URL instead, e.g. import … from "https://esm.sh/${bare}".`,
      });
      return;
    }
    if (ctx.signal.aborted) return;
    const worker = new Worker(workerSource(), { type: "module", name: "kadal-deck-runner" });
    await new Promise<void>((resolve) => {
      let evaluated = false;
      const finish = () => {
        clearTimeout(timer);
        ctx.signal.removeEventListener("abort", abort);
        worker.terminate();
        resolve();
      };
      const abort = () => finish();
      const timer = setTimeout(() => {
        const s = Math.round(ctx.timeout / 100) / 10;
        ctx.write(
          evaluated
            ? { text: `(stopped after ${s} s: a timer was still running)`, level: "info" }
            : { error: `Timed out after ${s} s — the code was still running, so it was stopped.` },
        );
        finish();
      }, ctx.timeout);
      ctx.signal.addEventListener("abort", abort);
      worker.onmessage = (e: MessageEvent<{ type: string; level?: string; text?: string }>) => {
        const m = e.data;
        if (m.type === "out") ctx.write({ text: m.text ?? "", level: (m.level as "log") ?? "log" });
        else if (m.type === "evaluated") evaluated = true;
        else if (m.type === "done") finish();
      };
      worker.onerror = (e) => {
        e.preventDefault();
        ctx.write({ error: e.message || "The runner's worker failed." });
        finish();
      };
      worker.postMessage({ code: js });
    });
  })();
}

export const javascriptRunner: CodeRunner = (code, ctx) => run(code, ctx, false);
export const typescriptRunner: CodeRunner = (code, ctx) => run(code, ctx, true);
