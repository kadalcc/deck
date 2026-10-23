import type { CSSProperties } from "react";

/**
 * A split-flap departure board that flips to its text: one cell per character, rows from the
 * text's lines, each cell spinning a few times before it settles (the CSS is in themes/live.css).
 */
export function FlipBoard({
  text,
  rows,
  cols,
  className,
  flipDuration = 35,
  stagger = 15,
}: {
  text: string;
  rows?: number;
  cols?: number;
  className?: string;
  flipDuration?: number;
  stagger?: number;
}) {
  const lines = text.split("\n");
  const c = cols ?? Math.max(...lines.map((l) => l.length));
  const r = rows ?? lines.length;
  const cells: string[] = [];
  for (let i = 0; i < r; i++) {
    const line = (lines[i] ?? "").padEnd(c, " ");
    for (let j = 0; j < c; j++) cells.push(line[j] ?? " ");
  }
  return (
    <div
      className={["deck-flipboard", className].filter(Boolean).join(" ")}
      style={
        {
          gridTemplateColumns: `repeat(${c}, 1fr)`,
          "--flip": `${flipDuration}ms`,
          "--stagger": `${stagger}ms`,
        } as CSSProperties
      }
    >
      {cells.map((ch, i) => (
        <span
          key={i}
          className="deck-flip-cell"
          style={{ animationDelay: `${(i % c) * stagger + Math.floor(i / c) * stagger * 2}ms` }}
        >
          {ch}
        </span>
      ))}
    </div>
  );
}
