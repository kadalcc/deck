import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { pwaClientScript } from "../pwa/client.ts";
import { type ServiceWorkerConfig, serviceWorkerSource } from "../pwa/sw.ts";
import {
  bypassPaths,
  monogramLetter,
  monogramSvg,
  pngSize,
  precacheList,
  pwaHead,
  pwaOptions,
  themeColorsFromCss,
  webManifest,
  writeServiceWorker,
} from "./pwa.ts";

describe("the app's look", () => {
  test("pwa: true, an object, or off", () => {
    expect(pwaOptions(true)).toEqual({});
    expect(pwaOptions({ name: "Maps", display: "fullscreen", bogus: 1 })).toEqual({
      name: "Maps",
      display: "fullscreen",
    });
    expect(pwaOptions({ display: "kiosk" })).toEqual({});
    expect(pwaOptions(false)).toBeNull();
    expect(pwaOptions("dev")).toBeNull();
  });

  test("the theme's colours come from its own stylesheet, var() fallbacks included", () => {
    const css = `.theme-sea { --deck-bg: #fbfbf9; --deck-fg: #111; --deck-accent: var(--theme-primary, #059669); }
.theme-sea[data-color-scheme="dark"] { --deck-bg: #0f1412; --deck-accent: #34d399; }`;
    const c = themeColorsFromCss(css, "sea");
    expect(c.light).toEqual({ bg: "#fbfbf9", fg: "#111", accent: "#059669" });
    expect(c.dark).toEqual({ bg: "#0f1412", fg: "#111", accent: "#34d399" });
    // A dark-first theme whose light rule is the variant.
    const rla = themeColorsFromCss(
      `.theme-rla { --deck-bg: #09090b; } .theme-rla[data-color-scheme="light"] { --deck-bg: #f4f4f5; }`,
      "rla",
    );
    expect(rla.light.bg).toBe("#f4f4f5");
    expect(rla.dark.bg).toBe("#09090b");
  });

  test("the monogram: a whole first letter, escaped, readable on its ground", () => {
    expect(monogramLetter("  élan vital")).toBe("É");
    expect(monogramLetter("👋 hello")).toBe("👋");
    expect(monogramLetter("")).toBe("K");
    const svg = monogramSvg("<b>", { bg: "#ffffff", fg: "#111111", accent: "#fafafa" });
    expect(svg).toContain("&lt;");
    // The accent is too close to the background: the foreground is the ground instead.
    expect(svg).toContain(`fill="#111111"`);
    expect(monogramSvg("A", { bg: "#fff", fg: "#000", accent: "#2563eb" }, true)).toContain(
      `<rect width="512" height="512"`,
    );
  });

  test("a PNG's size from its header", () => {
    const png = new Uint8Array(24);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    new DataView(png.buffer).setUint32(16, 192);
    new DataView(png.buffer).setUint32(20, 192);
    expect(pngSize(png)).toEqual({ width: 192, height: 192 });
    expect(pngSize(new Uint8Array(4))).toBeNull();
  });

  test("the manifest is scoped to the base", () => {
    const m = webManifest({
      title: "A very long deck title",
      description: "d",
      lang: "en",
      base: "/talks/x/",
      colors: { bg: "#fff", fg: "#000", accent: "#00f" },
      icons: [],
      options: {},
    });
    expect(m).toMatchObject({
      id: "/talks/x/",
      start_url: "/talks/x/",
      scope: "/talks/x/",
      display: "standalone",
    });
    expect(m.short_name).toBe("A very long…");
    const plain = webManifest({
      title: "T",
      description: "",
      lang: "",
      base: "/",
      colors: { bg: "#fff", fg: "#000", accent: "#00f" },
      icons: [],
      options: { display: "fullscreen" },
    });
    expect(plain.display_override).toBeUndefined();
  });
});

describe("what the worker keeps", () => {
  let out = "";
  beforeAll(async () => {
    out = await mkdtemp(join(tmpdir(), "kd-pwa-"));
    await writeFile(join(out, "index.html"), "<html><head></head><body></body></html>");
    await mkdir(join(out, "assets"));
    await writeFile(join(out, "assets", "index-abc.js"), "1");
    await writeFile(join(out, "assets", "index-abc.js.map"), "{}");
    await writeFile(join(out, "assets", "a b.png"), "png");
    await mkdir(join(out, "presenter"));
    await writeFile(join(out, "presenter", "index.html"), "copy");
    for (const f of ["404.html", "_redirects", "og-image.png", "deck.pdf"])
      await writeFile(join(out, f), "x");
  });
  afterAll(() => rm(out, { recursive: true, force: true }));

  test("every file but maps, fallbacks, route copies and the after-build extras; index.html is the base", () => {
    const list = precacheList(out, "/t/");
    expect(list.map(([u]) => u).sort()).toEqual([
      "/t/",
      "/t/assets/a%20b.png",
      "/t/assets/index-abc.js",
    ]);
    for (const [, rev] of list) expect(rev).toMatch(/^[0-9a-f]{16}$/);
  });

  test("the same build gives the same worker: no update offered for nothing", async () => {
    const a = writeServiceWorker(out, "/t/", { bypass: bypassPaths("/t/", "/api") });
    const first = await readFile(join(out, "sw.js"), "utf8");
    const b = writeServiceWorker(out, "/t/", { bypass: bypassPaths("/t/", "/api") });
    expect(b.version).toBe(a.version);
    expect(await readFile(join(out, "sw.js"), "utf8")).toBe(first);
    await writeFile(join(out, "assets", "index-abc.js"), "2");
    expect(writeServiceWorker(out, "/t/", { bypass: [] }).version).not.toBe(a.version);
  });

  test("the live room, the host's API and the dev endpoints are never the worker's", () => {
    expect(bypassPaths("/t/", "/rooms-api")).toEqual([
      "/api/",
      "/__kadal/",
      "/t/api/",
      "/t/__kadal/",
      "/rooms-api/",
    ]);
    expect(bypassPaths("/", "https://deck.kadal.cc/api")).toEqual(["/api/", "/__kadal/"]);
  });

  test("the page gets the manifest, theme-color, the touch icon, the toast and the script", () => {
    const html = pwaHead("<html><head>\n  </head></html>", {
      base: "/t/",
      colors: {
        light: { bg: "#fff", fg: "#000", accent: "#00f" },
        dark: { bg: "#000", fg: "#fff", accent: "#0ff" },
      },
      touchIcon: "/t/apple-touch-icon.png",
    });
    expect(html).toContain(`<link rel="manifest" href="/t/manifest.webmanifest" />`);
    expect(html).toContain(`media="(prefers-color-scheme: dark)"`);
    expect(html).toContain(`<link rel="apple-touch-icon" href="/t/apple-touch-icon.png" />`);
    expect(html).toContain(".kadal-sw-toast");
    expect(html).toContain(`{"scope":"/t/","sw":"/t/sw.js","network":["/t/remote"]}`);
  });

  test("the page script is plain JavaScript that compiles on its own", () => {
    const js = pwaClientScript({ scope: "/", sw: "/sw.js", network: ["/remote"] }).replace(
      /^<script>|<\/script>$/g,
      "",
    );
    expect(() => new Function(js)).not.toThrow();
  });
});

// ── the worker itself, run against fake caches and a fake network ─────────────────────────────

const ORIGIN = "https://d.dev";

class FakeCache {
  readonly entries = new Map<string, Response>();
  async put(req: string | Request, res: Response) {
    this.entries.set(key(req), res.clone());
  }
  async match(req: string | Request) {
    return this.entries.get(key(req))?.clone();
  }
}
const key = (req: string | Request) =>
  new URL(typeof req === "string" ? req : req.url, ORIGIN).href;

function worker(
  config: ServiceWorkerConfig,
  net: (url: string, init?: RequestInit) => Response | Promise<Response>,
  store = new Map<string, FakeCache>(),
) {
  const on: Record<string, (e: unknown) => void> = {};
  const state = {
    skipped: 0,
    claimed: 0,
    unregistered: false,
    fetched: [] as string[],
    active: null as object | null,
  };
  const caches = {
    open: async (name: string) => {
      if (!store.has(name)) store.set(name, new FakeCache());
      return store.get(name)!;
    },
    keys: async () => [...store.keys()],
    delete: async (name: string) => store.delete(name),
  };
  const self = {
    addEventListener: (t: string, f: (e: unknown) => void) => (on[t] = f),
    location: { origin: ORIGIN },
    registration: {
      get active() {
        return state.active;
      },
      unregister: async () => (state.unregistered = true),
    },
    clients: { matchAll: async () => [], claim: async () => void state.claimed++ },
    skipWaiting: async () => void state.skipped++,
  };
  const fetch = async (input: string | Request, init?: RequestInit) => {
    const url = key(input);
    state.fetched.push(url);
    return net(url, init);
  };
  class Req extends Request {
    constructor(input: string, init?: RequestInit) {
      super(new URL(input, ORIGIN).href, init);
    }
  }
  new Function("self", "caches", "fetch", "Request", serviceWorkerSource(config))(
    self,
    caches,
    fetch,
    Req,
  );
  const lifecycle = async (type: string) => {
    let p: Promise<unknown> = Promise.resolve();
    on[type]!({ waitUntil: (x: Promise<unknown>) => (p = x) });
    await p;
  };
  const request = async (url: string, init: RequestInit & { mode?: string } = {}) => {
    let answer: Promise<Response> | null = null;
    const req = new Request(new URL(url, ORIGIN).href, init);
    Object.defineProperty(req, "mode", { value: init.mode ?? "cors" });
    on.fetch!({ request: req, respondWith: (r: Promise<Response>) => (answer = r) });
    return answer ? await answer : null;
  };
  return { lifecycle, request, state, store };
}

const CONFIG: ServiceWorkerConfig = {
  scope: "/t/",
  version: "v1",
  precache: [
    ["/t/", "r-index"],
    ["/t/assets/a.js", "r-a"],
    ["/t/clip.mp4", "r-clip"],
  ],
  bypass: bypassPaths("/t/", "/api"),
  network: ["/t/remote"],
};

const online = (url: string) => {
  if (url.endsWith("/missing.js")) return new Response("no", { status: 404 });
  if (url.endsWith(".mp4"))
    return new Response("0123456789", { headers: { "content-type": "video/mp4" } });
  return new Response(`body of ${new URL(url).pathname}`, {
    headers: { "content-type": url.endsWith("/") ? "text/html" : "text/javascript" },
  });
};
const offline = () => {
  throw new TypeError("Failed to fetch");
};

describe("the service worker", () => {
  test("installs the build, takes over on the first visit, and keeps one version back", async () => {
    let net: typeof online = online;
    const w = worker(CONFIG, (u, i) => net(u, i));
    await w.lifecycle("install");
    expect(w.state.skipped).toBe(1);
    expect(w.state.fetched.sort()).toEqual([
      `${ORIGIN}/t/`,
      `${ORIGIN}/t/assets/a.js`,
      `${ORIGIN}/t/clip.mp4`,
    ]);
    await w.lifecycle("activate");
    expect(w.state.claimed).toBe(1);

    // Offline: the deck's routes are its page, files come from the cache, a video seeks.
    net = offline;
    const page = await w.request("/t/presenter", { mode: "navigate" });
    expect(await page!.text()).toBe("body of /t/");
    expect(await (await w.request("/t/assets/a.js"))!.text()).toBe("body of /t/assets/a.js");
    const part = await w.request("/t/clip.mp4", { headers: { range: "bytes=2-5" } });
    expect(part!.status).toBe(206);
    expect(part!.headers.get("content-range")).toBe("bytes 2-5/10");
    expect(await part!.text()).toBe("2345");

    // Never the worker's: the API, the live room, other origins, writes, the dev endpoints.
    expect(await w.request("/api/rooms/x")).toBeNull();
    expect(await w.request("/t/api/x")).toBeNull();
    expect(await w.request("/t/__kadal/notes")).toBeNull();
    expect(await w.request("https://other.dev/t/a.js")).toBeNull();
    expect(await w.request("/t/assets/a.js", { method: "POST", body: "x" })).toBeNull();
    expect(await w.request("/elsewhere/a.js")).toBeNull();
    // The phone remote is never served from the cache.
    await expect(w.request("/t/remote", { mode: "navigate" })).rejects.toThrow("Failed to fetch");

    // An update: unchanged files are copied, changed ones fetched, and nothing happens until asked.
    net = online;
    const fetchedBefore = w.state.fetched.length;
    const v2 = worker(
      {
        ...CONFIG,
        version: "v2",
        precache: [
          ["/t/", "r-index-2"],
          ["/t/assets/a.js", "r-a"],
          ["/t/clip.mp4", "r-clip"],
        ],
      },
      online,
      w.store,
    );
    v2.state.active = {};
    await v2.lifecycle("install");
    expect(v2.state.skipped).toBe(0);
    expect(v2.state.fetched).toEqual([`${ORIGIN}/t/`]);
    expect(w.state.fetched.length).toBe(fetchedBefore);
    await v2.lifecycle("activate");
    const v3 = worker({ ...CONFIG, version: "v3" }, online, w.store);
    v3.state.active = {};
    await v3.lifecycle("install");
    await v3.lifecycle("activate");
    const names = [...w.store.keys()].filter((k) => k.startsWith("kadal-deck|"));
    expect(names.sort()).toEqual(["kadal-deck|/t/|v2", "kadal-deck|/t/|v3"]);
  });

  test("a file the server lost costs that file only; a deck taken down removes its worker", async () => {
    const w = worker(
      { ...CONFIG, precache: [...CONFIG.precache, ["/t/missing.js", "r-m"]] },
      online,
    );
    await w.lifecycle("install");
    await w.lifecycle("activate");
    const gone = worker(CONFIG, () => new Response("unpublished", { status: 404 }), w.store);
    const res = await gone.request("/t/", { mode: "navigate" });
    expect(res!.status).toBe(404);
    expect(gone.state.unregistered).toBe(true);
    expect([...w.store.keys()].filter((k) => k.startsWith("kadal-deck|"))).toEqual([]);
  });
});
