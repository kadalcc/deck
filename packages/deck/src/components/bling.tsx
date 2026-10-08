import { icons } from "lucide-react";
import type { ComponentType, ReactNode } from "react";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * BLING  —  the small things that make a slide feel designed
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   <GradientText>      a heading painted with the theme's accent ramp (or your colours)
 *   <Glass>             a frosted card with a gradient hairline border
 *   <Glow>              a soft radial light behind whatever sits in the same box
 *   <Chip>              a pill with a coloured dot — tags, statuses, levels
 *   <Icon name="…">     any lucide icon by its name, sized in em
 *   <Divider>           a hairline with an optional label
 *   <Ribbon>            a corner ribbon ("live", "draft")
 *   <Halo>              a number or word inside a soft ring
 *   <Shimmer>           text with a slow sheen passing over it
 *   <Blob>              a soft organic shape to tuck behind a figure
 *   <Tilt>              a card that leans toward the pointer
 *
 * Every one reads the theme's tokens, so they change with the theme selector.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(" ");

export type Tone =
  | "accent"
  | "accent-2"
  | "good"
  | "warn"
  | "bad"
  | "info"
  | "neutral"
  | "purple"
  | "pink"
  | "amber"
  | "teal";

export function GradientText({
  children,
  from,
  to,
  angle = 90,
  className,
  as: Tag = "span",
}: {
  children?: ReactNode;
  from?: string;
  to?: string;
  angle?: number;
  className?: string;
  as?: "span" | "h1" | "h2" | "h3" | "strong";
}) {
  const style = {
    "--gt-from": from ?? "var(--deck-accent)",
    "--gt-to": to ?? "var(--deck-accent-2)",
    "--gt-angle": `${angle}deg`,
  } as React.CSSProperties;
  return (
    <Tag className={cx("deck-gradient-text", className)} style={style}>
      {children}
    </Tag>
  );
}

export function Glass({
  children,
  className,
  tone = "neutral",
  pad = "1em",
  glow = false,
  style,
}: {
  children?: ReactNode;
  className?: string;
  tone?: Tone;
  pad?: string;
  glow?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={cx("deck-glass", `tone-${tone}`, glow && "has-glow", className)}
      style={{ padding: pad, ...style }}
    >
      {children}
    </div>
  );
}

export function Glow({
  color,
  size = "60%",
  x = "50%",
  y = "50%",
  opacity = 0.35,
  className,
}: {
  color?: string;
  size?: string;
  x?: string;
  y?: string;
  opacity?: number;
  className?: string;
}) {
  return (
    <div
      className={cx("deck-glow", className)}
      aria-hidden
      style={{
        background: `radial-gradient(circle at ${x} ${y}, ${color ?? "var(--deck-accent)"} 0, transparent ${size})`,
        opacity,
      }}
    />
  );
}

export function Chip({
  children,
  tone = "neutral",
  icon,
  className,
}: {
  children?: ReactNode;
  tone?: Tone;
  icon?: string;
  className?: string;
}) {
  return (
    <span className={cx("deck-chip", `tone-${tone}`, className)}>
      {icon ? <Icon name={icon} size="1em" /> : <i className="deck-chip-dot" />}
      {children}
    </span>
  );
}

export function Icon({
  name,
  size = "1em",
  color,
  strokeWidth = 1.75,
  className,
}: {
  name: string;
  size?: string | number;
  color?: string;
  strokeWidth?: number;
  className?: string;
}) {
  const pascal = name.replace(/(^|[-_ ])(\w)/g, (_m, _s, c: string) => c.toUpperCase());
  const Cmp = (
    icons as Record<
      string,
      ComponentType<{
        size?: string | number;
        color?: string;
        strokeWidth?: number;
        className?: string;
      }>
    >
  )[pascal];
  if (!Cmp)
    return (
      <span className="deck-icon-missing" title={`No icon "${name}"`}>
        ▢
      </span>
    );
  return (
    <Cmp
      size={size}
      color={color}
      strokeWidth={strokeWidth}
      className={cx("deck-icon", className)}
    />
  );
}

export function Divider({ label, className }: { label?: ReactNode; className?: string }) {
  return (
    <div className={cx("deck-divider", label ? "has-label" : "", className)} role="separator">
      {label ? <span>{label}</span> : null}
    </div>
  );
}

export function Ribbon({
  children,
  tone = "accent",
  corner = "right",
}: {
  children?: ReactNode;
  tone?: Tone;
  corner?: "left" | "right";
}) {
  return <span className={cx("deck-ribbon", `tone-${tone}`, `corner-${corner}`)}>{children}</span>;
}

export function Halo({
  children,
  tone = "accent",
  size = "3.2em",
  className,
}: {
  children?: ReactNode;
  tone?: Tone;
  size?: string;
  className?: string;
}) {
  return (
    <span
      className={cx("deck-halo", `tone-${tone}`, className)}
      style={{ width: size, height: size }}
    >
      <span>{children}</span>
    </span>
  );
}

export function Shimmer({
  children,
  className,
  as: Tag = "span",
}: {
  children?: ReactNode;
  className?: string;
  as?: "span" | "h1" | "h2" | "strong";
}) {
  return <Tag className={cx("deck-shimmer", className)}>{children}</Tag>;
}

export function Blob({
  color,
  x = "50%",
  y = "50%",
  size = "40%",
  rotate = 0,
  opacity = 0.5,
  className,
}: {
  color?: string;
  x?: string;
  y?: string;
  size?: string;
  rotate?: number;
  opacity?: number;
  className?: string;
}) {
  return (
    <svg
      className={cx("deck-blob", className)}
      viewBox="0 0 200 200"
      aria-hidden
      style={{
        left: x,
        top: y,
        width: size,
        transform: `translate(-50%, -50%) rotate(${rotate}deg)`,
        opacity,
        color: color ?? "var(--deck-accent-2)",
      }}
    >
      <path
        fill="currentColor"
        d="M44.1,-63.6C57.4,-55.8,68.6,-43.4,74.7,-28.9C80.8,-14.4,81.9,2.1,77.5,16.9C73.1,31.7,63.3,44.7,50.7,54.5C38.2,64.4,22.9,71,6.7,72.1C-9.6,73.2,-26.8,68.8,-40.4,59.7C-54,50.6,-64,36.7,-70,20.9C-75.9,5.1,-77.8,-12.7,-71.7,-27.2C-65.6,-41.7,-51.5,-52.9,-37.2,-60.5C-22.9,-68.1,-8.4,-72.1,5.6,-79.9C19.7,-87.8,30.8,-71.4,44.1,-63.6Z"
        transform="translate(100 100)"
      />
    </svg>
  );
}

export function Tilt({
  children,
  className,
  max = 8,
}: {
  children?: ReactNode;
  className?: string;
  max?: number;
}) {
  return (
    <div
      className={cx("deck-tilt", className)}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        e.currentTarget.style.transform = `perspective(900px) rotateY(${px * max * 2}deg) rotateX(${-py * max * 2}deg)`;
      }}
      onPointerLeave={(e) => {
        e.currentTarget.style.transform = "";
      }}
    >
      {children}
    </div>
  );
}
