import { type ChildProcess, spawn } from "node:child_process";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { ViteDevServer } from "vite";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * `kadal-deck dev --tunnel` AND `--remote <password>`  (the dev server only)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * --tunnel             the dev server on the internet through a Cloudflare Quick Tunnel
 *                      (`cloudflared tunnel --url http://localhost:<port>`): an https address
 *                      anyone with it can open, printed with a QR code in the terminal, and the one
 *                      the phone remote's pairing QR uses. Nothing to sign up for; the tunnel goes
 *                      when the server stops. Needs `cloudflared` installed (the CLI checks first and
 *                      says how; nothing is ever installed for you).
 * --remote [password]  the dev server on the network (as `--host`), and — with a password — the
 *                      presenter, notes and editing pages behind it (Slidev's `--remote=pwd`).
 *
 * Who must give the password: anyone not on this computer — a request from another device on
 * the network, or anything that comes through the tunnel (cloudflared connects from localhost,
 * but the request carries the tunnel's host name and Cloudflare's headers). The tunnel always
 * has a password: without `--remote <password>`, one is made up and printed, because a tunnel
 * address is public and the dev server can write the deck's files.
 *
 * What it guards:
 *   <base>presenter, notes, notes-edit, overview       a password page first (the speaker's views)
 *   <base>__kadal/*  (notes, source, monaco-write…)   401 without it (they read and write the deck)
 * Everything else — the deck itself, the audience page, the phone remote (which pairs with a code
 * from the presenting screen) — stays open, as a published deck is.
 *
 * The password keeps people off those views and out of the files. It does not make the speaker
 * notes secret: they are part of the deck's code, in dev as in any build (a deck that must not
 * show them is built with `--without-notes`).
 *
 * The session is a random token in an HttpOnly cookie, kept in memory: restarting the server
 * signs everyone out. Wrong passwords are limited to 10 a minute per address.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const REMOTE_ENV = {
  /** The presenter password (`--remote <password>`, or made up for `--tunnel`). */
  password: "KADAL_DECK_REMOTE_PASSWORD",
  /** "1" when the CLI made the password up (the banner prints it). */
  generated: "KADAL_DECK_REMOTE_PASSWORD_GENERATED",
  /** "1": open a Cloudflare Quick Tunnel when the server listens. */
  tunnel: "KADAL_DECK_TUNNEL",
  /** The cloudflared binary to run (tests point it at a stand-in). */
  cloudflared: "KADAL_DECK_CLOUDFLARED",
} as const;

export interface RemoteSettings {
  password: string | null;
  generated: boolean;
  tunnel: boolean;
  cloudflared: string;
}

export function remoteSettings(env: NodeJS.ProcessEnv = process.env): RemoteSettings {
  return {
    password: env[REMOTE_ENV.password] || null,
    generated: env[REMOTE_ENV.generated] === "1",
    tunnel: env[REMOTE_ENV.tunnel] === "1",
    cloudflared: env[REMOTE_ENV.cloudflared] || "cloudflared",
  };
}

/** A password that is easy to read off a terminal and type on a phone: 3 groups of 4. */
export function makePassword(random: (n: number) => Buffer = randomBytes): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = random(12);
  let out = "";
  for (let i = 0; i < 12; i++) {
    if (i && i % 4 === 0) out += "-";
    out += alphabet[bytes[i]! % alphabet.length];
  }
  return out;
}

/** The quick tunnel's address in a line of cloudflared's log, or null. */
export function tunnelUrlIn(text: string): string | null {
  const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i.exec(text);
  return m ? m[0] : null;
}

const LOOPBACK = /^(localhost|127(?:\.\d+){3}|\[::1\]|::1)(?::\d+)?$/i;

/**
 * Where a request comes from: this computer, another device on the network, or the internet
 * through the tunnel (cloudflared connects from localhost but keeps the public host name and adds
 * Cloudflare's headers).
 */
export function originOf(
  req: Pick<IncomingMessage, "headers" | "socket">,
): "local" | "network" | "tunnel" {
  const address = req.socket.remoteAddress ?? "";
  const loopback =
    address === "::1" || address.startsWith("127.") || address === "::ffff:127.0.0.1";
  if (!loopback) return "network";
  const host = String(req.headers.host ?? "");
  if (req.headers["cf-connecting-ip"] || req.headers["cf-ray"] || (host && !LOOPBACK.test(host)))
    return "tunnel";
  return "local";
}

const GUARDED_PAGES = ["presenter", "notes", "notes-edit", "overview"];

/** Whether `path` (no query) is a page or an endpoint the password guards. */
export function guarded(path: string, base: string): "page" | "api" | null {
  // Any `__kadal/` segment, wherever it sits: some endpoints match the end of the URL
  // (monaco-dev.ts), so `/x/__kadal/monaco-write` must not slip past as "not under the base".
  const login = [LOGIN, LOGOUT].some((p) => path.replace(/\/+$/, "").endsWith(`/${p}`));
  if (!login && /(^|\/)__kadal\//.test(path)) return "api";
  for (const b of new Set([base, "/"])) {
    if (!path.startsWith(b)) continue;
    const rest = path.slice(b.length).replace(/\/+$/, "");
    if (rest === LOGIN || rest === LOGOUT) return null;
    if (rest.startsWith("__kadal/")) return "api";
    if (GUARDED_PAGES.includes(rest)) return "page";
  }
  return null;
}

const COOKIE = "kadal_deck_remote";
const LOGIN = "__kadal/login";
const LOGOUT = "__kadal/logout";
const MAX_FAILS = 10;

function cookies(req: IncomingMessage): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of String(req.headers.cookie ?? "").split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0) out[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}

const digest = (s: string) => createHash("sha256").update(s).digest();

/** Constant-time comparison of a typed password with the real one. */
export function passwordMatches(given: string, password: string): boolean {
  return timingSafeEqual(digest(given), digest(password));
}

function loginPage(base: string, next: string, error: string | null): string {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Presenter password · Kadal Deck</title>
<style>
  :root { color-scheme: light dark; --bg: #f6f7f9; --card: #fff; --fg: #15181d; --muted: #5d6673; --line: #d9dde3; --accent: #0b6bcb; }
  @media (prefers-color-scheme: dark) { :root { --bg: #0e1116; --card: #161b22; --fg: #e6e9ee; --muted: #9aa4b2; --line: #2b313a; --accent: #4ea1f3; } }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: var(--bg); color: var(--fg); font: 16px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; padding: 16px; }
  form { width: min(360px, 100%); background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 24px; }
  h1 { font-size: 18px; margin: 0 0 6px; }
  p { margin: 0 0 16px; color: var(--muted); font-size: 14px; }
  label { display: block; font-size: 13px; margin-bottom: 6px; }
  input { width: 100%; font: inherit; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--line); background: transparent; color: inherit; }
  input:focus-visible, button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  button { margin-top: 14px; width: 100%; font: inherit; font-weight: 600; padding: 10px; border: 0; border-radius: 8px; background: var(--accent); color: #fff; cursor: pointer; }
  .error { color: #d92d20; font-size: 14px; margin: 10px 0 0; }
  @media (prefers-color-scheme: dark) { .error { color: #ff8a80; } }
</style>
</head>
<body>
<form method="post" action="${esc(base)}${LOGIN}">
  <h1>Presenter password</h1>
  <p>This deck's presenter view and editing are protected. The password was printed where <code>kadal-deck dev</code> runs.</p>
  <input type="hidden" name="next" value="${esc(next)}" />
  <label for="password">Password</label>
  <input id="password" name="password" type="password" autocomplete="current-password" autofocus required />
  ${error ? `<p class="error" role="alert">${esc(error)}</p>` : ""}
  <button type="submit">Open</button>
</form>
</body>
</html>`;
}

function readForm(req: IncomingMessage): Promise<URLSearchParams> {
  return new Promise((done, fail) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > 8192) {
        fail(new Error("too large"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      const type = String(req.headers["content-type"] ?? "");
      if (type.includes("application/json")) {
        try {
          const j = JSON.parse(raw) as Record<string, unknown>;
          return done(new URLSearchParams(Object.entries(j).map(([k, v]) => [k, String(v)])));
        } catch {
          return done(new URLSearchParams());
        }
      }
      done(new URLSearchParams(raw));
    });
    req.on("error", fail);
  });
}

export interface RemoteGate {
  /** The tunnel's public address once it is up (with the deck's base), else null. */
  publicUrl(): string | null;
}

/**
 * Install the password gate (when there is a password) and the tunnel (when asked for). Register
 * before every other dev endpoint, so they are all behind it.
 */
export function remoteGate(
  server: ViteDevServer,
  options: { base: () => string; settings?: RemoteSettings; log?: (line: string) => void },
): RemoteGate {
  const settings = options.settings ?? remoteSettings();
  const log = options.log ?? ((line: string) => server.config.logger.info(line));
  const sessions = new Set<string>();
  const fails = new Map<string, { n: number; reset: number }>();
  let publicUrl: string | null = null;

  if (settings.password) {
    const password = settings.password;
    server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
      const url = new URL(req.url ?? "/", "http://x");
      const base = options.base();
      const path = url.pathname;
      const from = originOf(req);
      const secure =
        from === "tunnel" ||
        req.headers["x-forwarded-proto"] === "https" ||
        "encrypted" in req.socket;
      const cookie = (value: string, maxAge: number) =>
        `${COOKIE}=${value}; Path=${base}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;

      if (path === `${base}${LOGIN}` || path === `/${LOGIN}`) {
        if (req.method !== "POST") {
          res.statusCode = 405;
          return res.end();
        }
        const who = String(req.headers["cf-connecting-ip"] ?? req.socket.remoteAddress ?? "?");
        const now = Date.now();
        const f = fails.get(who);
        void readForm(req)
          .then((form) => {
            const next = form.get("next") ?? `${base}presenter`;
            const safeNext =
              next.startsWith(base) && !next.startsWith("//") ? next : `${base}presenter`;
            if (f && f.reset > now && f.n >= MAX_FAILS) {
              res.statusCode = 429;
              res.setHeader("Content-Type", "text/html; charset=utf-8");
              return res.end(loginPage(base, safeNext, "Too many wrong passwords. Wait a minute."));
            }
            if (!passwordMatches(form.get("password") ?? "", password)) {
              const entry = f && f.reset > now ? f : { n: 0, reset: now + 60_000 };
              entry.n++;
              fails.set(who, entry);
              res.statusCode = 401;
              res.setHeader("Content-Type", "text/html; charset=utf-8");
              return res.end(loginPage(base, safeNext, "That is not the password."));
            }
            fails.delete(who);
            const token = randomBytes(24).toString("base64url");
            sessions.add(token);
            res.statusCode = 303;
            res.setHeader("Set-Cookie", cookie(token, 12 * 60 * 60));
            res.setHeader("Location", safeNext);
            res.end();
          })
          .catch(() => {
            res.statusCode = 413;
            res.end();
          });
        return;
      }
      if (path === `${base}${LOGOUT}` || path === `/${LOGOUT}`) {
        const token = cookies(req)[COOKIE];
        if (token) sessions.delete(token);
        res.statusCode = 303;
        res.setHeader("Set-Cookie", cookie("", 0));
        res.setHeader("Location", base);
        return res.end();
      }

      const kind = guarded(path, base);
      if (!kind || from === "local") return next();
      const token = cookies(req)[COOKIE];
      if (token && sessions.has(token)) return next();
      res.setHeader("Cache-Control", "no-store");
      if (kind === "api") {
        res.statusCode = 401;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        return res.end(
          JSON.stringify({
            error: "Sign in with the presenter password first (open the presenter view).",
          }),
        );
      }
      res.statusCode = 401;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(loginPage(base, `${path}${url.search}`, null));
    });
  }

  if (settings.tunnel) {
    const open = () => {
      const address = server.httpServer?.address() as AddressInfo | string | null;
      const port = typeof address === "object" && address ? address.port : null;
      if (!port) return;
      const https = !!server.config.server.https;
      startTunnel(settings.cloudflared, `${https ? "https" : "http"}://localhost:${port}`, https, {
        onUrl: (url) => {
          publicUrl = `${url}${options.base()}`;
          void banner(publicUrl, settings, log);
        },
        onExit: (why) => {
          publicUrl = null;
          log(`\n  tunnel  closed${why ? ` (${why})` : ""}\n`);
        },
        server,
      });
    };
    if (server.httpServer?.listening) open();
    else server.httpServer?.once("listening", open);
  }

  return { publicUrl: () => publicUrl };
}

/** Start cloudflared's quick tunnel; it stops with the dev server (and with this process). */
function startTunnel(
  bin: string,
  origin: string,
  selfSigned: boolean,
  hooks: {
    onUrl: (url: string) => void;
    onExit: (why: string | null) => void;
    server: ViteDevServer;
  },
) {
  const args = [
    "tunnel",
    "--no-autoupdate",
    "--url",
    origin,
    ...(selfSigned ? ["--no-tls-verify"] : []),
  ];
  let child: ChildProcess;
  try {
    child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    hooks.onExit(e instanceof Error ? e.message : String(e));
    return;
  }
  let seen = "";
  let announced = false;
  const read = (chunk: Buffer) => {
    if (announced) return;
    seen = (seen + chunk.toString()).slice(-8192);
    const url = tunnelUrlIn(seen);
    if (url) {
      announced = true;
      hooks.onUrl(url);
    }
  };
  child.stdout?.on("data", read);
  child.stderr?.on("data", read);
  child.on("error", (e) => hooks.onExit(`could not start ${bin}: ${e.message}`));
  child.on("exit", (code) => hooks.onExit(code ? `cloudflared exited with ${code}` : null));
  const stop = () => {
    if (child.exitCode === null) child.kill();
  };
  // Ctrl+C reaches cloudflared with the rest of the terminal's process group; these cover the
  // server closing (a restart) and this process ending any other way.
  hooks.server.httpServer?.once("close", stop);
  process.once("exit", stop);
}

async function banner(url: string, settings: RemoteSettings, log: (line: string) => void) {
  let qr = "";
  try {
    const { toString } = await import("qrcode");
    qr = await toString(url, { type: "terminal", small: true, errorCorrectionLevel: "L" });
  } catch {
    /* the address alone */
  }
  const lines = [
    "",
    `  tunnel  ${url}`,
    "          the deck on the internet (a Cloudflare Quick Tunnel); the phone remote's QR uses it",
  ];
  if (settings.password)
    lines.push(
      settings.generated
        ? `          presenter and editing from elsewhere: password ${settings.password}`
        : "          presenter and editing from elsewhere: the password given to --remote",
    );
  if (qr) lines.push("", ...qr.split("\n").map((l) => (l ? `  ${l}` : l)));
  log(lines.join("\n"));
}
