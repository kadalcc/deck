import { Icon } from "../components/bling.tsx";
import { DRAW_COLORS, DRAW_SIZES, swatchGradient } from "./strokes.ts";

/** What the pointer does on the slide. */
export type DrawTool = "pen" | "highlighter" | "line" | "arrow" | "rect" | "ellipse" | "eraser";

/** The tools in toolbar order, with the key that picks each while the pen is on. */
export const TOOLS: { tool: DrawTool; icon: string; label: string; key: string }[] = [
  { tool: "pen", icon: "pencil", label: "Pen", key: "1" },
  { tool: "highlighter", icon: "highlighter", label: "Highlighter", key: "2" },
  { tool: "line", icon: "slash", label: "Line", key: "3" },
  { tool: "arrow", icon: "move-up-right", label: "Arrow", key: "4" },
  { tool: "rect", icon: "square", label: "Rectangle", key: "5" },
  { tool: "ellipse", icon: "circle", label: "Ellipse", key: "6" },
  { tool: "eraser", icon: "eraser", label: "Eraser", key: "7 E" },
];

/** Widths `[` and `]` step through; the toolbar shows DRAW_SIZES. */
export const SIZE_STEPS = [2, 4, 6, 8, 12, 16, 24, 32];

export interface ToolbarProps {
  tool: DrawTool;
  setTool: (t: DrawTool) => void;
  color: string;
  setColor: (c: string) => void;
  size: number;
  setSize: (n: number) => void;
  keep: boolean;
  setKeep: (k: boolean) => void;
  /** The eraser cuts only where it passes (true) or takes whole strokes (false). */
  partial: boolean;
  setPartial: (p: boolean) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onDone: () => void;
}

/**
 * The drawing toolbar: the tools, the colours (and any colour), the widths, whether strokes stay,
 * undo, redo, clear and done. It wraps onto two rows on a narrow screen rather than running off
 * it. Every button says its key in its title; the keys are DrawingLayer's.
 */
export function DrawToolbar(p: ToolbarProps) {
  const shape = p.tool !== "pen" && p.tool !== "highlighter" && p.tool !== "eraser";
  const custom = !DRAW_COLORS.includes(p.color);
  return (
    <div className="deck-draw-toolbar" role="toolbar" aria-label="Drawing tools">
      {TOOLS.map((t) => (
        <button
          type="button"
          key={t.tool}
          className={p.tool === t.tool ? "is-on" : ""}
          onClick={() => p.setTool(t.tool)}
          title={`${t.label} (${t.key})${shape && t.tool === p.tool ? " — Shift keeps it straight or square" : ""}`}
          aria-label={t.label}
          aria-pressed={p.tool === t.tool}
        >
          <Icon name={t.icon} />
        </button>
      ))}
      {p.tool === "eraser" ? (
        <button
          type="button"
          className={p.partial ? "is-on" : ""}
          onClick={() => p.setPartial(!p.partial)}
          title={
            p.partial
              ? "Erasing only where the eraser passes — click to erase whole strokes"
              : "Erasing whole strokes — click to erase only where the eraser passes"
          }
          aria-label="Erase only where the eraser passes"
          aria-pressed={p.partial}
        >
          <Icon name="scissors" />
        </button>
      ) : null}
      <span className="deck-draw-sep" />
      {DRAW_COLORS.map((c) => (
        <button
          type="button"
          key={c}
          className={["deck-draw-color", p.color === c ? "is-on" : ""].join(" ")}
          onClick={() => p.setColor(c)}
          aria-label={`Colour ${c}`}
          aria-pressed={p.color === c}
        >
          <span className="deck-draw-swatch" style={{ background: swatchGradient(c) }} />
        </button>
      ))}
      <label
        className={["deck-draw-color", "deck-draw-custom", custom ? "is-on" : ""].join(" ")}
        title="Any colour"
      >
        <span
          className="deck-draw-swatch"
          style={custom ? { background: p.color } : undefined}
          aria-hidden
        />
        <input
          type="color"
          value={/^#[0-9a-f]{6}$/i.test(p.color) ? p.color : "#ef4444"}
          onChange={(e) => p.setColor(e.target.value)}
          aria-label="Any colour"
        />
      </label>
      <span className="deck-draw-sep" />
      {DRAW_SIZES.map((s) => (
        <button
          type="button"
          key={s}
          className={p.size === s ? "is-on" : ""}
          onClick={() => p.setSize(s)}
          title={`Width ${s} ([ and ] step through more)`}
          aria-label={`Width ${s}`}
          aria-pressed={p.size === s}
        >
          <span className="deck-draw-dot" style={{ width: s + 4, height: s + 4 }} />
        </button>
      ))}
      {DRAW_SIZES.includes(p.size) ? null : (
        <span className="deck-draw-size" title="Width ([ and ])">
          {p.size}
        </span>
      )}
      <span className="deck-draw-sep" />
      <button
        type="button"
        className={p.keep ? "is-on" : ""}
        onClick={() => p.setKeep(!p.keep)}
        title={
          p.keep
            ? "Strokes stay on the slide — click to let them fade"
            : "Strokes fade after a moment — click to keep them"
        }
        aria-label={p.keep ? "Strokes stay" : "Strokes fade"}
        aria-pressed={p.keep}
      >
        <Icon name={p.keep ? "pin" : "pin-off"} />
      </button>
      <button
        type="button"
        onClick={p.onUndo}
        disabled={!p.canUndo}
        title="Undo (Ctrl Z)"
        aria-label="Undo"
      >
        <Icon name="undo-2" />
      </button>
      <button
        type="button"
        onClick={p.onRedo}
        disabled={!p.canRedo}
        title="Redo (Ctrl Shift Z)"
        aria-label="Redo"
      >
        <Icon name="redo-2" />
      </button>
      <button
        type="button"
        onClick={p.onClear}
        title="Clear the slide (Shift C)"
        aria-label="Clear"
      >
        <Icon name="trash-2" />
      </button>
      <button type="button" onClick={p.onDone} title="Done (Esc)" aria-label="Done">
        <Icon name="check" />
      </button>
    </div>
  );
}
