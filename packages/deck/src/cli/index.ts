/**
 * kadal-deck — the command line for a Kadal Deck folder (bin: ./bin.ts).
 *
 *   kadal-deck new <dir>                  a deck from the starter, no questions asked
 *   kadal-deck new --theme <name> [dir]   a theme package, ready to publish (--addon: an addon)
 *   kadal-deck theme eject [--dir theme]  copy the deck's theme into the deck, to change it
 *   kadal-deck import slidev <slides.md>  a Kadal deck from a Slidev one, with a report of the rest
 *   kadal-deck dev [vite flags]           the deck with live reload (vite)
 *   kadal-deck build [vite flags]         dist/ for any static host (vite build); --without-notes
 *   kadal-deck check                      lint the deck (frontmatter, MDX, components, assets…)
 *   kadal-deck info [topic]               the catalog: components, layouts, backgrounds, keys…
 *   kadal-deck screenshot                 PNGs of slides (headless Chromium)
 *   kadal-deck export [--format …]        PDF/PNG/PPTX/editable PPTX/Markdown into export/ (Playwright)
 *   kadal-deck login [--host URL]         sign this machine in to a Kadal Deck host
 *   kadal-deck logout                     forget the saved token
 *   kadal-deck whoami                     who and which workspace the token is for
 *   kadal-deck publish [--slug s] [--workspace handle] [--title t]
 *   kadal-deck narrate [--voice v]        bake the notes as speech (Kokoro) into public/narration/
 *   kadal-deck mcp                        a Model Context Protocol server on stdio, for AI agents
 *
 * Every command but dev, build and mcp takes --json: one JSON object on stdout, everything else
 * on stderr. Exit codes: 0 ok · 1 failed · 2 usage · 3 not signed in · 4 missing prerequisite.
 * KADAL_DECK_TOKEN and KADAL_DECK_HOST (default https://deck.kadal.cc) override the saved
 * credentials, which is how CI publishes.
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

import { type FlagSpecs, UsageError, bool, num, parseArgs, str } from "./args.ts";
import {
  HostError,
  clearCredentials,
  credentialsPath,
  hostFrom,
  loadCredentials,
  request,
  saveCredentials,
} from "./host.ts";
import { NoDeckError } from "./project.ts";
import { MissingDependencyError, keepStdoutClean, runVite } from "./vite.ts";

export const EXIT = { ok: 0, failed: 1, usage: 2, auth: 3, missing: 4 } as const;

export const HELP = `kadal-deck <command> [options]

  new <dir>   create a deck from the starter      --title <t> --yes --no-install --pm <npm|pnpm|yarn|bun>
              --theme <name> [dir]  a theme package instead (kadal-theme-<name>)   --addon <name>  an addon
  theme       theme eject [--dir ./theme] [--force]  copy the deck's theme (or a built-in) into the
              deck and point the headmatter at it   (-C <deck> for a deck elsewhere)
  import      import slidev <slides.md | folder>  convert a Slidev deck into a new Kadal deck folder,
              with IMPORT-REPORT.md for what did not carry over, then check it
              --out <dir> (default <folder>-kadal)  --force (write into a folder that is not empty)
              --install [--pm npm|pnpm|yarn|bun]  install its packages afterwards
  dev         run the deck locally with live reload (Vite flags pass through)
              --host  reachable on your network (the phone remote)   --https  self-signed, for motion sensors
  build       build the deck into dist/ (any static host can serve it)
              --without-notes  leave the speaker notes out of the build
              --download  also print it to dist/deck.pdf for the deck's Download button
              (\`download: true\` in the deck does the same; --no-download skips it)
  check       lint the deck: frontmatter, layouts, backgrounds, MDX, components, assets, glossary
              --no-compile  skip compiling each slide's MDX
  info        the reference: info [components|layouts|backgrounds|themes|transitions|clicks|code|
              deck|slide|keys|routes|live|cli|exit] [name]   --search <words>   --markdown
  screenshot  PNGs of slides into screenshots/   --slide <N|all> --out <dir> --theme <t>
              --scheme <light|dark> --width <px> --url <deck url> --dev
  export      PDF (and --png, --pptx) into export/   --out <dir> --scale <n> --url <deck url> --no-pdf
              --format pdf,png,pptx,pptx-editable,md   or the switches --pptx-editable --md
              --range 1,3-5   --dark / --scheme light|dark   --with-clicks / --no-with-clicks
              --omit-background (transparent)   --no-with-toc (no PDF bookmarks)   --per-slide
              --output <name>   --timeout <ms> --wait <ms> --wait-until networkidle|load|domcontentloaded|none
              --executable-path <chrome>   --port <n> (the local preview server)
              --vector-pdf (print with the browser alone: all vector, effects vary by viewer)
  login       sign in to a Kadal Deck host (opens the browser)   --host <url>
  logout      forget the saved token on this machine
  whoami      show the signed-in account and workspace
  publish     build and publish the deck; prints its URL
              --slug <slug>  --workspace <handle>  --title <title>  --host <url>
              --no-thumbnail  skip the picture of slide 1 the host shows in its lists
              --without-notes  publish without the speaker notes
  narrate     bake the narration: every notes segment spoken by Kokoro into public/narration/
              --voice <id> (default af_heart)  --dtype <fp32|fp16|q8|q4|q4f16>  --force (redo all)
              --setup  install kokoro-js into the deck first (an optional, ~400 MB dependency)
  mcp         serve the Model Context Protocol on stdio, for AI agents (Claude, Cursor, VS Code…)
              --allow-outside  let tools read and write outside --dir (off by default)

Global: --dir <path> (-C) runs in another folder · --json prints one JSON object on stdout ·
--help · --version.  Exit codes: 0 ok, 1 failed, 2 usage, 3 not signed in, 4 missing prerequisite.

Docs: https://deck.kadal.cc/docs/`;

interface Me {
  user: { email?: string; name?: string };
  current: { handle: string; name?: string; plan?: string } | null;
}

const GLOBAL: FlagSpecs = {
  json: { kind: "boolean" },
  dir: { kind: "string", short: "C" },
  help: { kind: "boolean", short: "h" },
};

const COMMAND_FLAGS: Record<string, FlagSpecs> = {
  new: {
    title: { kind: "string" },
    theme: { kind: "string" },
    addon: { kind: "string" },
    yes: { kind: "boolean", short: "y" },
    install: { kind: "boolean" },
    pm: { kind: "string" },
  },
  check: { compile: { kind: "boolean" } },
  info: { search: { kind: "string" }, markdown: { kind: "boolean" } },
  screenshot: {
    slide: { kind: "string", multiple: true },
    out: { kind: "string" },
    theme: { kind: "string" },
    scheme: { kind: "string" },
    width: { kind: "number" },
    url: { kind: "string" },
    dev: { kind: "boolean" },
  },
  login: { host: { kind: "string" } },
  logout: {},
  whoami: {},
  publish: {
    slug: { kind: "string" },
    workspace: { kind: "string" },
    title: { kind: "string" },
    host: { kind: "string" },
    thumbnail: { kind: "boolean" },
    "without-notes": { kind: "boolean" },
  },
  mcp: { "allow-outside": { kind: "boolean" } },
  // Mirrors IMPORT_FLAGS in import.ts, which is imported only when the command runs.
  import: {
    out: { kind: "string", short: "o" },
    force: { kind: "boolean" },
    install: { kind: "boolean" },
    pm: { kind: "string" },
  },
  // Mirrors NARRATE_FLAGS in narrate.ts, which is imported only when the command runs.
  narrate: {
    voice: { kind: "string" },
    dtype: { kind: "string" },
    force: { kind: "boolean" },
    setup: { kind: "boolean" },
  },
};

/** Global options may come before the command (`kadal-deck -C talk check`); move them after it. */
function commandFirst(argv: string[]): string[] {
  const lead: string[] = [];
  let i = 0;
  while (i < argv.length) {
    const a = argv[i]!;
    const takesValue = (a === "--dir" || a === "-C") && argv[i + 1] !== undefined;
    if (!takesValue && a !== "--json" && !a.startsWith("--dir=") && !a.startsWith("--json=")) break;
    const n = takesValue ? 2 : 1;
    lead.push(...argv.slice(i, i + n));
    i += n;
  }
  return lead.length && i < argv.length ? [argv[i]!, ...lead, ...argv.slice(i + 1)] : argv;
}

export async function main(argv: string[], cwd: string = process.cwd()): Promise<number> {
  const [command, ...rest] = commandFirst(argv);
  const json = rest.includes("--json") || rest.includes("--json=true");
  if (json) keepStdoutClean();
  // In JSON mode people-facing lines go to stderr; stdout carries exactly one JSON document.
  const say = (line: string) => (json ? console.error(line) : console.log(line));
  const emit = (data: unknown) => console.log(JSON.stringify(data, null, 2));

  try {
    return await run(command, rest, cwd, { json, say, emit });
  } catch (e) {
    const code =
      e instanceof UsageError || (e as Error)?.name === "TargetNotEmptyError"
        ? EXIT.usage
        : e instanceof MissingDependencyError ||
            e instanceof NoDeckError ||
            (e as Error)?.name === "PackageResolveError"
          ? EXIT.missing
          : e instanceof HostError && e.status === 401
            ? EXIT.auth
            : EXIT.failed;
    // oxlint-disable-next-line no-control-regex -- colour codes from Playwright and Vite
    const message = (e instanceof Error ? e.message : String(e)).replace(/\u001b\[[0-9;]*m/g, "");
    if (json)
      emit({
        ok: false,
        error: {
          code:
            e instanceof HostError
              ? e.code
              : code === EXIT.usage
                ? "usage"
                : code === EXIT.missing
                  ? "missing_prerequisite"
                  : code === EXIT.auth
                    ? "unauthorized"
                    : "failed",
          message,
          exitCode: code,
        },
      });
    else
      console.error(
        `error: ${message}${code === EXIT.usage ? "\n\nRun `kadal-deck help` for usage." : ""}`,
      );
    return code;
  }
}

export interface Io {
  json: boolean;
  say: (line: string) => void;
  emit: (data: unknown) => void;
}

async function run(
  command: string | undefined,
  rest: string[],
  cwd: string,
  io: Io,
): Promise<number> {
  const { json, say, emit } = io;
  switch (command) {
    case "dev":
    case "build": {
      // Vite's own flags pass straight through; only --dir is ours.
      const {
        flags,
        rest: vite,
        positionals,
      } = parseArgs(
        rest,
        command === "build"
          ? { dir: GLOBAL.dir!, download: { kind: "boolean" }, port: { kind: "number" } }
          : { dir: GLOBAL.dir! },
        { passthrough: true },
      );
      const dir = resolve(cwd, str(flags.dir) ?? ".");
      // `dev --https`: Vite dropped its own flag, so the deck's plugin makes a certificate
      // (vite/https.ts) — a phone remote needs a secure context for its motion sensors.
      const https = command === "dev" && vite.includes("--https");
      if (https) process.env.KADAL_DECK_HTTPS = "1";
      // `build --without-notes`: the deck's plugin reads this and builds no notes (vite/index.ts).
      if (command === "build" && vite.includes("--without-notes"))
        process.env.KADAL_DECK_WITHOUT_NOTES = "1";
      const passed = vite.filter((a) => a !== "--https" && a !== "--without-notes");
      await runVite(
        dir,
        command === "build" ? ["build", ...positionals, ...passed] : [...positionals, ...passed],
      );
      // `--download` (or `download: true` in the deck): the PDF its Download button offers.
      if (command === "build" && flags.download !== false) {
        const { buildDownload, deckWantsDownload, outDirOf } = await import("./download.ts");
        if (flags.download === true || (await deckWantsDownload(dir))) {
          const port = num(flags.port);
          await buildDownload(dir, { outDir: outDirOf(passed), ...(port ? { port } : {}), say });
        }
      }
      return EXIT.ok;
    }
    case undefined:
    case "help":
    case "--help":
    case "-h":
      say(HELP);
      return EXIT.ok;
    case "--version":
    case "-v":
    case "version": {
      const version = await ownVersion();
      if (json) emit({ ok: true, version });
      else say(version);
      return EXIT.ok;
    }
    case "theme":
      return themeCommand(rest, cwd, io);
    case "export": {
      const { EXPORT_FLAGS, joinSwitchValues, runExport } = await import("../export/run.ts");
      const { flags } = parseArgs(joinSwitchValues(rest), { ...GLOBAL, ...EXPORT_FLAGS });
      if (flags.help) {
        say(HELP);
        return EXIT.ok;
      }
      const dir = resolve(cwd, str(flags.dir) ?? ".");
      const result = await runExport(rest, dir, say);
      if (json)
        emit({
          ok: true,
          pages: result.pages,
          outDir: result.outDir,
          files: result.files,
          posters: result.posters,
          ...(result.outline !== undefined ? { outline: result.outline } : {}),
          ...(result.editable ? { editable: result.editable } : {}),
        });
      return EXIT.ok;
    }
  }

  const specs = COMMAND_FLAGS[command];
  if (!specs) throw new UsageError(`Unknown command: ${command}`);
  const { flags, positionals } = parseArgs(rest, { ...GLOBAL, ...specs });
  if (flags.help) {
    say(HELP);
    return EXIT.ok;
  }
  const dir = resolve(cwd, str(flags.dir) ?? ".");

  switch (command) {
    case "new": {
      const pm = str(flags.pm);
      if (pm && !["npm", "pnpm", "yarn", "bun"].includes(pm))
        throw new UsageError(`--pm must be npm, pnpm, yarn or bun`);
      const kind = flags.theme !== undefined ? "theme" : flags.addon !== undefined ? "addon" : null;
      if (kind) {
        if (flags.theme !== undefined && flags.addon !== undefined)
          throw new UsageError("--theme or --addon, not both");
        const raw = str(flags[kind]);
        if (!raw) throw new UsageError(`--${kind} needs a name: kadal-deck new --${kind} <name>`);
        const { newPackage } = await import("./new.ts");
        const result = await newPackage(
          kind,
          raw,
          positionals[0] ? resolve(cwd, positionals[0]) : null,
          cwd,
          {
            title: str(flags.title),
            install: flags.install === true,
            pm: pm as never,
            stdio: json ? "stderr" : "inherit",
          },
        );
        if (json) emit({ ok: true, kind, ...result });
        else
          say(
            `\nYour ${kind} is in ${result.dir}. Next:\n\n  ${result.next.join("\n  ")}\n\nDocs: https://deck.kadal.cc/docs/`,
          );
        return EXIT.ok;
      }
      const target = positionals[0];
      if (!target) throw new UsageError("Where should the deck go? kadal-deck new <dir>");
      const { newDeck } = await import("./new.ts");
      const result = await newDeck(resolve(cwd, target), {
        title: str(flags.title),
        install: flags.install !== false,
        pm: pm as never,
        stdio: json ? "stderr" : "inherit",
      });
      if (json) emit({ ok: true, ...result });
      else
        say(
          `\nYour deck is in ${result.dir}. Next:\n\n  ${result.next.join("\n  ")}\n\nDocs: https://deck.kadal.cc/docs/`,
        );
      return EXIT.ok;
    }
    case "check": {
      const { openProject, checkProject, rel } = await import("./project.ts");
      const { formatDiagnostics } = await import("../authoring/index.ts");
      const project = openProject(dir);
      const result = await checkProject(project, { compile: flags.compile !== false });
      if (json)
        emit({
          ...result,
          diagnostics: result.diagnostics.map((d) => ({ ...d, file: rel(project, d.file) })),
        });
      else say(formatDiagnostics(result, (f) => rel(project, f)));
      return result.ok ? EXIT.ok : EXIT.failed;
    }
    case "narrate": {
      const { narrate, setupKokoro } = await import("./narrate.ts");
      if (flags.setup) {
        const { packageManager } = await setupKokoro(dir, json);
        if (json) emit({ ok: true, setup: true, packageManager });
        else say(`kokoro-js is installed. Now: kadal-deck narrate`);
        return EXIT.ok;
      }
      const result = await narrate(
        dir,
        { voice: str(flags.voice), dtype: str(flags.dtype), force: flags.force === true },
        say,
      );
      if (json) emit({ ok: true, ...result });
      else
        say(
          `${result.made} made, ${result.skipped} already there (${result.segments} segments, ${result.voice}, ${result.format}). Index: ${result.index}`,
        );
      return EXIT.ok;
    }
    case "info":
      return info(positionals, { ...flags, dir }, io);
    case "screenshot":
      return screenshot(dir, flags, io);
    case "login": {
      const { login } = await import("./login.ts");
      const creds = await login({ host: hostFrom(process.env, str(flags.host)), log: say });
      const path = await saveCredentials(creds);
      if (json)
        emit({ ok: true, host: creds.host, workspace: creds.workspace ?? null, credentials: path });
      else
        say(`Signed in${creds.workspace ? ` to @${creds.workspace}` : ""}. Token saved to ${path}`);
      return EXIT.ok;
    }
    case "logout": {
      const had = await clearCredentials();
      if (json) emit({ ok: true, signedOut: had });
      else
        say(
          had
            ? "Signed out on this machine. Revoke the token in the dashboard (Tokens) if it may have leaked."
            : "Not signed in.",
        );
      return EXIT.ok;
    }
    case "whoami": {
      const creds = await loadCredentials();
      if (!creds) {
        if (json)
          emit({
            ok: false,
            signedIn: false,
            credentials: credentialsPath(),
            error: { code: "unauthorized", message: "Not signed in. Run `kadal-deck login`." },
          });
        else say("Not signed in. Run `kadal-deck login`.");
        return EXIT.auth;
      }
      const { data } = await request<Me>(creds.host, "/me", { token: creds.token });
      if (json)
        emit({
          ok: true,
          signedIn: true,
          host: creds.host,
          user: data.user,
          workspace: data.current,
          fromEnv: !!process.env.KADAL_DECK_TOKEN,
        });
      else {
        say(`${data.user.name ?? ""} <${data.user.email ?? "?"}> on ${creds.host}`.trim());
        if (data.current)
          say(
            `workspace @${data.current.handle}${data.current.plan ? ` · ${data.current.plan} plan` : ""}`,
          );
      }
      return EXIT.ok;
    }
    case "publish":
      return publishCommand(dir, flags, io);
    case "import": {
      const { importCommand } = await import("./import.ts");
      return importCommand(positionals, flags, cwd, io);
    }
    case "mcp": {
      const { serveStdio } = await import("../mcp/index.ts");
      await serveStdio({ dir, allowOutside: flags["allow-outside"] === true });
      return EXIT.ok;
    }
  }
  throw new UsageError(`Unknown command: ${command}`);
}

async function ownVersion(): Promise<string> {
  const url = new URL("../../package.json", import.meta.url);
  return (JSON.parse(await readFile(url, "utf8")) as { version: string }).version;
}

async function info(
  positionals: string[],
  flags: Record<string, unknown>,
  { json, say, emit }: Io,
): Promise<number> {
  const cat = await import("../catalog/index.ts");
  const search = str(flags.search);
  if (search) {
    const hits = cat.searchCatalog(search, 25);
    if (json) emit({ ok: true, query: search, hits });
    else if (!hits.length) say(`Nothing in the catalog matches "${search}".`);
    else for (const h of hits) say(`${h.section.padEnd(17)} ${h.name.padEnd(22)} ${h.summary}`);
    return EXIT.ok;
  }
  const [topic, name] = positionals;
  if (!topic) {
    if (json)
      emit({
        ok: true,
        version: cat.catalog.version,
        sections: cat.CATALOG_SECTIONS.map((s) => ({
          name: s,
          entries: (cat.catalog[s] as unknown[]).length,
        })),
      });
    else {
      say(`Kadal Deck ${cat.catalog.version} — kadal-deck info <topic> [name]\n`);
      for (const s of cat.CATALOG_SECTIONS)
        say(`  ${s.padEnd(18)} ${(cat.catalog[s] as unknown[]).length} entries`);
      say("\nAlso: --search <words>, --json for the data, --markdown for the long form.");
    }
    return EXIT.ok;
  }
  const section = cat.resolveSection(topic);
  if (!section)
    throw new UsageError(`No catalog section "${topic}". Try: ${cat.CATALOG_SECTIONS.join(", ")}`);
  if (name) {
    const entry = cat.findEntry(section, name);
    if (!entry) {
      if (json)
        emit({
          ok: false,
          error: { code: "not_found", message: `No ${section} entry "${name}".` },
        });
      else say(`No ${section} entry "${name}". kadal-deck info ${topic} lists them.`);
      return EXIT.failed;
    }
    if (json) emit({ ok: true, section, entry });
    else say(cat.sectionMarkdown({ ...cat.catalog, [section]: [entry] }, section));
    return EXIT.ok;
  }
  if (section === "themes") return infoThemes(cat, flags, { json, say, emit });
  if (json) emit({ ok: true, section, entries: cat.catalog[section] });
  else if (
    bool(flags.markdown) ||
    !["components", "deckFrontmatter", "slideFrontmatter"].includes(section)
  )
    say(cat.sectionMarkdown(cat.catalog, section));
  else {
    // The long sections get one line each; `info <section> <name>` shows the details.
    for (const item of cat.catalog[section] as Array<{
      name: string;
      summary?: string;
      description?: string;
      category?: string;
    }>)
      say(
        `  ${item.name.padEnd(24)} ${item.category ? `${item.category.padEnd(11)} ` : ""}${item.summary ?? item.description ?? ""}`,
      );
    say(`\nkadal-deck info ${topic} <name> for one in full; --markdown for all of them.`);
  }
  return EXIT.ok;
}

/**
 * `info themes`: the engine's themes, then every theme and addon package the deck in --dir can
 * see (its node_modules and above), with their layouts — what `theme:` and `addons:` can name.
 */
async function infoThemes(
  cat: typeof import("../catalog/index.ts"),
  flags: Record<string, unknown>,
  { json, say, emit }: Io,
): Promise<number> {
  const { listInstalledPackages } = await import("../theming/resolve.ts");
  const dir = resolve(str(flags.dir) ?? ".");
  const installed = listInstalledPackages(dir).map((p) => ({
    kind: p.kind,
    name: p.name,
    package: p.package,
    title: p.meta.title ?? null,
    description: p.meta.description ?? null,
    layouts: p.meta.layouts ?? [],
    components: p.meta.components ?? [],
    colorScheme: "colorScheme" in p.meta ? p.meta.colorScheme : null,
    root: p.root,
  }));
  if (json) {
    emit({ ok: true, section: "themes", entries: cat.catalog.themes, installed });
    return EXIT.ok;
  }
  say(cat.sectionMarkdown(cat.catalog, "themes"));
  const themes = installed.filter((p) => p.kind === "theme");
  const addons = installed.filter((p) => p.kind === "addon");
  say(`\nInstalled where ${dir} can see them:`);
  if (!installed.length)
    say(
      "  none — npm install a kadal-theme-* or @kadal/theme-* package, or `kadal-deck new --theme <name>`",
    );
  for (const p of themes)
    say(
      `  theme  ${p.name.padEnd(16)} ${(p.package ?? "").padEnd(28)} ${p.layouts.length ? `layouts: ${p.layouts.join(", ")}` : ""}`,
    );
  for (const p of addons)
    say(
      `  addon  ${p.name.padEnd(16)} ${(p.package ?? "").padEnd(28)} ${[...p.components, ...p.layouts.map((l) => `layout:${l}`)].join(", ")}`,
    );
  return EXIT.ok;
}

/** `kadal-deck theme eject [--dir ./theme] [--force]`; `-C <deck>` points at the deck. */
async function themeCommand(rest: string[], cwd: string, { json, say, emit }: Io): Promise<number> {
  const { flags, positionals } = parseArgs(rest, {
    json: { kind: "boolean" },
    help: { kind: "boolean", short: "h" },
    deck: { kind: "string", short: "C" },
    dir: { kind: "string" },
    force: { kind: "boolean" },
    theme: { kind: "string" },
  });
  const sub = positionals[0];
  if (flags.help || !sub) {
    say(HELP);
    return flags.help ? EXIT.ok : EXIT.usage;
  }
  if (sub !== "eject")
    throw new UsageError(`Unknown theme command "${sub}". Try: kadal-deck theme eject`);
  const { ejectTheme } = await import("../theming/eject.ts");
  const result = ejectTheme(resolve(cwd, str(flags.deck) ?? "."), {
    dir: str(flags.dir),
    force: flags.force === true,
    theme: str(flags.theme),
  });
  if (json) emit({ ok: true, ...result });
  else {
    say(
      `Theme "${result.name}" ejected to ${result.dir}; the headmatter now says theme: ${result.to}`,
    );
    for (const line of result.removedImports)
      say(`removed from src/main.tsx: ${line} (the copy styles .theme-${result.name} now)`);
    if (result.dependencies.length)
      say(`its module imports ${result.dependencies.join(", ")}: keep them installed in the deck.`);
  }
  return EXIT.ok;
}

async function screenshot(
  dir: string,
  flags: Record<string, unknown>,
  { json, say, emit }: Io,
): Promise<number> {
  const { openProject } = await import("./project.ts");
  const { DeckServer, SlideRenderer } = await import("./render.ts");
  const { outlineDeck } = await import("../authoring/index.ts");
  const project = openProject(dir);
  const scheme = str(flags.scheme);
  if (scheme && scheme !== "light" && scheme !== "dark")
    throw new UsageError("--scheme must be light or dark");
  const outline = outlineDeck(project.files);
  const wanted = (flags.slide as string[] | undefined) ?? ["all"];
  let slides: number[] | undefined;
  if (!wanted.includes("all")) {
    slides = wanted
      .flatMap((w) => w.split(","))
      .map((w) => {
        const s = outline.slides.find((x) => String(x.index) === w.trim() || x.id === w.trim());
        if (!s) throw new UsageError(`No slide "${w}" (0–${outline.slides.length - 1}, or an id)`);
        return s.index;
      });
  }
  const out = resolve(dir, str(flags.out) ?? "screenshots");
  const url = str(flags.url);
  let server: Awaited<ReturnType<typeof DeckServer.start>> | null = null;
  if (!url) {
    say(flags.dev ? "serve  vite dev" : "build  vite build + preview");
    server = await DeckServer.start(dir, flags.dev ? "dev" : "preview");
  }
  const renderer = new SlideRenderer(dir, () => url ?? server!.url);
  try {
    const result = await renderer.render({
      slides,
      scheme: scheme as "light" | "dark" | undefined,
      theme: str(flags.theme),
      width: num(flags.width),
    });
    await mkdir(out, { recursive: true });
    const files: Array<{ slide: number; path: string; width: number; height: number }> = [];
    for (const s of result.shots) {
      const path = join(out, `slide-${String(s.index).padStart(3, "0")}.png`);
      await writeFile(path, s.png);
      files.push({ slide: s.index, path, width: s.width, height: s.height });
      if (!json) say(`png    ${path}`);
    }
    if (json)
      emit({
        ok: result.errors.length === 0,
        files,
        missing: result.missing,
        errors: result.errors,
      });
    else {
      for (const m of result.missing) say(`skip   slide ${m} (hidden or not in the deck)`);
      for (const e of result.errors) say(`error  ${e}`);
      say(`\n${files.length} screenshot(s) in ${out}`);
    }
    return result.errors.some((e) => /failed to load/.test(e)) ? EXIT.failed : EXIT.ok;
  } finally {
    await renderer.close();
    server?.stop();
  }
}

export async function publishCommand(
  dir: string,
  flags: Record<string, unknown>,
  { json, say, emit }: Io,
): Promise<number> {
  const creds = await loadCredentials();
  if (!creds) {
    const message = "Not signed in. Run `kadal-deck login`, or set KADAL_DECK_TOKEN.";
    if (json) emit({ ok: false, error: { code: "unauthorized", message, exitCode: EXIT.auth } });
    else say(message);
    return EXIT.auth;
  }
  const { formatBytes, publish, slugFrom, titleFrom } = await import("./publish.ts");
  const hostFlag = str(flags.host);
  const host = hostFlag ? hostFrom(process.env, hostFlag) : creds.host;
  let workspace = str(flags.workspace) ?? creds.workspace;
  if (!workspace) {
    const { data } = await request<Me>(host, "/me", { token: creds.token });
    workspace = data.current?.handle;
    if (!workspace) throw new Error("This account has no workspace yet; open the dashboard once.");
  }
  const slug = str(flags.slug) ?? slugFrom(basename(dir));
  let title = str(flags.title);
  if (!title) title = titleFrom(await readFile(join(dir, "deck.mdx"), "utf8").catch(() => ""));
  const outDir = resolve(dir, ".kadal-deck", "publish");
  say(`publish  @${workspace}/${slug} → ${host}`);
  const result = await publish({
    host,
    token: creds.token,
    workspace,
    slug,
    title,
    outDir,
    log: say,
    build: async (base, out) => {
      await rm(out, { recursive: true, force: true });
      // `--without-notes`: the deck's plugin builds no notes (vite/index.ts reads this).
      if (flags["without-notes"] === true) process.env.KADAL_DECK_WITHOUT_NOTES = "1";
      await runVite(dir, ["build", "--base", base, "--outDir", out, "--emptyOutDir"]);
    },
  });
  // The picture the host lists the deck by. Never a reason for the publish to fail.
  let thumbnail = false;
  if (flags.thumbnail !== false) {
    const { publishThumbnail } = await import("./thumbnail.ts");
    const shot = await publishThumbnail({
      dir,
      outDir,
      base: result.deck.base,
      host,
      token: creds.token,
      deckId: result.deck.id,
      version: result.version,
    });
    thumbnail = shot.ok;
    if (!shot.ok && !json) say(`thumbnail skipped: ${shot.reason}`);
  }
  if (json)
    emit({
      ok: true,
      url: result.url,
      version: result.version,
      deck: result.deck,
      files: result.files,
      uploaded: result.uploaded,
      bytes: result.bytes,
      uploadedBytes: result.uploadedBytes,
      thumbnail,
    });
  else {
    say(
      `\nPublished version ${result.version}: ${result.files} files (${formatBytes(result.bytes)}), ${result.uploaded} uploaded.`,
    );
    say(result.url);
  }
  return EXIT.ok;
}
