import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { useDeck } from "./context.ts";
import { useActions, useUi } from "./hooks.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * HINTS  —  vim's `f`: label every clickable thing, type the label to use it
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Press F and every link, button, embedded page, image preview and input on the current slide
 * (plus the deck's own controls) gets a short home-row label. Type it and the target is used:
 * links open (external ones in a new tab), buttons click, an embedded page takes the keyboard,
 * an image opens in the lightbox. Escape or F again leaves. Labels are one letter when there
 * are few targets and two when there are many, as in Vimium.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "[role='button']",
  "iframe",
  "input:not([type='hidden']):not([disabled])",
  "select",
  "textarea",
  "summary",
  "video[controls]",
  "audio[controls]",
  "[data-hint]",
  ".deck-image[data-preview]",
].join(",");

const LETTERS = "asdfghjkl";

interface Target {
  el: HTMLElement;
  label: string;
  rect: DOMRect;
  kind: "link" | "iframe" | "button" | "input" | "other";
}

function labelsFor(n: number): string[] {
  if (n <= LETTERS.length) return [...LETTERS].slice(0, n);
  const out: string[] = [];
  for (const a of LETTERS) for (const b of LETTERS) out.push(a + b);
  return out.slice(0, n);
}

function kindOf(el: HTMLElement): Target["kind"] {
  const tag = el.tagName;
  if (tag === "A") return "link";
  if (tag === "IFRAME") return "iframe";
  if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return "input";
  if (tag === "BUTTON" || el.getAttribute("role") === "button") return "button";
  return "other";
}

function visible(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return false;
  if (r.bottom < 0 || r.right < 0 || r.top > window.innerHeight || r.left > window.innerWidth)
    return false;
  const cs = getComputedStyle(el);
  if (cs.visibility === "hidden" || cs.display === "none") return false;
  // A control that names itself a target may be faded out until hovered (a sketch's canvas button).
  return cs.opacity !== "0" || el.hasAttribute("data-hint");
}

export function HintLayer() {
  const deck = useDeck();
  const on = useUi((s) => s.hints);
  const actions = useActions();
  const [targets, setTargets] = useState<Target[]>([]);
  const [typed, setTyped] = useState("");

  const collect = useCallback(() => {
    const roots: Element[] = [];
    const slide = document.querySelector(".deck-slide.is-present");
    if (slide) roots.push(slide);
    for (const extra of document.querySelectorAll(
      ".deck-controls, .deck-theme-menu, .deck-audience, .deck-presenter-tools, .deck-room-panel",
    ))
      roots.push(extra);
    const seen = new Set<HTMLElement>();
    const els: HTMLElement[] = [];
    for (const root of roots) {
      for (const el of root.querySelectorAll<HTMLElement>(SELECTOR)) {
        if (seen.has(el) || !visible(el) || el.closest(".deck-hints")) continue;
        // A link wrapping an image counts once, as the link.
        if (el.tagName !== "A" && el.closest("a[href]")) continue;
        // A shielded embedded page is reached through its shield button, not the frame itself.
        if (el.tagName === "IFRAME" && el.closest(".deck-frame:not(.is-live)")) continue;
        seen.add(el);
        els.push(el);
      }
    }
    els.sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      return ra.top - rb.top || ra.left - rb.left;
    });
    const labels = labelsFor(els.length);
    setTargets(
      els.map((el, i) => ({
        el,
        label: labels[i]!,
        rect: el.getBoundingClientRect(),
        kind: kindOf(el),
      })),
    );
  }, []);

  useEffect(() => {
    if (!on) {
      setTargets([]);
      setTyped("");
      return;
    }
    collect();
    const again = () => collect();
    window.addEventListener("resize", again);
    window.addEventListener("scroll", again, true);
    const unsub = deck.nav.subscribe(again);
    return () => {
      window.removeEventListener("resize", again);
      window.removeEventListener("scroll", again, true);
      unsub();
    };
  }, [on, collect, deck.nav]);

  const activate = useCallback(
    (t: Target) => {
      actions.toggleHints(false);
      const el = t.el;
      if (t.kind === "iframe") {
        // Let the embedded page take the keyboard; the frame's own affordance hands it back.
        el.dispatchEvent(new CustomEvent("deck:interact", { bubbles: true }));
        el.focus();
        return;
      }
      if (t.kind === "link") {
        const a = el as HTMLAnchorElement;
        const external = a.target === "_blank" || (a.origin && a.origin !== window.location.origin);
        if (external) window.open(a.href, "_blank", "noopener");
        else a.click();
        return;
      }
      if (t.kind === "input") {
        (el as HTMLInputElement).focus();
        return;
      }
      el.click();
    },
    [actions],
  );

  useEffect(() => {
    if (!on) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        actions.toggleHints(false);
        return;
      }
      if (e.key === "Backspace") {
        e.preventDefault();
        e.stopPropagation();
        setTyped((t) => t.slice(0, -1));
        return;
      }
      if (e.key.length !== 1) return;
      const key = e.key.toLowerCase();
      if (!LETTERS.includes(key)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      setTyped((prev) => {
        const next = prev + key;
        const hit = targets.find((t) => t.label === next);
        if (hit) {
          queueMicrotask(() => activate(hit));
          return "";
        }
        return targets.some((t) => t.label.startsWith(next)) ? next : "";
      });
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [on, targets, activate, actions]);

  if (!on || typeof document === "undefined") return null;
  return createPortal(
    <div className="deck-hints" aria-live="polite">
      {targets.map((t) => {
        const match = typed && t.label.startsWith(typed);
        const dim = typed && !match;
        return (
          <span
            key={t.label}
            className={["deck-hint", `kind-${t.kind}`, match ? "is-match" : "", dim ? "is-dim" : ""]
              .filter(Boolean)
              .join(" ")}
            style={{ left: Math.max(2, t.rect.left), top: Math.max(2, t.rect.top - 10) }}
            onClick={() => activate(t)}
          >
            {match ? (
              <>
                <b>{typed}</b>
                {t.label.slice(typed.length)}
              </>
            ) : (
              t.label
            )}
          </span>
        );
      })}
      {targets.length === 0 ? (
        <span className="deck-hint-empty">Nothing to focus on this slide</span>
      ) : null}
    </div>,
    document.body,
  );
}
