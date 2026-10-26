import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Icon } from "../components/bling.tsx";
import { flatIndex, readHostOverride } from "../core/model.ts";
import { ENGINE_VERSION } from "../core/version.ts";
import { ticketHeaders } from "../live/ticket.ts";
import { type DeckRuntime, useDeck } from "../react/context.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * REPORT A BUG, REQUEST A FEATURE, SEND FEEDBACK  —  from the presenter's rail
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Only on a host that takes them: `window.__KADAL_DECK__.feedback`, a URL (an http(s) one, or a
 * same-site path). A self-hosted deck has nowhere to send them and shows nothing. Each opens a
 * small dialog — a title, the details, for a bug its severity and, if asked, a picture of the
 * slide on screen — and Send POSTs JSON there, with the presenter's ticket as the copilot sends
 * it (`x-deck-ticket`, live/ticket.ts):
 *
 *   { kind: "bug" | "feature" | "feedback", title, description,
 *     severity?: "low" | "medium" | "high" | "critical",          (a bug's; "medium" by default)
 *     screenshotDataUrl?: "data:image/jpeg;base64,…",              (a bug's, opted in, ≤ ~1 MB)
 *     url: location.href, deck: { slug, title }, slide: { index, title },
 *     engine: "0.7.0", userAgent }
 *
 * The host answers `{ id }`, which the dialog shows with its thanks. A failure is said in the
 * dialog, and what was typed stays.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type FeedbackKind = "bug" | "feature" | "feedback";
export type Severity = "low" | "medium" | "high" | "critical";
export const SEVERITIES: Severity[] = ["low", "medium", "high", "critical"];

/** The longest picture sent, as a data URL's length (a little under 1 MB). */
export const MAX_SCREENSHOT = 1_000_000;
const MAX_TITLE = 200;
const MAX_DESCRIPTION = 10_000;

export interface FeedbackDraft {
  kind: FeedbackKind;
  title: string;
  description: string;
  severity?: Severity;
  screenshotDataUrl?: string | null;
}

export interface FeedbackContext {
  url: string;
  deck: { slug: string; title: string };
  slide: { index: number; title: string | null };
  engine: string;
  userAgent: string;
}

export interface FeedbackPayload extends FeedbackContext {
  kind: FeedbackKind;
  title: string;
  description: string;
  severity?: Severity;
  screenshotDataUrl?: string;
}

/** Where the host takes reports, or null (then the presenter shows no feedback actions). */
export function feedbackEndpoint(scope: unknown = globalThis): string | null {
  return readHostOverride(scope)?.feedback ?? null;
}

/**
 * The body Send posts: trimmed, capped, and only what belongs to the kind — a severity and a
 * picture are a bug's (the picture only when it is an image data URL under the limit).
 */
export function feedbackPayload(draft: FeedbackDraft, ctx: FeedbackContext): FeedbackPayload {
  const out: FeedbackPayload = {
    kind: draft.kind,
    title: draft.title.trim().slice(0, MAX_TITLE),
    description: draft.description.trim().slice(0, MAX_DESCRIPTION),
    ...ctx,
  };
  if (draft.kind === "bug") {
    out.severity = SEVERITIES.includes(draft.severity as Severity)
      ? (draft.severity as Severity)
      : "medium";
    const shot = draft.screenshotDataUrl;
    if (typeof shot === "string" && shot.startsWith("data:image/") && shot.length <= MAX_SCREENSHOT)
      out.screenshotDataUrl = shot;
  }
  return out;
}

/** Where the deck is, for the report: its slug and title, and the slide on screen. */
export function feedbackContext(rt: DeckRuntime, index = currentIndex(rt)): FeedbackContext {
  const flat = rt.columns.flatMap((c) => c.slides);
  return {
    url: typeof location !== "undefined" ? location.href : "",
    deck: { slug: rt.config.slug, title: rt.config.title },
    slide: { index, title: flat[index]?.title ?? null },
    engine: ENGINE_VERSION,
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
  };
}

const currentIndex = (rt: DeckRuntime) => {
  const s = rt.nav.get();
  return flatIndex(rt.columns, s.h, s.v);
};

/**
 * POST the report. Resolves to the host's id; rejects with a sentence for the dialog. `send` is
 * `fetch` (a test passes its own); the ticket rides as `x-deck-ticket` when this window has one.
 */
export async function sendFeedback(
  endpoint: string,
  payload: FeedbackPayload,
  send: typeof fetch = fetch,
  headers: Record<string, string> = ticketHeaders(),
): Promise<{ id: string }> {
  let r: Response;
  try {
    r = await send(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("The host could not be reached. Check the connection and send it again.");
  }
  const body = (await r.json().catch(() => null)) as { id?: unknown; error?: unknown } | null;
  if (!r.ok) {
    const said = typeof body?.error === "string" && body.error ? ` ${body.error}` : "";
    throw new Error(
      r.status === 401 || r.status === 403
        ? `The host did not accept this presenter sign-in (${r.status}).${said}`
        : `The host answered ${r.status}.${said}`,
    );
  }
  const id = body?.id;
  if (typeof id !== "string" && typeof id !== "number")
    throw new Error("The host took it but sent back no reference.");
  return { id: String(id) };
}

/**
 * A picture of slide `index`, small enough to send: the engine's own slide picture
 * (`export.thumbnail`, export/thumbnail.tsx) made a JPEG, smaller until it fits the limit.
 */
export async function captureSlide(rt: DeckRuntime, index: number): Promise<string> {
  for (const width of [1280, 960, 640]) {
    const r = await rt.commands.run("export.thumbnail", { slide: index, width }, "ui");
    if (!r.ok) throw new Error(r.error);
    const png = (r.value as { dataUrl?: string }).dataUrl;
    if (!png) throw new Error("No picture came back.");
    const jpeg = await toJpeg(png, 0.82).catch(() => png);
    if (jpeg.length <= MAX_SCREENSHOT) return jpeg;
  }
  throw new Error("The picture is too large to send.");
}

async function toJpeg(dataUrl: string, quality: number): Promise<string> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  // A JPEG has no transparency: what the slide left clear is the page's own background.
  ctx.fillStyle = getComputedStyle(document.body).backgroundColor || "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);
  return canvas.toDataURL("image/jpeg", quality);
}

/* ── the UI ─────────────────────────────────────────────────────────────── */

const KINDS: Record<
  FeedbackKind,
  {
    action: string;
    short: string;
    icon: string;
    titleHint: string;
    detailsHint: string;
  }
> = {
  bug: {
    action: "Report a bug",
    short: "Bug",
    icon: "bug",
    titleHint: "What went wrong?",
    detailsHint: "What you did, what you expected, and what happened instead.",
  },
  feature: {
    action: "Request a feature",
    short: "Idea",
    icon: "lightbulb",
    titleHint: "What should the presenter view do?",
    detailsHint: "How would it help your talk?",
  },
  feedback: {
    action: "Send feedback",
    short: "Feedback",
    icon: "message-square-heart",
    titleHint: "In a few words",
    detailsHint: "Anything you'd like us to know.",
  },
};
const ORDER: FeedbackKind[] = ["bug", "feature", "feedback"];

/**
 * The three actions: icons with small labels in the folded rail (`rail`), a row of labelled
 * buttons at the foot of the open sidebar (`row`). Nothing without the host's endpoint.
 */
export function FeedbackActions({ layout }: { layout: "rail" | "row" }) {
  const endpoint = feedbackEndpoint();
  const [kind, setKind] = useState<FeedbackKind | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  if (!endpoint) return null;
  return (
    <div
      className={layout === "rail" ? "deck-rail-actions" : "deck-side-foot"}
      role="group"
      aria-label="Feedback"
    >
      {ORDER.map((k) => (
        <button
          key={k}
          type="button"
          className={layout === "rail" ? "deck-rail-action" : "deck-side-foot-btn"}
          onClick={(e) => {
            opener.current = e.currentTarget;
            setKind(k);
          }}
          title={KINDS[k].action}
          aria-label={KINDS[k].action}
          aria-haspopup="dialog"
        >
          <Icon name={KINDS[k].icon} />
          <span>{layout === "rail" ? KINDS[k].short : KINDS[k].action}</span>
        </button>
      ))}
      {kind ? (
        <FeedbackDialog
          kind={kind}
          endpoint={endpoint}
          onClose={() => {
            setKind(null);
            // Back where the presenter was: the button that opened it.
            const el = opener.current;
            requestAnimationFrame(() => el?.isConnected && el.focus());
          }}
        />
      ) : null}
    </div>
  );
}

type Sent = { id: string } | null;

function FeedbackDialog({
  kind,
  endpoint,
  onClose,
}: {
  kind: FeedbackKind;
  endpoint: string;
  onClose: () => void;
}) {
  const rt = useDeck();
  const k = KINDS[kind];
  const ids = useId();
  // The slide the report is about: the one on screen when the dialog opened.
  const [at] = useState(() => currentIndex(rt));
  const slideTitle = rt.columns.flatMap((c) => c.slides)[at]?.title ?? null;
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<Severity>("medium");
  const [attach, setAttach] = useState(false);
  const [shot, setShot] = useState<{
    state: "idle" | "busy" | "done" | "error";
    url?: string;
    error?: string;
  }>({
    state: "idle",
  });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<Sent>(null);
  const form = useRef<HTMLFormElement>(null);
  const done = useRef<HTMLButtonElement>(null);

  // The picture is made when the box is ticked, so the preview shows what will be sent (ticking
  // it again after a failure tries again).
  useEffect(() => {
    if (!attach) return;
    let alive = true;
    setShot({ state: "busy" });
    captureSlide(rt, at).then(
      (url) => alive && setShot({ state: "done", url }),
      (e: unknown) =>
        alive && setShot({ state: "error", error: e instanceof Error ? e.message : "No picture." }),
    );
    return () => {
      alive = false;
    };
  }, [attach, rt, at]);
  useEffect(() => {
    if (sent) done.current?.focus();
  }, [sent]);

  const submit = async () => {
    if (!title.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      const payload = feedbackPayload(
        {
          kind,
          title,
          description,
          severity,
          screenshotDataUrl: attach && shot.state === "done" ? shot.url : null,
        },
        feedbackContext(rt, at),
      );
      setSent(await sendFeedback(endpoint, payload));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  // Escape closes; Tab stays inside. Keys typed here are the dialog's, never the deck's.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab" || !form.current) return;
    const items = [
      ...form.current.querySelectorAll<HTMLElement>(
        "input:not([disabled]), textarea:not([disabled]), button:not([disabled])",
      ),
    ];
    if (!items.length) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const slideLabel = `Slide ${at + 1}${slideTitle ? ` · ${slideTitle}` : ""}`;
  return createPortal(
    <div
      className="deck-feedback-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        ref={form}
        className="deck-feedback"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${ids}-h`}
        data-deck-own-keys
        data-kind={kind}
        onKeyDown={onKeyDown}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <header className="deck-feedback-head">
          <span className="deck-feedback-icon" aria-hidden>
            <Icon name={k.icon} />
          </span>
          <h3 id={`${ids}-h`}>{k.action}</h3>
          <button
            type="button"
            className="deck-side-icon-btn"
            onClick={onClose}
            aria-label="Close"
            title="Close (Esc)"
          >
            <Icon name="x" />
          </button>
        </header>
        {sent ? (
          <div className="deck-feedback-sent" role="status">
            <span className="deck-feedback-check" aria-hidden>
              <Icon name="check" />
            </span>
            <p>
              <strong>Sent. Thank you.</strong>
              <span>
                Reference <code>{sent.id}</code>
              </span>
            </p>
            <div className="deck-feedback-actions">
              <button ref={done} type="button" className="is-primary" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            <label className="deck-feedback-field">
              <span>Title</span>
              <input
                type="text"
                value={title}
                maxLength={MAX_TITLE}
                placeholder={k.titleHint}
                onChange={(e) => setTitle(e.target.value)}
                required
                autoFocus
              />
            </label>
            <label className="deck-feedback-field">
              <span>Details</span>
              <textarea
                value={description}
                maxLength={MAX_DESCRIPTION}
                placeholder={k.detailsHint}
                rows={5}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            {kind === "bug" ? (
              <>
                <fieldset className="deck-feedback-severity">
                  <legend>Severity</legend>
                  <div role="radiogroup" aria-label="Severity">
                    {SEVERITIES.map((v) => (
                      <label key={v} className={severity === v ? "is-on" : ""} data-severity={v}>
                        <input
                          type="radio"
                          name={`${ids}-severity`}
                          value={v}
                          checked={severity === v}
                          onChange={() => setSeverity(v)}
                        />
                        {v[0]!.toUpperCase() + v.slice(1)}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <label className="deck-record-check deck-feedback-attach">
                  <input
                    type="checkbox"
                    checked={attach}
                    onChange={(e) => setAttach(e.target.checked)}
                  />
                  <span>
                    Attach a picture of the current slide
                    <small>{slideLabel}</small>
                  </span>
                </label>
                {attach ? (
                  <div className="deck-feedback-shot" aria-live="polite">
                    {shot.state === "done" ? (
                      <img src={shot.url} alt={`The picture to be sent: ${slideLabel}`} />
                    ) : shot.state === "error" ? (
                      <span className="deck-feedback-error">
                        No picture: {shot.error} It will be sent without one.
                      </span>
                    ) : (
                      <span className="deck-feedback-muted">Taking the picture…</span>
                    )}
                  </div>
                ) : null}
              </>
            ) : null}
            {error ? (
              <p className="deck-feedback-error" role="alert">
                {error}
              </p>
            ) : (
              <p className="deck-feedback-muted">
                Sent with the deck, {slideLabel.replace(/^Slide/, "slide")}, this page's address and
                the engine version ({ENGINE_VERSION}).
              </p>
            )}
            <div className="deck-feedback-actions">
              <button type="button" onClick={onClose}>
                Cancel
              </button>
              <button
                type="submit"
                className="is-primary"
                disabled={!title.trim() || sending || (attach && shot.state === "busy")}
              >
                {sending ? "Sending…" : "Send"}
              </button>
            </div>
          </>
        )}
      </form>
    </div>,
    document.body,
  );
}
