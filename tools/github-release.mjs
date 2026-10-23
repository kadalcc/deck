#!/usr/bin/env node
/**
 * One GitHub release per engine version, after tools/publish.mjs has put it on npm: the tag
 * `v<version>`, titled "Kadal Deck <version>", with the changelog entry for that version and the
 * packages that went out. The packages are released in lockstep (`fixed` in .changeset/config.json),
 * so one release covers all of them; the per-package tags (`@kadal/deck@<version>`) stay, because
 * changesets reads them.
 *
 * The notes come from `## <version>` in packages/deck/CHANGELOG.md (written by `changeset version`),
 * falling back to the root CHANGELOG.md. Running it twice does nothing the second time.
 *
 *   PUBLISHED_PACKAGES  changesets/action's `publishedPackages` output (JSON); optional
 *   GITHUB_SHA          the commit to tag; defaults to the commit of `@kadal/deck@<version>`
 *   GH_TOKEN            for `gh` (the workflow's GITHUB_TOKEN, with contents: write)
 *
 * It also pushes this version's per-package tags, which nothing else in the workflow does.
 *
 * Locally: `git fetch --tags && node tools/github-release.mjs` (with `gh` signed in).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const run = (cmd, args, opts = {}) =>
  (execFileSync(cmd, args, { cwd: root, encoding: "utf8", ...opts }) ?? "").trim();

const { version } = JSON.parse(readFileSync(join(root, "packages/deck/package.json"), "utf8"));
const tag = `v${version}`;

// tools/publish.mjs tags each package it publishes, but changesets/action doesn't push those tags
// with createGithubReleases off (0.4.2's never left the runner), so they go up here.
const packageTags = run("git", ["tag", "--list", `@kadal/*@${version}`]).split("\n").filter(Boolean);
if (packageTags.length)
  run("git", ["push", "origin", ...packageTags.map((t) => `refs/tags/${t}`)], { stdio: "inherit" });

try {
  run("gh", ["release", "view", tag], { stdio: ["ignore", "pipe", "ignore"] });
  console.log(`${tag} is already released`);
  process.exit(0);
} catch {
  // not released yet
}

/** The body of `## <version>` in a changelog, without the heading, or null. */
const entry = (file) => {
  if (!existsSync(file)) return null;
  const lines = readFileSync(file, "utf8").split("\n");
  const start = lines.findIndex((l) => l.trim() === `## ${version}`);
  if (start === -1) return null;
  const end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  return lines
    .slice(start + 1, end === -1 ? undefined : end)
    .join("\n")
    .trim();
};
const notes =
  entry(join(root, "packages/deck/CHANGELOG.md")) ??
  entry(join(root, "CHANGELOG.md")) ??
  "See the [changelog](https://deck.kadal.cc/changelog/).";

const published = process.env.PUBLISHED_PACKAGES
  ? JSON.parse(process.env.PUBLISHED_PACKAGES)
  : run("git", ["tag", "--list", `@kadal/*@${version}`])
      .split("\n")
      .filter(Boolean)
      .map((t) => ({ name: t.slice(0, t.lastIndexOf("@")), version }));
const order = (n) => (n === "@kadal/deck" ? 0 : n === "@kadal/create-deck" ? 1 : 2);
published.sort((a, b) => order(a.name) - order(b.name) || a.name.localeCompare(b.name));

const body = `${notes}

### Packages

${published
  .map((p) => `- [\`${p.name}@${p.version}\`](https://www.npmjs.com/package/${p.name}/v/${p.version})`)
  .join("\n")}

Published from [release.yml](https://github.com/kadalcc/deck/actions/workflows/release.yml) through npm trusted publishing, with provenance.

\`\`\`sh
npm create @kadal/deck@latest my-talk      # a new deck
npm install @kadal/deck@${version}            # or upgrade one
\`\`\`
`;

// The tag goes up with git, not with `gh release create --target`: GitHub refuses to create a ref
// through the API on a commit that touches .github/workflows unless the token has the `workflow`
// scope, which a git push of the tag doesn't need.
if (!run("git", ["ls-remote", "--tags", "origin", `refs/tags/${tag}`])) {
  const target = process.env.GITHUB_SHA || run("git", ["rev-list", "-n", "1", `@kadal/deck@${version}`]);
  run("git", ["tag", "--force", tag, target]);
  run("git", ["push", "origin", `refs/tags/${tag}`], { stdio: "inherit" });
}
const file = join(mkdtempSync(join(tmpdir(), "deck-release-")), "notes.md");
writeFileSync(file, body);
const args = ["release", "create", tag, "--verify-tag", "--title", `Kadal Deck ${version}`];
args.push("--notes-file", file, version.includes("-") ? "--prerelease" : "--latest");
run("gh", args, { stdio: "inherit" });
console.log(`Released ${tag}`);
