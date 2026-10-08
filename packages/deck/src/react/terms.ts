import { useEffect } from "react";

import { type GlossaryEntry, termId } from "../glossary/model.ts";
import type { DeckRuntime, TermReveal } from "./context.ts";

/**
 * The window's one term card, as plain functions over `deck.terms`. A reveal names a mention —
 * slide, term id, which occurrence — rather than carrying a definition or a position: every
 * screen runs the same build, so each resolves the words from its own glossary and anchors the
 * card to its own copy of the element. That is what lets the presenter's reveal travel through
 * the room as three small values and land correctly on a projector and a phone alike.
 */

/** "h,v" of the slide an element sits in, or null outside one. */
export function slideKeyOf(el: Element): string | null {
  const slide = el.closest<HTMLElement>(".deck-slide");
  if (!slide || slide.dataset.h === undefined) return null;
  return `${slide.dataset.h},${slide.dataset.v ?? "0"}`;
}

/** Which of its slide's mentions of `id` this element is, in document order. */
export function mentionIndex(el: Element, id: string): number {
  const slide = el.closest(".deck-slide");
  if (!slide) return 0;
  const all = slide.querySelectorAll(`[data-term="${CSS.escape(id)}"]`);
  return Math.max(0, Array.prototype.indexOf.call(all, el));
}

export function entryFor(deck: DeckRuntime, id: string): GlossaryEntry | undefined {
  return deck.glossary.get(id) ?? deck.glossary.get(termId(id));
}

export function openTerm(deck: DeckRuntime, reveal: TermReveal) {
  deck.terms.set(reveal);
}

/** Close the card; with `only`, just when it is that kind (a relayed "off" spares a local card). */
export function closeTerm(deck: DeckRuntime, only?: TermReveal["from"]) {
  const now = deck.terms.get();
  if (now && (!only || now.from === only)) deck.terms.set(null);
}

/**
 * What dismisses a card besides its own term: moving through the deck, Escape, the overview, and
 * a press anywhere that is not the card or a term. Escape is taken in the capture phase and kept
 * from the deck's bindings, where it would open the overview.
 */
export function useTermEffects(deck: DeckRuntime) {
  useEffect(() => {
    const offNav = deck.nav.subscribe((s, prev) => {
      if (
        s.h !== prev.h ||
        s.v !== prev.v ||
        s.click !== prev.click ||
        s.overview !== prev.overview
      )
        deck.terms.set(null);
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !deck.terms.get()) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      deck.terms.set(null);
    };
    const onPress = (e: PointerEvent) => {
      if (!deck.terms.get()) return;
      const t = e.target as Element | null;
      if (t?.closest?.(".deck-term, .deck-term-card, .deck-term-readout, .deck-hints")) return;
      deck.terms.set(null);
    };
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPress, true);
    return () => {
      offNav();
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onPress, true);
    };
  }, [deck]);
}
