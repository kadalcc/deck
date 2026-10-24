import { basename } from "node:path";

import { UsageError, num, str } from "./args.ts";
import { hostFrom, loadCredentials, request } from "./host.ts";
import type { Io } from "./index.ts";
import { slugFrom } from "./publish.ts";
import {
  type HostCtx,
  conflictsMessage,
  deckStatus,
  loadSync,
  pullDeck,
  resolveDeck,
} from "./sync.ts";

/**
 * `kadal-deck pull | status | resolve`: the commands over cli/sync.ts, with the CLI's usual
 * shape — sentences for people, one JSON object with `--json`, and exit codes an agent can act
 * on (3 not signed in, 5 conflicts left).
 */

const EXIT = { ok: 0, auth: 3, conflicts: 5 } as const;

/** Where the deck lives on the host: the saved login, sync.json's deck, or the folder's name. */
export async function hostContext(
  dir: string,
  flags: Record<string, unknown>,
): Promise<(HostCtx & { slug: string }) | null> {
  const creds = await loadCredentials();
  if (!creds) return null;
  const state = await loadSync(dir);
  const hostFlag = str(flags.host);
  const host = hostFlag ? hostFrom(process.env, hostFlag) : (state?.host ?? creds.host);
  let workspace = str(flags.workspace) ?? state?.workspace ?? creds.workspace;
  if (!workspace) {
    const { data } = await request<{ current: { handle: string } | null }>(host, "/me", {
      token: creds.token,
    });
    workspace = data.current?.handle;
    if (!workspace) throw new Error("This account has no workspace yet; open the dashboard once.");
  }
  return {
    host,
    token: creds.token,
    workspace,
    slug: str(flags.slug) ?? state?.slug ?? slugFrom(basename(dir)),
  };
}

export async function syncCommand(
  command: "pull" | "status" | "resolve",
  dir: string,
  flags: Record<string, unknown>,
  positionals: string[],
  { json, say, emit }: Io,
): Promise<number> {
  if (command === "resolve") {
    const picked = (["ours", "theirs", "both"] as const).filter((k) => flags[k] === true);
    if (picked.length > 1) throw new UsageError("One of --ours, --theirs or --both.");
    const list = flags.list === true || !picked.length;
    const r = await resolveDeck({ dir, target: positionals[0], choice: picked[0], list });
    if (json) emit({ ok: r.remaining.length === 0, ...r });
    else {
      for (const f of r.resolved)
        say(
          `${f.deleted ? "deleted " : "resolved"} ${f.path}${f.slide ? `#${f.slide}` : ""} (${picked[0]})`,
        );
      if (r.remaining.length) say(conflictsMessage(r.remaining, "Publishing waits"));
      else if (list) say("No conflicts.");
      else
        say(
          `No conflicts left.${r.settled ? " The pulled version is your base now: `kadal-deck publish` when ready." : ""}`,
        );
    }
    return r.remaining.length ? EXIT.conflicts : EXIT.ok;
  }

  const ctx = await hostContext(dir, flags);
  if (command === "status") {
    // Offline is still useful: local changes and conflicts need no host.
    const r = await deckStatus(
      ctx
        ? { ...ctx, dir }
        : {
            dir,
            slug: str(flags.slug) ?? slugFrom(basename(dir)),
            host: "",
            token: "",
            workspace: "",
            offline: true,
          },
    );
    const out = { ok: true, signedIn: !!ctx, ...r };
    if (json) emit(out);
    else {
      if (!ctx)
        say("Not signed in: showing this folder only (`kadal-deck login` for the web side).");
      for (const l of r.lines) say(l);
      if (r.next.length) say(`\nNext: ${r.next.join(", then ")}`);
    }
    return EXIT.ok;
  }

  if (!ctx) {
    const message = "Not signed in. Run `kadal-deck login`, or set KADAL_DECK_TOKEN.";
    if (json) emit({ ok: false, error: { code: "unauthorized", message, exitCode: EXIT.auth } });
    else say(message);
    return EXIT.auth;
  }
  if (flags.ours === true && flags.theirs === true)
    throw new UsageError("--ours or --theirs, not both.");
  const r = await pullDeck({
    ...ctx,
    dir,
    version: num(flags.version),
    strategy: flags.ours === true ? "ours" : flags.theirs === true ? "theirs" : undefined,
    dryRun: flags["dry-run"] === true,
    log: json ? () => {} : say,
  });
  if (json) emit({ ok: r.clean, ...r });
  else {
    for (const n of r.notes) say(`note     ${n}`);
    if (!r.files.length) say(`Already up to date with v${r.version}.`);
    for (const f of r.files)
      say(
        `${(r.dryRun ? `would ${f.change === "conflict" ? "conflict" : f.change.replace(/d$/, "")}` : f.change).padEnd(9)}${f.path}${f.slides?.length ? `  (slide${f.slides.length === 1 ? "" : "s"} ${f.slides.join(", ")})` : ""}`,
      );
    if (r.backup) say(`backup   ${r.backup}`);
    if (!r.clean) say(`\n${conflictsMessage(r.conflicts, "Publishing waits")}`);
    else if (r.files.length && !r.dryRun)
      say(`\nMerged v${r.version}. Check it (kadal-deck dev), then publish.`);
  }
  if (!r.clean) return EXIT.conflicts;
  return EXIT.ok;
}
