import {
  Children,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  createContext,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import { useDeck } from "../react/context.ts";
import { useClick } from "../react/hooks.ts";
import { FileIcon } from "./file-icons.tsx";

/**
 * Code blocks as tabs: Slidev's `::code-group` (compiler/code-groups.ts writes this component
 * for it), or written by hand around fences:
 *
 *   <CodeGroup>
 *
 *   ```sh [npm]
 *   npm i @kadal/deck
 *   ```
 *
 *   ```sh [bun]
 *   bun add @kadal/deck
 *   ```
 *
 *   </CodeGroup>
 *
 * Each tab is named by its fence's `[title]` (else its language) with a file-type badge; the
 * blocks keep everything else of theirs — line steps, numbers, notation marks, the copy button.
 *
 * Tabs, the WAI-ARIA way: a tablist of tabs and a panel each; ←/→ (and Home/End) move between
 * tabs while the tablist has focus — keys the deck leaves alone there (`data-deck-own-keys`) —
 * and Tab moves into the open panel. `clicks` turns the tabs over one click at a time instead
 * (the presenter's next press opens the next tab; clicking a tab still works). In print and
 * export the open tab prints; `print="all"` prints every tab, one after another, each with its
 * name.
 */
export interface CodeGroupProps {
  children?: ReactNode;
  /** Open the next tab on each click of the slide, from the group's own step on. */
  clicks?: boolean;
  /** With `clicks`: when the first turn happens, like `<Click at>` (`"+1"`, an absolute step). */
  at?: number | string;
  /** The tab open at first (0-based). Default 0. */
  active?: number;
  /** What print and export show: the open tab (default) or every tab. */
  print?: "active" | "all";
  className?: string;
}

/** Inside a group the block's own title bar steps aside: the tab says it already. */
export const CodeGroupContext = createContext(false);

interface Tab {
  element: ReactElement<Record<string, unknown>>;
  title: string;
  lang: string | null;
}

function tabsOf(children: ReactNode): Tab[] {
  const out: Tab[] = [];
  for (const child of Children.toArray(children)) {
    if (!isValidElement(child)) continue;
    const props = child.props as Record<string, unknown>;
    const lang = typeof props["data-lang"] === "string" ? (props["data-lang"] as string) : null;
    const title =
      (typeof props["data-title"] === "string" && (props["data-title"] as string)) ||
      (typeof props.title === "string" && (props.title as string)) ||
      lang ||
      `Tab ${out.length + 1}`;
    out.push({ element: child as ReactElement<Record<string, unknown>>, title, lang });
  }
  return out;
}

const atOf = (at: number | string | undefined) =>
  at === undefined ? undefined : typeof at === "number" ? at : /^\d+$/.test(at) ? Number(at) : at;

export function CodeGroup({ children, clicks, at, active = 0, print, className }: CodeGroupProps) {
  const tabs = tabsOf(children);
  const deck = useDeck();
  const id = useId();
  const span = clicks ? Math.max(0, tabs.length - 1) : 0;
  const { range, click } = useClick(span > 0 ? { span, at: atOf(at) } : { at: 0 });
  // With clicks the slide's step says which tab is open; a tab clicked by hand wins until the
  // step moves again.
  const stepped = span > 0 ? Math.min(span, Math.max(0, click - range.start + 1)) : null;
  const [chosen, setChosen] = useState<{ index: number; at: number | null } | null>(null);
  const current =
    chosen && (stepped === null || chosen.at === stepped)
      ? chosen.index
      : (stepped ?? Math.min(Math.max(0, active), Math.max(0, tabs.length - 1)));
  const list = useRef<HTMLDivElement>(null);
  const focusNext = useRef(false);

  useEffect(() => {
    if (!focusNext.current) return;
    focusNext.current = false;
    list.current?.querySelector<HTMLButtonElement>(`[data-tab="${current}"]`)?.focus();
  }, [current]);

  if (!tabs.length) return null;
  const select = (i: number, focus = false) => {
    focusNext.current = focus;
    setChosen({ index: i, at: stepped });
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const n = tabs.length;
    const to =
      e.key === "ArrowRight"
        ? (current + 1) % n
        : e.key === "ArrowLeft"
          ? (current - 1 + n) % n
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? n - 1
              : null;
    if (to === null) return;
    e.preventDefault();
    e.stopPropagation();
    select(to, true);
  };
  const printAll = print === "all" && deck.mode === "print";

  return (
    <div
      className={["deck-code-group", printAll ? "is-print-all" : "", className ?? ""]
        .filter(Boolean)
        .join(" ")}
    >
      <div
        ref={list}
        className="deck-code-group-tabs"
        role="tablist"
        aria-orientation="horizontal"
        data-deck-own-keys=""
        onKeyDown={onKey}
      >
        {tabs.map((t, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            id={`${id}-tab-${i}`}
            data-tab={i}
            aria-selected={i === current}
            aria-controls={`${id}-panel-${i}`}
            tabIndex={i === current ? 0 : -1}
            className={i === current ? "is-active" : undefined}
            onClick={() => select(i)}
          >
            <FileIcon title={t.title} lang={t.lang} />
            <span>{t.title}</span>
          </button>
        ))}
      </div>
      <CodeGroupContext.Provider value={true}>
        {tabs.map((t, i) => (
          <div
            key={i}
            role="tabpanel"
            id={`${id}-panel-${i}`}
            aria-labelledby={`${id}-tab-${i}`}
            className="deck-code-group-panel"
            hidden={!printAll && i !== current}
            data-title={t.title}
          >
            {printAll ? (
              <div className="deck-code-group-print-title">
                <FileIcon title={t.title} lang={t.lang} />
                <span>{t.title}</span>
              </div>
            ) : null}
            {t.element}
          </div>
        ))}
      </CodeGroupContext.Provider>
    </div>
  );
}
