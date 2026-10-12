/**
 * An invisible Turnstile challenge for the audience connection, used only when the deck config
 * names a site key (`live.turnstile`). The token rides on the WebSocket URL; the host verifies it
 * once at connect time. Presenters (with their cookie) never see it.
 */
import { opaqueOrigin } from "../core/storage.ts";
import { viewerPass } from "./ticket.ts";

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          size?: string;
          callback: (token: string) => void;
          "error-callback"?: () => void;
          "expired-callback"?: () => void;
        },
      ) => string;
      remove: (id: string) => void;
    };
  }
}

let loading: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Turnstile failed to load"));
    document.head.appendChild(s);
  });
  return loading;
}

/**
 * The host's own check, for a sandboxed deck: with no pass yet, go to the host's verification page,
 * which runs Turnstile on an unsandboxed page of its own and comes back to this address with a pass
 * in the fragment (live/ticket.ts takes it). The pass itself rides on the connection as `pass`, so
 * the token this returns is always null; it never resolves while the page is leaving.
 */
export function viewerCheck(verify: string): Promise<string | null> {
  if (viewerPass.get() || typeof window === "undefined") return Promise.resolve(null);
  const back = `${location.pathname}${location.search}${location.hash}`;
  location.replace(`${verify}${verify.includes("?") ? "&" : "?"}next=${encodeURIComponent(back)}`);
  return new Promise(() => {});
}

export async function turnstileToken(siteKey: string): Promise<string | null> {
  // Turnstile's frame answers its parent by origin, and an opaque origin can't be answered.
  if (opaqueOrigin()) return null;
  try {
    await loadScript();
  } catch {
    return null;
  }
  const api = window.turnstile;
  if (!api) return null;
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-9999px;top:-9999px;";
  document.body.appendChild(host);
  return new Promise((resolve) => {
    let id = "";
    const done = (token: string | null) => {
      if (id) api.remove(id);
      host.remove();
      resolve(token);
    };
    const timer = setTimeout(() => done(null), 15_000);
    id = api.render(host, {
      sitekey: siteKey,
      size: "invisible",
      callback: (token) => {
        clearTimeout(timer);
        done(token);
      },
      "error-callback": () => {
        clearTimeout(timer);
        done(null);
      },
    });
  });
}
