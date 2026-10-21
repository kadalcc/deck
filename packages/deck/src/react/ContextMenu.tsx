import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { Icon } from "../components/bling.tsx";
import { isEditable } from "../core/keyboard.ts";
import { useCommand } from "./commands.ts";
import { useDeck } from "./context.ts";
import { defaultMenuItems, type MenuItem, menuEnabled } from "./menu.ts";

/**
 * The right-click menu (react/menu.ts has the items and the API). On the deck page and in the
 * presenter's "current" box; opened by a right-click on a slide, or by Shift+F10 / the context-menu
 * key (the `contextMenu` binding, which runs `view.contextMenu`), closed by Escape, a click elsewhere, Tab or choosing an item. Up/Down/Home/End move
 * through it, Enter or Space chooses, and focus goes back where it was.
 *
 * What it leaves alone: Shift + right-click (the browser's own menu, always), a right-click in a
 * text field or on a link, a long-press on a touch screen (the browser's text selection and image
 * menu), and the pen — while drawing, the right button belongs to the drawing layer.
 */
export function ContextMenu() {
  const deck = useDeck();
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [version, setVersion] = useState(0);
  const menu = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const enabled =
    menuEnabled(deck.config.contextMenu, !!deck.manifest.dev) &&
    (deck.mode === "play" || deck.mode === "presenter") &&
    !deck.projector;

  const items = useMemo(() => {
    void version;
    const all = deck.menu.items(defaultMenuItems(deck));
    return all.filter((item) => {
      if (item.when && !item.when(deck)) return false;
      if (item.command) {
        const spec = deck.commands.get(item.command);
        if (!spec) return false;
        try {
          if (spec.enabled && !spec.enabled()) return false;
        } catch {
          return false;
        }
      }
      return true;
    });
  }, [deck, version, at]);

  const openAt = (x: number, y: number) => {
    returnTo.current = document.activeElement as HTMLElement | null;
    setVersion((n) => n + 1);
    setPos(null);
    setAt({ x, y });
  };
  const close = (refocus = true) => {
    setAt(null);
    if (refocus) returnTo.current?.focus?.();
  };

  useCommand(
    enabled
      ? {
          id: "view.contextMenu",
          title: "Context menu",
          description: "Open the deck's context menu in the middle of the slide (Shift+F10).",
          group: "view",
          run: () => openAt(window.innerWidth / 2, window.innerHeight / 2),
        }
      : null,
  );

  useEffect(() => {
    if (!enabled) return;
    let touch = false;
    const onPointer = (e: PointerEvent) => {
      touch = e.pointerType === "touch";
    };
    const onContext = (e: MouseEvent) => {
      if (e.shiftKey || e.defaultPrevented || touch) return;
      const target = e.target as HTMLElement | null;
      if (!target || isEditable(target) || target.closest("a[href], .deck-context-menu")) return;
      // The slide only — by where the pointer is, since layers over the slide (confetti, the
      // laser, a drawing) take the event — and never the controls, a panel or a dialog.
      if (
        target.closest(
          "button, input, select, textarea, [role='dialog'], [role='menu'], [role='toolbar'], [data-deck-own-keys], .deck-controls, .deck-progress, .deck-slide-number, .deck-pause-curtain, .deck-theme-menu",
        )
      )
        return;
      const area = document.querySelector<HTMLElement>(
        deck.mode === "presenter" ? ".deck-presenter-current" : ".deck-scroll, .deck-stage",
      );
      const r = area?.getBoundingClientRect();
      const inside =
        !!r &&
        e.clientX >= r.left &&
        e.clientX <= r.right &&
        e.clientY >= r.top &&
        e.clientY <= r.bottom;
      if (!inside || deck.ui.get().drawing) return;
      e.preventDefault();
      openAt(e.clientX, e.clientY);
    };
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("contextmenu", onContext);
    return () => {
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("contextmenu", onContext);
    };
  }, [enabled, deck]);

  // Clamp to the viewport once the menu's size is known, then focus the first item.
  useLayoutEffect(() => {
    if (!at || !menu.current) return;
    const r = menu.current.getBoundingClientRect();
    const pad = 8;
    const left = Math.max(pad, Math.min(at.x, window.innerWidth - r.width - pad));
    const top = Math.max(pad, Math.min(at.y, window.innerHeight - r.height - pad));
    setPos({ left, top });
  }, [at]);
  // Focus the first item once the menu is placed (a hidden element cannot take focus).
  useEffect(() => {
    if (pos)
      menu.current
        ?.querySelector<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"])')
        ?.focus();
  }, [pos]);

  useEffect(() => {
    if (!at) return;
    const onDown = (e: PointerEvent) => {
      if (!menu.current?.contains(e.target as Node)) close(false);
    };
    const onBlur = () => close(false);
    // Escape closes the menu wherever focus went, before the deck reads it as "overview".
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      close();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("blur", onBlur);
    window.addEventListener("resize", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("resize", onBlur);
    };
  }, [at]);

  if (!at || !enabled) return null;

  const choose = (item: MenuItem) => {
    if (isDisabled(item)) return;
    close();
    if (item.run) item.run(deck);
    else if (item.command) void deck.commands.run(item.command, item.params ?? {}, "ui");
  };
  const isDisabled = (item: MenuItem) =>
    typeof item.disabled === "function" ? item.disabled(deck) : !!item.disabled;
  const isChecked = (item: MenuItem) =>
    typeof item.checked === "function" ? item.checked(deck) : item.checked;

  const onKeyDown = (e: React.KeyboardEvent) => {
    const list = [...(menu.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])];
    const i = list.indexOf(document.activeElement as HTMLElement);
    const move = (to: number) => list[(to + list.length) % list.length]?.focus();
    if (e.key === "ArrowDown") move(i + 1);
    else if (e.key === "ArrowUp") move(i - 1);
    else if (e.key === "Home") move(0);
    else if (e.key === "End") move(list.length - 1);
    else if (e.key === "Tab") close();
    else if (e.key.length === 1 && /\S/.test(e.key)) {
      // Typeahead: the next item starting with that letter.
      const k = e.key.toLowerCase();
      const from = list.slice(i + 1).concat(list.slice(0, i + 1));
      from.find((el) => el.textContent?.trim().toLowerCase().startsWith(k))?.focus();
    } else return;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      ref={menu}
      className="deck-context-menu"
      role="menu"
      aria-label="Deck"
      data-deck-own-keys
      style={
        pos ? { left: pos.left, top: pos.top } : { left: at.x, top: at.y, visibility: "hidden" }
      }
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) => {
        const checked = isChecked(item);
        const disabled = isDisabled(item);
        return (
          <div key={item.id} className="deck-context-group">
            {item.separator && i > 0 ? <div className="deck-context-sep" role="separator" /> : null}
            <button
              type="button"
              role={checked === undefined ? "menuitem" : "menuitemcheckbox"}
              aria-checked={checked === undefined ? undefined : checked}
              aria-disabled={disabled || undefined}
              tabIndex={-1}
              className="deck-context-item"
              onClick={() => choose(item)}
            >
              <span className="deck-context-icon" aria-hidden>
                {checked ? <Icon name="check" /> : item.icon ? <Icon name={item.icon} /> : null}
              </span>
              <span className="deck-context-label">{item.label}</span>
              {item.keys ? <kbd className="deck-context-keys">{item.keys}</kbd> : null}
            </button>
          </div>
        );
      })}
    </div>
  );
}
