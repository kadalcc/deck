import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/**
 * Talking to a Kadal Deck host (https://deck.kadal.cc, or a self-hosted one): where the
 * credentials live, and one `request` that turns the host's `{error, message}` answers into
 * errors a person can act on.
 */

export const DEFAULT_HOST = "https://deck.kadal.cc";

export interface Credentials {
  host: string;
  token: string;
  /** The workspace handle the token belongs to, when the host said. */
  workspace?: string;
}

export function credentialsPath(env: NodeJS.ProcessEnv = process.env): string {
  const base = env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(base, "kadal-deck", "credentials.json");
}

/** KADAL_DECK_TOKEN / KADAL_DECK_HOST win over the saved file (for CI). */
export async function loadCredentials(
  env: NodeJS.ProcessEnv = process.env,
): Promise<Credentials | null> {
  let saved: Partial<Credentials> = {};
  try {
    saved = JSON.parse(await readFile(credentialsPath(env), "utf8")) as Partial<Credentials>;
  } catch {
    /* none saved */
  }
  const token = env.KADAL_DECK_TOKEN || saved.token;
  if (!token) return null;
  return {
    host: normaliseHost(env.KADAL_DECK_HOST || saved.host || DEFAULT_HOST),
    token,
    workspace: env.KADAL_DECK_TOKEN ? undefined : saved.workspace,
  };
}

export async function saveCredentials(
  creds: Credentials,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  const path = credentialsPath(env);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, `${JSON.stringify(creds, null, 2)}\n`, { mode: 0o600 });
  await chmod(path, 0o600);
  return path;
}

export async function clearCredentials(env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  try {
    await rm(credentialsPath(env));
    return true;
  } catch {
    return false;
  }
}

export function hostFrom(env: NodeJS.ProcessEnv = process.env, flag?: string): string {
  return normaliseHost(flag || env.KADAL_DECK_HOST || DEFAULT_HOST);
}

export function normaliseHost(host: string): string {
  return host.replace(/\/+$/, "");
}

/** An answer from the host that was not a success, with what the person should do about it. */
export class HostError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly body: unknown = null,
  ) {
    super(message);
    this.name = "HostError";
  }
}

export interface RequestOptions {
  method?: string;
  token?: string | null;
  json?: unknown;
  body?: Uint8Array;
  contentType?: string;
  /** Statuses that are answers rather than errors (e.g. 202 while a login is pending). */
  accept?: number[];
  fetch?: typeof fetch;
}

/** `host` + `/api/v1` + `path`, JSON in and out. Throws `HostError` with a helpful message. */
export async function request<T>(
  host: string,
  path: string,
  opts: RequestOptions = {},
): Promise<{ status: number; data: T }> {
  const doFetch = opts.fetch ?? fetch;
  const headers: Record<string, string> = { accept: "application/json" };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  let body: BodyInit | undefined;
  if (opts.json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(opts.json);
  } else if (opts.body) {
    headers["content-type"] = opts.contentType ?? "application/octet-stream";
    body = opts.body as unknown as BodyInit;
  }
  const res = await doFetch(`${host}/api/v1${path}`, {
    method: opts.method ?? (body ? "POST" : "GET"),
    headers,
    body,
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (res.ok || opts.accept?.includes(res.status)) return { status: res.status, data: data as T };
  const err = (data && typeof data === "object" ? data : {}) as { error?: string; message?: string };
  throw new HostError(res.status, err.error ?? `http_${res.status}`, explain(res.status, host, err.message), data);
}

function explain(status: number, host: string, message?: string): string {
  const said = message ? `${message}` : "";
  switch (status) {
    case 401:
      return `Not signed in, or the token was revoked. Run \`kadal-deck login\` (or set KADAL_DECK_TOKEN).${said ? ` (${said})` : ""}`;
    case 402:
      return `${said || "This would go over your plan's limits."} Upgrade at ${host}/app/billing.`;
    case 403:
      return said || "That isn't allowed with this token.";
    case 404:
      return said || "Not found: check the workspace handle (--workspace) and that the deck exists.";
    case 413:
      return said || "A file is too large for the host (25 MB per file).";
    case 429:
      return said || "Too many requests; wait a minute and try again.";
    default:
      return said || `The host answered ${status}.`;
  }
}
