import { type ComponentType, StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import type { DeckConfigInput, DeckManifest } from "../core/model.ts";
import { flatIndex, totalSlides } from "../core/model.ts";
import { key as navKey } from "../core/navigation.ts";
import type { DeckRuntime, ViewMode } from "../react/context.ts";
import { Deck } from "../react/Deck.tsx";
import { type CompiledDeck, compileDeck } from "./compile.ts";
import { type FromPreview, type OutlineEntry, isToPreview } from "./protocol.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SHELL: a deck with no build of its own
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * One prebuilt page (`dist/shell/`) that runs any deck from its `deck.mdx`: it fetches the file
 * beside itself (or, in `?preview`, waits for its parent to post the text), compiles it in the
 * browser (`runtime/compile.ts`) and renders `<Deck>`. A host can serve the same shell files for
 * every deck — content-addressed, uploaded once — with only `deck.mdx` and its assets differing.
 *
 * In `?preview` the shell is an editor's live view: it answers on `postMessage` with compile
 * diagnostics and the outline, reports where the viewer is, runs commands for the editor (the
 * same registry the keyboard uses), and can report a click on the slide for a comment pin.
 * ─────────────────────────────────────────────────────────────────────────────
 */

declare const __KADAL_DECK_VERSION__: string | undefined;
const VERSION = typeof __KADAL_DECK_VERSION__ === "string" ? __KADAL_DECK_VERSION__ : "dev";

const MODE_SEGMENTS = new Set(["presenter", "join", "audience", "notes", "stats", "remote", "export"]);

/** The deck's root path, from the host's word or the address: the last mode segment comes off. */
export function shellBase(pathname: string, injected?: unknown): string {
  if (typeof injected === "string" && injected.startsWith("/"))
    return injected.endsWith("/") ? injected : `${injected}/`;
  const parts = pathname.split("/");
  const last = parts[parts.length - 1] ?? "";
  if (MODE_SEGMENTS.has(last.replace(/\.html$/, "")) || last === "index.html") parts.pop();
  else if (last !== "") parts.pop();
  const base = parts.join("/");
  return base.endsWith("/") ? base : `${base}/`;
}

export interface ShellOptions {
  root: HTMLElement;
  config?: DeckConfigInput;
  components?: Record<string, ComponentType<Record<string, unknown>>>;
  pages?: Partial<Record<Exclude<ViewMode, "play" | "print">, ComponentType>>;
  /** Wraps the deck: `<LiveProvider />`. */
  providers?: ComponentType<{ children?: React.ReactNode }>;
}

type State =
  | { phase: "loading" }
  | { phase: "failed"; message: string }
  | { phase: "ready"; compiled: CompiledDeck; key: number };

const post = (message: FromPreview) => {
  if (window.parent && window.parent !== window) window.parent.postMessage(message, "*");
};

function outlineOf(manifest: DeckManifest): OutlineEntry[] {
  return manifest.slides.map((s) => ({
    index: s.index,
    id: s.id,
    title: s.title,
    layout: typeof s.frontmatter.layout === "string" ? s.frontmatter.layout : null,
    hasNotes: s.hasNotes,
    line: s.source.line,
    file: s.source.file,
  }));
}

/** A slide to land on once the next compile is mounted (`source.at`). */
let pendingAt: number | null = null;

const runtime = () => (window as unknown as { __deck?: DeckRuntime }).__deck;

/** Start the shell. Resolves once the first compile has rendered (or failed). */
export function startShell(options: ShellOptions): void {
  const preview = new URLSearchParams(location.search).has("preview");
  const injected = (window as unknown as { __KADAL_DECK__?: { base?: unknown } }).__KADAL_DECK__;
  const base = shellBase(location.pathname, injected?.base);
  const root = createRoot(options.root);
  root.render(
    <StrictMode>
      <Shell {...options} base={base} preview={preview} />
    </StrictMode>,
  );
}

function Shell({
  config,
  components,
  pages,
  providers: Providers,
  base,
  preview,
}: ShellOptions & { base: string; preview: boolean }) {
  const [state, setState] = useState<State>({ phase: "loading" });

  useEffect(() => {
    let alive = true;
    let key = 0;
    pendingAt = null;
    const load = async (text: string, files: Record<string, string> = {}, at?: number) => {
      const t0 = performance.now();
      const compiled = await compileDeck(text, { files });
      if (!alive) return;
      pendingAt = at ?? null;
      setState({ phase: "ready", compiled, key: ++key });
      post({
        kadal: 1,
        type: "compiled",
        ok: compiled.ok,
        diagnostics: compiled.diagnostics,
        outline: outlineOf(compiled.manifest),
        ms: Math.round(performance.now() - t0),
      });
    };

    if (!preview) {
      // The published case: deck.mdx (and an optional list of other files) beside the shell.
      (async () => {
        try {
          const res = await fetch(`${base}deck.mdx`, { cache: "no-cache" });
          if (!res.ok) throw new Error(`deck.mdx: ${res.status}`);
          const text = await res.text();
          const files: Record<string, string> = {};
          const fetchAll = (names: string[]) =>
            Promise.all(
              names.map(async (name) => {
                const r = await fetch(`${base}${name}`);
                files[name] = r.ok ? await r.text() : "";
              }),
            );
          // The host lists what it published beside deck.mdx; otherwise ask the compiler what
          // the deck reads (includes, a named glossary) and fetch that, a round at a time.
          const listed = (window as unknown as { __KADAL_DECK__?: { files?: unknown } })
            .__KADAL_DECK__?.files;
          if (Array.isArray(listed)) await fetchAll(listed.filter((f) => typeof f === "string"));
          for (let round = 0; round < 3; round++) {
            const { missing } = await compileDeck(text, { files });
            const todo = missing.filter((m) => !(m in files));
            if (!todo.length) break;
            await fetchAll(todo);
          }
          await load(text, files);
        } catch (err) {
          if (alive)
            setState({ phase: "failed", message: err instanceof Error ? err.message : String(err) });
        }
      })();
      return () => {
        alive = false;
      };
    }

    // The editor's preview: only the parent speaks to us.
    const onMessage = (e: MessageEvent) => {
      if (e.source !== window.parent || !isToPreview(e.data)) return;
      const m = e.data;
      if (m.type === "source") void load(m.text, m.files, m.at);
      else if (m.type === "command") {
        const rt = runtime();
        if (!rt) {
          post({
            kadal: 1,
            type: "command:result",
            seq: m.seq,
            result: { ok: false, code: "unknown", error: "The deck is not running yet." },
          });
          return;
        }
        void rt.commands.run(m.id, m.params, "agent").then((result) =>
          post({ kadal: 1, type: "command:result", seq: m.seq, result }),
        );
      } else if (m.type === "commands") {
        post({ kadal: 1, type: "commands:list", seq: m.seq, commands: runtime()?.commands.list() ?? [] });
      } else if (m.type === "pick") picking = m.on;
    };
    let picking = false;
    const onClick = (e: MouseEvent) => {
      if (!picking) return;
      const slide = (e.target as Element | null)?.closest?.(".deck-slide.is-present");
      const rt = runtime();
      if (!slide || !rt) return;
      e.preventDefault();
      e.stopPropagation();
      picking = false;
      const rect = slide.getBoundingClientRect();
      const el = e.target as HTMLElement;
      const s = rt.nav.get();
      post({
        kadal: 1,
        type: "picked",
        index: flatIndex(rt.columns, s.h, s.v),
        x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
        y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
        text: (el.innerText || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 160),
        element: [el.tagName.toLowerCase(), ...Array.from(el.classList).slice(0, 2)].join("."),
      });
    };
    window.addEventListener("message", onMessage);
    window.addEventListener("click", onClick, true);
    post({ kadal: 1, type: "ready", version: VERSION });
    return () => {
      alive = false;
      window.removeEventListener("message", onMessage);
      window.removeEventListener("click", onClick, true);
    };
  }, [base, preview]);

  // Tell the editor where the viewer is, as they move.
  useEffect(() => {
    if (!preview || state.phase !== "ready") return;
    let off: (() => void) | null = null;
    const id = setInterval(() => {
      const rt = runtime();
      if (!rt || off) return;
      if (pendingAt !== null) {
        void rt.commands.run("nav.goto", { index: pendingAt }, "api");
        pendingAt = null;
      }
      const send = () => {
        const s = rt.nav.get();
        post({
          kadal: 1,
          type: "nav",
          index: flatIndex(rt.columns, s.h, s.v),
          click: s.click,
          clicks: s.totals[navKey(s.h, s.v)] ?? 0,
          total: totalSlides(rt.columns),
        });
      };
      send();
      off = rt.nav.subscribe(send);
    }, 50);
    return () => {
      clearInterval(id);
      off?.();
    };
  }, [preview, state]);

  if (state.phase === "loading")
    return <div className="deck-shell-status" aria-busy="true" />;
  if (state.phase === "failed")
    return (
      <div className="deck-shell-status" role="alert">
        <strong>This deck could not load.</strong> {state.message}
      </div>
    );
  const deck = (
    <Deck
      key={state.key}
      manifest={state.compiled.manifest}
      config={config}
      components={components}
      pages={pages}
      base={base}
    >
      {Providers ? <Providers /> : null}
    </Deck>
  );
  return deck;
}
