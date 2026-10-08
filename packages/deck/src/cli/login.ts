import { spawn } from "node:child_process";

import { type Credentials, HostError, request } from "./host.ts";

/**
 * `kadal-deck login`: the device flow.
 *
 *   POST /cli/start                       → {code, poll, verify_url, expires_in, interval}
 *   (the person opens verify_url, signs in, approves `code` for a workspace)
 *   GET  /cli/poll?code=…&poll=…          → 202 {status: "pending"} until approved, then
 *                                           200 {token, workspace: {handle, name}}
 *
 * `poll` is a secret only this terminal holds: the code on screen is safe to show, because
 * nobody who merely sees it can collect the token.
 */

interface Started {
  code: string;
  poll: string;
  verify_url: string;
  expires_in?: number;
  interval?: number;
}

interface Approved {
  token?: string;
  workspace?: { handle?: string; name?: string } | null;
  status?: string;
}

export interface LoginOptions {
  host: string;
  fetch?: typeof fetch;
  /** Open the verification page (default: the system browser). */
  open?: (url: string) => void;
  log?: (line: string) => void;
  /** Override the host's polling interval, in ms (tests). */
  intervalMs?: number;
}

export async function login(o: LoginOptions): Promise<Credentials> {
  const log = o.log ?? (() => {});
  const { data: s } = await request<Started>(o.host, "/cli/start", {
    method: "POST",
    json: {},
    fetch: o.fetch,
  });
  log(`Your code: ${s.code}`);
  log(`Approve it at ${s.verify_url}`);
  (o.open ?? openBrowser)(s.verify_url);

  const every = o.intervalMs ?? Math.max(1, s.interval ?? 2) * 1000;
  const deadline = Date.now() + (s.expires_in ?? 600) * 1000;
  const query = `?code=${encodeURIComponent(s.code)}&poll=${encodeURIComponent(s.poll)}`;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, every));
    let answer: { status: number; data: Approved };
    try {
      answer = await request<Approved>(o.host, `/cli/poll${query}`, { accept: [202], fetch: o.fetch });
    } catch (e) {
      if (e instanceof HostError && (e.status === 429 || e.status >= 500)) continue;
      throw e;
    }
    if (answer.status === 202 || !answer.data?.token) continue;
    return {
      host: o.host,
      token: answer.data.token,
      ...(answer.data.workspace?.handle ? { workspace: answer.data.workspace.handle } : {}),
    };
  }
  throw new Error("The login code expired before it was approved; run `kadal-deck login` again.");
}

/** Best effort: if no browser opens, the URL is already on screen. */
export function openBrowser(url: string): void {
  const [cmd, args] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]];
  try {
    const child = spawn(cmd, args as string[], { stdio: "ignore", detached: true });
    child.on("error", () => {});
    child.unref();
  } catch {
    /* the URL is printed */
  }
}
