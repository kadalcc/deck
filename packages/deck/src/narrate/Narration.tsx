import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";

import { Icon } from "../components/bling.tsx";
import { flatIndex } from "../core/model.ts";
import { key as navKey } from "../core/navigation.ts";
import { readItem, writeItem } from "../core/storage.ts";
import { useStore } from "../core/store.ts";
import { cmd, useCommand } from "../react/commands.ts";
import { type DeckRuntime, useDeck } from "../react/context.ts";
import { chooseEngine, ENGINE_CHOICES, type EngineChoice, silentEngine } from "./engine.ts";
import { BakedClips, browserEngine, browserVoices, hasSpeechSynthesis, KokoroClient } from "./engines.ts";
import { isKokoroVoice, KOKORO_VOICES } from "./kokoro-protocol.ts";
import { type NarrationState, Narrator, type NarratorHost, RATES } from "./player.ts";
import { speechMs, timelineOf } from "./text.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * <Narration> — the narrator, its commands and its bar
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Mounted at the bottom of the presenter view, and on the deck itself behind `?narrate` or the R
 * key (react/NarrationGate.tsx). It is a lazy chunk: a deck that never narrates never loads it.
 * Every control is a `narrate.*` command, so a key, the phone remote and an agent can run the
 * same rehearsal the buttons do.
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
          if (s.h !== prev.h || s.v !== prev.v || s.click !== prev.click || s.totals !== prev.totals)
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
        .object({ from: z.number().int().min(0).max(Math.max(0, slideCount - 1)).optional() })
        .strict(),
      run: async (p) => {
        await narrator.play(p.from);
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
      params: z.object({ volume: z.number().min(0).max(1), muted: z.boolean().optional() }).strict(),
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
      params: z.object({ engine: z.enum(["auto", "baked", "kokoro", "browser", "silent"]) }).strict(),
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
      description: "On: the narration turns the deck's pages. Off: it reads on and leaves the deck alone.",
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
      description: "Whether it is playing, where, which engine and voice, the speed and volume, and the estimated length.",
      group: "query",
      readOnly: true,
      run: state,
    }),
  );
}

function clock(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/** The bar. `onClose` (the play view) adds a close button. */
export default function Narration({
  autoplay = false,
  onClose,
}: {
  /** Start playing once mounted (from slide `from` when given). */
  autoplay?: { from?: number } | false;
  onClose?: () => void;
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

  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    let alive = true;
    void browserVoices().then((v) => alive && setVoices(v));
    return () => {
      alive = false;
    };
  }, []);

  const entry = timeline.slides[s.slide];
  const before = entry ? entry.start + entry.ms.slice(0, s.segment).reduce((n, m) => n + m + c.gap, 0) : 0;
  const within =
    s.playing && (s.phase === "speaking" || s.phase === "dwell" || s.phase === "gap")
      ? Math.min(Math.max(0, now - s.startedAt), s.expectedMs || 0)
      : 0;
  const elapsed = Math.min(timeline.total, before + within);
  const pct = timeline.total ? (elapsed / timeline.total) * 100 : 0;

  const status =
    s.error ??
    (s.kokoro.state === "loading"
      ? `Downloading voice ${Math.round(s.kokoro.progress * 100)}%`
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

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const at = ((e.clientX - box.left) / box.width) * timeline.total;
    const hit = [...timeline.slides].reverse().find((x) => x.start <= at) ?? timeline.slides[0];
    if (hit) run("narrate.play", { from: hit.index });
  };
  const onTrackKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (e.key === "Home" || e.key === "End" || step) {
      e.preventDefault();
      e.stopPropagation();
      const target =
        e.key === "Home" ? 0 : e.key === "End" ? slides.length - 1 : Math.min(slides.length - 1, Math.max(0, s.slide + step));
      run("narrate.play", { from: target });
    }
  };

  const voiceValue = s.engine === "browser" ? `browser:${s.browserVoice ?? ""}` : s.voice;

  return (
    <div
      className={["deck-narration", s.playing ? "is-playing" : ""].filter(Boolean).join(" ")}
      role="region"
      aria-label="Narration"
      // A button pressed with Space or Enter is that button, not the deck's next step too.
      onKeyDown={(e) => {
        const t = e.target as HTMLElement;
        if ((e.key === " " || e.key === "Enter") && t.closest("button, select, input")) e.stopPropagation();
      }}
    >
      <div
        className="deck-narration-track"
        role="slider"
        tabIndex={0}
        aria-label="Narration position"
        aria-valuemin={1}
        aria-valuemax={slides.length}
        aria-valuenow={s.slide + 1}
        aria-valuetext={`Slide ${s.slide + 1} of ${slides.length}${entry?.title ? `: ${entry.title}` : ""}`}
        onClick={seek}
        onKeyDown={onTrackKey}
      >
        <div className="deck-narration-fill" style={{ width: `${pct}%` }} />
        {timeline.total
          ? timeline.slides.map((x) => (
              <span
                key={x.index}
                className={[
                  "deck-narration-marker",
                  x.index === s.slide ? "is-current" : "",
                  x.segments.length ? "" : "is-silent",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={{ left: `${(x.start / timeline.total) * 100}%` }}
                title={`${x.index + 1}. ${x.title ?? "Untitled"}`}
              />
            ))
          : null}
      </div>
      <div className="deck-narration-controls">
        <button type="button" onClick={() => run("narrate.prev")} aria-label="Previous step" title="Previous step">
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
        <button type="button" onClick={() => run("narrate.next")} aria-label="Next step" title="Next step">
          <Icon name="skip-forward" />
        </button>
        <button type="button" onClick={() => run("narrate.stop")} aria-label="Stop narration" title="Stop">
          <Icon name="square" />
        </button>
        <span className="deck-narration-time" aria-label="Elapsed and estimated total">
          {clock(elapsed)} / {clock(timeline.total)}
        </span>
        <span className="deck-narration-status" role="status" aria-live="polite">
          {status}
        </span>
        <span className="deck-narration-spacer" />
        <label className="deck-narration-field">
          <span className="deck-narration-label">Speed</span>
          <select
            value={String(s.rate)}
            onChange={(e) => run("narrate.rate", { rate: Number(e.target.value) })}
            aria-label="Speed"
          >
            {[...new Set([...RATES, s.rate])]
              .sort((a, b) => a - b)
              .map((r) => (
                <option key={r} value={String(r)}>
                  {r}×
                </option>
              ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => run("narrate.volume", { volume: s.volume, muted: !s.muted })}
          aria-label={s.muted ? "Unmute" : "Mute"}
          aria-pressed={s.muted}
          title={s.muted ? "Unmute" : "Mute"}
        >
          <Icon name={s.muted || s.volume === 0 ? "volume-x" : s.volume < 0.5 ? "volume-1" : "volume-2"} />
        </button>
        <input
          className="deck-narration-volume"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={s.muted ? 0 : s.volume}
          onChange={(e) => run("narrate.volume", { volume: Number(e.target.value), muted: false })}
          aria-label="Volume"
        />
        <label className="deck-narration-field">
          <span className="deck-narration-label">Voice</span>
          <select
            value={voiceValue}
            onChange={(e) => {
              const v = e.target.value;
              run("narrate.voice", { voice: v.startsWith("browser:") ? v.slice(8) || "default" : v });
            }}
            aria-label="Voice"
          >
            <optgroup label="Kokoro">
              {KOKORO_VOICES.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.lang === "en-gb" ? "UK" : "US"} {v.gender})
                </option>
              ))}
            </optgroup>
            {voices.length ? (
              <optgroup label="This browser">
                {voices.map((v) => (
                  <option key={v.voiceURI} value={`browser:${v.name}`}>
                    {v.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
        </label>
        <label className="deck-narration-field">
          <span className="deck-narration-label">Engine</span>
          <select value={s.engine} onChange={(e) => run("narrate.engine", { engine: e.target.value })} aria-label="Engine">
            <option value="auto">Auto</option>
            <option value="baked">Recorded</option>
            <option value="kokoro" disabled={s.kokoro.state === "unavailable"}>
              Kokoro{s.kokoro.state === "unavailable" ? " (not installed)" : ""}
            </option>
            <option value="browser">Browser</option>
            <option value="silent">Silent</option>
          </select>
        </label>
        <button
          type="button"
          className={s.follow ? "is-on" : ""}
          onClick={() => run("narrate.follow", { on: !s.follow })}
          aria-pressed={s.follow}
          title="Follow the narrator: let it turn the pages"
        >
          <Icon name="footprints" /> Follow
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
        ) : null}
      </div>
    </div>
  );
}
