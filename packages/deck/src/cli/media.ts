import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

import { UsageError, bool, str } from "./args.ts";
import { HostError, hostFrom, loadCredentials, request } from "./host.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * kadal-deck media  —  the workspace's media library, from the command line
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   kadal-deck media list [--kind sticker] [--q rocket] [--json]
 *   kadal-deck media add <id|name> [--to public/stickers/] [--force]
 *
 * The library is what people upload in the hosted builder (stickers, images, GIFs, memes, short
 * videos). `add` downloads one item into the project — by default under public/stickers/, so the
 * deck can use it as `<Sticker src="/stickers/…" />` — and prints the line to paste. The host's
 * endpoints: GET /api/v1/workspaces/:ws/media (list/search) and GET /api/v1/media/:id/file.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface MediaItem {
  id: string;
  kind: "image" | "gif" | "sticker" | "meme" | "video";
  name: string;
  contentType: string;
  bytes: number;
  width: number | null;
  height: number | null;
  tags?: string[];
  folder?: string | null;
}

interface Me {
  current: { handle: string } | null;
}

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/apng": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

/** A file name for an item: its name, made safe, with the extension its type has. */
export function mediaFileName(item: Pick<MediaItem, "id" | "name" | "contentType">): string {
  const ext = EXT[item.contentType.split(";")[0]!.trim().toLowerCase()] ?? "bin";
  const stem =
    item.name
      .replace(/\.[a-z0-9]{2,5}$/i, "")
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || item.id;
  return `${stem}.${ext}`;
}

/** The one item `query` names: an exact id, else an exact name, else the only name containing it. */
export function pickMedia(items: MediaItem[], query: string): MediaItem {
  const q = query.trim().toLowerCase();
  const byId = items.find((i) => i.id === query.trim());
  if (byId) return byId;
  const exact = items.filter((i) => i.name.toLowerCase() === q);
  if (exact.length === 1) return exact[0]!;
  const near = exact.length ? exact : items.filter((i) => i.name.toLowerCase().includes(q));
  if (near.length === 1) return near[0]!;
  if (!near.length)
    throw new UsageError(`No media item matches "${query}". Try \`kadal-deck media list\`.`);
  throw new UsageError(
    `"${query}" matches ${near.length} items — use the id:\n${near
      .slice(0, 10)
      .map((i) => `  ${i.id}  ${i.name}`)
      .join("\n")}`,
  );
}

/** The site path a file under public/ is served at, or null outside public/. */
export function publicPath(projectDir: string, file: string): string | null {
  const rel = relative(resolve(projectDir, "public"), file);
  if (!rel || rel.startsWith("..") || rel.startsWith(sep)) return null;
  return `/${rel.split(sep).join("/")}`;
}

/** The MDX to paste for an item at `src`. */
export function mediaSnippet(item: Pick<MediaItem, "kind" | "name">, src: string): string {
  const alt = item.name.replace(/"/g, "'");
  if (item.kind === "sticker") return `<Sticker src="${src}" alt="${alt}" />`;
  if (item.kind === "video") return `<Video src="${src}" autoplay loop muted />`;
  return `<Image src="${src}" alt="${alt}" />`;
}

interface Io {
  json: boolean;
  say: (line: string) => void;
  emit: (data: unknown) => void;
}

export async function mediaCommand(
  positionals: string[],
  flags: Record<string, unknown>,
  dir: string,
  { json, say, emit }: Io,
): Promise<number> {
  const [sub, target] = positionals;
  if (sub !== "list" && sub !== "add")
    throw new UsageError(
      "Usage: kadal-deck media list [--kind k] [--q text] | media add <id|name> [--to dir]",
    );
  if (sub === "add" && !target)
    throw new UsageError("Usage: kadal-deck media add <id|name> [--to dir]");
  const creds = await loadCredentials();
  if (!creds) {
    const message = "Not signed in. Run `kadal-deck login`, or set KADAL_DECK_TOKEN.";
    if (json) emit({ ok: false, error: { code: "unauthorized", message, exitCode: 3 } });
    else say(message);
    return 3;
  }
  const host = str(flags.host) ? hostFrom(process.env, str(flags.host)) : creds.host;
  let workspace = str(flags.workspace) ?? creds.workspace;
  if (!workspace) {
    const { data } = await request<Me>(host, "/me", { token: creds.token });
    workspace = data.current?.handle;
    if (!workspace) throw new Error("This account has no workspace yet; open the dashboard once.");
  }
  const kind = str(flags.kind);
  const fetchItems = async (q?: string) => {
    const qs = new URLSearchParams({ limit: "100", sort: "recent" });
    if (kind) qs.set("kind", kind);
    if (q) qs.set("q", q);
    const { data } = await request<{ items: MediaItem[] }>(
      host,
      `/workspaces/${encodeURIComponent(workspace)}/media?${qs}`,
      { token: creds.token },
    );
    return data.items ?? [];
  };
  const q = sub === "list" ? str(flags.q) : target;
  let items = await fetchItems(q);
  // A search matches names and tags; an id is found in the unfiltered list.
  if (
    sub === "add" &&
    !items.some((i) => i.id === target || i.name.toLowerCase().includes(target!.toLowerCase()))
  )
    items = await fetchItems();

  if (sub === "list") {
    if (json) emit({ ok: true, workspace, items });
    else if (!items.length) say(`No media in @${workspace}${q || kind ? " matching that" : ""}.`);
    else
      for (const i of items)
        say(
          `${i.id}  ${i.kind.padEnd(7)}  ${String(i.width ?? "?")}×${String(i.height ?? "?")}  ${(i.bytes / 1024).toFixed(0).padStart(6)} KB  ${i.name}`,
        );
    return 0;
  }

  const item = pickMedia(items, target!);
  const res = await fetch(`${host}/api/v1/media/${encodeURIComponent(item.id)}/file`, {
    headers: { authorization: `Bearer ${creds.token}` },
  });
  if (!res.ok)
    throw new HostError(
      res.status,
      `http_${res.status}`,
      `The host answered ${res.status} for ${item.name}.`,
    );
  const body = new Uint8Array(await res.arrayBuffer());
  const to = resolve(dir, str(flags.to) ?? join("public", "stickers"));
  const file = join(to, mediaFileName(item));
  const existing = await readFile(file).catch(() => null);
  if (existing && !bool(flags.force) && !Buffer.from(existing).equals(Buffer.from(body)))
    throw new UsageError(`${relative(dir, file)} exists and differs. Pass --force to replace it.`);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, body);
  const src = publicPath(dir, file) ?? `./${relative(dir, file).split(sep).join("/")}`;
  const snippet = mediaSnippet(item, src);
  if (json) emit({ ok: true, item, file, src, snippet });
  else {
    say(`added  ${relative(dir, file)}  (${(body.byteLength / 1024).toFixed(0)} KB)`);
    say(`use it:  ${snippet}`);
  }
  return 0;
}
