import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { join } from "node:path";

/**
 * A self-signed certificate for `kadal-deck dev --https`, made with the system's `openssl` and
 * kept in node_modules/.kadal-deck/https for a few weeks. It names localhost and every address of
 * this machine, so the phone remote opened from the QR is a secure context (motion sensors need
 * one). The browser still warns once — the certificate is nobody's but yours — and the phone has
 * to accept it once per address. Without openssl it says so and the server stays on http.
 */
const MAX_AGE = 25 * 24 * 60 * 60 * 1000;

export function devCertificate(root: string): { key: Buffer; cert: Buffer } | null {
  const dir = join(root, "node_modules", ".kadal-deck", "https");
  const keyFile = join(dir, "key.pem");
  const certFile = join(dir, "cert.pem");
  const namesFile = join(dir, "names.txt");
  const ips = Object.values(networkInterfaces())
    .flat()
    .filter((i): i is NonNullable<typeof i> => !!i && i.family === "IPv4")
    .map((i) => i.address);
  const names = [
    "DNS:localhost",
    ...[...new Set(["127.0.0.1", ...ips])].map((ip) => `IP:${ip}`),
  ].join(",");
  const fresh =
    existsSync(keyFile) &&
    existsSync(certFile) &&
    existsSync(namesFile) &&
    readFileSync(namesFile, "utf8") === names &&
    Date.now() - statSync(certFile).mtimeMs < MAX_AGE;
  if (!fresh) {
    try {
      mkdirSync(dir, { recursive: true });
      execFileSync(
        "openssl",
        [
          "req",
          "-x509",
          "-newkey",
          "rsa:2048",
          "-nodes",
          "-sha256",
          "-days",
          "30",
          "-subj",
          "/CN=Kadal Deck dev server",
          "-keyout",
          keyFile,
          "-out",
          certFile,
          "-addext",
          `subjectAltName=${names}`,
        ],
        { stdio: "ignore" },
      );
      writeFileSync(namesFile, names);
    } catch {
      console.warn(
        "[deck] --https needs `openssl` on the PATH to make a certificate; serving over http. (Or set server.https in vite.config.)",
      );
      return null;
    }
  }
  return { key: readFileSync(keyFile), cert: readFileSync(certFile) };
}
