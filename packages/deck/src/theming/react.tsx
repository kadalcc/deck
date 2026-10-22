import { type ComponentType, useEffect, useMemo, useRef, useState } from "react";

import { isEditable } from "../core/keyboard.ts";
import type { DeckManifest } from "../core/model.ts";
import { registerBackground } from "../react/Backgrounds.tsx";
import type { DeckRuntime } from "../react/context.ts";
import { registerLazyRenderer, registerRenderer } from "../renderers/index.ts";
import {
  BUILTIN_THEMES,
  type DeckLayers,
  type PackageModule,
  type PackageRef,
  type ResolvedLayers,
  type SetupApi,
  type ThemeMeta,
  normalizeModule,
} from "./contract.ts";
import { type ResolvedFonts, resolveFonts } from "./fonts.ts";
import { mergeComponents, mergeLayers, mergeThemeConfig, themeConfigVars } from "./merge.ts";
import { localAsset } from "../core/remote-assets.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THEMES, ADDONS AND FONTS IN THE RUNNING DECK
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * What `<Deck>` calls, each in a line: the merged components and layers for the theme this
 * screen shows (a theme picked from the menu loads its module then, if it was lazy), the
 * `--theme-*` and font variables for the deck root, the font stylesheets, and every package's
 * `setup(api)` — run once the deck exists, cleaned up when it goes.
 * ─────────────────────────────────────────────────────────────────────────────
 */

type Components = Record<string, ComponentType<Record<string, unknown>>>;

/** The theme this screen shows, as the manifest resolved it (null for a plain CSS theme). */
export function themeRefFor(manifest: DeckManifest, theme: string): PackageRef | null {
  const p = manifest.packages;
  if (!p) return null;
  return p.themes.find((t) => t.name === theme) ?? (p.theme?.name === theme ? p.theme : null);
}

export interface DeckPackagesState {
  components: Components;
  layers: ResolvedLayers;
  /** The modules whose `setup` runs: the theme on show, then the addons. */
  modules: PackageModule[];
}

/** Lazy theme modules this page loaded, by the loader (a recompiled deck has new loaders). */
const loadedThemes = new WeakMap<object, PackageModule | null>();

export function useDeckPackages(
  manifest: DeckManifest,
  deckComponents: Components,
  deckLayers: DeckLayers | undefined,
  theme: string,
): DeckPackagesState {
  const ref = themeRefFor(manifest, theme);
  const [, setTick] = useState(0);
  const eager = useMemo(() => normalizeModule(ref?.module), [ref]);
  const lazy = ref?.load && !ref.module ? loadedThemes.get(ref.load) : undefined;
  const themeModule = eager ?? lazy ?? null;

  useEffect(() => {
    if (!ref?.load || ref.module || loadedThemes.has(ref.load)) return;
    let alive = true;
    const load = ref.load;
    load()
      .then((m) => {
        loadedThemes.set(load, normalizeModule(m));
        if (alive) setTick((n) => n + 1);
      })
      .catch((err: unknown) =>
        console.warn(`[deck] the theme "${ref.name}" could not load its layouts:`, err),
      );
    return () => {
      alive = false;
    };
  }, [ref]);

  const addons = useMemo(
    () => (manifest.packages?.addons ?? []).map((a) => normalizeModule(a.module)),
    [manifest.packages],
  );
  // The deck's own theme's components stay under whichever theme is on show: slides were written
  // with them, and a theme picked from the menu must not leave a slide naming a missing one.
  // Its layouts and layers go with it — a slide falls back to the built-in layout instead.
  const declared = useMemo(
    () => normalizeModule(manifest.packages?.theme?.module),
    [manifest.packages],
  );
  const components = useMemo(
    () => ({
      ...(declared && declared !== themeModule ? (declared.components as Components) : {}),
      ...mergeComponents(deckComponents, addons, themeModule),
    }),
    [deckComponents, addons, themeModule, declared],
  );
  const layers = useMemo(
    () => mergeLayers([manifest.packages?.layers, deckLayers], addons, themeModule),
    [manifest.packages, deckLayers, addons, themeModule],
  );
  const modules = useMemo(
    () => [themeModule, ...addons].filter((m): m is PackageModule => !!m),
    [themeModule, addons],
  );
  return { components, layers, modules };
}

/** `--theme-*` (the theme's themeConfig under the deck's) and the font variables, for the root. */
export function useRootVars(
  manifest: DeckManifest,
  theme: string,
  themeConfig: Record<string, unknown>,
  fonts: unknown,
): Record<string, string> {
  const ref = themeRefFor(manifest, theme);
  return useMemo(() => {
    const meta = (ref?.meta ?? BUILTIN_THEMES[theme] ?? null) as ThemeMeta | null;
    return {
      ...themeConfigVars(mergeThemeConfig(meta, themeConfig)),
      ...resolveFonts(fonts).vars,
    };
  }, [ref, theme, themeConfig, fonts]);
}

// ── fonts ────────────────────────────────────────────────────────────────────────────────────

let fontsPending: Promise<void> = Promise.resolve();

/**
 * Resolves once the deck's font stylesheets have loaded (or failed) and the browser has the
 * faces — what the print view waits for before it says it is ready, so an export is never
 * taken in the fallback face.
 */
export function deckFontsReady(): Promise<void> {
  return fontsPending;
}

function loadSheet(
  sheet: ResolvedFonts["sheets"][number],
  links: HTMLLinkElement[],
): Promise<void> {
  return new Promise((done) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = localAsset(sheet.href);
    link.dataset.deckFont = sheet.family;
    let retried = false;
    link.onload = () => done();
    link.onerror = () => {
      // Google refuses the whole family when one weight is missing: ask once more without them.
      if (sheet.retry && !retried) {
        retried = true;
        link.href = localAsset(sheet.retry);
        return;
      }
      console.warn(`[deck] the font "${sheet.family}" could not load from ${sheet.href}.`);
      done();
    };
    document.head.appendChild(link);
    links.push(link);
    // A stylesheet that never answers must not hold an export forever.
    setTimeout(done, 8000);
  });
}

/** Load the deck's `fonts` (either form) for as long as the deck is mounted. */
export function useDeckFonts(fonts: unknown): void {
  const key = JSON.stringify(fonts ?? null);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const resolved = resolveFonts(JSON.parse(key));
    if (!resolved.sheets.length) return;
    const links: HTMLLinkElement[] = [];
    fontsPending = Promise.all(resolved.sheets.map((s) => loadSheet(s, links)))
      .then(() =>
        Promise.all(
          resolved.families.map((f) => document.fonts?.load(`1em "${f}"`).catch(() => [])),
        ),
      )
      .then(() => document.fonts?.ready)
      .then(() => undefined);
    return () => links.forEach((l) => l.remove());
  }, [key]);
}

/** True once `deckFontsReady()` has resolved (for the print view's ready flag). */
export function useFontsReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    // A tick first, so the deck's own effect has started the load this waits for.
    const t = setTimeout(() => {
      void deckFontsReady().then(() => alive && setReady(true));
    }, 0);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, []);
  return ready;
}

// ── setup(api) ───────────────────────────────────────────────────────────────────────────────

const apiExtensions = new Map<string, unknown>();

/**
 * Offer packages one more thing in `setup(api)`: `extendSetupApi("registerCodeRunner", fn)` makes
 * `api.registerCodeRunner` exist for every theme and addon set up after it. The engine's own
 * extension points call this from their module, so nothing here needs to know about them.
 */
export function extendSetupApi(name: string, value: unknown): void {
  if (["deck", "commands", "panels", "addRoute"].includes(name))
    throw new Error(`extendSetupApi: "${name}" is reserved.`);
  apiExtensions.set(name, value);
}

/** `"shift+k"`, `"g"`, `"mod+e"` (mod = ⌘ on a Mac, Ctrl elsewhere) against a key event. */
export function matchesShortcut(
  combo: string,
  e: Pick<KeyboardEvent, "key" | "shiftKey" | "altKey" | "ctrlKey" | "metaKey">,
): boolean {
  const parts = combo
    .toLowerCase()
    .split("+")
    .map((p) => p.trim())
    .filter(Boolean);
  const key = parts.pop();
  if (!key) return false;
  const mac = typeof navigator !== "undefined" && /mac|iphone|ipad/i.test(navigator.platform ?? "");
  const want = {
    shift: parts.includes("shift"),
    alt: parts.includes("alt") || parts.includes("option"),
    ctrl: parts.includes("ctrl") || (!mac && parts.includes("mod")),
    meta: parts.includes("meta") || parts.includes("cmd") || (mac && parts.includes("mod")),
  };
  const pressed = e.key.toLowerCase() === key || (key === "space" && e.key === " ");
  return (
    pressed &&
    e.altKey === want.alt &&
    e.ctrlKey === want.ctrl &&
    e.metaKey === want.meta &&
    // A shifted character (`?`) carries its shift in the key itself.
    (e.shiftKey === want.shift || (!want.shift && key.length === 1 && !/[a-z0-9]/.test(key)))
  );
}

/**
 * The api one setup run gets. `dispose()` undoes what its helpers registered (`shortcut`); the
 * deck calls it when the package goes, after the setup's own cleanup.
 */
export function setupApi(deck: DeckRuntime | (() => DeckRuntime)): SetupApi & { dispose(): void } {
  const current = typeof deck === "function" ? deck : () => deck;
  const now = current();
  const disposers: Array<() => void> = [];
  const api = {
    ...Object.fromEntries(apiExtensions),
    commands: now.commands,
    panels: now.panels,
    registerRenderer,
    registerLazyRenderer,
    registerBackground,
    /**
     * A key for the package: `shortcut("shift+k", () => …)`. Not while typing in a field, never
     * in a projector window; the deck's own keys still run (pick one the help overlay lacks).
     */
    shortcut(combo: string, run: (e: KeyboardEvent) => void) {
      if (typeof window === "undefined") return () => {};
      const onKey = (e: KeyboardEvent) => {
        if (e.defaultPrevented || isEditable(e.target) || current().projector) return;
        if (!matchesShortcut(combo, e)) return;
        e.preventDefault();
        run(e);
      };
      window.addEventListener("keydown", onKey);
      const off = () => window.removeEventListener("keydown", onKey);
      disposers.push(off);
      return off;
    },
    /** A page of the package's own (react/routes.tsx); removed with the package. */
    addRoute(route: Parameters<SetupApi["addRoute"]>[0]) {
      const off = current().routes?.add(route) ?? (() => {});
      disposers.push(off);
      return off;
    },
    dispose() {
      for (const off of disposers.splice(0).reverse()) off();
    },
  } as Omit<SetupApi, "deck"> & { dispose(): void };
  // Always the deck as it is now: a theme switch makes a new runtime object.
  return Object.defineProperty(api, "deck", { get: current, enumerable: true }) as SetupApi & {
    dispose(): void;
  };
}

/** Run each package's `setup` once per deck (and again for a theme picked from the menu). */
export function usePackageSetup(deck: DeckRuntime, modules: PackageModule[]): void {
  const latest = useRef(deck);
  latest.current = deck;
  useEffect(() => {
    const setups = modules
      .map((m) => m.setup)
      .filter((s): s is NonNullable<PackageModule["setup"]> => !!s);
    if (!setups.length) return;
    const cleanups: Array<() => void> = [];
    let alive = true;
    const api = setupApi(() => latest.current);
    for (const setup of setups) {
      try {
        const out = setup(api);
        if (typeof out === "function") cleanups.push(out);
        else if (out && typeof (out as Promise<unknown>).then === "function")
          void (out as Promise<void | (() => void)>).then(
            (fn) => {
              if (typeof fn !== "function") return;
              if (alive) cleanups.push(fn);
              else fn();
            },
            (err: unknown) => console.warn("[deck] a package's setup failed:", err),
          );
      } catch (err) {
        console.warn("[deck] a package's setup failed:", err);
      }
    }
    return () => {
      alive = false;
      for (const fn of cleanups.reverse()) fn();
      api.dispose();
    };
  }, [modules]);
}
