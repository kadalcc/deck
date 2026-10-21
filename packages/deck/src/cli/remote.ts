import { spawnSync } from "node:child_process";

import { REMOTE_ENV, makePassword } from "../vite/remote-dev.ts";
import { UsageError } from "./args.ts";
import { MissingDependencyError } from "./vite.ts";

/**
 * `kadal-deck dev --tunnel` and `--remote [password]`: checked here, before Vite starts, and
 * handed to the deck's plugin through the environment (vite/remote-dev.ts does the rest once the
 * server listens). Nothing is installed: without cloudflared, the command stops and says how to
 * get it.
 */

export function cloudflaredVersion(
  bin = process.env[REMOTE_ENV.cloudflared] || "cloudflared",
): string | null {
  try {
    const r = spawnSync(bin, ["--version"], { encoding: "utf8", timeout: 10_000 });
    if (r.status !== 0) return null;
    return (r.stdout || r.stderr).trim().split("\n")[0] || "cloudflared";
  } catch {
    return null;
  }
}

/** How to install cloudflared here, in one or two lines. */
export function cloudflaredInstallHint(platform: NodeJS.Platform = process.platform): string {
  const how =
    platform === "darwin"
      ? "brew install cloudflared"
      : platform === "win32"
        ? "winget install --id Cloudflare.cloudflared"
        : "your package manager (cloudflared), or the .deb/.rpm/binary from Cloudflare";
  return `--tunnel needs Cloudflare's cloudflared on your PATH (no account needed for a quick tunnel). Install it with ${how} — see https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/ — then run the command again.`;
}

export interface DevRemote {
  /** Arguments to add to Vite's (`--host` for `--remote`). */
  args: string[];
  /** Environment for the deck's plugin. */
  env: Record<string, string>;
}

/**
 * Turn `--tunnel` / `--remote [password]` into Vite arguments and the plugin's environment.
 * `remote` is the parsed flag: undefined (absent), true (no password) or the password.
 */
export function devRemote(
  { tunnel, remote, viteArgs }: { tunnel: boolean; remote: unknown; viteArgs: string[] },
  check: { cloudflared: () => string | null; password: () => string } = {
    cloudflared: () => cloudflaredVersion(),
    password: () => makePassword(),
  },
): DevRemote {
  const args: string[] = [];
  const env: Record<string, string> = {};
  if (remote !== undefined && remote !== true && typeof remote !== "string")
    throw new UsageError("--remote takes an optional password: --remote or --remote <password>");
  if (typeof remote === "string" && !remote.trim())
    throw new UsageError("--remote <password> needs a password that is not empty");
  // --remote: on the network, as Slidev's; the plugin guards the presenter when there is a password.
  if (remote !== undefined && !viteArgs.some((a) => a === "--host" || a.startsWith("--host=")))
    args.push("--host");
  let password = typeof remote === "string" ? remote : null;
  if (tunnel) {
    if (!check.cloudflared()) throw new MissingDependencyError(cloudflaredInstallHint());
    env[REMOTE_ENV.tunnel] = "1";
    // A tunnel is public and the dev server writes files: it always has a password.
    if (!password) {
      password = check.password();
      env[REMOTE_ENV.generated] = "1";
    }
  }
  if (password) env[REMOTE_ENV.password] = password;
  return { args, env };
}
