import { type CSSProperties, useEffect, useSyncExternalStore } from "react";

import { iconState, requestIcon, subscribeIcon } from "../icons/registry.ts";

/**
 * An Iconify icon (`set:name`), drawn from the registry (icons/registry.ts): bundled by the build
 * when the deck has the set installed, fetched from the Iconify API otherwise. `<Icon>` hands any
 * name with a colon here; the compiler turns Slidev's `<mdi-account />` into exactly that.
 *
 * Sized like text: `size` is the height (default 1em), the width follows the icon's own
 * proportions, so `class="text-3xl"` or a `font-size` scales it and `color` (or `currentColor`
 * from the text) colours a monochrome one. While it loads it holds its space; when it cannot be
 * had (offline, a name the set does not have) a small box says so, with the reason as its title.
 */

/** `"color: red; font-size: 2em"` → a React style object; an object passes through. */
export function styleObject(style: unknown): CSSProperties | undefined {
  if (!style) return undefined;
  if (typeof style === "object") return style as CSSProperties;
  const out: Record<string, string> = {};
  for (const part of String(style).split(";")) {
    const at = part.indexOf(":");
    if (at <= 0) continue;
    const prop = part.slice(0, at).trim();
    const value = part.slice(at + 1).trim();
    if (!prop || !value) continue;
    out[
      prop.startsWith("--") ? prop : prop.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase())
    ] = value;
  }
  return out as CSSProperties;
}

/** "1.2em" scaled by `k` → "1.44em"; numbers are px. */
function scaled(size: string | number, k: number): string | number {
  if (typeof size === "number") return Math.round(size * k * 100) / 100;
  const m = /^(-?[\d.]+)([a-z%]*)$/i.exec(size.trim());
  return m ? `${Math.round(Number(m[1]) * k * 1000) / 1000}${m[2]}` : size;
}

export interface IconifyIconProps {
  /** `set:icon`, e.g. `mdi:account`, `logos:vue`. */
  name: string;
  /** The height (the width follows the icon's proportions). Default 1em. */
  size?: string | number;
  color?: string;
  /** An accessible name; without one the icon is decorative (aria-hidden). */
  title?: string;
  className?: string;
  /** Slidev writes `class`; it is the same as `className`. */
  class?: string;
  /** An object, or a CSS string as written in HTML. */
  style?: CSSProperties | string;
}

export function IconifyIcon({
  name,
  size = "1em",
  color,
  title,
  className,
  class: cls,
  style,
}: IconifyIconProps) {
  const state = useSyncExternalStore(
    (l) => subscribeIcon(name, l),
    () => iconState(name),
    () => iconState(name),
  );
  useEffect(() => requestIcon(name), [name]);
  const classes = ["deck-icon", "deck-iconify", cls, className].filter(Boolean).join(" ");
  const css = { ...styleObject(style), ...(color ? { color } : null) };
  const a11y = title ? { role: "img", "aria-label": title } : { "aria-hidden": true };
  if (state?.status === "missing")
    return (
      <span
        className={["deck-icon-missing", cls, className].filter(Boolean).join(" ")}
        title={`${name}: ${state.reason}`}
        style={{ ...css, width: size, height: size }}
        {...a11y}
      />
    );
  if (state?.status !== "ready")
    return (
      <svg className={`${classes} is-loading`} width={size} height={size} style={css} aria-hidden />
    );
  const { body, width, height, left = 0, top = 0 } = state.icon;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`${left} ${top} ${width} ${height}`}
      width={scaled(size, width / height)}
      height={size}
      className={classes}
      style={css}
      data-icon={name}
      {...a11y}
      dangerouslySetInnerHTML={{
        __html: title ? `<title>${title.replace(/</g, "&lt;")}</title>${body}` : body,
      }}
    />
  );
}
