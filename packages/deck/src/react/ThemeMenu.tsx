import { useEffect, useRef } from "react";

import { BUILTIN_THEMES, type ThemeMeta } from "../theming/contract.ts";
import { useDeck } from "./context.ts";
import { DownloadButton } from "./Download.tsx";
import { useActions, useUi } from "./hooks.ts";

/**
 * The theme selector: every screen picks its own look — the deck's own themes (`theme` and
 * `themes`: built-ins, packages the Vite plugin imported, or CSS main.tsx imports), then every
 * first-party theme it did not name, plus light or dark — and keeps the choice in the browser.
 * `T` opens it; the palette button does the same. A theme not loaded yet starts loading when
 * the pointer reaches its row, and its swatch comes from its metadata (`kadal.theme.swatch`).
 */
/** Built-in themes whose name is an initialism: "rla" reads "RLA", not "Rla". */
const BUILT_IN_TITLES: Record<string, string> = { rla: "RLA" };

export function themeLabel(name: string, title?: string): string {
  return (
    title ??
    BUILT_IN_TITLES[name] ??
    name.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

export function ThemeMenu({ compact = false }: { compact?: boolean }) {
  const deck = useDeck();
  const open = useUi((s) => s.themeMenu);
  const theme = useUi((s) => s.theme);
  const scheme = useUi((s) => s.colorScheme);
  const actions = useActions();
  const root = useRef<HTMLDivElement>(null);
  const themes = deck.config.themes.length ? deck.config.themes : [deck.config.theme];
  const refOf = (name: string) => deck.manifest.packages?.themes.find((t) => t.name === name);
  // A theme package's own display name ("Seriph"), when the manifest resolved one.
  const title = (name: string) => {
    const ref = refOf(name);
    return ref && !ref.builtin ? ref.meta.title : undefined;
  };
  // The swatch's colours without the theme's stylesheet, which a lazy theme has not loaded yet.
  const swatch = (name: string) => {
    const pair = ((refOf(name)?.meta ?? BUILTIN_THEMES[name]) as ThemeMeta | undefined)?.swatch;
    return pair ? { background: `linear-gradient(135deg, ${pair[0]}, ${pair[1]})` } : undefined;
  };
  // Start a lazy theme's chunk before the click (both loaders cache, so this costs one fetch).
  const prefetch = (name: string) => {
    const ref = refOf(name);
    if (ref?.load && !ref.module) void ref.load().catch(() => {});
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) actions.toggleThemeMenu(false);
    };
    // Escape is handled by the deck's key handler, which closes the menu without touching anything else.
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open, actions]);

  return (
    <div
      ref={root}
      className={["deck-theme-menu", compact ? "is-compact" : "", open ? "is-open" : ""]
        .filter(Boolean)
        .join(" ")}
    >
      <button
        type="button"
        className="deck-theme-button"
        onClick={() => actions.toggleThemeMenu()}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Theme (T)"
      >
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M12 3a9 9 0 0 0 0 18c1.1 0 2-.9 2-2v-1.3c0-.5.4-.9.9-.9H16a5 5 0 0 0 5-5c0-5-4-8.8-9-8.8Z" />
          <circle cx="7.5" cy="11.5" r="1.2" fill="currentColor" stroke="none" />
          <circle cx="10.5" cy="7.5" r="1.2" fill="currentColor" stroke="none" />
          <circle cx="15" cy="7.5" r="1.2" fill="currentColor" stroke="none" />
        </svg>
        {compact ? null : <span>{themeLabel(theme, title(theme))}</span>}
      </button>
      <DownloadButton compact={compact} />
      {open ? (
        <div className="deck-theme-popover" role="menu">
          <div className="deck-theme-section">Theme</div>
          {themes.map((name) => (
            <button
              key={name}
              type="button"
              role="menuitemradio"
              aria-checked={name === theme}
              className={name === theme ? "is-on" : ""}
              onClick={() => actions.setTheme(name)}
              onPointerEnter={() => prefetch(name)}
              onFocus={() => prefetch(name)}
            >
              <i className={`deck-theme-swatch theme-${name}`} style={swatch(name)} />
              {themeLabel(name, title(name))}
            </button>
          ))}
          <div className="deck-theme-section">Scheme</div>
          <div className="deck-theme-row">
            <button
              type="button"
              className={scheme === "light" ? "is-on" : ""}
              onClick={() => actions.setColorScheme("light")}
            >
              ☀ Light
            </button>
            <button
              type="button"
              className={scheme === "dark" ? "is-on" : ""}
              onClick={() => actions.setColorScheme("dark")}
            >
              ☾ Dark
            </button>
          </div>
          <button
            type="button"
            role="menuitem"
            className="deck-theme-display"
            onClick={() => {
              actions.toggleThemeMenu(false);
              void deck.commands.run("view.settings", { on: true }, "ui");
            }}
          >
            Display settings… <kbd>,</kbd>
          </button>
          <div className="deck-theme-hint">Yours only — every screen keeps its own choice.</div>
        </div>
      ) : null}
    </div>
  );
}
