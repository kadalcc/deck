import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { HostError, loadCredentials, saveCredentials } from "./host.ts";
import { login } from "./login.ts";
import { manifestOf, publish, slugFrom, titleFrom } from "./publish.ts";

/** A fake host speaking the /api/v1 contract, keeping just enough state to check the client. */
const TOKEN = "kd_test";
const blobs = new Map<string, Uint8Array>();
const calls: string[] = [];
let failNextPut = 1;
let polls = 0;
let versions: { files: { path: string; sha256: string }[] }[] = [];
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

let server: ReturnType<typeof Bun.serve>;
let host = "";
let dir = "";

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "kadal-deck-cli-"));
  server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname.replace(/^\/api\/v1/, "");
      calls.push(`${req.method} ${path}`);
      const json = (data: unknown, status = 200) => Response.json(data, { status });
      if (path === "/cli/start") return json({ code: "ABCD-EFGH", poll: "p0ll", verify_url: `${host}/app/cli/?code=ABCD-EFGH`, expires_in: 60, interval: 1 });
      if (path === "/cli/poll") {
        if (url.searchParams.get("poll") !== "p0ll") return json({ error: "denied", message: "Unknown login." }, 403);
        return ++polls < 3 ? json({ status: "pending" }, 202) : json({ token: TOKEN, workspace: { handle: "ana", name: "Ana" } });
      }
      if (req.headers.get("authorization") !== `Bearer ${TOKEN}`)
        return json({ error: "unauthorized", message: "Sign in." }, 401);
      if (req.method === "POST" && path === "/workspaces/ana/decks") {
        const body = (await req.json()) as { slug: string };
        return json({ id: "dabc123def456", slug: body.slug, title: body.slug, url: `${host}/@ana/${body.slug}/`, base: `/@ana/${body.slug}/` }, 201);
      }
      if (req.method === "POST" && path === "/workspaces/full/decks")
        return json({ id: "dfull", slug: "x", title: "x", url: "", base: "/@full/x/" }, 201);
      if (req.method === "POST" && path === "/decks/dfull/versions")
        return json({ error: "storage_limit", message: "The Free plan holds 250 MB." }, 402);
      if (req.method === "POST" && path === "/decks/dabc123def456/versions") {
        const body = (await req.json()) as { files: { path: string; sha256: string }[] };
        versions.push(body);
        return json({ version: versions.length, missing: [...new Set(body.files.map((f) => f.sha256))].filter((s) => !blobs.has(s)) }, 201);
      }
      if (req.method === "PUT" && path.startsWith("/blobs/")) {
        if (failNextPut-- > 0) return json({ error: "oops", message: "temporary" }, 503);
        const body = new Uint8Array(await req.arrayBuffer());
        const s = path.slice("/blobs/".length);
        if (sha(body) !== s) return json({ error: "hash_mismatch", message: "bad" }, 422);
        blobs.set(s, body);
        return json({ ok: true }, 201);
      }
      const commit = /^\/decks\/dabc123def456\/versions\/(\d+)\/commit$/.exec(path);
      if (req.method === "POST" && commit) {
        const v = versions[Number(commit[1]) - 1];
        const missing = v.files.map((f) => f.sha256).filter((s) => !blobs.has(s));
        if (missing.length) return json({ error: "missing_blobs", message: "missing", missing }, 409);
        return json({ ok: true, version: Number(commit[1]), url: `${host}/@ana/my-talk/` });
      }
      return json({ error: "not_found", message: "no" }, 404);
    },
  });
  host = `http://localhost:${server.port}`;
});

afterAll(async () => {
  server.stop(true);
  await rm(dir, { recursive: true, force: true });
});

const fakeBuild = (files: Record<string, string>) => async (base: string, out: string) => {
  await mkdir(join(out, "assets"), { recursive: true });
  for (const [p, body] of Object.entries(files)) await writeFile(join(out, p), body.replace("%BASE%", base));
};

describe("kadal-deck publish", () => {
  test("first publish uploads everything, retries a 503, and prints the URL", async () => {
    const out = join(dir, "build1");
    const r = await publish({
      host, token: TOKEN, workspace: "ana", slug: "my-talk", outDir: out,
      build: fakeBuild({ "index.html": '<script src="%BASE%assets/a.js"></script>', "assets/a.js": "console.log(1)", "assets/b.css": "x{}" }),
    });
    expect(r.url).toBe(`${host}/@ana/my-talk/`);
    expect(r.files).toBe(3);
    expect(r.uploaded).toBe(3);
    expect(new TextDecoder().decode(blobs.get(sha(new TextEncoder().encode('<script src="/@ana/my-talk/assets/a.js"></script>')))!)).toContain("/@ana/my-talk/");
  });

  test("a second publish sends only what changed", async () => {
    const before = calls.filter((c) => c.startsWith("PUT")).length;
    const r = await publish({
      host, token: TOKEN, workspace: "ana", slug: "my-talk", outDir: join(dir, "build2"),
      build: fakeBuild({ "index.html": '<script src="%BASE%assets/a.js"></script>', "assets/a.js": "console.log(2)", "assets/b.css": "x{}" }),
    });
    expect(r.version).toBe(2);
    expect(r.uploaded).toBe(1);
    expect(calls.filter((c) => c.startsWith("PUT")).length - before).toBe(1);
  });

  test("plan limits and bad tokens come back as readable errors", async () => {
    const build = fakeBuild({ "index.html": "hi" });
    const limit = await publish({ host, token: TOKEN, workspace: "full", slug: "x", outDir: join(dir, "b3"), build }).catch((e) => e);
    expect(limit).toBeInstanceOf(HostError);
    expect((limit as HostError).status).toBe(402);
    expect((limit as HostError).message).toContain("/app/billing");
    const denied = await publish({ host, token: "nope", workspace: "ana", slug: "x", outDir: join(dir, "b4"), build }).catch((e) => e);
    expect((denied as HostError).status).toBe(401);
    expect((denied as HostError).message).toContain("kadal-deck login");
  });
});

describe("kadal-deck login", () => {
  test("polls with the secret until approved, then saves 0600 credentials", async () => {
    let opened = "";
    const creds = await login({ host, open: (u) => (opened = u), intervalMs: 10 });
    expect(opened).toContain("/app/cli/?code=ABCD-EFGH");
    expect(creds).toEqual({ host, token: TOKEN, workspace: "ana" });
    expect(polls).toBe(3);
    const env = { XDG_CONFIG_HOME: join(dir, "cfg") } as NodeJS.ProcessEnv;
    const path = await saveCredentials(creds, env);
    expect((await Bun.file(path).stat()).mode & 0o777).toBe(0o600);
    expect(await loadCredentials(env)).toEqual(creds);
    expect((await loadCredentials({ ...env, KADAL_DECK_TOKEN: "kd_ci" }))?.token).toBe("kd_ci");
  });
});

describe("helpers", () => {
  test("slugs, titles and manifests", async () => {
    expect(slugFrom("/x/My Talk 2026!")).toBe("my-talk-2026");
    expect(slugFrom("_template")).toBe("template");
    expect(titleFrom('---\ntitle: "Hello, world"\n---\n# x')).toBe("Hello, world");
    expect(titleFrom("# no headmatter")).toBeUndefined();
    const m = await manifestOf(join(dir, "build2"));
    expect(m.map((f) => f.path)).toEqual(["assets/a.js", "assets/b.css", "index.html"]);
    expect(m[0].type).toContain("javascript");
  });
});
