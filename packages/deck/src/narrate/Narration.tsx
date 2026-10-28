import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";

import { Icon } from "../components/bling.tsx";
import { flatIndex, resolveSlideOptions } from "../core/model.ts";
import { key as navKey } from "../core/navigation.ts";
import { readItem, writeItem } from "../core/storage.ts";
import { useStore } from "../core/store.ts";
import { cmd, useCommand } from "../react/commands.ts";
import { type DeckRuntime, useDeck } from "../react/context.ts";
import { BackgroundLayer } from "../react/Backgrounds.tsx";
import { Listbox, type ListboxGroup } from "../react/Listbox.tsx";
import { RenderContextProvider } from "../react/render-context.ts";
import { SlideFrame } from "../react/SlideFrame.tsx";
import {
  type Chapter,
  chapterOfSlide,
  chaptersOf,
  clock,
  nearestSlide,
  slideAtTime,
  slideRange,
} from "./chapters.ts";
import { chooseEngine, ENGINE_CHOICES, type EngineChoice, silentEngine } from "./engine.ts";
import {
  BakedClips,
  browserEngine,
  browserVoices,
  hasSpeechSynthesis,
  KokoroClient,
} from "./engines.ts";
import { activeNarrator } from "./active.ts";
import { isKokoroVoice, KOKORO_VOICES } from "./kokoro-protocol.ts";
import { type NarrationState, Narrator, type NarratorHost, RATES } from "./player.ts";
import { barFill, barSpan, narrationPosition, steadyPosition } from "./progress.ts";
import { speechMs, type Timeline, timelineOf } from "./text.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * <Narration> — the narrator, its commands and its bar
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Mounted at the bottom of the presenter view, and on the deck itself behind `?narrate` or the R
 * key (react/NarrationGate.tsx). It is a lazy chunk: a deck that never narrates never loads it.
 * Every control is a `narrate.*` command, so a key, the phone remote and an agent can run the
 * same rehearsal the buttons do.
 *
 * In the presenter view the bar can be hidden (presenter/rehearsal.ts): it stays mounted, so the
 * narrator keeps going, and shows as a small pill while it plays or waits paused mid-talk. There
 * the voice and the engine sit in the toolbar's rehearsal menu (`RehearsalSettings` below) rather
 * than on the bar.
 * ─────────────────────────────────────────────────────────────────────────────
 */

interface Prefs {
  rate?: number;
  volume?: number;
  muted?: boolean;
  voice?: string;
  browserVoice?: string | null;
  engine?: EngineChoice;
  follow?: boolean;
}
const PREFS = "deck.narration";
function readPrefs(): Prefs {
  try {
    const raw = JSON.parse(readItem(PREFS) ?? "{}") as Prefs;
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

/** The narrator for this deck window, wired to its commands, its slides and its engines. */
function useNarrator(rt: DeckRuntime) {
  const made = useMemo(() => {
    const c = rt.config.narration;
    const slides = rt.columns.flatMap((col) => col.slides);
    const baked = new BakedClips(rt.base);
    const kokoro = new KokoroClient(rt.manifest.kokoro, c);
    const estimate = (text: string, rate: number) => {
      const ms = baked.get(narrator.state.get().voice, text)?.ms;
      return ms ? ms / rate : speechMs(text, rate);
    };
    const engines = {
      baked: baked.engine(),
      kokoro: kokoro.engine(),
      browser: browserEngine(estimate),
      silent: silentEngine(estimate),
    };
    const host: NarratorHost = {
      slides,
      where: () => {
        const s = rt.nav.get();
        return {
          index: flatIndex(rt.columns, s.h, s.v),
          click: s.click,
          clicks: s.totals[navKey(s.h, s.v)] ?? null,
        };
      },
      run: (id, params) => rt.commands.run(id, params, "api"),
      onMove: (listener) =>
        rt.nav.subscribe((s, prev) => {
          if (
            s.h !== prev.h ||
            s.v !== prev.v ||
            s.click !== prev.click ||
            s.totals !== prev.totals
          )
            listener();
        }),
      async engineFor(text, state) {
        await baked.load();
        const pick = chooseEngine(state.engine, {
          baked: !!baked.get(state.voice, text),
          kokoro: kokoro.status.get().state,
          browser: hasSpeechSynthesis(),
        });
        if (pick.loadKokoro) kokoro.load();
        return engines[pick.engine];
      },
      estimate,
      gap: c.gap,
      silent: c.silent,
    };
    const prefs = readPrefs();
    const narrator = new Narrator(host, {
      voice: prefs.voice && isKokoroVoice(prefs.voice) ? prefs.voice : c.voice,
      rate: prefs.rate ?? c.rate,
      engine: prefs.engine && ENGINE_CHOICES.includes(prefs.engine) ? prefs.engine : c.engine,
      volume: prefs.volume,
      muted: prefs.muted,
      browserVoice: prefs.browserVoice ?? null,
      follow: prefs.follow,
    });
    narrator.setKokoro(kokoro.status.get());
    return { narrator, kokoro, baked, engines, slides };
  }, [rt]);

  useEffect(() => {
    const { narrator, kokoro, engines } = made;
    const detach = narrator.attach();
    activeNarrator.set(narrator);
    const offKokoro = kokoro.status.subscribe((s) => narrator.setKokoro(s));
    const offState = narrator.state.subscribe((s, prev) => {
      if (s.volume !== prev.volume || s.muted !== prev.muted)
        for (const e of Object.values(engines)) e.setVolume?.(s.volume, s.muted);
      const keep: Prefs = {
        rate: s.rate,
        volume: s.volume,
        muted: s.muted,
        voice: s.voice,
        browserVoice: s.browserVoice,
        engine: s.engine,
        follow: s.follow,
      };
      writeItem(PREFS, JSON.stringify(keep));
    });
    return () => {
      offKokoro();
      offState();
      detach();
      if (activeNarrator.get() === narrator) activeNarrator.set(null);
      kokoro.destroy();
    };
  }, [made]);
  return made;
}

/** What `narrate.state` answers. */
function summary(s: NarrationState, total: number) {
  return {
    playing: s.playing,
    phase: s.phase,
    slide: s.slide,
    segment: s.segment,
    rate: s.rate,
    volume: s.volume,
    muted: s.muted,
    voice: s.voice,
    browserVoice: s.browserVoice,
    engine: s.engine,
    using: s.using,
    follow: s.follow,
    kokoro: s.kokoro,
    estimatedTotalMs: Math.round(total),
    error: s.error,
  };
}

function useNarrateCommands(narrator: Narrator, slideCount: number, total: () => number) {
  const state = () => summary(narrator.state.get(), total());
  const group = "narrate" as const;
  useCommand(
    cmd({
      id: "narrate.play",
      title: "Narrate",
      description:
        "Read the speaker notes aloud and turn the pages: each click's notes, then the next step. From the current step, or from the start of slide `from` (0-based).",
      group,
      params: z
        .object({
          from: z
            .number()
            .int()
            .min(0)
            .max(Math.max(0, slideCount - 1))
            .optional(),
        })
        .strict(),
      run: async (p) => {
        await narrator.play(p.from);
        return state();
      },
    }),
  );
  useCommand(
    cmd({
      id: "narrate.seek",
      title: "Narration: go to a slide",
      description:
        "Go to the start of slide `to` (0-based) and leave playing alone: playing goes on from there, paused or stopped waits there.",
      group,
      params: z
        .object({
          to: z
            .number()
            .int()
            .min(0)
            .max(Math.max(0, slideCount - 1)),
        })
        .strict(),
      run: async (p) => {
        await narrator.seek(p.to);
        return state();
      },
    }),
  );
  useCommand(
    cmd({
      id: "narrate.pause",
      title: "Pause narration",
      description: "Stop the voice at once; narrate.play says the current step again.",
      group,
      run: () => {
        narrator.pause();
        return state();
      },
    }),
  );
  useCommand(
    cmd({
      id: "narrate.toggle",
      title: "Narrate or pause",
      description: "Start narrating, or pause it if it is playing.",
      group,
      keys: "R",
      run: async () => {
        await narrator.toggle();
        return state();
      },
    }),
  );
  useCommand(
    cmd({
      id: "narrate.stop",
      title: "Stop narration",
      description: "Stop, and start again from wherever the deck is next time.",
      group,
      run: () => {
        narrator.stop();
        return state();
      },
    }),
  );
  useCommand(
    cmd({
      id: "narrate.next",
      title: "Next narrated step",
      description: "Skip the rest of this step and go on to the next one.",
      group,
      run: async () => {
        await narrator.next();
        return state();
      },
    }),
  );
  useCommand(
    cmd({
      id: "narrate.prev",
      title: "Previous narrated step",
      description: "Back one step and say it again.",
      group,
      run: async () => {
        await narrator.prev();
        return state();
      },
    }),
  );
  useCommand(
    cmd({
      id: "narrate.rate",
      title: "Narration speed",
      description: `Speaking speed, 0.5–3 (the menu offers ${RATES.join(", ")}).`,
      group,
      params: z.object({ rate: z.number().min(0.5).max(3) }).strict(),
      run: (p) => {
        narrator.setRate(p.rate);
        return state();
      },
    }),
  );
  useCommand(
    cmd({
      id: "narrate.volume",
      title: "Narration volume",
      description: "Volume 0–1, and optionally mute or unmute.",
      group,
      params: z
        .object({ volume: z.number().min(0).max(1), muted: z.boolean().optional() })
        .strict(),
      run: (p) => {
        narrator.setVolume(p.volume, p.muted);
        return state();
      },
    }),
  );
  useCommand(
    cmd({
      id: "narrate.voice",
      title: "Narration voice",
      description: `A Kokoro voice id (${KOKORO_VOICES.slice(0, 4)
        .map((v) => v.id)
        .join(", ")}…; af_heart is the default), or the name of one of this browser's voices.`,
      group,
      params: z.object({ voice: z.string().min(1) }).strict(),
      run: (p) => {
        if (isKokoroVoice(p.voice)) {
          narrator.setVoice(p.voice);
          if (narrator.state.get().engine === "browser") narrator.setEngine("auto");
        } else {
          narrator.setVoice(p.voice, true);
          narrator.setEngine("browser");
        }
        return state();
      },
    }),
  );
  useCommand(
    cmd({
      id: "narrate.engine",
      title: "Narration engine",
      description:
        'Which voice says the notes: "auto" (recorded clips, else Kokoro once downloaded, else the browser\'s), "baked", "kokoro", "browser", or "silent" (timing only).',
      group,
      params: z
        .object({ engine: z.enum(["auto", "baked", "kokoro", "browser", "silent"]) })
        .strict(),
      run: (p) => {
        narrator.setEngine(p.engine);
        return state();
      },
    }),
  );
  useCommand(
    cmd({
      id: "narrate.follow",
      title: "Follow the narrator",
      description:
        "On: the narration turns the deck's pages. Off: it reads on and leaves the deck alone.",
      group,
      params: z.object({ on: z.boolean().optional() }).strict(),
      run: (p) => {
        narrator.setFollow(p.on ?? !narrator.state.get().follow);
        return state();
      },
    }),
  );
  useCommand(
    cmd({
      id: "narrate.state",
      title: "Narration state",
      description:
        "Whether it is playing, where, which engine and voice, the speed and volume, and the estimated length.",
      group: "query",
      readOnly: true,
      run: state,
    }),
  );
}

/**
 * The bar. `onClose` (the play view) adds a close button that pauses and closes. The presenter
 * view passes `hidden`/`onHide`/`onShow` instead (presenter/rehearsal.ts): its × hides the bar
 * and leaves the narrator running, and `menu` says the voice and engine are in its toolbar menu.
 */
export default function Narration({
  autoplay = false,
  onClose,
  hidden = false,
  onHide,
  onShow,
  menu = false,
}: {
  /** Start playing once mounted (from slide `from` when given). */
  autoplay?: { from?: number } | false;
  onClose?: () => void;
  /** Hidden: no bar; while narrating (or paused mid-way) a pill with the way back. */
  hidden?: boolean;
  onHide?: () => void;
  onShow?: () => void;
  /** The voice and the engine are picked elsewhere (the presenter's rehearsal menu). */
  menu?: boolean;
}) {
  const rt = useDeck();
  const { narrator, slides } = useNarrator(rt);
  const s = useStore(narrator.state);
  const c = rt.config.narration;
  const run = (id: string, params: unknown = {}) => void rt.commands.run(id, params, "ui");

  const timeline = useMemo(
    () => timelineOf(slides, { rate: s.rate, gap: c.gap, silent: c.silent }),
    [slides, s.rate, c.gap, c.silent],
  );
  const chapters = useMemo(
    () =>
      chaptersOf(
        slides.map((x) => ({
          h: x.h,
          title: x.title,
          section:
            resolveSlideOptions(x.frontmatter, rt.config, x.index === 0).layout === "section",
        })),
        timeline,
      ),
    [slides, timeline, rt.config],
  );
  const totalRef = useRef(timeline.total);
  totalRef.current = timeline.total;
  useNarrateCommands(narrator, slides.length, () => totalRef.current);

  // Started by the R key or narrate.play before this chunk had loaded.
  useEffect(() => {
    if (autoplay) void rt.commands.run("narrate.play", autoplay, "ui");
  }, [autoplay, rt.commands]);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!s.playing) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [s.playing]);

  // `now` is re-read on every render (the ticker above only asks for one), so a step that has just
  // begun is measured from its own start rather than from the last tick.
  void now;
  const raw = narrationPosition(timeline, c.gap, s, Date.now());
  const last = useRef<{ at: number; slide: number; segment: number } | null>(null);
  const elapsed = steadyPosition(
    last.current,
    { at: raw, slide: s.slide, segment: s.segment },
    s.playing,
  );
  // Only a move back skips the fill's easing: forward it glides, back it jumps.
  const back = last.current !== null && elapsed < last.current.at - 1;
  last.current = { at: elapsed, slide: s.slide, segment: s.segment };
  const pct = barFill(timeline, elapsed, s) * 100;
  const chapterNow = chapterOfSlide(chapters, s.slide);
  const current = chapters[chapterNow];

  const status =
    s.error ??
    (s.kokoro.state === "loading"
      ? s.kokoro.progress >= 0.999
        ? "Preparing voice…"
        : `Downloading voice ${Math.round(s.kokoro.progress * 100)}%`
      : s.using === "kokoro"
        ? `Kokoro${s.kokoro.device ? ` · ${s.kokoro.device === "webgpu" ? "WebGPU" : "WebAssembly"}` : ""}`
        : s.using === "baked"
          ? "Recorded voice"
          : s.using === "browser"
            ? "Browser voice"
            : s.using === "silent"
              ? "Silent · timing only"
              : s.kokoro.state === "error"
                ? "Kokoro unavailable · browser voice"
                : s.phase === "ended"
                  ? "The end"
                  : "Ready");

  const { voiceValue, voiceGroups, voiceShown, rates, engineGroups } = useChoices(s);

  if (hidden) {
    // Nothing to come back to while it is idle: the toolbar's menu and Shift R bring the bar back.
    if (!s.playing && s.phase !== "paused") return null;
    return (
      <div
        className={["deck-narration-pill", s.playing ? "is-playing" : ""].filter(Boolean).join(" ")}
        role="region"
        aria-label="Narration (timeline hidden)"
        onKeyDown={(e) => {
          if (e.key === " " || e.key === "Enter") e.stopPropagation();
        }}
      >
        <button
          type="button"
          className="deck-narration-play"
          onClick={() => run("narrate.toggle")}
          aria-label={s.playing ? "Pause narration (R)" : "Narrate (R)"}
          aria-pressed={s.playing}
          title={s.playing ? "Pause (R)" : "Narrate (R)"}
        >
          <Icon name={s.playing ? "pause" : "play"} />
        </button>
        <span className="deck-narration-pill-text">
          <b>{s.playing ? "Narrating" : "Paused"}</b>
          <span className="deck-narration-time">
            {clock(elapsed)} <span aria-hidden="true">/</span> {clock(timeline.total)}
          </span>
        </span>
        {onShow ? (
          <button
            type="button"
            className="deck-narration-pill-show"
            onClick={onShow}
            title="Show the rehearsal timeline (Shift R)"
          >
            <Icon name="chevrons-up" /> Timeline
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={["deck-narration", s.playing ? "is-playing" : ""].filter(Boolean).join(" ")}
      role="region"
      aria-label="Narration"
      // A button pressed with Space or Enter is that button, not the deck's next step too.
      onKeyDown={(e) => {
        const t = e.target as HTMLElement;
        if ((e.key === " " || e.key === "Enter") && t.closest("button, select, input"))
          e.stopPropagation();
      }}
    >
      <Track
        timeline={timeline}
        chapters={chapters}
        slide={s.slide}
        count={slides.length}
        pct={pct}
        jump={back}
        titleOf={(i) => timeline.slides[i]?.title ?? null}
        go={(to) => run("narrate.seek", { to })}
      />
      <div className="deck-narration-controls">
        <div className="deck-narration-group">
          <button
            type="button"
            onClick={() => run("narrate.prev")}
            aria-label="Previous step"
            title="Previous step"
          >
            <Icon name="skip-back" />
          </button>
          <button
            type="button"
            className="deck-narration-play"
            onClick={() => run("narrate.toggle")}
            aria-label={s.playing ? "Pause narration (R)" : "Narrate (R)"}
            aria-pressed={s.playing}
            title={s.playing ? "Pause (R)" : "Narrate (R)"}
          >
            <Icon name={s.playing ? "pause" : "play"} />
          </button>
          <button
            type="button"
            onClick={() => run("narrate.next")}
            aria-label="Next step"
            title="Next step"
          >
            <Icon name="skip-forward" />
          </button>
          <button
            type="button"
            onClick={() => run("narrate.stop")}
            aria-label="Stop narration"
            title="Stop"
          >
            <Icon name="square" />
          </button>
        </div>
        <div className="deck-narration-where">
          <span className="deck-narration-time" aria-label="Elapsed and estimated total">
            {clock(elapsed)} <span aria-hidden="true">/</span> {clock(timeline.total)}
          </span>
          <span className="deck-narration-chapter" title={current?.title ?? undefined}>
            {current && chapters.length > 1
              ? `${chapterNow + 1}/${chapters.length} · ${current.title ?? "Untitled"}`
              : `Slide ${s.slide + 1} of ${slides.length}`}
          </span>
          <span className="deck-narration-status" role="status" aria-live="polite">
            {status}
          </span>
        </div>
        <div className="deck-narration-group deck-narration-settings">
          <Listbox
            label="Speed"
            prefix="Speed"
            className="deck-narration-speed"
            minWidth={110}
            value={String(s.rate)}
            display={`${s.rate}×`}
            onChange={(v) => run("narrate.rate", { rate: Number(v) })}
            groups={[{ options: rates.map((r) => ({ value: String(r), label: `${r}×` })) }]}
          />
          <span className="deck-narration-loud">
            <button
              type="button"
              onClick={() => run("narrate.volume", { volume: s.volume, muted: !s.muted })}
              aria-label={s.muted ? "Unmute" : "Mute"}
              aria-pressed={s.muted}
              title={s.muted ? "Unmute" : "Mute"}
            >
              <Icon
                name={
                  s.muted || s.volume === 0 ? "volume-x" : s.volume < 0.5 ? "volume-1" : "volume-2"
                }
              />
            </button>
            <input
              className="deck-narration-volume"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={s.muted ? 0 : s.volume}
              style={
                { "--deck-range-fill": `${(s.muted ? 0 : s.volume) * 100}%` } as React.CSSProperties
              }
              onChange={(e) =>
                run("narrate.volume", { volume: Number(e.target.value), muted: false })
              }
              aria-label="Volume"
            />
          </span>
          {menu ? null : (
            <Listbox
              label="Voice"
              prefix="Voice"
              className="deck-narration-voice"
              minWidth={240}
              value={voiceValue}
              display={voiceShown}
              onChange={(v) =>
                run("narrate.voice", {
                  voice: v.startsWith("browser:") ? v.slice(8) || "default" : v,
                })
              }
              groups={voiceGroups}
            />
          )}
          {menu ? null : (
            <Listbox
              label="Engine"
              prefix="Engine"
              className="deck-narration-engine"
              minWidth={200}
              value={s.engine}
              onChange={(v) => run("narrate.engine", { engine: v })}
              groups={engineGroups}
            />
          )}
          <button
            type="button"
            className={["deck-narration-follow", s.follow ? "is-on" : ""].filter(Boolean).join(" ")}
            onClick={() => run("narrate.follow", { on: !s.follow })}
            aria-pressed={s.follow}
            title="Follow the narrator: let it turn the pages"
          >
            <Icon name="footprints" /> <span className="deck-narration-follow-label">Follow</span>
          </button>
          {onClose ? (
            <button
              type="button"
              onClick={() => {
                narrator.pause();
                onClose();
              }}
              aria-label="Close narration"
              title="Close"
            >
              <Icon name="x" />
            </button>
          ) : onHide ? (
            <button
              type="button"
              className="deck-narration-hide"
              onClick={onHide}
              aria-label="Hide the rehearsal timeline"
              title={
                s.playing
                  ? "Hide the timeline; narration keeps playing (Shift R)"
                  : "Hide the timeline (Shift R)"
              }
            >
              <Icon name="x" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** The speeds, voices and engines the bar and the rehearsal menu offer, for the state `s`. */
function useChoices(s: NarrationState) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    let alive = true;
    void browserVoices().then((v) => alive && setVoices(v));
    return () => {
      alive = false;
    };
  }, []);
  const voiceValue = s.engine === "browser" ? `browser:${s.browserVoice ?? ""}` : s.voice;
  const voiceGroups = useMemo<ListboxGroup[]>(
    () => [
      {
        label: "Kokoro",
        options: KOKORO_VOICES.map((v) => ({
          value: v.id,
          label: v.name,
          detail: `${v.lang === "en-gb" ? "UK" : "US"} ${v.gender}`,
        })),
      },
      ...(voices.length
        ? [
            {
              label: "This browser",
              options: voices.map((v) => ({
                value: `browser:${v.name}`,
                label: v.name,
                detail: v.lang,
              })),
            },
          ]
        : []),
    ],
    [voices],
  );
  const voiceShown = (() => {
    if (voiceValue.startsWith("browser:")) return voiceValue.slice(8) || "Browser default";
    const k = KOKORO_VOICES.find((v) => v.id === voiceValue);
    return k ? `${k.name} (${k.lang === "en-gb" ? "UK" : "US"} ${k.gender})` : voiceValue;
  })();
  const rates = [...new Set([...RATES, s.rate])].sort((a, b) => a - b);
  const engineGroups: ListboxGroup[] = [
    {
      options: [
        { value: "auto", label: "Auto", detail: "best available" },
        { value: "baked", label: "Recorded", detail: "pre-recorded clips" },
        {
          value: "kokoro",
          label: "Kokoro",
          detail: s.kokoro.state === "unavailable" ? "not installed" : "neural, in the browser",
          disabled: s.kokoro.state === "unavailable",
        },
        { value: "browser", label: "Browser", detail: "system voice" },
        { value: "silent", label: "Silent", detail: "timing only" },
      ],
    },
  ];
  return { voiceValue, voiceGroups, voiceShown, rates, engineGroups };
}

/**
 * The rehearsal settings in the presenter toolbar's menu (presenter/RehearsalMenu.tsx): speed,
 * voice, engine and following, for the narrator the bar is running. The same commands as the
 * bar's controls, so the two never disagree.
 */
export function RehearsalSettings() {
  const narrator = useStore(activeNarrator);
  if (!narrator) return <p className="deck-record-note">Loading the narrator…</p>;
  return <Settings narrator={narrator} />;
}

function Settings({ narrator }: { narrator: Narrator }) {
  const rt = useDeck();
  const s = useStore(narrator.state);
  const run = (id: string, params: unknown = {}) => void rt.commands.run(id, params, "ui");
  const { voiceValue, voiceGroups, voiceShown, rates, engineGroups } = useChoices(s);
  return (
    <>
      <div className="deck-record-row">
        <span>Speed</span>
        <Listbox
          label="Speed"
          value={String(s.rate)}
          display={`${s.rate}×`}
          onChange={(v) => run("narrate.rate", { rate: Number(v) })}
          groups={[{ options: rates.map((r) => ({ value: String(r), label: `${r}×` })) }]}
        />
      </div>
      <div className="deck-record-row">
        <span>Voice</span>
        <Listbox
          label="Voice"
          minWidth={240}
          value={voiceValue}
          display={voiceShown}
          onChange={(v) =>
            run("narrate.voice", { voice: v.startsWith("browser:") ? v.slice(8) || "default" : v })
          }
          groups={voiceGroups}
        />
      </div>
      <div className="deck-record-row">
        <span>Engine</span>
        <Listbox
          label="Engine"
          minWidth={200}
          value={s.engine}
          onChange={(v) => run("narrate.engine", { engine: v })}
          groups={engineGroups}
        />
      </div>
      <label className="deck-record-check">
        <input
          type="checkbox"
          checked={s.follow}
          onChange={(e) => run("narrate.follow", { on: e.target.checked })}
        />
        Follow the narrator: let it turn the pages
      </label>
    </>
  );
}

/** Below this many pixels apart, slide dots are thinned so a long deck's track stays legible. */
const DOT_GAP = 7;

/**
 * The timeline: a thin progress line with a small point for every slide and a larger one where
 * each chapter starts. Hovering anywhere says where a click would land — a picture of that slide,
 * its number, title and time, or over a chapter point the chapter — and a click goes there (playing
 * or not, as it was). As a slider: arrows step a slide, Page keys (or Shift+arrows) a chapter,
 * Home/End the ends. The bar runs from the first slide's start to the last's (progress.ts).
 */
function Track({
  timeline,
  chapters,
  slide,
  count,
  pct,
  jump,
  titleOf,
  go,
}: {
  timeline: Timeline;
  chapters: Chapter[];
  slide: number;
  count: number;
  pct: number;
  /** The fill moved back (a seek): show it there at once instead of easing. */
  jump: boolean;
  titleOf: (i: number) => string | null;
  go: (from: number) => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ x: number; slide: number; chapter: number | null } | null>(
    null,
  );
  const [shift, setShift] = useState(0);
  const [width, setWidth] = useState(0);
  const total = barSpan(timeline);
  const at = (ms: number) => (total ? Math.min(100, (ms / total) * 100) : 0);
  const chapterNow = chapterOfSlide(chapters, slide);
  const chapterStarts = useMemo(() => new Set(chapters.map((c) => c.first)), [chapters]);

  useLayoutEffect(() => {
    const el = track.current;
    if (!el) return;
    const measure = () => setWidth(el.getBoundingClientRect().width);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // A dot for every slide that has room for one; a chapter's first slide has its larger point.
  const dots = useMemo(() => {
    if (!total || !width) return [] as number[];
    const out: number[] = [];
    let lastX = -Infinity;
    for (const e of timeline.slides) {
      if (chapters.length > 1 && chapterStarts.has(e.index)) {
        lastX = (e.start / total) * width;
        continue;
      }
      const x = (e.start / total) * width;
      if (x - lastX < DOT_GAP) continue;
      out.push(e.index);
      lastX = x;
    }
    return out;
  }, [timeline, total, width, chapters.length, chapterStarts]);

  const locate = (clientX: number, target: EventTarget | null) => {
    const box = track.current?.getBoundingClientRect();
    if (!box || !total) return null;
    const x = Math.min(box.width, Math.max(0, clientX - box.left));
    const el = target as HTMLElement | null;
    const point = el?.closest?.("[data-chapter]");
    const chapter = point ? Number(point.getAttribute("data-chapter")) : null;
    if (chapter != null)
      return {
        x: (at(chapters[chapter]!.start) / 100) * box.width,
        slide: chapters[chapter]!.first,
        chapter,
      };
    const dot = el?.closest?.("[data-slide]");
    const ms = (x / box.width) * total;
    const hit = dot ? nearestSlide(timeline, dots, ms) : slideAtTime(timeline, ms);
    const start = timeline.slides[hit]?.start ?? 0;
    // Over a dot, the marker sits on the dot; elsewhere it follows the pointer.
    return { x: dot ? (at(start) / 100) * box.width : x, slide: hit, chapter: null };
  };

  // Keep the tooltip inside the window: measured after it renders, nudged back from either edge.
  useLayoutEffect(() => {
    const el = tip.current;
    const box = track.current?.getBoundingClientRect();
    if (!el || !box || !hover) return setShift(0);
    const w = el.offsetWidth;
    const left = box.left + hover.x - w / 2;
    const min = 8;
    const max = window.innerWidth - 8 - w;
    setShift(left < min ? min - left : left > max ? max - left : 0);
  }, [hover]);

  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const byChapter =
      e.key === "PageUp" ||
      e.key === "PageDown" ||
      (e.shiftKey && (e.key === "ArrowLeft" || e.key === "ArrowRight"));
    const dir =
      e.key === "ArrowRight" || e.key === "PageDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "PageUp"
          ? -1
          : 0;
    let target: number | null = null;
    if (e.key === "Home") target = 0;
    else if (e.key === "End") target = count - 1;
    else if (dir && byChapter) {
      // Back from inside a chapter goes to its start first, as a media player's "previous" does.
      const c = chapters[chapterNow];
      const to = dir < 0 && c && slide > c.first ? chapterNow : chapterNow + dir;
      target = chapters[Math.min(chapters.length - 1, Math.max(0, to))]?.first ?? null;
    } else if (dir) target = Math.min(count - 1, Math.max(0, slide + dir));
    if (target == null) return;
    e.preventDefault();
    e.stopPropagation();
    go(target);
  };

  const hc = hover?.chapter != null ? chapters[hover.chapter] : null;
  const hs = hover ? timeline.slides[hover.slide] : null;
  const title = titleOf(slide);

  return (
    <div
      ref={track}
      className="deck-narration-track"
      role="slider"
      tabIndex={0}
      aria-label="Narration position"
      aria-valuemin={1}
      aria-valuemax={count}
      aria-valuenow={slide + 1}
      aria-valuetext={`Slide ${slide + 1} of ${count}${title ? `: ${title}` : ""}${
        chapters.length > 1 ? `, chapter ${chapterNow + 1} of ${chapters.length}` : ""
      }`}
      data-deck-own-keys=""
      onPointerMove={(e) => setHover(locate(e.clientX, e.target))}
      onPointerLeave={() => setHover(null)}
      onClick={(e) => {
        const l = locate(e.clientX, e.target);
        if (l) go(l.slide);
      }}
      onKeyDown={onKey}
    >
      <div className="deck-narration-rail" aria-hidden="true">
        <div
          className={["deck-narration-fill", jump ? "is-jump" : ""].filter(Boolean).join(" ")}
          style={{ width: `${pct}%` }}
        />
        {hover ? <div className="deck-narration-hover" style={{ left: hover.x }} /> : null}
      </div>
      {dots.map((i) => (
        <span
          key={i}
          data-slide={i}
          aria-hidden="true"
          className={[
            "deck-narration-dot",
            i < slide ? "is-past" : i === slide ? "is-current" : "",
            hover?.chapter == null && hover?.slide === i ? "is-hover" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          style={{ left: `${at(timeline.slides[i]!.start)}%` }}
        />
      ))}
      {total && chapters.length > 1
        ? chapters.map((c) => (
            <span
              key={c.n}
              data-chapter={c.n}
              aria-hidden="true"
              className={[
                "deck-narration-point",
                c.n < chapterNow ? "is-past" : c.n === chapterNow ? "is-current" : "",
                hover?.chapter === c.n ? "is-hover" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={{ left: `${at(c.start)}%` }}
            />
          ))
        : null}
      {hover && hs ? (
        <div
          ref={tip}
          className="deck-narration-tip"
          role="presentation"
          style={{
            left: hover.x,
            width: THUMB_W,
            transform: `translateX(calc(-50% + ${shift}px))`,
          }}
        >
          <SlideThumb index={hover.slide} />
          {hc ? (
            <>
              <TipRow
                className="is-title"
                lead={`Chapter ${hc.n + 1} ·`}
                text={hc.title ?? "Untitled"}
              />
              <TipRow lead={null} text={`${slideRange(hc)} · starts ${clock(hc.start)}`} />
            </>
          ) : (
            <>
              <TipRow
                className="is-title"
                lead={`${hs.index + 1}.`}
                text={hs.title ?? "Untitled"}
              />
              <TipRow
                lead={chapters.length > 1 ? `${clock(hs.start)} ·` : clock(hs.start)}
                text={
                  chapters.length > 1
                    ? (chapters[chapterOfSlide(chapters, hs.index)]!.title ??
                      `chapter ${chapterOfSlide(chapters, hs.index) + 1}`)
                    : null
                }
              />
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

/**
 * A line of the tooltip: a part that stays put ("7.", "0:36 ·") and the text after it, cut off with
 * an ellipsis when it does not fit. Text that does not fit glides along to show the rest, waits,
 * and glides back (with reduced motion it stays cut off).
 */
function TipRow({
  className,
  lead,
  text,
}: {
  className?: string;
  lead: string | null;
  text: string | null;
}) {
  return (
    <div className={["deck-narration-tip-row", className].filter(Boolean).join(" ")}>
      {lead ? <span className="deck-narration-tip-lead">{lead}</span> : null}
      {text ? <Marquee text={text} /> : null}
    </div>
  );
}

/** Pixels a second the overflowing text glides at, and how long it rests at each end. */
const GLIDE_SPEED = 28;
const GLIDE_REST = 1400;

function Marquee({ text }: { text: string }) {
  const box = useRef<HTMLSpanElement>(null);
  const [over, setOver] = useState(0);
  // "rest" shows the start with an ellipsis; "out" glides to the end; "back" glides home.
  const [leg, setLeg] = useState<"rest" | "out" | "back">("rest");

  useLayoutEffect(() => {
    setLeg("rest");
    // The box's own scroll width: the text inside is inline at rest, and an inline box has none.
    const b = box.current;
    setOver(b ? Math.max(0, Math.ceil(b.scrollWidth - b.clientWidth)) : 0);
  }, [text]);

  const still =
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const glide = Math.max(800, (over / GLIDE_SPEED) * 1000);
  useEffect(() => {
    if (!over || still) return;
    const next = leg === "rest" ? "out" : leg === "out" ? "back" : "rest";
    const wait = leg === "rest" ? GLIDE_REST : leg === "out" ? glide + GLIDE_REST : glide;
    const t = setTimeout(() => setLeg(next), wait);
    return () => clearTimeout(t);
  }, [over, still, leg, glide]);

  const moving = over > 0 && !still && leg !== "rest";
  return (
    <span
      ref={box}
      className={["deck-narration-marquee", moving ? "is-moving" : ""].filter(Boolean).join(" ")}
      title={over ? text : undefined}
    >
      <span
        className="deck-narration-marquee-text"
        style={
          moving
            ? {
                transform: `translateX(${leg === "out" ? -over : 0}px)`,
                transitionDuration: `${glide}ms`,
              }
            : undefined
        }
      >
        {text}
      </span>
    </span>
  );
}

/** Width of the tooltip's picture of a slide, in CSS pixels; its height follows the deck's shape. */
const THUMB_W = 192;

/**
 * The slide under the pointer, small: the deck's own rendering (as the presenter's "next" preview
 * is), every step shown, nothing running. Waits for the pointer to settle on a slide so sweeping
 * along the track does not build every slide on the way.
 */
function SlideThumb({ index }: { index: number }) {
  const deck = useDeck();
  const [shown, setShown] = useState<number | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setShown(index), shown === null ? 60 : 110);
    return () => clearTimeout(t);
  }, [index, shown]);
  const { width: W, height: H } = deck.config;
  const h = Math.round((THUMB_W * H) / W);
  const flat = useMemo(() => deck.columns.flatMap((c) => c.slides), [deck.columns]);
  const meta = shown === null ? null : flat[shown];
  const options = meta ? deck.options.get(navKey(meta.h, meta.v)) : null;
  return (
    <div className="deck-narration-thumb" style={{ width: THUMB_W, height: h }} aria-hidden="true">
      {meta && options ? (
        <div
          className="deck-narration-thumb-canvas"
          style={{ width: W, height: H, transform: `scale(${THUMB_W / W})` }}
        >
          <BackgroundLayer bg={options.background} active={false} />
          {/* A picture of the slide, as an overview tile is: `<RenderWhen context="overview">` holds. */}
          <RenderContextProvider value="overview">
            <SlideFrame
              key={`${meta.h},${meta.v}`}
              meta={meta}
              options={options}
              h={meta.h}
              v={meta.v}
              active={false}
              click={999}
              preview
              className="is-tile"
            />
          </RenderContextProvider>
        </div>
      ) : null}
    </div>
  );
}
