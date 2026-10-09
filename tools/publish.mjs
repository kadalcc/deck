#!/usr/bin/env node
/**
 * Publishes every package whose current version isn't on npm yet (what `changeset publish` did),
 * in one of three modes, from NPM_PUBLISH_MODE:
 *
 *   direct (default)  `npm publish` — in CI this authenticates through npm trusted publishing
 *   stage             `npm stage publish` — each version waits on npmjs.com (Staged Packages)
 *                     until a maintainer approves it with 2FA
 *   bootstrap         `npm stage publish` only for packages npm has never seen, with an ordinary
 *                     token. Staging creates the package (as a `0.0.0-stage` placeholder), which
 *                     is what a trusted publisher needs before it can be added; reject the staged
 *                     version, add the trusted publisher, then publish directly.
 *
 * Prints `New tag: <name>@<version>` for each one, which changesets/action turns into git tags and
 * GitHub releases. Run after `bun run build`.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const mode = process.env.NPM_PUBLISH_MODE || "direct";
if (!["direct", "stage", "bootstrap"].includes(mode))
  throw new Error(`NPM_PUBLISH_MODE must be direct, stage or bootstrap, not ${mode}`);

const onNpm = (name, version) => {
  try {
    return (
      execFileSync("npm", ["view", `${name}@${version}`, "version"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim() === version
    );
  } catch {
    return false; // 404: the package or this version doesn't exist yet
  }
};

const exists = (name) => {
  try {
    execFileSync("npm", ["view", name, "name"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

const failed = [];
for (const dir of readdirSync(join(root, "packages")).sort()) {
  const pkgDir = join(root, "packages", dir);
  if (!existsSync(join(pkgDir, "package.json"))) continue;
  const {
    name,
    version,
    private: isPrivate,
  } = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
  if (isPrivate) continue;
  if (onNpm(name, version)) {
    console.log(`${name}@${version} is already on npm`);
    continue;
  }
  if (mode === "bootstrap" && exists(name)) {
    console.log(`${name} already exists on npm; nothing to bootstrap`);
    continue;
  }
  const argv = mode === "direct" ? ["publish"] : ["stage", "publish"];
  console.log(`$ npm ${argv.join(" ")}   (${name}@${version})`);
  try {
    execFileSync("npm", argv, { cwd: pkgDir, stdio: "inherit" });
    if (mode === "bootstrap") continue; // a placeholder to reject, not a release
    // changesets/action pushes these tags and turns them into GitHub releases.
    const tag = `${name}@${version}`;
    try {
      execFileSync("git", ["tag", tag], { cwd: root, stdio: "ignore" });
    } catch {
      // already tagged (a re-run after a partial failure)
    }
    console.log(`New tag: ${tag}`);
  } catch {
    failed.push(`${name}@${version}`);
  }
}
if (failed.length) {
  console.error(`Failed to ${mode === "direct" ? "publish" : "stage"}: ${failed.join(", ")}`);
  process.exit(1);
}
