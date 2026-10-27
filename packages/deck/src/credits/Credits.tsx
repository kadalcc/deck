import type { MouseEvent, PointerEvent, ReactNode } from "react";

import { findById, flatIndex } from "../core/model.ts";
import { useDeck } from "../react/context.ts";
import { useRenderContext } from "../react/render-context.ts";
import {
  type CreditGroup,
  type CreditItem,
  DEFAULT_CREDITS,
  creditsLinkTarget,
  resolvedCredits,
} from "./model.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * <Credits />  and the link to it
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `<Credits />` draws what the compiler collected (credits/model.ts): a card per source — its
 * name linked to its home, the licence linked to its text, who made it, and what the deck uses
 * from it (titles for GIFs, stickers and templates; a count for emoji and icons, whose names are
 * noise). The generated "Credits" slide is just this on the default layout; a deck can place it
 * on a slide of its own instead.
 *
 * `CreditsLink` is the small "Credits" link at the bottom centre of every other slide (the play
 * view's controls hold the bottom corners).
 * SlideFrame draws it beside the slide's layout, never inside it, so it is not centred, not
 * auto-fitted and never moves a thing. It is a link in play and in the audience's view; in print
 * and the exports it is a line of text that says which page the credits are on.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const SHOWN = 8;

function noun(g: CreditGroup): string {
  const n = g.items.length;
  if (g.id.startsWith("emoji:")) return `${n} emoji`;
  if (g.id.startsWith("iconify:")) return `${n} icon${n === 1 ? "" : "s"}`;
  if (g.id.startsWith("font:")) return "Meme captions";
  return `${n} item${n === 1 ? "" : "s"}`;
}

function External({
  href,
  className,
  children,
}: {
  href?: string;
  className?: string;
  children: ReactNode;
}) {
  if (!href) return <span className={className}>{children}</span>;
  return (
    <a className={className} href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

function ItemLine({ item }: { item: CreditItem }) {
  return (
    <li className="deck-credits-item">
      <External href={item.href}>{item.title}</External>
      {item.by ? <span className="deck-credits-item-by"> by {item.by}</span> : null}
      {item.licence ? (
        <>
          {" · "}
          <External href={item.licenceUrl} className="deck-credits-item-licence">
            {item.licence}
          </External>
        </>
      ) : null}
    </li>
  );
}

function Group({ group }: { group: CreditGroup }) {
  const items = group.show === "items" ? group.items : [];
  const more = items.length - SHOWN;
  return (
    <li className="deck-credits-group" data-source={group.id}>
      <div className="deck-credits-head">
        <External href={group.url} className="deck-credits-name">
          {group.label}
        </External>
        {group.licence ? (
          <External href={group.licenceUrl} className="deck-credits-licence">
            {group.licence}
          </External>
        ) : null}
      </div>
      {group.by ? <p className="deck-credits-by">by {group.by}</p> : null}
      {group.show === "count" ? (
        <p className="deck-credits-count">{noun(group)}</p>
      ) : (
        <ul className="deck-credits-items">
          {items.slice(0, more > 1 ? SHOWN : items.length).map((item, i) => (
            <ItemLine key={i} item={item} />
          ))}
          {more > 1 ? <li className="deck-credits-more">and {more} more</li> : null}
        </ul>
      )}
      {group.notice ? <p className="deck-credits-notice">{group.notice}</p> : null}
    </li>
  );
}

export interface CreditsProps {
  /** The heading (default: the headmatter's `credits.title`, else "Credits"); `false` for none. */
  title?: string | false;
  /** One line under the heading; `false` for none. */
  lede?: string | false;
  className?: string;
}

/** Every attributed item the deck uses, by source, with licences and links (collected at compile time). */
export function Credits({ title, lede, className }: CreditsProps) {
  const deck = useDeck();
  const c = resolvedCredits(deck.config.credits);
  const groups = c?.groups ?? [];
  const heading = title === false ? null : (title ?? c?.title ?? DEFAULT_CREDITS.title);
  const line =
    lede === false
      ? null
      : (lede ??
        (groups.length
          ? "What these slides borrow, and where it comes from."
          : "These slides use no third-party media."));
  return (
    <section
      className={["deck-credits", className].filter(Boolean).join(" ")}
      aria-label={heading ?? "Credits"}
      data-groups={groups.length}
    >
      {heading ? <h1 className="deck-credits-title">{heading}</h1> : null}
      {line ? <p className="deck-credits-lede">{line}</p> : null}
      {groups.length ? (
        <ul className="deck-credits-groups">
          {groups.map((g) => (
            <Group key={g.id} group={g} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

const stop = (e: MouseEvent | PointerEvent) => e.stopPropagation();

/** The corner link to the credits slide, for SlideFrame; null where there is nothing to link to. */
export function CreditsLink({ slideId }: { slideId: string }) {
  const deck = useDeck();
  const where = useRenderContext();
  const c = creditsLinkTarget(deck.config.credits, slideId);
  if (!c || !c.at) return null;
  const at = findById(deck.columns, c.at);
  if (!at) return null;
  const page = flatIndex(deck.columns, at.h, at.v) + 1;
  const href = `#/${encodeURIComponent(c.at)}`;
  if (where.print)
    return (
      <span className="deck-credits-link is-print">
        {c.title} · slide {page}
      </span>
    );
  return (
    <a
      className="deck-credits-link"
      href={href}
      aria-label={`${c.title}: the media in this deck and their licences (slide ${page})`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        deck.actions.gotoId(c.at!);
      }}
      onPointerDown={stop}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M10.1 6.2a2.6 2.6 0 1 0 0 3.6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
      <span>{c.title}</span>
    </a>
  );
}
