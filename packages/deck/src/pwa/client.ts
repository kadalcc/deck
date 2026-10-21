/**
 * The page's half of `pwa: true`: an inline script and its stylesheet, written into the built
 * index.html (never in dev). It registers `<base>sw.js` for the deck's scope once the page has
 * loaded and says, in a small toast at the top, what the worker is doing:
 *
 *   first visit     "Saving for offline… 40%", then "Ready to present offline" (gone in 4 s)
 *   a new build     "A new version of this deck is ready." [Reload] [Later] — the page never
 *                   reloads by itself, so a deploy in the middle of a talk changes nothing until
 *                   the speaker says so; Reload activates the new worker and reloads this window
 *   back in view    after 30 minutes away, the worker checks for a new version
 *
 * Nothing at all on the print view (`?print-pdf`: exports, screenshots, the OG image) or the
 * phone remote; no toast in an embedded or projector window. The toast is a polite live region,
 * keeps its clicks to itself (a click on the slide area advances the deck), follows the system
 * colour scheme, does not animate under reduced motion and is never printed.
 */
export interface PwaClientOptions {
  /** The deck's base: the worker's scope. */
  scope: string;
  /** The worker's URL. */
  sw: string;
  /** Path prefixes that get no worker (the phone remote). */
  network: string[];
}

export function pwaClientScript(o: PwaClientOptions): string {
  return `<script>(${client.toString()})(${JSON.stringify(o)});</script>`;
}

/* The function is serialised into the page as it is: plain browser JS, no imports. */
function client(o: PwaClientOptions): void {
  if (!("serviceWorker" in navigator)) return;
  const q = new URLSearchParams(location.search);
  if (q.has("print-pdf") || q.get("print") === "pdf") return;
  if (o.network.some((p) => location.pathname.startsWith(p))) return;
  const quiet = q.has("embedded") || q.has("projector") || window.top !== window;
  const firstVisit = !navigator.serviceWorker.controller;
  let el: HTMLDivElement | null = null;
  let hide = 0;

  const toast = (text: string, actions: Array<[string, () => void]> = [], ms = 0) => {
    if (quiet) return;
    if (!el) {
      el = document.createElement("div");
      el.className = "kadal-sw-toast";
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
      // The deck turns pages on clicks and keys: the toast's own never reach it.
      for (const t of ["pointerdown", "click", "keydown", "wheel"])
        el.addEventListener(t, (e) => e.stopPropagation());
      document.body.appendChild(el);
    }
    el.replaceChildren();
    const span = document.createElement("span");
    span.textContent = text;
    el.appendChild(span);
    for (const [label, run] of actions) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.addEventListener("click", run);
      el.appendChild(b);
    }
    el.dataset.open = "";
    clearTimeout(hide);
    if (ms) hide = window.setTimeout(close, ms);
  };
  const close = () => {
    if (el) delete el.dataset.open;
  };

  let reloading = false;
  let wanted = false;
  const offer = (w: ServiceWorker) =>
    toast("A new version of this deck is ready.", [
      [
        "Reload",
        () => {
          wanted = true;
          w.postMessage({ type: "kadal-sw:update" });
        },
      ],
      ["Later", close],
    ]);

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (wanted && !reloading) {
      reloading = true;
      location.reload();
    }
  });
  navigator.serviceWorker.addEventListener("message", (e: MessageEvent) => {
    const d = (e.data ?? {}) as { type?: string; done?: number; total?: number };
    if (!firstVisit) return;
    if (d.type === "kadal-sw:progress" && d.total)
      toast(`Saving for offline… ${Math.round(((d.done ?? 0) / d.total) * 100)}%`);
    if (d.type === "kadal-sw:ready") toast("Ready to present offline.", [], 4000);
  });
  navigator.serviceWorker.startMessages();

  const start = () =>
    navigator.serviceWorker
      .register(o.sw, { scope: o.scope })
      .then((reg) => {
        const watch = (w: ServiceWorker | null) => {
          w?.addEventListener("statechange", () => {
            if (w.state === "installed" && !firstVisit && navigator.serviceWorker.controller)
              offer(w);
          });
        };
        if (reg.waiting && !firstVisit) offer(reg.waiting);
        watch(reg.installing);
        reg.addEventListener("updatefound", () => watch(reg.installing));
        let checked = Date.now();
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState !== "visible" || Date.now() - checked < 30 * 60_000) return;
          checked = Date.now();
          reg.update().catch(() => {});
        });
      })
      .catch((err: unknown) =>
        // A sandboxed or file:// page cannot have a worker: the deck still works, online.
        console.warn("[deck] no offline copy:", err instanceof Error ? err.message : err),
      );
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });
}

/**
 * The toast's look: top centre, where neither the deck's controls (bottom right) nor its theme
 * menu (bottom left) are; both schemes; no motion if asked.
 */
export const PWA_TOAST_CSS = `<style>
.kadal-sw-toast{position:fixed;top:16px;left:50%;z-index:2147483000;display:flex;align-items:center;gap:10px;width:max-content;max-width:calc(100vw - 32px);box-sizing:border-box;padding:10px 14px;border-radius:10px;font:500 14px/1.35 system-ui,-apple-system,"Segoe UI",sans-serif;color:#0a0a0a;background:#fff;border:1px solid rgba(0,0,0,.12);box-shadow:0 6px 24px rgba(0,0,0,.18);opacity:0;transform:translate(-50%,-8px);pointer-events:none;transition:opacity .2s,transform .2s}
.kadal-sw-toast[data-open]{opacity:1;transform:translate(-50%,0);pointer-events:auto}
.kadal-sw-toast button{font:inherit;font-weight:600;padding:4px 10px;border-radius:6px;border:1px solid currentColor;background:transparent;color:inherit;cursor:pointer}
.kadal-sw-toast button:first-of-type{background:#0a0a0a;color:#fff;border-color:#0a0a0a}
.kadal-sw-toast button:focus-visible{outline:2px solid #2563eb;outline-offset:2px}
@media (prefers-color-scheme:dark){.kadal-sw-toast{color:#fafafa;background:#18181b;border-color:rgba(255,255,255,.14)}.kadal-sw-toast button:first-of-type{background:#fafafa;color:#0a0a0a;border-color:#fafafa}}
@media (prefers-reduced-motion:reduce){.kadal-sw-toast,.kadal-sw-toast[data-open]{transition:none;transform:translate(-50%,0)}}
@media print{.kadal-sw-toast{display:none!important}}
</style>`;
