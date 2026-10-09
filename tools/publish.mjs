#!/usr/bin/env node
/**
 * Publishes every package whose current version isn't on npm yet (what `changeset publish` did),
 * in one of two modes, from NPM_PUBLISH_MODE:
 *
 *   direct (default)  `npm publish` — in CI this authenticates through npm trusted publishing
 *   stage             `npm stage publish` — each version waits on npmjs.com (Staged Packages)
 *                     until a maintainer approves it with 2FA; also how a package that doesn't
 *                     exist yet gets onto npm without a token that bypasses 2FA
 *
 * Prints `New tag: <name>@<version>` for each one, which changesets/action turns into git tags and
 * GitHub releases. Run after `bun run build`.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const mode = process.env.NPM_PUBLISH_MODE || "direct";
if (mode !== "direct" && mode !== "stage")
  throw new Error(`NPM_PUBLISH_MODE must be direct or stage, not ${mode}`);

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
  const argv = mode === "stage" ? ["stage", "publish"] : ["publish"];
  console.log(`$ npm ${argv.join(" ")}   (${name}@${version})`);
  try {
    execFileSync("npm", argv, { cwd: pkgDir, stdio: "inherit" });
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
  console.error(`Failed to ${mode === "stage" ? "stage" : "publish"}: ${failed.join(", ")}`);
  process.exit(1);
}
