import {
  Children,
  cloneElement,
  createContext,
  type ElementType,
  isValidElement,
  type ReactNode,
  useContext,
} from "react";

import type { ClickAt } from "../core/clicks.ts";
import { useClick } from "../react/hooks.ts";

/**
 * Click-driven reveals. `<Click>` is Slidev's v-click and reveal.js's fragment in one: it registers
 * a step and shows its children from that step on (or hides them, with `hide`). `effect` names the
 * reveal.js fragment styles — fade-in (default), fade-up/down/left/right, fade-out, grow, shrink,
 * strike, highlight-red/green/blue, highlight-current-*, semi-fade-out, current-visible,
 * fade-in-then-out, fade-in-then-semi-out — and any custom class the theme defines.
 */
export type ClickEffect =
  | "fade-in"
  | "fade-out"
  | "fade-up"
  | "fade-down"
  | "fade-left"
  | "fade-right"
  | "fade-in-then-out"
  | "fade-in-then-semi-out"
  | "current-visible"
  | "grow"
  | "shrink"
  | "strike"
  | "semi-fade-out"
  | "highlight-red"
  | "highlight-green"
  | "highlight-blue"
  | "highlight-current-red"
  | "highlight-current-green"
  | "highlight-current-blue"
  | (string & {});

export interface ClickProps {
  at?: ClickAt;
  hide?: boolean;
  effect?: ClickEffect;
  /** The element to render; a `span` for inline text, `div` by default. */
  as?: ElementType;
  className?: string;
  style?: React.CSSProperties;
  children?: ReactNode;
  [key: string]: unknown;
}

export function Click({
  at,
  hide,
  effect = "fade-in",
  as,
  className,
  style,
  children,
  ...rest
}: ClickProps) {
  const { shown, current, range, click } = useClick({ at, hide });
  const Tag = (as ?? "div") as ElementType;
  const past = click > range.start;
  return (
    <Tag
      {...rest}
      className={[
        "deck-click",
        `effect-${effect}`,
        shown ? "is-shown" : "is-hidden",
        current ? "is-current" : "",
        past ? "is-past" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={style}
      data-click-at={range.start}
      aria-hidden={shown ? undefined : true}
    >
      {children}
    </Tag>
  );
}

/** reveal.js spelling. */
export const Fragment = Click;

/** Shows with the previous click rather than one after it. */
export function After(props: Omit<ClickProps, "at">) {
  return <Click {...props} at="+0" />;
}

interface ClicksScope {
  every: number;
  depth: number;
  level: number;
  effect: ClickEffect;
}

const ClicksContext = createContext<ClicksScope | null>(null);

export interface ClicksProps {
  /** Reveal this many items per click. */
  every?: number;
  /** How deep nested lists take part; 1 means only the outer list. */
  depth?: number;
  effect?: ClickEffect;
  children?: ReactNode;
}

/**
 * Reveal each child in turn. Wrap a Markdown list to step through its items (the `li` mapping
 * registers itself when inside a `<Clicks>`), or any elements to step through them.
 */
/**
 * Does this child step its own items, so `<Clicks>` must leave it alone?
 *
 * A Markdown list does: the `li` mapping below turns each item into a click while it is inside a
 * `<Clicks>`. Wrapping the list as well spends a click on the list as a whole and lands every item
 * one step late — which puts the notes' `[click]` markers, the presenter's step count and any
 * `<Click at={n}>` later on the slide out of step with what the audience sees.
 *
 * MDX maps `ul` to `Ul` (`export { Ul as ul }` in components/index.ts), so what arrives here has
 * that component as its type and no className of its own — the class exists only once `Ul` has
 * rendered, which is why the className test alone could never see it.
 */
export function stepsItsOwnItems(child: ReactNode): boolean {
  if (!isValidElement(child)) return false;
  const type = child.type;
  if (type === Ul || type === Ol) return true;
  if (type === "ul" || type === "ol") return true;
  return !!(child.props as { className?: string })?.className?.includes?.("deck-list");
}

export function Clicks({ every = 1, depth = 1, effect = "fade-in", children }: ClicksProps) {
  const items = Children.toArray(children);
  const listLike = items.some(stepsItsOwnItems);
  return (
    <ClicksContext.Provider value={{ every, depth, level: 0, effect }}>
      {listLike
        ? children
        : items.map((child, i) =>
            isValidElement(child) ? (
              <Click key={i} at={i % every === 0 ? undefined : "+0"} effect={effect}>
                {child}
              </Click>
            ) : (
              child
            ),
          )}
    </ClicksContext.Provider>
  );
}

/** The `li` mapping: a plain list item, or a click step when inside `<Clicks>`. */
export function Li({ children, ...rest }: { children?: ReactNode; [key: string]: unknown }) {
  const scope = useContext(ClicksContext);
  if (!scope || scope.level >= scope.depth) return <li {...rest}>{children}</li>;
  return (
    <ClicksContext.Provider value={{ ...scope, level: scope.level + 1 }}>
      <ClickLi scope={scope} {...rest}>
        {children}
      </ClickLi>
    </ClicksContext.Provider>
  );
}

let liCounter = 0;
function ClickLi({
  scope,
  children,
  ...rest
}: {
  scope: ClicksScope;
  children?: ReactNode;
  [key: string]: unknown;
}) {
  // Items share a step in groups of `every`: the first of each group registers a step, the rest ride along.
  const index = liCounter++;
  const at = index % scope.every === 0 ? undefined : "+0";
  const { shown, current, range, click } = useClick({ at });
  return (
    <li
      {...rest}
      className={[
        "deck-click",
        `effect-${scope.effect}`,
        shown ? "is-shown" : "is-hidden",
        current ? "is-current" : "",
        click > range.start ? "is-past" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-click-at={range.start}
    >
      {children}
    </li>
  );
}

/** Lists keep their markup. `<Clicks>` recognises these two by identity, so it leaves them to
 * step their own items; the class is for the stylesheet. */
export function Ul(props: { children?: ReactNode; className?: string; [key: string]: unknown }) {
  return <ul {...props} className={["deck-list", props.className].filter(Boolean).join(" ")} />;
}
export function Ol(props: { children?: ReactNode; className?: string; [key: string]: unknown }) {
  return <ol {...props} className={["deck-list", props.className].filter(Boolean).join(" ")} />;
}

export { cloneElement };
