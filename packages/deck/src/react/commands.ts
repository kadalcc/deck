import { useEffect, useRef, useSyncExternalStore } from "react";
import { z } from "zod";

import type { CommandInfo, CommandSpec } from "../core/commands.ts";
import { flatIndex, fromFlat, totalSlides } from "../core/model.ts";
import { key as navKey } from "../core/navigation.ts";
import { type DeckRuntime, useDeck } from "./context.ts";

/** A point on the slide, 0–1 from the top-left corner. */
const point = z.object({
  x: z.number().min(0).max(1).describe("0 is the left edge of the slide, 1 the right"),
  y: z.number().min(0).max(1).describe("0 is the top edge of the slide, 1 the bottom"),
});
const force = z
  .object({ on: z.boolean().optional().describe("true to switch on, false off; omit to toggle") })
  .strict();

/** What an agent (or a remote) needs to know about where the deck is. */
export function deckState(rt: DeckRuntime) {
  const s = rt.nav.get();
  const u = rt.ui.get();
  const meta = rt.columns[s.h]?.slides[s.v] ?? null;
  return {
    mode: rt.mode,
    slide: {
      index: flatIndex(rt.columns, s.h, s.v),
      h: s.h,
      v: s.v,
      id: meta?.id ?? null,
      title: meta?.title ?? null,
      click: s.click,
      clicks: s.totals[navKey(s.h, s.v)] ?? 0,
    },
    total: totalSlides(rt.columns),
    blackout: s.paused,
    overview: s.overview,
    autoSliding: s.autoSliding,
    pointer: u.pointer,
    spotlight: u.spotlight,
    drawing: u.drawing,
    hints: u.hints,
    zoomed: !!u.zoom,
    colorScheme: u.colorScheme,
    theme: u.theme,
  };
}

function slideSummary(rt: DeckRuntime, flat: number, withNotes: boolean) {
  const { h, v } = fromFlat(rt.columns, flat);
  const meta = rt.columns[h]?.slides[v];
  if (!meta) return null;
  return {
    index: flat,
    h,
    v,
    id: meta.id,
    title: meta.title,
    layout: typeof meta.frontmatter.layout === "string" ? meta.frontmatter.layout : null,
    text: meta.text ?? "",
    ...(withNotes ? { notes: meta.notesText ?? null } : { hasNotes: meta.hasNotes }),
  };
}

/** Keeps a command's parameter type while it sits in a list of commands of every shape. */
export const cmd = <P extends z.ZodType>(spec: CommandSpec<P>): CommandSpec =>
  spec as unknown as CommandSpec;

/**
 * The runtime's own commands: everything `DeckActions` can do, plus the reads an agent needs.
 * Layers that own state (drawing, laser, confetti, narration) register theirs where they live.
 */
export function builtinCommands(rt: DeckRuntime): CommandSpec[] {
  const a = rt.actions;
  const c = rt.config;
  const isPresenting = () => rt.mode === "play" || rt.mode === "presenter";
  const nav = (
    id: string,
    title: string,
    description: string,
    run: () => void,
    keys?: string,
  ): CommandSpec => ({
    id,
    title,
    description,
    group: "navigate",
    keys,
    enabled: isPresenting,
    run: () => {
      run();
      return deckState(rt).slide;
    },
  });

  const list: CommandSpec[] = [
    nav("nav.next", "Next", "Advance one step: the next click on this slide, or the next slide.", a.next, "Space"),
    nav("nav.prev", "Previous", "Go back one step: the previous click, or the previous slide.", a.prev, "K"),
    nav("nav.nextSlide", "Next slide", "Skip the remaining clicks and go to the next slide.", a.nextSlide),
    nav("nav.prevSlide", "Previous slide", "Go to the previous slide, skipping its clicks.", a.prevSlide),
    nav("nav.left", "Left", "reveal.js's left arrow: back a click, then the previous column.", a.left, "←"),
    nav("nav.right", "Right", "reveal.js's right arrow: forward a click, then the next column.", a.right, "→"),
    nav("nav.up", "Up", "The slide above in a vertical stack.", a.up, "↑"),
    nav("nav.down", "Down", "The slide below in a vertical stack.", a.down, "↓"),
    nav("nav.first", "First slide", "Go to the first slide.", a.first, "Home"),
    nav("nav.last", "Last slide", "Go to the last slide.", a.last, "End"),
    cmd({
      id: "nav.goto",
      title: "Go to slide",
      description:
        "Go to a slide by its 0-based position in the deck (`index`), by its id, or by a word in its title; optionally to a click step on it.",
      group: "navigate",
      enabled: isPresenting,
      params: z
        .object({
          index: z.number().int().min(0).optional().describe("0-based position in the deck"),
          id: z.string().optional().describe("the slide's id (frontmatter `id`)"),
          title: z.string().optional().describe("a case-insensitive part of the slide's title"),
          click: z.number().int().min(0).optional().describe("the click step to show, default 0"),
        })
        .strict()
        .refine((p) => p.index !== undefined || p.id || p.title, "Give index, id or title."),
      run: (p) => {
        let flat = p.index;
        if (flat === undefined && p.id) {
          const all = rt.columns.flatMap((col) => col.slides);
          const i = all.findIndex((s) => s.id === p.id);
          if (i === -1) throw new Error(`No slide with id "${p.id}".`);
          flat = i;
        }
        if (flat === undefined && p.title) {
          const want = p.title.toLowerCase();
          const all = rt.columns.flatMap((col) => col.slides);
          const i = all.findIndex((s) => s.title?.toLowerCase().includes(want));
          if (i === -1) throw new Error(`No slide title contains "${p.title}".`);
          flat = i;
        }
        const total = totalSlides(rt.columns);
        if (flat! >= total) throw new Error(`The deck has ${total} slides (0–${total - 1}).`);
        const { h, v } = fromFlat(rt.columns, flat!);
        a.goto(h, v, p.click ?? 0);
        return deckState(rt).slide;
      },
    }),
    cmd({
      id: "present.blackout",
      title: "Blackout",
      description: "Black the screen out for everyone (pause), or bring the slides back.",
      group: "present",
      keys: "B .",
      params: force,
      enabled: () => c.pause && isPresenting(),
      run: (p) => {
        a.togglePause(p.on);
        return { blackout: rt.nav.get().paused };
      },
    }),
    cmd({
      id: "present.pointer",
      title: "Laser pointer",
      description: "Switch the laser pointer on or off. Aim it with present.laserAt.",
      group: "present",
      keys: "X",
      params: force,
      enabled: isPresenting,
      run: (p) => {
        a.togglePointer(p.on);
        return { pointer: rt.ui.get().pointer };
      },
    }),
    cmd({
      id: "present.spotlight",
      title: "Spotlight",
      description:
        "Dim everything except a circle around the laser, to focus the room on one spot. Turns the laser on.",
      group: "present",
      params: force,
      enabled: isPresenting,
      run: (p) => {
        rt.ui.update((u) => {
          const spotlight = p.on ?? !u.spotlight;
          return { ...u, spotlight, pointer: spotlight ? true : u.pointer };
        });
        return { spotlight: rt.ui.get().spotlight };
      },
    }),
    cmd({
      id: "present.autoSlide",
      title: "Auto-slide",
      description: "Start or pause advancing on a timer.",
      group: "present",
      keys: "A",
      enabled: isPresenting,
      run: () => {
        a.toggleAutoSlide();
        return { autoSliding: rt.nav.get().autoSliding };
      },
    }),
    cmd({
      id: "draw.toggle",
      title: "Pen",
      description: "Switch the drawing pen on or off.",
      group: "draw",
      keys: "C",
      params: force,
      enabled: () => c.drawings.enabled && isPresenting(),
      run: (p) => {
        a.toggleDrawing(p.on);
        return { drawing: rt.ui.get().drawing };
      },
    }),
    cmd({
      id: "view.zoom",
      title: "Zoom in",
      description: "Zoom into a point on the slide (2×). Zoom out with view.zoomOut.",
      group: "view",
      keys: "Alt+click",
      params: point.extend({ scale: z.number().min(1.2).max(6).optional() }).strict(),
      enabled: isPresenting,
      run: (p) => {
        const zoom = { x: p.x * c.width, y: p.y * c.height, scale: p.scale ?? 2 };
        rt.ui.update((u) => ({ ...u, zoom }));
        return { zoomed: true };
      },
    }),
    cmd({
      id: "view.zoomOut",
      title: "Zoom out",
      description: "Back to the whole slide.",
      group: "view",
      keys: "Esc",
      run: () => {
        a.zoomOut();
        return { zoomed: false };
      },
    }),
    cmd({
      id: "view.overview",
      title: "Overview",
      description: "Show or hide every slide as a grid of tiles.",
      group: "view",
      keys: "O",
      params: force,
      enabled: () => c.overview && isPresenting(),
      run: (p) => a.toggleOverview(p.on),
    }),
    cmd({
      id: "view.hints",
      title: "Focus labels",
      description:
        "Label every link and control on the slide with a letter, so one can be opened from the keyboard.",
      group: "view",
      keys: "F",
      params: force,
      enabled: isPresenting,
      run: (p) => a.toggleHints(p.on),
    }),
    cmd({
      id: "view.fullscreen",
      title: "Full screen",
      description: "Enter or leave full screen (needs a user gesture in most browsers).",
      group: "view",
      run: () => a.toggleFullscreen(),
    }),
    cmd({
      id: "view.help",
      title: "Keyboard help",
      description: "Show or hide the keyboard shortcuts.",
      group: "view",
      keys: "?",
      params: force,
      enabled: () => c.help,
      run: (p) => a.toggleHelp(p.on),
    }),
    cmd({
      id: "view.jump",
      title: "Jump to slide",
      description: "Open the prompt for a slide number.",
      group: "view",
      keys: "G",
      enabled: () => c.jumpToSlide,
      run: () => a.toggleJump(true),
    }),
    cmd({
      id: "view.search",
      title: "Search",
      description: "Open search across the slides.",
      group: "view",
      keys: "Ctrl+Shift+F",
      enabled: () => c.search,
      run: () => a.toggleSearch(true),
    }),
    cmd({
      id: "view.colorScheme",
      title: "Light or dark",
      description: "Set the colour scheme, or toggle it.",
      group: "view",
      keys: "D",
      params: z.object({ scheme: z.enum(["light", "dark"]).optional() }).strict(),
      run: (p) => {
        if (p.scheme) a.setColorScheme(p.scheme);
        else a.toggleColorScheme();
        return { colorScheme: rt.ui.get().colorScheme };
      },
    }),
    cmd({
      id: "view.theme",
      title: "Theme",
      description: `Switch this screen's theme. Available: ${c.themes.join(", ")}.`,
      group: "view",
      params: z.object({ name: z.string() }).strict(),
      enabled: () => c.themes.length > 1,
      run: (p) => {
        if (!c.themes.includes(p.name)) throw new Error(`Themes: ${c.themes.join(", ")}.`);
        a.setTheme(p.name);
        return { theme: p.name };
      },
    }),
    cmd({
      id: "view.themeMenu",
      title: "Theme menu",
      description: "Open or close the theme menu.",
      group: "view",
      keys: "T",
      params: force,
      run: (p) => a.toggleThemeMenu(p.on),
    }),
    cmd({
      id: "view.presenter",
      title: "Presenter view",
      description: "Open the presenter window (notes, timer, next slide).",
      group: "view",
      keys: "P",
      enabled: () => rt.mode === "play",
      run: () => a.openPresenter(),
    }),
    cmd({
      id: "view.projector",
      title: "Share window",
      description: "Open or close a window that mirrors the slides only, to share on a call.",
      group: "view",
      params: force,
      enabled: () => rt.mode === "presenter",
      run: (p) => a.toggleProjector(p.on),
    }),
    cmd({
      id: "view.toast",
      title: "Show a message",
      description: "Flash a short message on this screen for a moment.",
      group: "view",
      params: z.object({ message: z.string().min(1).max(140) }).strict(),
      run: (p) => a.toast(p.message),
    }),
    cmd({
      id: "deck.state",
      title: "Where are we",
      description:
        "The current slide (index, title, click step), the slide count, and which tools are on.",
      group: "query",
      readOnly: true,
      run: () => deckState(rt),
    }),
    cmd({
      id: "deck.outline",
      title: "Outline",
      description: "Every slide's index, id, title and layout, and whether it has notes.",
      group: "query",
      readOnly: true,
      run: () => ({
        title: typeof rt.manifest.headmatter.title === "string" ? rt.manifest.headmatter.title : null,
        slides: Array.from({ length: totalSlides(rt.columns) }, (_, i) =>
          slideSummary(rt, i, false),
        ).map(
          (s) =>
            s && {
              index: s.index,
              id: s.id,
              title: s.title,
              layout: s.layout,
              hasNotes: "hasNotes" in s ? s.hasNotes : !!s.notes,
            },
        ),
      }),
    }),
    cmd({
      id: "deck.slide",
      title: "Read a slide",
      description:
        "A slide's text and speaker notes (notes keep [click] markers between steps). Defaults to the current slide.",
      group: "query",
      readOnly: true,
      params: z.object({ index: z.number().int().min(0).optional() }).strict(),
      run: (p) => {
        const flat = p.index ?? deckState(rt).slide.index;
        const s = slideSummary(rt, flat, true);
        if (!s) throw new Error(`No slide ${flat}.`);
        return s;
      },
    }),
    cmd({
      id: "deck.search",
      title: "Find slides",
      description: "Slides whose title, text or notes contain the words, best first.",
      group: "query",
      readOnly: true,
      params: z.object({ query: z.string().min(1) }).strict(),
      run: (p) => {
        const words = p.query.toLowerCase().split(/\s+/).filter(Boolean);
        const hits: { index: number; title: string | null; score: number }[] = [];
        const all = rt.columns.flatMap((col) => col.slides);
        all.forEach((s, index) => {
          const title = (s.title ?? "").toLowerCase();
          const body = `${s.text ?? ""} ${s.notesText ?? ""}`.toLowerCase();
          let score = 0;
          for (const w of words) score += (title.includes(w) ? 3 : 0) + (body.includes(w) ? 1 : 0);
          if (score) hits.push({ index, title: s.title, score });
        });
        return hits.sort((x, y) => y.score - x.score).slice(0, 10);
      },
    }),
    cmd({
      id: "deck.commands",
      title: "What can I do",
      description: "Every command available right now, with its parameters as JSON Schema.",
      group: "query",
      readOnly: true,
      run: (): CommandInfo[] => rt.commands.list(),
    }),
  ];
  return list;
}

/** Register built-ins once per runtime. */
export function useBuiltinCommands(rt: DeckRuntime): void {
  useEffect(() => {
    const offs = builtinCommands(rt).map((spec) => rt.commands.register(spec));
    return () => {
      for (const off of offs) off();
    };
  }, [rt]);
}

/**
 * Register a command for as long as the calling component is mounted. `spec` may change every
 * render: the registration keeps the latest `run`/`enabled` without re-registering.
 */
export function useCommand<P extends z.ZodType>(spec: CommandSpec<P> | null): void {
  const rt = useDeck();
  const latest = useRef(spec);
  latest.current = spec;
  const id = spec?.id ?? null;
  useEffect(() => {
    if (!id || !latest.current) return;
    const s = latest.current;
    return rt.commands.register({
      ...s,
      enabled: () => !!latest.current && (latest.current.enabled ? latest.current.enabled() : true),
      run: (params, origin) => latest.current!.run(params as never, origin),
    });
  }, [rt.commands, id]);
}

/** The commands available now, re-rendering when the set changes. */
export function useCommandList(): CommandInfo[] {
  const rt = useDeck();
  const cache = useRef<{ version: number; list: CommandInfo[] }>({ version: -1, list: [] });
  const version = useRef(0);
  return useSyncExternalStore(
    (cb) =>
      rt.commands.onChange(() => {
        version.current++;
        cb();
      }),
    () => {
      if (cache.current.version !== version.current)
        cache.current = { version: version.current, list: rt.commands.list() };
      return cache.current.list;
    },
    () => cache.current.list,
  );
}
