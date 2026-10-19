import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Icon } from "../components/bling.tsx";
import { Qr } from "../components/content.tsx";
import { readItem, writeItem } from "../core/storage.ts";
import { useStore } from "../core/store.ts";
import { copyText } from "../live/analytics.tsx";
import { useLiveOptional } from "../live/context.ts";
import type { RemoteState } from "../live/protocol.ts";
import { presenterTicket } from "../live/ticket.ts";
import { deckState, useCommand } from "../react/commands.ts";
import { type DeckRuntime, useDeck } from "../react/context.ts";
import { presenterClock } from "../react/pacing.ts";
import { createCoalescer } from "./air.ts";
import { devHost, type HostLink, roomHost } from "./link.ts";
import { FORWARDED, remoteBus } from "./mirror.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE PRESENTING WINDOW'S SIDE OF THE PHONE REMOTE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Lives in the presenter view's toolbar: the "Phone remote" button, the dialog with the QR, and
 * the part that matters — every command a paired phone sends runs HERE, through the same command
 * registry the keyboard uses (origin "remote"), and its answer goes back to that phone. While a
 * phone is connected, what it shows (slide, step, blackout, laser, the timer) is pushed to it as
 * it changes. With a room the wire is the room; on `kadal-deck dev` it is the dev server's relay.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** What a phone may not do: open windows on the presenter's machine, or pair and unpair phones. */
const DENIED = new Set([
  "view.presenter",
  "view.projector",
  "view.fullscreen",
  "remote.pair",
  "remote.disconnect",
]);

/** What a phone shows, from the presenting window's stores. */
export function remoteState(rt: DeckRuntime): RemoteState {
  const s = deckState(rt);
  return {
    slide: s.slide,
    total: s.total,
    blackout: s.blackout,
    overview: s.overview,
    pointer: s.pointer,
    spotlight: s.spotlight,
    drawing: s.drawing,
    hints: s.hints,
    zoomed: s.zoomed,
    colorScheme: s.colorScheme,
    theme: s.theme,
    startedAt: presenterClock.get(),
  };
}

const codeKey = (rt: DeckRuntime) => `deck.remote.code.${rt.config.slug || "deck"}`;

export function RemoteHost() {
  const deck = useDeck();
  const live = useLiveOptional();
  const relay = deck.manifest.relay ?? null;
  const [open, setOpen] = useState(false);
  // On the dev relay a code is only asked for once someone wants one — or a reload had one.
  const [wanted, setWanted] = useState(() => !!readItem(codeKey(deck), "session"));
  // Made in an effect, not a memo: a link holds a socket's attention (and, on the dev relay, a
  // code), so whatever makes one must be what closes it.
  const [link, setLink] = useState<HostLink | null>(null);
  useEffect(() => {
    let made: HostLink | null = null;
    if (live)
      made = roomHost({
        client: live.client,
        remoteUrl: `${window.location.origin}${deck.base}remote`,
        ticket: presenterTicket,
      });
    else if (relay && wanted)
      made = devHost(relay, {
        path: `${deck.base}remote`,
        remember: {
          get: () => readItem(codeKey(deck), "session"),
          set: (code) => writeItem(codeKey(deck), code, "session"),
        },
      });
    setLink(made);
    return () => {
      made?.close();
      setLink(null);
    };
  }, [live, relay, wanted, deck]);

  const remotes = useStore(link?.remotes ?? zero);
  const url = useStore(link?.url ?? none);
  const problem = useStore(link?.problem ?? none);

  // Run what the phones send, and answer.
  const laserByRemote = useRef(false);
  useEffect(() => {
    if (!link) return;
    const bus = link.kind === "dev" ? remoteBus(deck) : null;
    const off = link.onCommand(async (c) => {
      if (DENIED.has(c.id)) {
        link.reply(c.from, c.seq, {
          ok: false,
          code: "disabled",
          error: `A phone remote cannot run "${c.id}".`,
        });
        return;
      }
      const result = await deck.commands.run(c.id, c.params, "remote");
      link.reply(c.from, c.seq, result);
      if (c.id === "present.laserAt") laserByRemote.current = result.ok;
      else if (c.id === "present.laserOff") laserByRemote.current = false;
      if (result.ok && bus && FORWARDED.has(c.id)) bus.post({ id: c.id, params: c.params });
    });
    return () => {
      off();
      bus?.close();
    };
  }, [link, deck]);

  // A phone that drops mid-point leaves no laser behind.
  const lastCount = useRef(0);
  useEffect(() => {
    const before = lastCount.current;
    lastCount.current = remotes;
    if (remotes > before)
      deck.actions.toast(
        remotes > 1 ? `${remotes} phone remotes connected` : "Phone remote connected",
      );
    if (remotes === 0 && before > 0 && laserByRemote.current) {
      laserByRemote.current = false;
      void deck.commands.run("present.laserOff", {}, "remote");
      if (link?.kind === "dev") {
        const bus = remoteBus(deck);
        bus.post({ id: "present.laserOff", params: {} });
        bus.close();
      }
    }
  }, [remotes, deck, link]);

  // Tell the phones what changed, at most ten times a second, and only what did change.
  useEffect(() => {
    if (!link || remotes === 0) return;
    let last = "";
    const out = createCoalescer<null>(() => {
      const state = remoteState(deck);
      const json = JSON.stringify(state);
      if (json === last) return;
      last = json;
      link.push(state);
    }, 100);
    out.push(null);
    const offs = [
      deck.nav.subscribe(() => out.push(null)),
      deck.ui.subscribe(() => out.push(null)),
      presenterClock.subscribe(() => out.push(null)),
    ];
    return () => {
      for (const off of offs) off();
      out.cancel();
    };
  }, [link, remotes, deck]);

  useCommand({
    id: "remote.state",
    title: "Remote state",
    description: "What a phone remote shows: the slide and step, the tools that are on, the timer.",
    group: "query",
    readOnly: true,
    run: () => remoteState(deck),
  });
  useCommand({
    id: "remote.pair",
    title: "Pair a phone",
    description:
      "Show the QR a phone scans to become a remote for this window, and return the URL it holds.",
    group: "room",
    enabled: () => !!live || !!relay,
    run: () => {
      setWanted(true);
      setOpen(true);
      return { url: link?.url.get() ?? null, remotes: link?.remotes.get() ?? 0 };
    },
  });
  useCommand(
    link
      ? {
          id: "remote.disconnect",
          title: "Disconnect phones",
          description:
            "Disconnect every phone remote (on the dev server the pairing code changes too).",
          group: "room",
          run: () => link.kick(),
        }
      : null,
  );

  return (
    <>
      <button
        type="button"
        className={remotes ? "is-on" : ""}
        onClick={() => {
          setWanted(true);
          setOpen((o) => !o);
        }}
        title="Use your phone as a remote: next, laser, pen, notes"
        data-remotes={remotes}
      >
        <Icon name="smartphone" /> Phone remote{remotes ? ` · ${remotes}` : ""}
      </button>
      {open
        ? createPortal(
            <RemoteDialog
              url={url}
              problem={
                problem ??
                (!live && !relay
                  ? "A phone remote needs the room (a hosted deck) or the dev server (`kadal-deck dev`). This build has neither."
                  : null)
              }
              remotes={remotes}
              kind={link?.kind ?? null}
              onKick={() => link?.kick()}
              onClose={() => setOpen(false)}
            />,
            document.body,
          )
        : null}
    </>
  );
}

function RemoteDialog({
  url,
  problem,
  remotes,
  kind,
  onKick,
  onClose,
}: {
  url: string | null;
  problem: string | null;
  remotes: number;
  kind: "room" | "dev" | null;
  onKick: () => void;
  onClose: () => void;
}) {
  const deck = useDeck();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Escape") return;
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  const insecure = url?.startsWith("http://") && !/^http:\/\/(localhost|127\.)/.test(url);
  return (
    <div className="deck-remote-dialog" role="dialog" aria-label="Phone remote" onClick={onClose}>
      <div className="deck-remote-dialog-panel" onClick={(e) => e.stopPropagation()}>
        <header>
          <strong>
            <Icon name="smartphone" /> Phone remote
          </strong>
          <button type="button" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </header>
        {url && problem ? <p className="deck-remote-problem">{problem}</p> : null}
        {url ? (
          <>
            <Qr value={url} size={240} className="deck-remote-qr" />
            <p>
              Scan with your phone's camera. It becomes a remote for <b>this window</b>: next and
              back, blackout, a laser you aim by touch or by moving the phone, the pen, and your
              notes.
            </p>
            {insecure ? (
              <p className="deck-muted">
                Plain http on the network: the phone points by touch. For the air pointer's motion
                sensors, run <code>kadal-deck dev --host --https</code>.
              </p>
            ) : null}
            <p className="deck-muted">
              Anyone who scans this code can drive the deck — keep it off a shared screen.
            </p>
          </>
        ) : (
          <p className="deck-remote-problem">{problem ?? "Getting a pairing code…"}</p>
        )}
        <footer>
          <span className="deck-remote-count" data-remotes={remotes}>
            <i className={remotes ? "is-on" : ""} />
            {remotes === 0
              ? "No phone connected"
              : remotes === 1
                ? "1 phone connected"
                : `${remotes} phones connected`}
          </span>
          {url ? (
            <button
              type="button"
              data-remote-url={url}
              onClick={async () => {
                setCopied(await copyText(url));
              }}
            >
              <Icon name="link" /> {copied ? "Copied" : "Copy link"}
            </button>
          ) : null}
          {kind ? (
            <button
              type="button"
              disabled={!remotes && kind === "room"}
              onClick={() => {
                onKick();
                deck.actions.toast(
                  kind === "dev" ? "Phones disconnected · new code" : "Phones disconnected",
                );
              }}
              title={
                kind === "dev"
                  ? "Disconnect every phone and change the code"
                  : "Disconnect every phone"
              }
            >
              <Icon name="unplug" /> Disconnect
            </button>
          ) : null}
        </footer>
      </div>
    </div>
  );
}

import { createStore } from "../core/store.ts";
const zero = createStore(0);
const none = createStore<string | null>(null);
