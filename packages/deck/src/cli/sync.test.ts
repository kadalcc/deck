import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { hasConflictMarkers } from "../sync/markers.ts";
import { FakeHost } from "./fake-host.ts";
import { DivergedError } from "./publish.ts";
import {
  ConflictsError,
  NoSourceError,
  deckStatus,
  loadSync,
  publishWithSync,
  pullDeck,
  resolveDeck,
} from "./sync.ts";

const DECK = `---
title: Sync test
---

# Hello

First slide.

---

# Two

Line a

---

# Three

Line c
`;

let dir: string;
let host: FakeHost;
const write = (path: string, text: string) => {
  mkdirSync(join(dir, path, ".."), { recursive: true });
  writeFileSync(join(dir, path), text);
};
const read = (path: string) => readFileSync(join(dir, path), "utf8");
const ctx = () => ({ host: host.url, token: "t", workspace: "ana", fetch: host.fetch });

/** `kadal-deck publish`, with a build that writes a two-file site (and a kit). */
const publishNow = (o: { force?: boolean; source?: boolean; showcase?: boolean } = {}) =>
  publishWithSync({
    ...ctx(),
    dir,
    slug: "talk",
    outDir: join(dir, ".kadal-deck", "publish"),
    meta: { theme: "minimal", slides: 3 },
    ...o,
    build: async (_base, out, kitDir) => {
      mkdirSync(out, { recursive: true });
      writeFileSync(
        join(out, "index.html"),
        `<!doctype html><title>${read("deck.mdx").length}</title>`,
      );
      if (kitDir) {
        mkdirSync(kitDir, { recursive: true });
        writeFileSync(join(kitDir, "index.html"), "<!doctype html>kit");
        writeFileSync(
          join(kitDir, "kit.json"),
          JSON.stringify({
            engine: "0.5.0",
            kitVersion: 1,
            components: ["Chart"],
            layouts: [],
            modules: [],
            editable: [],
          }),
        );
      }
    },
  });
const pull = (o: Partial<Parameters<typeof pullDeck>[0]> = {}) =>
  pullDeck({ ...ctx(), dir, slug: "talk", ...o });

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "kadal-sync-"));
  host = new FakeHost();
  write("deck.mdx", DECK);
  write("glossary.yaml", "MDX: Markdown with components\n");
  write("src/components.tsx", "export const components = {};\n");
  write("package.json", "{}\n");
  write(".gitignore", "node_modules/\n");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("publish", () => {
  test("uploads the editable source privately, the kit, meta, and records the base", async () => {
    const { result, kitBuilt } = await publishNow();
    expect(result.version).toBe(1);
    expect(kitBuilt).toBe(true);
    const v = host.deckBySlug("talk")!.versions[0]!;
    expect(Object.keys(v.source!).sort()).toEqual(["deck.mdx", "glossary.yaml"]);
    // Source is never in the built files the decks host serves.
    expect(Object.keys(v.files).sort()).toEqual([
      "__kadal/kit/index.html",
      "__kadal/kit/kit.json",
      "index.html",
    ]);
    expect(v.body).toMatchObject({
      origin: "cli",
      base: null,
      meta: { theme: "minimal", slides: 3 },
      kit: { kitVersion: 1, components: ["Chart"] },
    });
    expect("showcase" in v.body).toBe(false);
    const state = await loadSync(dir);
    expect(state).toMatchObject({
      deckId: v === undefined ? "" : host.deckBySlug("talk")!.id,
      version: 1,
      sourceHash: v.sourceHash,
    });
    expect(read(".kadal-deck/sync/base/deck.mdx")).toBe(DECK);
    expect(read(".gitignore")).toContain(".kadal-deck/");
  });

  test("--showcase is sent only when given; a non-public deck is refused plainly", async () => {
    await publishNow({ showcase: false });
    expect(host.deckBySlug("talk")!.versions[0]!.body.showcase).toBe(false);
    host.deckBySlug("talk")!.visibility = "private";
    const err = await publishNow({ showcase: true }).catch((e: Error) => e);
    expect((err as Error).message).toContain("Only public decks can be listed in the showcase");
    expect((err as { code?: string }).code).toBe("not_public");
  });

  test("--no-source sends no source and no kit, and sticks until --source", async () => {
    await publishNow({ source: false });
    expect(host.deckBySlug("talk")!.versions[0]!.source).toBeNull();
    expect((await loadSync(dir))!.source).toBe(false);
    const again = await publishNow();
    expect(again.kitBuilt).toBe(false);
    expect(host.deckBySlug("talk")!.versions[1]!.source).toBeNull();
    await publishNow({ source: true });
    expect(host.deckBySlug("talk")!.versions[2]!.source).not.toBeNull();
    expect((await loadSync(dir))!.source).toBeUndefined();
  });
});

describe("web edits, both ways", () => {
  test("publish → web edit → status → pull merges cleanly", async () => {
    await publishNow();
    host.webEdit("talk", {
      "deck.mdx": DECK.replace("Line c", "Line c, from the web"),
      "glossary.yaml": "MDX: Markdown with components\n",
    });
    const st = await deckStatus({ ...ctx(), dir, slug: "talk" });
    expect(st.newer.map((v) => v.version)).toEqual([2]);
    expect(st.lines.join("\n")).toContain(
      "The web has 1 newer version (v2 (quick edit by Asha, 25 Oct",
    );
    expect(st.next).toEqual(["kadal-deck pull"]);
    const r = await pull();
    expect(r.clean).toBe(true);
    expect(r.files).toEqual([{ path: "deck.mdx", change: "updated", slides: [3] }]);
    expect(read("deck.mdx")).toContain("Line c, from the web");
    expect((await loadSync(dir))!.version).toBe(2);
    // The file it changed, as it was.
    expect(readFileSync(join(r.backup!, "deck.mdx"), "utf8")).toBe(DECK);
    // Publishing now is not a divergence.
    const p = await publishNow();
    expect(p.result.version).toBe(3);
  });

  test("both edited different slides: a clean merge, then publish", async () => {
    await publishNow();
    host.webEdit("talk", {
      "deck.mdx": DECK.replace("Line c", "web edit"),
      "glossary.yaml": "MDX: Markdown with components\n",
    });
    write("deck.mdx", DECK.replace("Line a", "local edit"));
    // Publishing first is refused: the deck moved.
    const err = await publishNow().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DivergedError);
    expect((err as DivergedError).head).toMatchObject({
      version: 2,
      origin: "builder",
      by: "Asha",
    });
    expect((err as Error).message).toContain(
      "Run `kadal-deck pull` to merge their edits, or `kadal-deck publish --force`",
    );
    const r = await pull();
    expect(r.clean).toBe(true);
    expect(r.files[0]).toMatchObject({ path: "deck.mdx", change: "merged" });
    expect(read("deck.mdx")).toContain("local edit");
    expect(read("deck.mdx")).toContain("web edit");
    const p = await publishNow();
    expect(host.sourceOf("talk", p.result.version)["deck.mdx"]).toBe(read("deck.mdx"));
  });

  test("the same slide: conflict (exit 5 paths), publish refuses, resolve, publish", async () => {
    await publishNow();
    host.webEdit("talk", {
      "deck.mdx": DECK.replace("Line a", "web words"),
      "glossary.yaml": "MDX: Markdown with components\n",
    });
    write("deck.mdx", DECK.replace("Line a", "my words"));
    const r = await pull();
    expect(r.clean).toBe(false);
    expect(r.conflicts).toMatchObject([
      { path: "deck.mdx", slide: 2, kind: "content", ours: "my words", theirs: "web words" },
    ]);
    const text = read("deck.mdx");
    expect(text).toContain(
      "<<<<<<< local (your files)\nmy words\n||||||| base v1\nLine a\n=======\nweb words\n>>>>>>> web v2 (quick edit by Asha",
    );
    // The base stays where it was until the conflict is settled.
    expect((await loadSync(dir))!).toMatchObject({ version: 1, pending: { version: 2 } });
    expect(await publishNow().catch((e: unknown) => e)).toBeInstanceOf(ConflictsError);
    expect(await pull().catch((e: unknown) => e)).toBeInstanceOf(ConflictsError);
    const st = await deckStatus({ ...ctx(), dir, slug: "talk" });
    expect(st.conflicts).toHaveLength(1);
    expect(st.next[0]).toBe("kadal-deck resolve --list");

    const listed = await resolveDeck({ dir, list: true });
    expect(listed.remaining).toHaveLength(1);
    const done = await resolveDeck({ dir, target: "deck.mdx#2", choice: "both" });
    expect(done).toMatchObject({
      resolved: [{ path: "deck.mdx", slide: 2 }],
      remaining: [],
      settled: true,
    });
    expect(read("deck.mdx")).toBe(DECK.replace("Line a", "my words\nweb words"));
    expect((await loadSync(dir))!).toMatchObject({ version: 2, pending: null });
    const p = await publishNow();
    expect(p.result.version).toBe(3);
    expect(host.deckBySlug("talk")!.versions[2]!.body.base).toBe(2);
  });

  test("--force replaces the web's version, and pull --version brings it back", async () => {
    await publishNow();
    host.webEdit("talk", {
      "deck.mdx": DECK.replace("Line c", "web only"),
      "glossary.yaml": "MDX: Markdown with components\n",
    });
    write("deck.mdx", DECK.replace("Line a", "mine"));
    const p = await publishNow({ force: true });
    expect(p.result.version).toBe(3);
    expect(p.replaced).toMatchObject({ version: 2, origin: "builder" });
    expect(host.calls.some((c) => c.includes("/commit?force=1"))).toBe(true);
    const r = await pull({ version: 2 });
    expect(r.clean).toBe(true);
    expect(read("deck.mdx")).toContain("web only");
    expect(read("deck.mdx")).toContain("mine");
    // The head did not move, so the base did not either: publishing the restored edits just works.
    expect((await loadSync(dir))!.version).toBe(3);
    expect((await publishNow()).result.version).toBe(4);
  });

  test("a missing base snapshot is fetched from the host by version", async () => {
    await publishNow();
    rmSync(join(dir, ".kadal-deck", "sync", "base"), { recursive: true });
    host.webEdit("talk", {
      "deck.mdx": DECK.replace("Line c", "web"),
      "glossary.yaml": "MDX: Markdown with components\n",
    });
    write("deck.mdx", DECK.replace("Line a", "local"));
    const r = await pull();
    expect(r.notes.join(" ")).toContain("fetched v1 from the host");
    expect(r.clean).toBe(true);
    expect(read("deck.mdx")).toContain("local");
    expect(read("deck.mdx")).toContain("web");
  });

  test("no sync.json at all (a fresh clone): what differs conflicts, the rest is kept", async () => {
    await publishNow();
    rmSync(join(dir, ".kadal-deck"), { recursive: true });
    host.webEdit("talk", {
      "deck.mdx": DECK.replace("Line c", "web"),
      "glossary.yaml": "MDX: Markdown with components\n",
    });
    const r = await pull();
    expect(r.notes.join(" ")).toContain("No sync snapshot");
    expect(r.clean).toBe(false);
    expect(r.conflicts).toMatchObject([{ path: "deck.mdx", slide: 3, kind: "add-add" }]);
    expect(hasConflictMarkers(read("deck.mdx"))).toBe(true);
    await resolveDeck({ dir, choice: "theirs" });
    expect(read("deck.mdx")).toContain("web");
    expect((await loadSync(dir))!.version).toBe(2);
  });

  test("--dry-run writes nothing; --theirs settles every conflict", async () => {
    await publishNow();
    host.webEdit("talk", {
      "deck.mdx": DECK.replace("Line a", "web"),
      "glossary.yaml": "MDX: Markdown with components\n",
    });
    write("deck.mdx", DECK.replace("Line a", "mine"));
    const dry = await pull({ dryRun: true });
    expect(dry.files[0]!.change).toBe("conflict");
    expect(read("deck.mdx")).toBe(DECK.replace("Line a", "mine"));
    expect(existsSync(join(dir, ".kadal-deck", "sync", "backup"))).toBe(false);
    const r = await pull({ strategy: "theirs" });
    expect(r.clean).toBe(true);
    expect(read("deck.mdx")).toBe(DECK.replace("Line a", "web"));
  });

  test("a file added on the web arrives; one deleted on the web goes (backed up)", async () => {
    write("pages/extra.mdx", "# Extra\n");
    await publishNow();
    host.webEdit("talk", {
      "deck.mdx": DECK,
      "pages/web.mdx": "# From the web\n",
    });
    const r = await pull();
    expect(r.files.map((f) => `${f.change} ${f.path}`).sort()).toEqual([
      "added pages/web.mdx",
      "deleted glossary.yaml",
      "deleted pages/extra.mdx",
    ]);
    expect(existsSync(join(dir, "pages/extra.mdx"))).toBe(false);
    expect(readdirSync(join(r.backup!, "pages"))).toEqual(["extra.mdx"]);
    expect(read("pages/web.mdx")).toBe("# From the web\n");
  });

  test("a deck published before 0.5 has no source to pull", async () => {
    host.legacy = true;
    await publishNow();
    host.legacy = false;
    const err = await pull().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NoSourceError);
    expect((err as Error).message).toContain("Publish once with kadal-deck 0.5 or later");
  });

  test("an unpublished web draft is said in status, and warned about on publish", async () => {
    await publishNow();
    host.deckBySlug("talk")!.draft = {
      id: "dr1",
      rev: 41,
      baseVersion: 1,
      dirty: true,
      updatedAt: Date.now() - 5 * 60_000,
      updatedBy: "Asha",
    };
    const st = await deckStatus({ ...ctx(), dir, slug: "talk" });
    expect(st.lines.join("\n")).toContain(
      "Unpublished web draft (rev 41, edited 5 min ago by Asha).",
    );
    const lines: string[] = [];
    await publishWithSync({
      ...ctx(),
      dir,
      slug: "talk",
      outDir: join(dir, ".kadal-deck", "publish"),
      log: (l) => lines.push(l),
      build: async (_b, out) => {
        mkdirSync(out, { recursive: true });
        writeFileSync(join(out, "index.html"), "x");
      },
    });
    expect(lines.join("\n")).toContain(
      "Someone is editing this deck on the web (unpublished, Asha)",
    );
  });

  test("status offline: local changes by slide, conflicts", async () => {
    await publishNow();
    write("deck.mdx", DECK.replace("Line a", "x").replace("Line c", "y"));
    const st = await deckStatus({
      dir,
      slug: "talk",
      host: "",
      token: "",
      workspace: "",
      offline: true,
    });
    expect(st.local).toEqual([{ path: "deck.mdx", change: "modified", slides: [2, 3] }]);
    expect(st.lines.join("\n")).toContain("You have local changes in deck.mdx (2 slides).");
  });

  test(".kadaldeckignore keeps files out of the source", async () => {
    write("data/big.csv", "a,b\n1,2\n");
    write("data/keep.json", "{}\n");
    write(".kadaldeckignore", "data/*.csv\n");
    await publishNow();
    expect(Object.keys(host.deckBySlug("talk")!.versions[0]!.source!).sort()).toEqual([
      "data/keep.json",
      "deck.mdx",
      "glossary.yaml",
    ]);
  });
});

describe("the commands' exit codes", () => {
  test("resolve: 5 while conflicts are left, 0 once settled; pull without a login: 3", async () => {
    const { main } = await import("./index.ts");
    const saved = { xdg: process.env.XDG_CONFIG_HOME, token: process.env.KADAL_DECK_TOKEN };
    process.env.XDG_CONFIG_HOME = join(dir, ".no-config");
    delete process.env.KADAL_DECK_TOKEN;
    const log = console.log;
    const out: string[] = [];
    console.log = (s: string) => out.push(s);
    try {
      write(
        "deck.mdx",
        DECK.replace("Line a", "<<<<<<< local (your files)\nmine\n=======\nweb\n>>>>>>> web v2"),
      );
      expect(await main(["resolve", "--list", "-C", dir, "--json"])).toBe(5);
      expect(JSON.parse(out.at(-1)!).remaining).toHaveLength(1);
      expect(await main(["publish", "-C", dir, "--json"])).toBe(3);
      expect(await main(["resolve", "--theirs", "-C", dir, "--json"])).toBe(0);
      expect(read("deck.mdx")).toBe(DECK.replace("Line a", "web"));
      expect(await main(["pull", "-C", dir, "--json"])).toBe(3);
      expect(await main(["status", "-C", dir, "--json"])).toBe(0);
      expect(JSON.parse(out.at(-1)!)).toMatchObject({ ok: true, signedIn: false });
    } finally {
      console.log = log;
      process.env.XDG_CONFIG_HOME = saved.xdg;
      if (saved.token) process.env.KADAL_DECK_TOKEN = saved.token;
    }
  });
});
