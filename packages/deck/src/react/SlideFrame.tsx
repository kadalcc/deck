import {
  Component as ReactComponent,
  type ComponentType,
  type ErrorInfo,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { createClickRegistry } from "../core/clicks.ts";
import type { MagicMoveData, SlideMeta, SlideOptions } from "../core/model.ts";
import { key as navKey, setTotal } from "../core/navigation.ts";
import { SlideContext, type SlideContextValue, useDeck } from "./context.ts";
import { layoutFor } from "./layouts.tsx";
import { MDXProvider } from "./mdx.tsx";

/**
 * One mounted slide: loads its module lazily, gives it a click registry, wraps it in its layout,
 * and reports its click total to the navigation store. Neighbouring slides are mounted hidden so
 * their media is ready (reveal.js's `viewDistance`); the presenter's next-slide preview, the
 * overview and print pages mount slides in `preview` mode, where nothing autoplays.
 */
export interface SlideFrameProps {
  meta: SlideMeta;
  options: SlideOptions;
  h: number;
  v: number;
  active: boolean;
  /** The click to render; defaults to the nav click when active, all clicks when past, 0 when future. */
  click: number;
  preview?: boolean;
  /**
   * When to give embedded pages their `src`: `lazy` (the default) only while the slide is the
   * active one; `load` also on a mirror that is never "active" — the audience's copy — a beat
   * later at a random moment, so a room full of phones does not hit the embedded site at once.
   */
  frames?: "lazy" | "load";
  /** The slide a press lands on next: its embedded pages load now, hidden, and stay loaded. */
  prefetch?: boolean;
  /**
   * Whether the slide's glossary terms answer to the pointer and to reveals from the room. On by
   * default wherever the slide is real; a preview is inert — except the audience's mirror, which
   * is a preview in every other respect and turns this on.
   */
  terms?: boolean;
  className?: string;
  style?: React.CSSProperties;
  children?: ReactNode;
}

const modules = new Map<number, Promise<{ default: ComponentType<Record<string, unknown>> }>>();
const magicModules = new Map<number, Promise<{ default: MagicMoveData[] }>>();

/**
 * A slide's module, once.
 *
 * A REJECTION is deliberately not kept. The cache used to hold whatever the first attempt
 * returned, so a slide that failed once failed for the life of the window: navigating back to it
 * handed out the same rejected promise, and the only way out was to close the window and open a
 * new one. A chunk can fail for reasons that pass — a dropped connection, or a window left open
 * across a deploy, which is the usual one.
 */
export function loadSlide(meta: SlideMeta) {
  const cached = modules.get(meta.index);
  if (cached) return cached;
  const pending = meta.load().catch((error: unknown) => {
    if (modules.get(meta.index) === pending) modules.delete(meta.index);
    throw error;
  });
  modules.set(meta.index, pending);
  return pending;
}

/**
 * The shape of "this chunk is not on the server any more": the window was open when a new build
 * went out, so the name it is asking for no longer exists and the host answers with the index
 * page instead. Safari words it as a MIME type, Chrome and Firefox as a failed import.
 */
const STALE_BUILD = /MIME type|dynamically imported module|Importing a module script failed/i;

/**
 * Reload once to pick up the new build — never twice in a minute, or a slide that is genuinely
 * broken becomes a window that reloads for ever.
 */
function recoverFromStaleBuild() {
  try {
    const key = "deck.stale-reload";
    const last = Number(sessionStorage.getItem(key) ?? 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(key, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

export function loadMagic(meta: SlideMeta) {
  if (!meta.loadMagic) return null;
  const cached = magicModules.get(meta.index);
  if (cached) return cached;
  const pending = meta.loadMagic().catch((error: unknown) => {
    if (magicModules.get(meta.index) === pending) magicModules.delete(meta.index);
    throw error;
  });
  magicModules.set(meta.index, pending);
  return pending;
}

/** One broken slide shows its error in place instead of taking the whole deck down. */
class SlideBoundary extends ReactComponent<
  { index: number; resetKey: unknown; children: ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };
  static getDerivedStateFromError(e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  componentDidCatch(_e: unknown, _info: ErrorInfo) {}
  componentDidUpdate(prev: { resetKey: unknown }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }
  render() {
    if (this.state.error)
      return (
        <div className="deck-slide-error">
          <strong>Slide {this.props.index + 1} failed to render</strong>
          <pre>{this.state.error}</pre>
        </div>
      );
    return this.props.children;
  }
}

/**
 * One embedded page at a time, per host.
 *
 * The slide you are on loads its page first and the slide AHEAD waits for it, because two loads of
 * the same host at once is how a small server gets pushed past a limit — and the frame that loses
 * is left showing an error page for the rest of the talk, which nothing out here can detect. It
 * adds up faster than it looks: the presenter view and the share window each load their own copy,
 * so one arrival at a live slide could be four requests landing together.
 */
const loadingHosts = new Set<string>();

function hostOf(src: string) {
  try {
    return new URL(src, window.location.href).origin;
  } catch {
    return src;
  }
}

function startFrame(frame: HTMLIFrameElement, src: string) {
  const host = hostOf(src);
  loadingHosts.add(host);
  const free = () => {
    loadingHosts.delete(host);
    frame.removeEventListener("load", free);
    frame.removeEventListener("error", free);
  };
  frame.addEventListener("load", free);
  frame.addEventListener("error", free);
  // Never hold the gate on a load that never ends.
  setTimeout(free, 10_000);
  frame.setAttribute("src", src);
}

/** The slide ahead: start when the host is quiet, or once waiting has stopped being worth it. */
function startFrameWhenHostIsFree(
  frame: HTMLIFrameElement,
  src: string,
  timers: ReturnType<typeof setTimeout>[],
  waited = 0,
) {
  if (!loadingHosts.has(hostOf(src)) || waited >= 9_000) {
    startFrame(frame, src);
    return;
  }
  timers.push(setTimeout(() => startFrameWhenHostIsFree(frame, src, timers, waited + 600), 600));
}

export function SlideFrame({
  meta,
  options,
  h,
  v,
  active,
  click,
  preview = false,
  frames = "lazy",
  prefetch = false,
  terms = !preview,
  className,
  style,
  children,
}: SlideFrameProps) {
  const deck = useDeck();
  const [Component, setComponent] = useState<ComponentType<Record<string, unknown>> | null>(null);
  const [magic, setMagic] = useState<MagicMoveData[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const registry = useMemo(
    () => createClickRegistry(options.clicksStart),
    [options.clicksStart, meta.index],
  );
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    let alive = true;
    loadSlide(meta)
      .then((m) => alive && setComponent(() => m.default))
      .catch((error: unknown) => {
        if (!alive) return;
        const message = error instanceof Error ? error.message : String(error);
        // A window left open across a deploy is asking for a chunk that has been replaced. Every
        // screen but the presenter's heals itself — a reload lands on the same slide, because the
        // address carries it — while the presenter is asked rather than interrupted: their timer
        // starts when the view opens and a reload would quietly set it back to zero mid-talk.
        if (STALE_BUILD.test(message) && deck.mode !== "presenter" && recoverFromStaleBuild())
          return;
        setFailed(message);
      });
    const mm = loadMagic(meta);
    if (mm) mm.then((m) => alive && setMagic(m.default)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [meta, deck.mode]);

  // Report the click total (the registry's, or the frontmatter override) to the nav store.
  useEffect(() => {
    if (preview) return;
    const report = (total: number) => {
      const t = options.clicks ?? total;
      deck.nav.update((s) => setTotal(s, h, v, t));
    };
    report(registry.total());
    return registry.onChange(report);
  }, [registry, deck.nav, h, v, options.clicks, preview]);

  // Media: autoplay on show, pause on hide; lazy sources (data-src) when mounted near the view.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const node of el.querySelectorAll<HTMLElement>("[data-src]")) {
      const isIframe = node.tagName === "IFRAME";
      const ahead = prefetch && !preview;
      if (isIframe && !active && !ahead && frames !== "load" && node.dataset.preload === undefined)
        continue;
      const src = node.dataset.src;
      if (!src || node.getAttribute("src") === src) continue;
      // An iframe starts loading once the slide transition has played, so a heavy page (a live
      // map) does not stall the animation of the slide it is arriving on. The next slide's
      // loads a moment later still, behind the current one's.
      if (!isIframe) {
        node.setAttribute("src", src);
        continue;
      }
      const frame = node as HTMLIFrameElement;
      // A slide arriving: once its transition has played, so a heavy page does not stall it.
      if (active && !preview) timers.push(setTimeout(() => startFrame(frame, src), 750));
      // The slide ahead: when this host has gone quiet again.
      else if (!active && ahead)
        timers.push(setTimeout(() => startFrameWhenHostIsFree(frame, src, timers), 1500));
      // A mirror told it can carry live pages, staggered so a room of them does not arrive at once.
      // Spelled out rather than left to fall through: the audience's mirror is `active` AND a
      // preview, and an implicit last case would have had every one of them load at once.
      else if (frames === "load")
        timers.push(setTimeout(() => startFrame(frame, src), 300 + Math.random() * 2200));
      // Every other preview — the overview, print, the presenter's next box, a phone — keeps
      // its poster.
    }
    if (preview) return () => timers.forEach(clearTimeout);
    const media = el.querySelectorAll<HTMLMediaElement>("video, audio");
    if (active) {
      for (const m of media) {
        const wants =
          deck.config.autoPlayMedia === true ||
          (deck.config.autoPlayMedia !== false && m.dataset.autoplay !== undefined);
        if (wants) void m.play().catch(() => {});
      }
    } else {
      for (const m of media) {
        if (m.dataset.ignore !== undefined) continue;
        m.pause();
        if (m.dataset.autoplay !== undefined) m.currentTime = 0;
      }
      // Unload lazy iframes when hidden, so nothing keeps playing in the background — except on
      // the slide that comes next, which is loading ahead on purpose.
      if (!prefetch)
        for (const f of el.querySelectorAll<HTMLIFrameElement>("iframe[data-src]")) {
          if (f.dataset.preload === undefined && f.getAttribute("src")) f.removeAttribute("src");
        }
    }
    return () => timers.forEach(clearTimeout);
  }, [active, preview, frames, prefetch, Component, deck.config.autoPlayMedia]);

  // Auto-fit: a slide whose content is taller than the canvas is scaled down to fit, measured
  // after it renders and again when a click reveals more, fonts arrive or images load. Every
  // mount fits — the stage, a mirror on a phone, the presenter's next-slide box, an overview
  // tile, a print page — so the same slide looks the same everywhere.
  useEffect(() => {
    if (!deck.config.autoFit || !Component) return;
    const host = root.current;
    if (!host) return;
    const el = host.querySelector<HTMLElement>(".deck-layout");
    if (!el || /deck-layout-(image|iframe|full|none)/.test(el.className)) return;
    let raf = 0;
    const fit = () => {
      el.classList.remove("is-fitted");
      el.style.removeProperty("--deck-fit");
      const need = el.scrollHeight;
      const have = el.clientHeight;
      if (need > have + 2) {
        el.style.setProperty("--deck-fit", Math.max(0.45, (have / need) * 0.985).toFixed(3));
        el.classList.add("is-fitted");
      }
    };
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(fit);
    };
    schedule();
    document.fonts?.ready.then(schedule).catch(() => {});
    const onLoad = (e: Event) => {
      if ((e.target as HTMLElement | null)?.tagName === "IMG") schedule();
    };
    host.addEventListener("load", onLoad, true);
    const ro = new ResizeObserver(schedule);
    ro.observe(host);
    return () => {
      cancelAnimationFrame(raf);
      host.removeEventListener("load", onLoad, true);
      ro.disconnect();
    };
  }, [Component, click, active, preview, deck.config.autoFit]);

  const value = useMemo<SlideContextValue>(
    () => ({ meta, options, h, v, active, click, registry, magic, preview, terms }),
    [meta, options, h, v, active, click, registry, magic, preview, terms],
  );

  const Layout = layoutFor(options.layout, deck.components);
  const stateClasses = options.state.map((s) => `state-${s}`).join(" ");

  return (
    <SlideContext.Provider value={value}>
      <section
        ref={root}
        className={[
          "deck-slide",
          `layout-${options.layout}`,
          options.className,
          stateClasses,
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        data-h={h}
        data-v={v}
        data-index={meta.index}
        data-id={meta.id}
        data-layout={options.layout}
        data-active={active ? "true" : undefined}
        data-click={click}
        data-color-scheme={options.colorScheme ?? undefined}
        aria-hidden={active ? undefined : true}
        style={{ ...style, ...(options.zoom !== 1 ? { zoom: options.zoom } : null) }}
      >
        {failed ? (
          <div className="deck-slide-error">
            <strong>Slide {meta.index + 1} failed to load</strong>
            <pre>{failed}</pre>
            {/*
              Somewhere to go from here: a window with no browser chrome — the share window — had
              nothing but closing it and opening another.

              Reloading is the only thing offered because it is the only thing that works. A
              browser remembers a module whose fetch failed, so importing the same address again
              makes no request at all (measured: zero) and fails the same way; the page has to be
              loaded afresh to ask for the new build's names.
            */}
            <div className="deck-slide-error-actions">
              <button type="button" onClick={() => window.location.reload()}>
                Reload the deck
              </button>
            </div>
          </div>
        ) : Component ? (
          <SlideBoundary index={meta.index} resetKey={Component}>
            <MDXProvider>
              <Layout frontmatter={meta.frontmatter} options={options}>
                <Component frontmatter={meta.frontmatter} />
              </Layout>
            </MDXProvider>
          </SlideBoundary>
        ) : (
          <div className="deck-slide-loading" />
        )}
        {children}
      </section>
    </SlideContext.Provider>
  );
}

export { navKey };
