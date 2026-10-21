import { spawn } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * `kadal-deck new <dir>`: a deck from the starter template, without questions — what
 * `npm create @kadal/deck` does, for scripts and agents. The template ships in this package
 * (template/, synced from examples/starter at build time); inside the repository the example
 * itself stands in.
 */

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

export interface NewOptions {
  title?: string;
  install?: boolean;
  pm?: PackageManager;
  /** Where install output goes (never our stdout when it is a protocol). */
  stdio?: "inherit" | "stderr" | "ignore";
}

export interface NewResult {
  dir: string;
  title: string;
  files: string[];
  installed: boolean;
  packageManager: PackageManager;
  next: string[];
}

function templateDir(): { dir: string; workspace: boolean } {
  const shipped = fileURLToPath(new URL("../../template", import.meta.url));
  if (existsSync(join(shipped, "deck.mdx"))) return { dir: shipped, workspace: false };
  const example = fileURLToPath(new URL("../../../../examples/starter", import.meta.url));
  if (existsSync(join(example, "deck.mdx"))) return { dir: example, workspace: true };
  throw new Error("The starter template is missing from this install of @kadal/deck.");
}

export function packageName(dir: string): string {
  const n = basename(dir)
    .toLowerCase()
    .replace(/[^a-z0-9-~._]+/g, "-")
    .replace(/^[-._]+|-+$/g, "");
  return n || "my-deck";
}

export function detectPackageManager(env: NodeJS.ProcessEnv = process.env): PackageManager {
  const ua = env.npm_config_user_agent ?? "";
  return ua.startsWith("pnpm")
    ? "pnpm"
    : ua.startsWith("yarn")
      ? "yarn"
      : ua.startsWith("bun")
        ? "bun"
        : "npm";
}

function titleFromDir(dir: string): string {
  const words = basename(dir)
    .replace(/[-_.]+/g, " ")
    .trim();
  return words ? words[0]!.toUpperCase() + words.slice(1) : "My deck";
}

const list = (dir: string, base = dir): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? list(join(dir, e.name), base) : [join(dir, e.name).slice(base.length + 1)],
  );

export class TargetNotEmptyError extends Error {
  override name = "TargetNotEmptyError";
}

export async function newDeck(target: string, options: NewOptions = {}): Promise<NewResult> {
  const dir = resolve(target);
  if (existsSync(dir) && readdirSync(dir).length > 0)
    throw new TargetNotEmptyError(`${dir} is not empty. Choose another directory.`);
  const template = templateDir();
  cpSync(template.dir, dir, {
    recursive: true,
    filter: (src) =>
      !/[\\/](node_modules|dist|export|screenshots|\.kadal-deck)([\\/]|$)/.test(
        src.slice(template.dir.length),
      ),
  });
  if (existsSync(join(dir, "_gitignore")))
    renameSync(join(dir, "_gitignore"), join(dir, ".gitignore"));

  const pkgPath = join(dir, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
    name: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  pkg.name = packageName(dir);
  if (template.workspace) {
    // Copied from the repository's example: point workspace ranges at this engine's version.
    const own = JSON.parse(
      readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
    ) as { version: string };
    for (const deps of [pkg.dependencies, pkg.devDependencies])
      for (const [n, r] of Object.entries(deps ?? {}))
        if (r.startsWith("workspace:")) deps![n] = `^${own.version}`;
  }
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

  const title = options.title?.trim() || titleFromDir(dir);
  const deckPath = join(dir, "deck.mdx");
  const deck = readFileSync(deckPath, "utf8")
    .replace(/^title:.*$/m, `title: ${JSON.stringify(title)}`)
    .replace(/^# .*$/m, `# ${title.replace(/[{}<>]/g, "")}`);
  writeFileSync(deckPath, deck);

  const pm = options.pm ?? detectPackageManager();
  let installed = false;
  if (options.install !== false) {
    await new Promise<void>((ok, fail) => {
      const stdio =
        options.stdio === "ignore"
          ? "ignore"
          : options.stdio === "stderr"
            ? (["ignore", process.stderr, process.stderr] as const)
            : "inherit";
      const child = spawn(pm, ["install"], {
        cwd: dir,
        stdio: stdio as never,
        shell: process.platform === "win32",
      });
      child.on("error", fail);
      child.on("exit", (code) =>
        code === 0 ? ok() : fail(new Error(`${pm} install failed (exit ${code})`)),
      );
    });
    installed = true;
  }
  const run = pm === "npm" ? "npm run" : pm;
  const x = pm === "npm" ? "npx" : pm === "bun" ? "bunx" : `${pm} exec`;
  return {
    dir,
    title,
    files: list(dir)
      .filter((f) => !f.startsWith("node_modules"))
      .sort(),
    installed,
    packageManager: pm,
    next: [
      `cd ${dir}`,
      ...(installed ? [] : [`${pm} install`]),
      `${run} dev`,
      `${x} kadal-deck check`,
      `${x} kadal-deck publish`,
    ],
  };
}

/**
 * `kadal-deck new --theme <name> [dir]` (or `--addon`): a theme or addon package from the
 * scaffold (theming/scaffold.ts) — package.json per the contract, a stylesheet with every token
 * and layout class, a layout, a layer, a README and a preview deck. Installs only when asked
 * (`--install`): a package is often made inside a workspace that installs for it.
 */
export async function newPackage(
  kind: "theme" | "addon",
  rawName: string,
  target: string | null,
  cwd: string,
  options: NewOptions = {},
): Promise<NewResult & { name: string; package: string }> {
  const { addonScaffold, scaffoldName, scaffoldTitle, themeScaffold } =
    await import("../theming/scaffold.ts");
  const name = scaffoldName(rawName);
  if (!name)
    throw new Error(`"${rawName}" has nothing a package name can use; try letters and dashes.`);
  const pkgName = `kadal-${kind}-${name}`;
  const dir = resolve(target ?? join(cwd, pkgName));
  if (existsSync(dir) && readdirSync(dir).length > 0)
    throw new TargetNotEmptyError(`${dir} is not empty. Choose another directory.`);
  const own = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
    version: string;
  };
  const opts = {
    name,
    title: options.title?.trim() || scaffoldTitle(name),
    deckRange: `^${own.version}`,
  };
  const files = kind === "theme" ? themeScaffold(opts) : addonScaffold(opts);
  for (const [rel, text] of Object.entries(files)) {
    const file = join(dir, rel === "_gitignore" ? ".gitignore" : rel);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  const pm = options.pm ?? detectPackageManager();
  let installed = false;
  if (options.install === true) {
    await install(pm, dir, options.stdio);
    installed = true;
  }
  const run = pm === "npm" ? "npm run" : pm;
  return {
    dir,
    name,
    package: pkgName,
    title: opts.title,
    files: list(dir).sort(),
    installed,
    packageManager: pm,
    next: [
      `cd ${dir}`,
      ...(installed ? [] : [`${pm} install`]),
      `${run} dev                 the preview deck, live`,
      `${kind === "theme" ? "edit style.css, layouts.tsx" : "edit index.tsx, style.css"}`,
      `npm publish             keep the kadal-${kind} keyword`,
    ],
  };
}

function install(pm: PackageManager, dir: string, where: NewOptions["stdio"]): Promise<void> {
  return new Promise<void>((ok, fail) => {
    const stdio =
      where === "ignore"
        ? "ignore"
        : where === "stderr"
          ? (["ignore", process.stderr, process.stderr] as const)
          : "inherit";
    const child = spawn(pm, ["install"], {
      cwd: dir,
      stdio: stdio as never,
      shell: process.platform === "win32",
    });
    child.on("error", fail);
    child.on("exit", (code) =>
      code === 0 ? ok() : fail(new Error(`${pm} install failed (exit ${code})`)),
    );
  });
}
