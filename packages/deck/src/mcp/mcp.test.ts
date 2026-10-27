import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createServer } from "./index.ts";

/**
 * The MCP server driven through the SDK's own client over an in-memory transport, against a copy
 * of examples/starter (its node_modules linked, so Vite and the engine resolve). Rendering and
 * export need Chromium; where Playwright has none installed those two are skipped.
 */

const starter = resolve(import.meta.dir, "../../../../examples/starter");
const work = mkdtempSync(join(tmpdir(), "kadal-deck-mcp-"));
const deck = join(work, "deck");
let client: Client;
let close: () => Promise<void>;
const saved = {
  XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
  KADAL_DECK_TOKEN: process.env.KADAL_DECK_TOKEN,
};

async function chromiumInstalled(): Promise<boolean> {
  try {
    const { chromium } = await import("playwright");
    return existsSync(chromium.executablePath());
  } catch {
    return false;
  }
}
const canRender = await chromiumInstalled();
const canBuild = existsSync(join(starter, "node_modules", "vite"));

type Result = {
  isError?: boolean;
  content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
  structuredContent?: Record<string, unknown>;
};
const call = async (name: string, args: Record<string, unknown> = {}) =>
  // Generous: under a loaded CI box a first render starts Vite and Chromium.
  (await client.callTool({ name, arguments: args }, undefined, {
    timeout: 240_000,
  })) as unknown as Result;
const text = (r: Result) =>
  r.content
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n");
const deckText = () => readFileSync(join(deck, "deck.mdx"), "utf8");

beforeAll(async () => {
  cpSync(starter, deck, {
    recursive: true,
    filter: (src) =>
      !/[\\/](node_modules|dist|export|screenshots|\.kadal-deck)([\\/]|$)/.test(
        src.slice(starter.length),
      ),
  });
  if (existsSync(join(starter, "node_modules")))
    symlinkSync(join(starter, "node_modules"), join(deck, "node_modules"), "dir");
  process.env.XDG_CONFIG_HOME = join(work, "config");
  delete process.env.KADAL_DECK_TOKEN;
  const made = createServer({ dir: deck });
  close = made.close;
  const [a, b] = InMemoryTransport.createLinkedPair();
  await made.server.connect(a);
  client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(b);
});

afterAll(async () => {
  await client?.close();
  await close?.();
  rmSync(work, { recursive: true, force: true });
  for (const [k, v] of Object.entries(saved))
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
});

describe("the server describes itself", () => {
  test("tools, with descriptions, schemas and hints", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      [
        "deck_build",
        "deck_check",
        "deck_conflicts",
        "deck_create",
        "deck_export",
        "deck_frontmatter_schema",
        "deck_outline",
        "deck_preview",
        "deck_publish",
        "deck_pull",
        "deck_read_slide",
        "deck_reference",
        "deck_resolve",
        "deck_sync_status",
        "deck_update_frontmatter",
        "media_search",
        "media_trending",
        "media_used",
        "notes_set",
        "slide_add",
        "slide_move",
        "slide_remove",
        "slide_render",
        "slide_update",
      ].sort(),
    );
    for (const t of tools) {
      expect(t.description!.length, t.name).toBeGreaterThan(40);
      expect(t.inputSchema.type).toBe("object");
      expect(t.annotations?.readOnlyHint, t.name).toBeDefined();
    }
    expect(tools.find((t) => t.name === "slide_remove")!.annotations!.destructiveHint).toBe(true);
    expect(tools.find((t) => t.name === "deck_outline")!.annotations!.readOnlyHint).toBe(true);
  });

  test("the media tools: kinds, sets and what they promise an agent", async () => {
    const { tools } = await client.listTools();
    const search = tools.find((t) => t.name === "media_search")!;
    const props = search.inputSchema.properties as Record<string, { enum?: string[] }>;
    expect(search.inputSchema.required).toEqual(["kind", "query"]);
    expect(props.kind!.enum).toEqual(["icon", "emoji", "sticker", "gif", "meme", "template", "kadal"]);
    expect(props.set!.enum).toContain("twemoji");
    expect(search.description).toContain("mdx");
    expect(search.description).toContain("credits: true");
    expect(search.annotations?.readOnlyHint).toBe(true);
    const trending = tools.find((t) => t.name === "media_trending")!;
    expect(trending.inputSchema.required).toEqual(["kind"]);
    const used = tools.find((t) => t.name === "media_used")!;
    expect(used.inputSchema.required).toEqual(["provider", "id"]);
    expect(used.annotations?.readOnlyHint).toBe(false);
    expect(used.annotations?.idempotentHint).toBe(true);
  });

  test("media_used: only KLIPY counts uses, and KLIPY needs the sign-in", async () => {
    const other = await call("media_used", { provider: "imgflip", id: "181913649" });
    expect(other.isError).toBeFalsy();
    expect(other.structuredContent).toMatchObject({ reported: false });
    expect(text(other)).toContain("doesn't count uses");
    const klipy = await call("media_used", { provider: "klipy", id: "gifs/hello-hi-662" });
    expect(klipy.structuredContent).toMatchObject({ reported: false });
    expect(text(klipy)).toContain("not signed in");
  });

  test("resources and prompts", async () => {
    const { resources } = await client.listResources();
    const uris = resources.map((r) => r.uri);
    for (const u of [
      "kadal-deck://catalog",
      "kadal-deck://reference",
      "kadal-deck://schema/frontmatter",
      "kadal-deck://guide/workflow",
      "kadal-deck://guide/design-guide",
      "kadal-deck://guide/components",
    ])
      expect(uris).toContain(u);
    // every resource the instructions name is one the server lists
    const named = client.getInstructions()?.match(/kadal-deck:\/\/[\w/-]+/g) ?? [];
    expect(named.length).toBeGreaterThan(0);
    for (const u of named) expect(uris).toContain(u);
    const cat = await client.readResource({ uri: "kadal-deck://catalog" });
    expect(
      JSON.parse((cat.contents[0] as { text: string }).text).components.length,
    ).toBeGreaterThan(50);
    const guide = await client.readResource({ uri: "kadal-deck://guide/design-guide" });
    expect((guide.contents[0] as { text: string }).text).toContain("One idea per slide");
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name).sort()).toEqual(["draft_deck", "review_deck"]);
    const p = await client.getPrompt({
      name: "draft_deck",
      arguments: { topic: "Monsoon maps", minutes: "10" },
    });
    expect((p.messages[0]!.content as { text: string }).text).toContain("Monsoon maps");
  });
});

describe("reference", () => {
  test("sections, entries, search, schema", async () => {
    expect(text(await call("deck_reference"))).toContain("components");
    const poll = await call("deck_reference", { section: "components", name: "Poll" });
    expect(text(poll)).toContain("question");
    expect(text(await call("deck_reference", { search: "vertical stack" }))).toBeTruthy();
    expect((await call("deck_reference", { section: "nope" })).isError).toBe(true);
    const schema = await call("deck_frontmatter_schema", { scope: "slide" });
    expect(JSON.parse(text(schema)).properties.layout).toBeDefined();
  });
});

describe("project and edits", () => {
  test("outline, read, check", async () => {
    const o = await call("deck_outline");
    expect((o.structuredContent!.slides as unknown[]).length).toBe(8);
    expect(text(o)).toContain("Three dashes start a new slide");
    const s = await call("deck_read_slide", { slide: 4 });
    expect(s.structuredContent!.content).toContain("```ts {1|2-4|all}");
    expect(text(s)).toMatch(/\d+\| ## Code that steps/);
    const c = await call("deck_check");
    expect(c.structuredContent).toMatchObject({ ok: true, errors: 0 });
  });

  test("add, update, notes, move, remove — each lints and keeps the rest", async () => {
    const before = deckText();
    const added = await call("slide_add", {
      content: "## Added\n\n<Clicks>\n\n- one\n- two\n\n</Clicks>",
      frontmatter: { layout: "center" },
      notes: "Say [click] one [click] two",
      at: 1,
    });
    expect(added.isError).toBeFalsy();
    expect(added.structuredContent).toMatchObject({ ok: true, slides: 9, diagnostics: [] });
    expect((added.structuredContent!.slide as { title: string }).title).toBe("Added");

    const upd = await call("slide_update", { slide: 1, patch: { background: "aurorra" } });
    expect(
      (upd.structuredContent!.diagnostics as Array<{ code: string }>).map((d) => d.code),
    ).toEqual(["background-unknown"]);
    await call("slide_update", { slide: 1, patch: { background: "aurora" } });
    await call("notes_set", { slide: 1, notes: "New notes [click] here" });
    expect(deckText()).toContain("<Notes>\nNew notes [click] here\n</Notes>");
    await call("slide_move", { slide: 1, to: 8 });
    const o = await call("deck_outline");
    expect((o.structuredContent!.slides as Array<{ title: string }>).at(-1)!.title).toBe("Added");
    await call("slide_remove", { slide: 8 });
    expect(deckText()).toBe(before);

    await call("deck_update_frontmatter", { patch: { author: "Test Author" } });
    expect(deckText()).toContain("author: Test Author");
    await call("deck_update_frontmatter", { patch: { author: "Your name" } });
    expect(deckText()).toBe(before);
    expect((await call("slide_update", { slide: 99, content: "x" })).isError).toBe(true);
    expect((await call("slide_update", { slide: 1 })).isError).toBe(true);
  });

  test("deck_create scaffolds a deck the other tools can use", async () => {
    const r = await call("deck_create", {
      dir: join(deck, "talks", "fresh"),
      title: "Fresh talk",
      install: false,
    });
    expect(r.structuredContent).toMatchObject({ ok: true, installed: false, title: "Fresh talk" });
    const o = await call("deck_outline", { dir: join(deck, "talks", "fresh") });
    expect(o.structuredContent!.title).toBe("Fresh talk");
    expect(
      (await call("deck_create", { dir: join(deck, "talks", "fresh"), install: false })).isError,
    ).toBe(true);
  });

  test("deck_publish without a login says how to sign in", async () => {
    const r = await call("deck_publish");
    expect(r.isError).toBe(true);
    expect(text(r)).toContain("kadal-deck login");
  });
});

describe.if(canBuild)("serving and building", () => {
  test("deck_preview starts the dev server and stops it", async () => {
    const r = await call("deck_preview");
    const url = r.structuredContent!.url as string;
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    expect((await fetch(url)).ok).toBe(true);
    expect((await call("deck_preview", { stop: true })).structuredContent!.running).toBe(false);
  }, 240_000);

  test("deck_build writes dist/", async () => {
    const r = await call("deck_build");
    expect(r.isError, text(r)).toBeFalsy();
    expect(existsSync(join(deck, "dist", "index.html"))).toBe(true);
  }, 240_000);
});

describe.if(canBuild && canRender)("seeing it", () => {
  test("slide_render returns PNG images of the slides", async () => {
    const r = await call("slide_render", { slides: [0, "s3"], scheme: "dark", width: 640 });
    expect(r.isError, text(r)).toBeFalsy();
    const images = r.content.filter((c) => c.type === "image");
    expect(images.length).toBe(2);
    for (const img of images) {
      expect(img.mimeType).toBe("image/png");
      const bytes = Buffer.from(img.data!, "base64");
      expect(bytes.subarray(1, 4).toString()).toBe("PNG");
      expect(bytes.readUInt32BE(16)).toBe(640);
    }
    expect(r.structuredContent!.rendered).toEqual([
      { slide: 0, width: 640, height: 360 },
      { slide: 3, width: 640, height: 360 },
    ]);
    // An edit shows up in the next render (the dev server reloads the deck).
    await call("slide_update", { slide: 0, content: "# Changed" });
    const again = await call("slide_render", { slides: [0] });
    expect(again.content.filter((c) => c.type === "image").length).toBe(1);
  }, 300_000);

  test("deck_export writes a PDF", async () => {
    const r = await call("deck_export", { formats: ["pdf"] });
    expect(r.isError, text(r)).toBeFalsy();
    const files = r.structuredContent!.files as Array<{ kind: string; path: string }>;
    expect(files.map((f) => f.kind)).toEqual(["pdf"]);
    expect(readFileSync(files[0]!.path).subarray(0, 4).toString()).toBe("%PDF");
  }, 300_000);
});

describe("review regressions (PR #6)", () => {
  test("tools stay inside the server's folder", async () => {
    expect(text(await call("deck_outline", { dir: "/etc" }))).toMatch(/outside the folder/);
    expect(
      (await call("deck_create", { dir: join(work, "elsewhere"), install: false })).isError,
    ).toBe(true);
    expect(text(await call("deck_export", { out: "../escaped" }))).toMatch(
      /outside the deck folder/,
    );

    // An include that leaves the deck is neither read nor written.
    const original = deckText();
    writeFileSync(join(work, "outside.mdx"), "# Outside\n");
    writeFileSync(join(deck, "deck.mdx"), `${original}\n---\nsrc: ../outside.mdx\n---\n`);
    try {
      const check = await call("deck_check");
      expect(
        (check.structuredContent!.diagnostics as Array<{ code: string }>).map((d) => d.code),
      ).toContain("include-outside");
      const edit = await call("slide_update", { slide: 1, content: "## Changed" });
      expect(edit.isError).toBe(true);
      expect(readFileSync(join(work, "outside.mdx"), "utf8")).toBe("# Outside\n");
    } finally {
      writeFileSync(join(deck, "deck.mdx"), original);
    }
  });

  test("a refused edit says why and writes nothing", async () => {
    const before = deckText();
    const r = await call("slide_update", {
      slide: 1,
      content: "## Unclosed\n\n```js\nconst a = 1",
    });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/never closes/);
    expect(deckText()).toBe(before);
  });
});

describe.if(canBuild)("the dev server is shared", () => {
  test("concurrent calls start one server; a stopped one is started again", async () => {
    const [a, b] = await Promise.all([call("deck_preview"), call("deck_preview")]);
    expect(a.structuredContent!.url).toBe(b.structuredContent!.url);
    await call("deck_preview", { stop: true });
    if (canRender) {
      const r = await call("slide_render", { slides: [0], width: 320 });
      expect(r.isError, text(r)).toBeFalsy();
    }
    const again = await call("deck_preview");
    expect((await fetch(again.structuredContent!.url as string)).ok).toBe(true);
    await call("deck_preview", { stop: true });
  }, 300_000);
});
