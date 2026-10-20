import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";

import { Icon } from "../components/bling.tsx";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * <Listbox> — the engine's own select
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A button that shows the choice and opens a list of options: the narration bar's speed, voice and
 * engine, the phone remote's settings. A native <select> draws itself in the operating system's
 * style, which no theme reaches; this one is made of the deck's tokens, so every theme and both
 * schemes dress it. (The engine is published on its own, so it cannot borrow a host app's kit.)
 *
 * The WAI-ARIA select-only combobox pattern: the button has the focus while closed; open, the list
 * has it and names the active option with aria-activedescendant. Up/Down, Home/End, Page keys,
 * typeahead, Enter or Space to choose, Escape or Tab to leave. A click anywhere else closes it.
 * The list is `position: fixed`, measured from the button, so no scrolling or clipped container
 * cuts it off; it opens above the button when there is more room there (a bar along the bottom).
 * Keys pressed in it never reach the deck (`data-deck-own-keys`, core/keyboard.ts).
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface ListboxOption<T extends string = string> {
  value: T;
  label: string;
  /** A second, quieter line or trailing note. */
  detail?: string;
  disabled?: boolean;
}

export interface ListboxGroup<T extends string = string> {
  label?: string;
  options: ListboxOption<T>[];
}

export interface ListboxProps<T extends string = string> {
  value: T;
  onChange: (value: T) => void;
  /** The accessible name: "Speed", "Voice". */
  label: string;
  /** Shown before the value inside the button, muted ("Speed"); hidden on narrow screens. */
  prefix?: string;
  groups: ListboxGroup<T>[];
  /** What the button says; the selected option's label by default. */
  display?: string;
  className?: string;
  /** "auto" picks the side with more room. */
  side?: "auto" | "top" | "bottom";
  /** The list's minimum width in px (it is at least as wide as the button). */
  minWidth?: number;
}

interface Place {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
}

const GAP = 6;
const EDGE = 8;

export function Listbox<T extends string>({
  value,
  onChange,
  label,
  prefix,
  groups,
  display,
  className,
  side = "auto",
  minWidth = 160,
}: ListboxProps<T>) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [place, setPlace] = useState<Place | null>(null);
  const typed = useRef({ text: "", at: 0 });

  const flat = useMemo(() => groups.flatMap((g) => g.options), [groups]);
  const selected = flat.findIndex((o) => o.value === value);
  const shown = display ?? flat[selected]?.label ?? String(value);
  const optionId = (i: number) => `${id}-o${i}`;

  const step = (from: number, by: number) => {
    if (!flat.length) return -1;
    let i = from;
    for (let n = 0; n < flat.length; n++) {
      i = Math.min(flat.length - 1, Math.max(0, i + by));
      if (!flat[i]!.disabled) return i;
      if ((by > 0 && i === flat.length - 1) || (by < 0 && i === 0)) break;
    }
    return from;
  };
  const edge = (end: "first" | "last") => {
    const order = end === "first" ? flat.map((_, i) => i) : flat.map((_, i) => flat.length - 1 - i);
    return order.find((i) => !flat[i]!.disabled) ?? -1;
  };

  const show = (at?: number) => {
    setActive(at ?? (selected >= 0 && !flat[selected]!.disabled ? selected : edge("first")));
    setOpen(true);
  };
  const hide = (refocus: boolean) => {
    setOpen(false);
    setPlace(null);
    if (refocus) button.current?.focus();
  };
  const choose = (i: number) => {
    const o = flat[i];
    if (!o || o.disabled) return;
    hide(true);
    if (o.value !== value) onChange(o.value);
  };

  // Place the list against the button, inside the window.
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const b = button.current?.getBoundingClientRect();
      if (!b) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const width = Math.min(Math.max(b.width, minWidth), vw - EDGE * 2);
      const left = Math.min(Math.max(EDGE, b.left), vw - EDGE - width);
      const above = b.top - GAP - EDGE;
      const below = vh - b.bottom - GAP - EDGE;
      const up = side === "top" || (side === "auto" && above > below);
      setPlace(
        up
          ? { left, width, bottom: vh - b.top + GAP, maxHeight: Math.min(320, above) }
          : { left, width, top: b.bottom + GAP, maxHeight: Math.min(320, below) },
      );
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open, side, minWidth]);

  // The list sizes itself to its longest option; once it has, keep its right edge in the window.
  useLayoutEffect(() => {
    if (!open || !place || !list.current) return;
    const over = list.current.getBoundingClientRect().right - (window.innerWidth - EDGE);
    if (over > 0.5) setPlace((p) => p && { ...p, left: Math.max(EDGE, p.left - over) });
  }, [open, place]);

  // Open and placed (a list still being measured is hidden, and hidden things take no focus): the
  // list takes the focus; the active option stays in view.
  const placed = !!place;
  useEffect(() => {
    if (open && placed) list.current?.focus({ preventScroll: true });
  }, [open, placed]);
  useEffect(() => {
    if (!open || active < 0) return;
    document.getElementById(optionId(active))?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  // A press anywhere else, or the page scrolling under it, closes it.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (list.current?.contains(t) || button.current?.contains(t)) return;
      hide(false);
    };
    const scrolled = (e: Event) => {
      if (list.current?.contains(e.target as Node)) return;
      hide(false);
    };
    document.addEventListener("pointerdown", away, true);
    window.addEventListener("scroll", scrolled, true);
    return () => {
      document.removeEventListener("pointerdown", away, true);
      window.removeEventListener("scroll", scrolled, true);
    };
  }, [open]);

  const typeahead = (key: string) => {
    const now = Date.now();
    const t = typed.current;
    t.text = now - t.at > 600 ? key : t.text + key;
    t.at = now;
    const q = t.text.toLowerCase();
    const start = active < 0 ? 0 : active + (t.text.length === 1 ? 1 : 0);
    for (let n = 0; n < flat.length; n++) {
      const i = (start + n) % flat.length;
      const o = flat[i]!;
      if (!o.disabled && o.label.toLowerCase().startsWith(q)) return setActive(i);
    }
  };

  const onButtonKey = (e: React.KeyboardEvent) => {
    if (open && e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      return hide(true);
    }
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
      e.preventDefault();
      e.stopPropagation();
      show(e.key === "ArrowUp" && selected < 0 ? edge("last") : undefined);
    }
  };

  const onListKey = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    const k = e.key;
    if (k === "Tab") return hide(false);
    if (k === "Escape") {
      e.preventDefault();
      return hide(true);
    }
    e.preventDefault();
    if (k === "ArrowDown") setActive((a) => step(a, 1));
    else if (k === "ArrowUp") setActive((a) => step(a, -1));
    else if (k === "Home") setActive(edge("first"));
    else if (k === "End") setActive(edge("last"));
    else if (k === "PageDown") setActive((a) => step(a, 8));
    else if (k === "PageUp") setActive((a) => step(a, -8));
    else if (k === "Enter" || k === " ") choose(active);
    else if (k.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) typeahead(k);
  };

  let index = -1;
  return (
    <span className={["deck-listbox", open ? "is-open" : "", className ?? ""].filter(Boolean).join(" ")}>
      <button
        ref={button}
        type="button"
        className="deck-listbox-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-label={label}
        title={`${label}: ${shown}`}
        data-deck-own-keys=""
        onClick={() => (open ? hide(true) : show())}
        onKeyDown={onButtonKey}
      >
        {prefix ? <span className="deck-listbox-prefix">{prefix}</span> : null}
        <span className="deck-listbox-value">{shown}</span>
        <Icon name="chevron-down" className="deck-listbox-chevron" />
      </button>
      {open ? (
        <div
          ref={list}
          id={`${id}-list`}
          className="deck-listbox-list"
          role="listbox"
          tabIndex={-1}
          aria-label={label}
          aria-activedescendant={active >= 0 ? optionId(active) : undefined}
          data-deck-own-keys=""
          data-side={place?.bottom != null ? "top" : "bottom"}
          style={
            place
              ? {
                  left: place.left,
                  minWidth: place.width,
                  maxWidth: `calc(100vw - ${EDGE * 2}px)`,
                  top: place.top,
                  bottom: place.bottom,
                  maxHeight: place.maxHeight,
                }
              : { visibility: "hidden" }
          }
          onKeyDown={onListKey}
        >
          {groups.map((g, gi) => (
            // oxlint-disable-next-line jsx-a11y/role-has-required-aria-props -- a group needs no state
            <div key={g.label ?? gi} role="group" aria-label={g.label}>
              {g.label ? (
                <div className="deck-listbox-group" aria-hidden="true">
                  {g.label}
                </div>
              ) : null}
              {g.options.map((o) => {
                index++;
                const i = index;
                const isSel = o.value === value;
                return (
                  <div
                    key={o.value}
                    id={optionId(i)}
                    role="option"
                    aria-selected={isSel}
                    aria-disabled={o.disabled || undefined}
                    className={[
                      "deck-listbox-option",
                      i === active ? "is-active" : "",
                      isSel ? "is-selected" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onPointerMove={() => !o.disabled && active !== i && setActive(i)}
                    onClick={() => choose(i)}
                  >
                    <Icon name="check" className="deck-listbox-check" />
                    <span className="deck-listbox-label">{o.label}</span>
                    {o.detail ? <span className="deck-listbox-detail">{o.detail}</span> : null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ) : null}
    </span>
  );
}
