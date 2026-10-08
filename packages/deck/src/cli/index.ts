/**
 * kadal-deck — the command line for a Kadal Deck folder (bin: ./bin.ts).
 *
 *   kadal-deck dev [vite flags]           the deck with live reload (vite)
 *   kadal-deck build [vite flags]         dist/ for any static host (vite build)
 *   kadal-deck export [--png] [--pptx]    PDF/PNG/PPTX into export/ (needs playwright, pptxgenjs)
 *   kadal-deck login [--host URL]         sign this machine in to a Kadal Deck host
 *   kadal-deck logout                     forget the saved token
 *   kadal-deck whoami                     who and which workspace the token is for
 *   kadal-deck publish [--slug s] [--workspace handle] [--title t]
 *
 * KADAL_DECK_TOKEN and KADAL_DECK_HOST (default https://deck.kadal.cc) override the saved
 * credentials, which is how CI publishes.
 */
import { readFile, rm } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

import { clearCredentials, hostFrom, loadCredentials, request, saveCredentials } from "./host.ts";
import { login } from "./login.ts";
import { formatBytes, publish, slugFrom, titleFrom } from "./publish.ts";
import { runVite } from "./vite.ts";

export const HELP = `kadal-deck <command>

  dev        run the deck locally with live reload
  build      build the deck into dist/ (any static host can serve it)
  export     PDF (and --png, --pptx) into export/
  login      sign in to a Kadal Deck host (opens the browser)
  logout     forget the saved token on this machine
  whoami     show the signed-in account and workspace
  publish    build and publish the deck; prints its URL
             --slug <slug>  --workspace <handle>  --title <title>  --host <url>

Docs: https://deck.kadal.cc/docs/`;

interface Me {
  user: { email?: string; name?: string };
  current: { handle: string; name?: string; plan?: string } | null;
}

export async function main(argv: string[], cwd: string = process.cwd()): Promise<number> {
  const [command, ...rest] = argv;
  const flag = (name: string) => {
    const i = rest.indexOf(name);
    return i >= 0 ? rest[i + 1] : undefined;
  };
  const out = (line: string) => console.log(line);

  switch (command) {
    case "dev":
      await runVite(cwd, rest);
      return 0;
    case "build":
      await runVite(cwd, ["build", ...rest]);
      return 0;
    case "export": {
      const { runExport } = await import("../export/run.ts");
      await runExport(rest, cwd);
      return 0;
    }
    case "login": {
      const creds = await login({ host: hostFrom(process.env, flag("--host")), log: out });
      const path = await saveCredentials(creds);
      out(`Signed in${creds.workspace ? ` to @${creds.workspace}` : ""}. Token saved to ${path}`);
      return 0;
    }
    case "logout":
      out(
        (await clearCredentials())
          ? "Signed out on this machine. Revoke the token in the dashboard (Tokens) if it may have leaked."
          : "Not signed in.",
      );
      return 0;
    case "whoami": {
      const creds = await loadCredentials();
      if (!creds) {
        out("Not signed in. Run `kadal-deck login`.");
        return 1;
      }
      const { data } = await request<Me>(creds.host, "/me", { token: creds.token });
      out(`${data.user.name ?? ""} <${data.user.email ?? "?"}> on ${creds.host}`.trim());
      if (data.current)
        out(`workspace @${data.current.handle}${data.current.plan ? ` · ${data.current.plan} plan` : ""}`);
      return 0;
    }
    case "publish":
      return publishCommand(cwd, flag, out);
    case undefined:
    case "help":
    case "--help":
    case "-h":
      out(HELP);
      return 0;
    case "--version":
    case "-v": {
      const url = new URL("../../package.json", import.meta.url);
      out((JSON.parse(await readFile(url, "utf8")) as { version: string }).version);
      return 0;
    }
    default:
      out(`Unknown command: ${command}\n\n${HELP}`);
      return 1;
  }
}

async function publishCommand(
  cwd: string,
  flag: (name: string) => string | undefined,
  out: (line: string) => void,
): Promise<number> {
  const creds = await loadCredentials();
  if (!creds) {
    out("Not signed in. Run `kadal-deck login`, or set KADAL_DECK_TOKEN.");
    return 1;
  }
  const host = flag("--host") ? hostFrom(process.env, flag("--host")) : creds.host;
  let workspace = flag("--workspace") ?? creds.workspace;
  if (!workspace) {
    const { data } = await request<Me>(host, "/me", { token: creds.token });
    workspace = data.current?.handle;
    if (!workspace) throw new Error("This account has no workspace yet; open the dashboard once.");
  }
  const slug = flag("--slug") ?? slugFrom(basename(cwd));
  let title = flag("--title");
  if (!title) title = titleFrom(await readFile(join(cwd, "deck.mdx"), "utf8").catch(() => ""));
  const outDir = resolve(cwd, ".kadal-deck", "publish");
  out(`publish  @${workspace}/${slug} → ${host}`);
  const result = await publish({
    host,
    token: creds.token,
    workspace,
    slug,
    title,
    outDir,
    log: out,
    build: async (base, dir) => {
      await rm(dir, { recursive: true, force: true });
      await runVite(cwd, ["build", "--base", base, "--outDir", dir, "--emptyOutDir"]);
    },
  });
  out(
    `\nPublished version ${result.version}: ${result.files} files (${formatBytes(result.bytes)}), ${result.uploaded} uploaded.`,
  );
  out(result.url);
  return 0;
}
