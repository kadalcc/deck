import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { type IncomingMessage, type ServerResponse, createServer, request } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { UsageError } from "../cli/args.ts";
import { cloudflaredInstallHint, devRemote } from "../cli/remote.ts";
import { MissingDependencyError } from "../cli/vite.ts";
import {
  REMOTE_ENV,
  guarded,
  makePassword,
  originOf,
  passwordMatches,
  remoteGate,
  tunnelUrlIn,
} from "./remote-dev.ts";

const work = mkdtempSync(join(tmpdir(), "kadal-deck-remote-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));

describe("kadal-deck dev --tunnel / --remote: the flags", () => {
  const ok = {
    cloudflared: () => "cloudflared version 2026.6.1",
    password: () => "abcd-efgh-jkmn",
  };

  test("--remote alone: on the network, no password", () => {
    expect(devRemote({ tunnel: false, remote: true, viteArgs: [] }, ok)).toEqual({
      args: ["--host"],
      env: {},
    });
    expect(
      devRemote({ tunnel: false, remote: true, viteArgs: ["--host", "0.0.0.0"] }, ok).args,
    ).toEqual([]);
  });

  test("--remote <password>: on the network, the password to the plugin", () => {
    expect(devRemote({ tunnel: false, remote: "s3cret", viteArgs: [] }, ok)).toEqual({
      args: ["--host"],
      env: { [REMOTE_ENV.password]: "s3cret" },
    });
    expect(() => devRemote({ tunnel: false, remote: "  ", viteArgs: [] }, ok)).toThrow(UsageError);
  });

  test("--tunnel: always a password (made up when none was given)", () => {
    expect(devRemote({ tunnel: true, remote: undefined, viteArgs: [] }, ok)).toEqual({
      args: [],
      env: {
        [REMOTE_ENV.tunnel]: "1",
        [REMOTE_ENV.password]: "abcd-efgh-jkmn",
        [REMOTE_ENV.generated]: "1",
      },
    });
    expect(devRemote({ tunnel: true, remote: "mine", viteArgs: [] }, ok).env).toEqual({
      [REMOTE_ENV.tunnel]: "1",
      [REMOTE_ENV.password]: "mine",
    });
  });

  test("--tunnel without cloudflared: exit 4, with how to install it, nothing installed", () => {
    const none = { ...ok, cloudflared: () => null };
    expect(() => devRemote({ tunnel: true, remote: undefined, viteArgs: [] }, none)).toThrow(
      MissingDependencyError,
    );
    expect(cloudflaredInstallHint("darwin")).toContain("brew install cloudflared");
    expect(cloudflaredInstallHint("win32")).toContain("winget install --id Cloudflare.cloudflared");
    expect(cloudflaredInstallHint("linux")).toContain("developers.cloudflare.com");
  });
});

describe("the pieces", () => {
  test("a made-up password reads off a terminal", () => {
    expect(makePassword()).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
    expect(makePassword()).not.toBe(makePassword());
  });

  test("the tunnel's address in cloudflared's log", () => {
    const log =
      "2026-10-22T00:00:00Z INF +----------------------------+\n2026-10-22T00:00:00Z INF |  https://quiet-river-sea-lamp.trycloudflare.com  |\n";
    expect(tunnelUrlIn(log)).toBe("https://quiet-river-sea-lamp.trycloudflare.com");
    expect(tunnelUrlIn("Requesting new quick Tunnel on trycloudflare.com...")).toBeNull();
  });

  test("where a request comes from", () => {
    const req = (address: string, headers: Record<string, string>) =>
      ({ socket: { remoteAddress: address }, headers }) as never;
    expect(originOf(req("127.0.0.1", { host: "localhost:5173" }))).toBe("local");
    expect(originOf(req("::1", { host: "[::1]:5173" }))).toBe("local");
    expect(originOf(req("192.168.1.9", { host: "192.168.1.4:5173" }))).toBe("network");
    expect(originOf(req("127.0.0.1", { host: "x.trycloudflare.com" }))).toBe("tunnel");
    expect(
      originOf(req("127.0.0.1", { host: "localhost:5173", "cf-connecting-ip": "1.2.3.4" })),
    ).toBe("tunnel");
  });

  test("what the password guards", () => {
    expect(guarded("/presenter", "/")).toBe("page");
    expect(guarded("/talk/notes-edit/", "/talk/")).toBe("page");
    expect(guarded("/__kadal/source", "/")).toBe("api");
    expect(guarded("/talk/__kadal/notes", "/talk/")).toBe("api");
    expect(guarded("/__kadal/login", "/")).toBeNull();
    expect(guarded("/", "/")).toBeNull();
    expect(guarded("/remote", "/")).toBeNull();
    expect(guarded("/join", "/")).toBeNull();
    expect(passwordMatches("a", "a")).toBe(true);
    expect(passwordMatches("a", "b")).toBe(false);
  });
});

/** A real HTTP server with the gate in front of a stand-in for the deck. */
async function gated(settings: Parameters<typeof remoteGate>[1]["settings"], logs: string[] = []) {
  const middlewares: Array<(req: IncomingMessage, res: ServerResponse, next: () => void) => void> =
    [];
  const http = createServer((req, res) => {
    let i = 0;
    const next = () => {
      const mw = middlewares[i++];
      if (mw) mw(req, res, next);
      else res.end(`deck:${req.url}`);
    };
    next();
  });
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", r));
  const server = {
    middlewares: { use: (fn: (typeof middlewares)[number]) => middlewares.push(fn) },
    httpServer: http,
    config: { server: {}, logger: { info: (l: string) => logs.push(l) } },
  };
  const gate = remoteGate(server as never, { base: () => "/", settings, log: (l) => logs.push(l) });
  const port = (http.address() as AddressInfo).port;
  const call = (
    path: string,
    opts: { method?: string; headers?: Record<string, string>; body?: string } = {},
  ) =>
    new Promise<{ status: number; body: string; headers: Record<string, unknown> }>(
      (done, fail) => {
        const r = request(
          { host: "127.0.0.1", port, path, method: opts.method ?? "GET", headers: opts.headers },
          (res) => {
            let body = "";
            res.on("data", (c) => (body += c));
            res.on("end", () => done({ status: res.statusCode!, body, headers: res.headers }));
          },
        );
        r.on("error", fail);
        if (opts.body) r.write(opts.body);
        r.end();
      },
    );
  return { gate, call, close: () => new Promise<void>((r) => http.close(() => r())) };
}

describe("the password gate, over HTTP", () => {
  const settings = { password: "open sesame", generated: false, tunnel: false, cloudflared: "x" };
  const tunnel = { host: "quiet-river.trycloudflare.com", "cf-connecting-ip": "203.0.113.9" };

  test("this computer is never asked", async () => {
    const s = await gated(settings);
    expect((await s.call("/presenter", { headers: { host: "localhost:5173" } })).body).toBe(
      "deck:/presenter",
    );
    expect((await s.call("/__kadal/source?slide=0", { headers: { host: "localhost" } })).body).toBe(
      "deck:/__kadal/source?slide=0",
    );
    await s.close();
  });

  test("through the tunnel: the deck is open; the presenter asks; the endpoints refuse", async () => {
    const s = await gated(settings);
    expect((await s.call("/", { headers: tunnel })).body).toBe("deck:/");
    expect((await s.call("/remote?pair=ABC234", { headers: tunnel })).body).toBe(
      "deck:/remote?pair=ABC234",
    );
    const page = await s.call("/presenter", { headers: tunnel });
    expect(page.status).toBe(401);
    expect(page.body).toContain("Presenter password");
    expect(page.body).toContain('name="next" value="/presenter"');
    const api = await s.call("/__kadal/notes", { method: "POST", headers: tunnel, body: "{}" });
    expect(api.status).toBe(401);
    expect(JSON.parse(api.body).error).toContain("presenter password");
    await s.close();
  });

  test("the right password: a session cookie, then everything opens; the wrong one: no", async () => {
    const s = await gated(settings);
    const form = { ...tunnel, "content-type": "application/x-www-form-urlencoded" };
    const wrong = await s.call("/__kadal/login", {
      method: "POST",
      headers: form,
      body: "password=nope&next=%2Fpresenter",
    });
    expect(wrong.status).toBe(401);
    expect(wrong.body).toContain("That is not the password.");
    const right = await s.call("/__kadal/login", {
      method: "POST",
      headers: form,
      body: "password=open+sesame&next=%2Fnotes-edit",
    });
    expect(right.status).toBe(303);
    expect(right.headers.location).toBe("/notes-edit");
    const cookie = String(right.headers["set-cookie"]).split(";")[0]!;
    expect(String(right.headers["set-cookie"])).toContain("HttpOnly");
    expect(String(right.headers["set-cookie"])).toContain("Secure");
    expect((await s.call("/presenter", { headers: { ...tunnel, cookie } })).body).toBe(
      "deck:/presenter",
    );
    expect((await s.call("/__kadal/source?slide=1", { headers: { ...tunnel, cookie } })).body).toBe(
      "deck:/__kadal/source?slide=1",
    );
    // `next` never leaves the deck.
    const away = await s.call("/__kadal/login", {
      method: "POST",
      headers: form,
      body: "password=open+sesame&next=https%3A%2F%2Fevil.example",
    });
    expect(away.headers.location).toBe("/presenter");
    // Signing out ends the session.
    await s.call("/__kadal/logout", { headers: { ...tunnel, cookie } });
    expect((await s.call("/presenter", { headers: { ...tunnel, cookie } })).status).toBe(401);
    await s.close();
  });

  test("ten wrong passwords a minute, then a wait", async () => {
    const s = await gated(settings);
    const form = { ...tunnel, "content-type": "application/x-www-form-urlencoded" };
    for (let i = 0; i < 10; i++)
      await s.call("/__kadal/login", { method: "POST", headers: form, body: "password=x" });
    const blocked = await s.call("/__kadal/login", {
      method: "POST",
      headers: form,
      body: "password=open+sesame",
    });
    expect(blocked.status).toBe(429);
    await s.close();
  });

  test("without a password nothing is guarded (plain --host / --remote)", async () => {
    const s = await gated({ password: null, generated: false, tunnel: false, cloudflared: "x" });
    expect((await s.call("/presenter", { headers: tunnel })).body).toBe("deck:/presenter");
    await s.close();
  });
});

describe("the tunnel, with a stand-in for cloudflared", () => {
  test("starts when the server listens, prints the address, a QR and the password, stops with it", async () => {
    // Prints what cloudflared prints, then waits to be stopped; records its arguments.
    const stand = join(work, "cloudflared");
    const argsFile = join(work, "args.json");
    writeFileSync(
      stand,
      `#!/usr/bin/env node
require("fs").writeFileSync(${JSON.stringify(argsFile)}, JSON.stringify(process.argv.slice(2)));
process.stderr.write("INF Requesting new quick Tunnel on trycloudflare.com...\\n");
setTimeout(() => process.stderr.write("INF |  https://calm-tide-deck-test.trycloudflare.com  |\\n"), 50);
setInterval(() => {}, 1000);
`,
    );
    chmodSync(stand, 0o755);
    const logs: string[] = [];
    const s = await gated(
      { password: "abcd-efgh-jkmn", generated: true, tunnel: true, cloudflared: stand },
      logs,
    );
    for (let i = 0; i < 50 && !s.gate.publicUrl(); i++) await new Promise((r) => setTimeout(r, 50));
    expect(s.gate.publicUrl()).toBe("https://calm-tide-deck-test.trycloudflare.com/");
    for (let i = 0; i < 50 && !logs.some((l) => l.includes("tunnel")); i++)
      await new Promise((r) => setTimeout(r, 20));
    const banner = logs.join("\n");
    expect(banner).toContain("tunnel  https://calm-tide-deck-test.trycloudflare.com/");
    expect(banner).toContain("password abcd-efgh-jkmn");
    expect(banner).toMatch(/[▀▄█]/); // the QR
    const args = JSON.parse(readFileSync(argsFile, "utf8")) as string[];
    expect(args.slice(0, 3)).toEqual(["tunnel", "--no-autoupdate", "--url"]);
    expect(args[3]).toMatch(/^http:\/\/localhost:\d+$/);
    await s.close();
    for (let i = 0; i < 50 && !logs.some((l) => l.includes("tunnel  closed")); i++)
      await new Promise((r) => setTimeout(r, 20));
    expect(logs.some((l) => l.includes("tunnel  closed"))).toBe(true);
    expect(s.gate.publicUrl()).toBeNull();
  });
});
