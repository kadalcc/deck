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

import { FakeHost } from "../cli/fake-host.ts";
import { mergeMdx } from "../sync/mdx.ts";
import { createServer } from "./index.ts";

/**
 * The MCP server's sync tools, over the SDK's in-memory transport: conflicts, resolve, the edit
 * tools' refusal to half-edit a conflicted slide, status, pull — and, where the starter's
 * node_modules are there to build with, a publish refused as `diverged` against a fake host.
 */

const starter = resolve(import.meta.dir, "../../../../examples/starter");
const canBuild = existsSync(join(starter, "node_modules", "vite"));
const work = mkdtempSync(join(tmpdir(), "kadal-deck-mcp-sync-"));
const deck = join(work, "deck");
const host = new FakeHost();
let client: Client;
let close: () => Promise<void>;
const saved = {
  XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
  KADAL_DECK_TOKEN: process.env.KADAL_DECK_TOKEN,
  KADAL_DECK_HOST: process.env.KADAL_DECK_HOST,
  fetch: globalThis.fetch,
};

type Result = {
  isError?: boolean;
  content: Array<{ type: string; text?: string }>;
  structuredContent?: Record<string, unknown>;
};
const call = async (name: string, args: Record<string, unknown> = {}) =>
  (await client.callTool({ name, arguments: args }, undefined, {
    timeout: 300_000,
  })) as unknown as Result;
const text = (r: Result) => r.content.map((c) => c.text ?? "").join("\n");
const deckText = () => readFileSync(join(deck, "deck.mdx"), "utf8");
const base = () => readFileSync(join(starter, "deck.mdx"), "utf8");

beforeAll(async () => {
  cpSync(starter, deck, {
    recursive: true,
    filter: (src) =>
      !/[\\/](node_modules|dist|export|screenshots|\.kadal-deck|kit-fixture[^\\/]*)([\\/]|$)/.test(
        src.slice(starter.length),
      ),
  });
  if (canBuild) symlinkSync(join(starter, "node_modules"), join(deck, "node_modules"), "dir");
  process.env.XDG_CONFIG_HOME = join(work, "config");
  process.env.KADAL_DECK_TOKEN = "t";
  process.env.KADAL_DECK_HOST = host.url;
  // Only the fake host's address goes through the fake; anything else (Vite, Chromium) is real.
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
    String(input).startsWith(host.url)
      ? host.fetch(input, init)
      : saved.fetch(input, init)) as typeof fetch;
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
  globalThis.fetch = saved.fetch;
  for (const k of ["XDG_CONFIG_HOME", "KADAL_DECK_TOKEN", "KADAL_DECK_HOST"] as const)
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  rmSync(work, { recursive: true, force: true });
});

describe("conflicts", () => {
  test("deck_check reports them, edit tools refuse to half-edit, deck_resolve settles", async () => {
    const original = base();
    const first = /^# .+$/m.exec(original)![0];
    const merged = mergeMdx(
      original,
      original.replace(first, `${first} (mine)`),
      original.replace(first, `${first} (web)`),
      {
        oursLabel: "local (your files)",
        theirsLabel: "web v2 (quick edit by Asha)",
      },
    );
    expect(merged.conflicts).toHaveLength(1);
    writeFileSync(join(deck, "deck.mdx"), merged.text);

    const check = await call("deck_check", { compile: false });
    expect(text(check)).toContain("Unresolved merge conflict on slide 1");

    const listed = await call("deck_conflicts");
    const conflicts = listed.structuredContent!.conflicts as Array<Record<string, unknown>>;
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ path: "deck.mdx", slide: 1, which: 0, kind: "content" });
    expect(text(listed)).toContain("--- yours");

    // Editing the conflicted slide while keeping its markers is refused, and nothing is written.
    const half = await call("notes_set", { slide: 0, notes: "Hello" });
    expect(half.isError).toBe(true);
    expect(text(half)).toContain("unresolved merge conflict");
    expect(deckText()).toBe(merged.text);
    // Another slide is fine.
    const other = await call("notes_set", { slide: 1, notes: "Fine" });
    expect(other.isError).toBeFalsy();

    const r = await call("deck_resolve", { path: "deck.mdx", which: 0, choice: "theirs" });
    expect(r.structuredContent).toMatchObject({
      remaining: [],
      next: ["deck_check", "deck_publish"],
    });
    expect(deckText()).toContain(`${first} (web)`);
    expect(deckText()).not.toContain("<<<<<<<");
  });

  test("deck_sync_status works offline-ish (no deck on the host yet)", async () => {
    const r = await call("deck_sync_status");
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent).toMatchObject({ signedIn: true, conflicts: [] });
  });
});

describe.skipIf(!canBuild)("publish against a host that moved", () => {
  test("deck_publish returns diverged; deck_pull merges; deck_publish then works", async () => {
    const first = await call("deck_publish", { slug: "talk" });
    expect(first.structuredContent, text(first)).toMatchObject({ ok: true, version: 1, kit: true });
    const v1 = host.deckBySlug("talk")!.versions[0]!;
    expect(Object.keys(v1.files)).toContain("__kadal/kit/index.html");
    expect(Object.keys(v1.files)).toContain("__kadal/kit/kit.json");
    expect(Object.keys(v1.source!)).toContain("deck.mdx");
    expect(v1.body.meta).toMatchObject({ theme: "minimal" });

    const now = deckText();
    const lastHeading = [...now.matchAll(/^## .+$/gm)].at(-1)![0];
    host.webEdit("talk", {
      ...host.sourceOf("talk"),
      "deck.mdx": now.replace(lastHeading, `${lastHeading} — web`),
    });
    writeFileSync(join(deck, "deck.mdx"), now.replace(/^(# .+)$/m, "$1 — local"));

    const refused = await call("deck_publish", { slug: "talk" });
    expect(refused.isError).toBeFalsy();
    expect(refused.structuredContent).toMatchObject({
      ok: false,
      reason: "diverged",
      head: { version: 2 },
      next: ["deck_pull", "deck_publish --force"],
    });

    const status = await call("deck_sync_status");
    expect(status.structuredContent!.next).toContain("deck_pull");
    const pulled = await call("deck_pull");
    expect(pulled.structuredContent).toMatchObject({ clean: true, version: 2 });
    expect(deckText()).toContain("— web");
    expect(deckText()).toContain("— local");

    const again = await call("deck_publish", { slug: "talk" });
    expect(again.structuredContent, text(again)).toMatchObject({ ok: true, version: 3 });
  }, 600_000);
});
