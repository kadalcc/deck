import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { entrySlug, planBuild, writeIndexPages } from "./build.ts";
import { HOSTS, hostTargets, hostingContext, hostingFiles, writeHosting } from "./hosting.ts";
import { detectBase, staticHandler } from "./serve.ts";

describe("kadal-deck build's plan", () => {
  test("no deck file: the plugin's entry, into the output itself", () => {
    expect(planBuild([], ["--base", "/x/"])).toEqual({
      entries: [{ entry: "", subdir: null }],
      vite: ["--base", "/x/"],
      outDir: "dist",
    });
  });

  test("one deck file: that file, into the output itself; --out is Vite's --outDir", () => {
    expect(planBuild(["talk.mdx"], [], "public-site")).toEqual({
      entries: [{ entry: "talk.mdx", subdir: null }],
      vite: ["--outDir", "public-site"],
      outDir: "public-site",
    });
  });

  test("several: a folder each, same names numbered, deck files a Vite switch swallowed recovered", () => {
    // `--emptyOutDir b.mdx`: the passthrough parser hands Vite the file as the switch's value.
    const plan = planBuild(["a.mdx", "talks/A.mdx"], ["--emptyOutDir", "b.md", "--base", "/t/"]);
    expect(plan.entries).toEqual([
      { entry: "a.mdx", subdir: "a" },
      { entry: "talks/A.mdx", subdir: "a-2" },
      { entry: "b.md", subdir: "b" },
    ]);
    expect(plan.vite).toEqual(["--emptyOutDir", "--base", "/t/"]);
  });

  test("a folder name from a file name", () => {
    expect(entrySlug("talks/2024 Intro.mdx")).toBe("2024-intro");
    expect(entrySlug("!!!.md")).toBe("deck");
  });

  test("the listing page, 404.html and the gathered _redirects", async () => {
    const out = await mkdtemp(join(tmpdir(), "kd-multi-"));
    await mkdir(join(out, "a"));
    await writeFile(join(out, "a", "_redirects"), "/t/a/*    /t/a/index.html    200\n");
    writeIndexPages(
      out,
      [
        { entry: "a.mdx", subdir: "a" },
        { entry: "b.mdx", subdir: "b" },
      ],
      [
        { entry: "a.mdx", outDir: join(out, "a"), base: "/t/a/", title: "Maps & <you>" },
        { entry: "b.mdx", outDir: join(out, "b"), base: "/t/b/", title: null },
      ],
    );
    const index = await readFile(join(out, "index.html"), "utf8");
    expect(index).toContain(`<a href="./a/">Maps &amp; &lt;you&gt;</a>`);
    expect(index).toContain(`<a href="./b/">b</a>`);
    expect(await readFile(join(out, "404.html"), "utf8")).toContain("Not found");
    expect(await readFile(join(out, "_redirects"), "utf8")).toBe(
      "/t/a/*    /t/a/index.html    200\n",
    );
    await rm(out, { recursive: true, force: true });
  });
});

describe("kadal-deck serve", () => {
  let root = "";
  let server: Server;
  let url = "";
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "kd-serve-"));
    await writeFile(
      join(root, "index.html"),
      `<script type="module" crossorigin src="/talks/x/assets/index-abc.js"></script>`,
    );
    await mkdir(join(root, "assets"));
    await writeFile(join(root, "assets", "index-abc.js"), "console.log(1)");
    await writeFile(join(root, "clip.mp4"), "0123456789");
    await writeFile(join(root, "manifest.webmanifest"), "{}");
    await mkdir(join(root, "presenter"));
    await writeFile(join(root, "presenter", "index.html"), "presenter copy");
    server = createServer(staticHandler({ root, base: detectBase(root) }));
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
    await rm(root, { recursive: true, force: true });
  });

  test("the base is read from the build", () => {
    expect(detectBase(root)).toBe("/talks/x/");
  });

  test("files, routes, the base's redirect, and nothing outside", async () => {
    const js = await fetch(`${url}/talks/x/assets/index-abc.js`);
    expect(js.headers.get("cache-control")).toContain("immutable");
    expect(js.headers.get("content-type")).toContain("javascript");
    expect((await fetch(`${url}/talks/x/manifest.webmanifest`)).headers.get("content-type")).toBe(
      "application/manifest+json",
    );
    expect(await (await fetch(`${url}/talks/x/presenter`)).text()).toBe("presenter copy");
    const notes = await fetch(`${url}/talks/x/notes`);
    expect(notes.headers.get("cache-control")).toBe("no-cache");
    expect(await notes.text()).toContain("index-abc.js");
    expect((await fetch(`${url}/talks/x/missing.png`)).status).toBe(404);
    const root302 = await fetch(`${url}/`, { redirect: "manual" });
    expect(root302.status).toBe(302);
    expect(root302.headers.get("location")).toBe("/talks/x/");
    // (fetch folds a plain or %2e%2e itself; an encoded slash reaches the server as written.)
    expect((await fetch(`${url}/talks/x/..%2f..%2f..%2fetc%2fpasswd`)).status).toBe(403);
    expect((await fetch(`${url}/talks/x/`, { method: "POST" })).status).toBe(405);
  });

  test("a Range request gets its bytes", async () => {
    const res = await fetch(`${url}/talks/x/clip.mp4`, { headers: { range: "bytes=3-6" } });
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 3-6/10");
    expect(await res.text()).toBe("3456");
    expect(
      (await fetch(`${url}/talks/x/clip.mp4`, { headers: { range: "bytes=50-60" } })).status,
    ).toBe(416);
  });
});

describe("kadal-deck ci", () => {
  let repo = "";
  let deck = "";
  beforeAll(async () => {
    repo = await mkdtemp(join(tmpdir(), "kd-ci-"));
    await mkdir(join(repo, ".git"));
    deck = join(repo, "talks", "maps");
    await mkdir(deck, { recursive: true });
    await writeFile(join(repo, "pnpm-lock.yaml"), "");
    await writeFile(join(deck, "deck.mdx"), "---\ntitle: Maps\ndownload: true\n---\n\n# Maps\n");
  });
  afterAll(() => rm(repo, { recursive: true, force: true }));

  test("names and aliases", () => {
    expect(hostTargets("gh,netlify,cf")).toEqual(["github-pages", "netlify", "cloudflare"]);
    expect(() => hostTargets("heroku")).toThrow(/Unknown host/);
  });

  test("the recipes fit the deck: its package manager, its folder, its need for Chromium", () => {
    const c = hostingContext(deck, new Date("2026-10-22T00:00:00Z"));
    expect(c).toMatchObject({
      pm: "pnpm",
      needsBrowser: true,
      slug: "maps",
      repoRoot: repo,
      lockfile: join(repo, "pnpm-lock.yaml"),
    });
    const [wf] = hostingFiles("github-pages", c);
    expect(wf!.path).toBe(join(repo, ".github", "workflows", "deploy-deck.yml"));
    expect(wf!.content).toContain("working-directory: talks/maps");
    expect(wf!.content).toContain("path: talks/maps/dist");
    expect(wf!.content).toContain("pnpm install --frozen-lockfile");
    expect(wf!.content).not.toContain("cache-dependency-path");
    expect(wf!.content).toContain("pnpm exec playwright install --with-deps chromium");
    expect(wf!.content).toContain(`pnpm exec kadal-deck build --base "$base"`);
    expect(hostingFiles("netlify", c)[0]!.content).toContain(
      `command = "pnpm exec playwright install chromium && pnpm exec kadal-deck build"`,
    );
    const vercel = JSON.parse(hostingFiles("vercel", c)[0]!.content);
    expect(vercel.rewrites).toEqual([{ source: "/(.*)", destination: "/index.html" }]);
    expect(hostingFiles("cloudflare", c)[0]!.content).toContain(
      `"compatibility_date": "2026-10-22"`,
    );
    const docker = hostingFiles("docker", c).map((f) => f.path.split("/").pop());
    expect(docker).toEqual(["Dockerfile", "nginx.conf", ".dockerignore"]);
    for (const h of HOSTS)
      for (const f of hostingFiles(h, c)) expect(f.content.length).toBeGreaterThan(50);
  });

  test("a deck with no lockfile yet installs with npm install, without a cache", async () => {
    const lone = await mkdtemp(join(tmpdir(), "kd-ci-lone-"));
    const c = hostingContext(lone);
    expect(c.lockfile).toBeNull();
    const wf = hostingFiles("github-pages", c)[0]!.content;
    expect(wf).toContain("- run: npm install");
    expect(wf).not.toContain("cache: npm");
    await rm(lone, { recursive: true, force: true });
  });

  test("never replaces a file without --force", async () => {
    const first = writeHosting(deck, ["netlify"]);
    expect(first.files).toEqual([join(deck, "netlify.toml")]);
    expect(() => writeHosting(deck, ["netlify"])).toThrow(/--force/);
    expect(writeHosting(deck, ["netlify"], { force: true }).next[0]).toContain("Netlify");
  });
});
