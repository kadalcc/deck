/* oxlint-disable no-underscore-dangle -- the host's page global is named __KADAL_DECK__ */
import { afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";

import { resolveBackground } from "../core/model.ts";
import { LAYOUTS, layoutFor } from "./layouts.tsx";
import {
  type LoaderDeps,
  PremiumBackground,
  PremiumLoader,
  installRuntime,
  premiumLoaderFor,
  usePremiumItem,
} from "./premium.tsx";

/** A fake host: a catalog, modules by URL, and a log of what was asked for. */
function fakeHost(opts: { status?: number; modules?: Record<string, unknown> } = {}) {
  const calls: string[] = [];
  const styles: string[] = [];
  const deps: LoaderDeps = {
    fetch: async (url) => {
      calls.push(`fetch ${url}`);
      const status = opts.status ?? 200;
      return {
        ok: status === 200,
        status,
        json: async () => [
          { id: "pro/wave", kind: "background", module: "items/wave.js" },
          { id: "pro/split", kind: "layout", module: "items/split.js" },
          { id: "pro/broken", kind: "background", module: "items/broken.js" },
          { id: "pro/escape", kind: "background", module: "../../x.js" },
        ],
      };
    },
    importModule: async (url) => {
      calls.push(`import ${url}`);
      const m = opts.modules?.[url];
      if (m === undefined) throw new Error("404");
      return m;
    },
    install: async () => {
      calls.push("install");
    },
    addStyle: (id, css) => styles.push(`${id} ${css}`),
  };
  return { deps, calls, styles };
}

const BASE = "https://decks.example/@a/talk/__kadal/premium/";
const Wave = ({ active }: { active?: boolean }) =>
  createElement("i", { className: "wave", "data-live": String(!!active) });
const WavePoster = () => createElement("i", { className: "wave-poster" });
const Split = ({ children }: { children?: React.ReactNode }) =>
  createElement("div", { className: "split" }, children);
const MODULES = {
  [`${BASE}items/wave.js`]: {
    default: {
      backgrounds: { "pro/wave": Wave },
      poster: { "pro/wave": WavePoster },
      css: ".wave{}",
    },
  },
  [`${BASE}items/split.js`]: { default: { layouts: { "pro/split": Split } } },
  [`${BASE}items/broken.js`]: { default: { backgrounds: {} } },
};

describe("PremiumLoader", () => {
  test("fetches the catalog once, imports each module once, adds css once", async () => {
    const host = fakeHost({ modules: MODULES });
    const l = new PremiumLoader(BASE, host.deps);
    expect(l.state("pro/wave", "background")).toEqual({ status: "loading" });
    const [a, b] = await Promise.all([
      l.load("pro/wave", "background"),
      l.load("pro/wave", "background"),
    ]);
    expect(a.status).toBe("ready");
    expect(b).toBe(a);
    await l.load("pro/split", "layout");
    expect(host.calls).toEqual([
      `fetch ${BASE}catalog.json`,
      "install",
      `import ${BASE}items/wave.js`,
      "install",
      `import ${BASE}items/split.js`,
    ]);
    expect(host.styles).toEqual(["pro/wave .wave{}"]);
    // The state object is stable until it changes.
    expect(l.state("pro/wave", "background")).toBe(l.state("pro/wave", "background"));
  });

  test("every failure is a reason, never a throw", async () => {
    const l = new PremiumLoader(BASE, fakeHost({ modules: MODULES }).deps);
    expect(await l.load("pro/nope", "background")).toEqual({ status: "failed", reason: "missing" });
    expect(await l.load("pro/wave", "layout")).toEqual({ status: "failed", reason: "missing" });
    expect(await l.load("pro/broken", "background")).toEqual({
      status: "failed",
      reason: "bad-module",
    });
    expect(await l.load("pro/escape", "background")).toEqual({
      status: "failed",
      reason: "bad-module",
    });
    const gone = new PremiumLoader(BASE, fakeHost({ modules: {} }).deps);
    expect(await gone.load("pro/wave", "background")).toEqual({
      status: "failed",
      reason: "network",
    });
  });

  test("a 402 from the host is 'not entitled', and nothing is imported", async () => {
    const host = fakeHost({ status: 402, modules: MODULES });
    const l = new PremiumLoader(BASE, host.deps);
    expect(await l.load("pro/wave", "background")).toEqual({
      status: "failed",
      reason: "not-entitled",
    });
    expect(host.calls).toEqual([`fetch ${BASE}catalog.json`]);
  });
});

describe("rendering", () => {
  const g = globalThis as { __KADAL_DECK__?: unknown };
  afterEach(() => {
    g.__KADAL_DECK__ = undefined;
  });

  test("without a host base: the theme's own background and the default layout, nothing fetched", () => {
    g.__KADAL_DECK__ = undefined;
    const bg = resolveBackground({ background: "pro/wave" })!;
    const html = renderToString(
      createElement(PremiumBackground, {
        name: bg.component!,
        props: {},
        active: true,
        still: false,
      }),
    );
    expect(html).toBe("");
    const L = layoutFor("pro/split", {});
    expect(renderToString(createElement(L, { frontmatter: {}, options: {} as never }, "x"))).toBe(
      renderToString(
        createElement(LAYOUTS.default!, { frontmatter: {}, options: {} as never }, "x"),
      ),
    );
  });

  test("with a granted base: the item once loaded, the poster for a still copy", async () => {
    const base = "https://decks.example/@a/two/__kadal/premium/";
    const mods = Object.fromEntries(
      Object.entries(MODULES).map(([k, v]) => [k.replace(BASE, base), v]),
    );
    const l = premiumLoaderFor(base, fakeHost({ modules: mods }).deps);
    g.__KADAL_DECK__ = { premium: base };
    await l.load("pro/wave", "background");
    await l.load("pro/split", "layout");
    const bg = resolveBackground({ background: { component: "pro/wave" } })!;
    const render = (active: boolean, still: boolean) =>
      renderToString(
        createElement(PremiumBackground, { name: bg.component!, props: bg.props, active, still }),
      );
    expect(render(true, false)).toContain('class="wave" data-live="true"');
    expect(render(true, false)).toContain("deck-premium-item");
    // A slide leaving keeps the live item (paused), so the cross-fade doesn't swap pictures.
    expect(render(false, false)).toContain('class="wave" data-live="false"');
    expect(render(false, true)).toContain("wave-poster");
    const L = layoutFor("pro/split", {});
    expect(
      renderToString(createElement(L, { frontmatter: {}, options: {} as never }, "x")),
    ).toContain('<div class="split">x</div>');
  });

  test("usePremiumItem ignores names that are not pro/", () => {
    let seen: unknown = "unset";
    const Probe = () => {
      seen = usePremiumItem("aurora", "background");
      return null;
    };
    renderToString(createElement(Probe));
    expect(seen).toBeNull();
  });
});

describe("the runtime global", () => {
  test("is published once, frozen, with React, jsx, components and the version", async () => {
    const scope: Record<string, unknown> = {};
    const rt = await installRuntime(scope);
    expect(rt.contract).toBe(1);
    expect(typeof rt.React.useState).toBe("function");
    expect(typeof rt.jsx.jsx).toBe("function");
    expect(typeof rt.components.Click).toBe("function");
    expect(rt.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(Object.isFrozen(rt)).toBe(true);
    expect(await installRuntime(scope)).toBe(rt);
    expect(() => {
      scope.__KADAL_DECK_RUNTIME__ = {};
    }).toThrow();
  });
});
