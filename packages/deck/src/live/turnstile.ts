/**
 * An invisible Turnstile challenge for the audience connection, used only when the deck config
 * names a site key (`live.turnstile`). The token rides on the WebSocket URL; the host verifies it
 * once at connect time. Presenters (with their cookie) never see it.
 */
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

export async function turnstileToken(siteKey: string): Promise<string | null> {
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
