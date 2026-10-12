# Making a talk that works

Slides support a speaker; they are not the document. Judge every slide by what the room sees in
the three seconds after it appears.

## Structure

- **Arc**: title → hook (a question, a number, a story) → 3–5 sections → the one thing to
  remember → thanks/Q&A. Say the takeaway early and again at the end.
- **One idea per slide.** If a slide needs two headings, it is two slides. Slides are free.
- **Headings are claims**, not topics: "Caching cut p95 latency by 40%" beats "Caching".
- Mark sections with `layout: section`; land big numbers with `layout: fact`, quotes with
  `layout: quote`, a single sentence with `layout: statement`. Varied layouts give rhythm.
- Pace: about one slide a minute; dense slides take longer. Vertical slides (`----`) hold
  optional depth (backup data, details for Q&A).

## Text

- At most ~6 bullets, ~8 words each. Prefer one sentence, a number, or a picture.
- Nothing smaller than ~28px on the 1920 × 1080 stage (the default body is 34–36px). If
  `autoFit` is shrinking a slide, cut words or split the slide — do not let it shrink.
- Reveal lists and arguments step by step with `<Clicks>` / `<Click>` so the room reads what you
  are saying, not three points ahead. Do not animate for decoration.
- Code: show the 5–15 lines that matter, use line-highlight steps (`{2|4-6|all}`) or a
  magic-move to walk through changes, and give the block a file title.

## Visuals

- Contrast first: dark text on light or light on dark; check both schemes if the deck allows the
  theme menu (`kadal-deck screenshot --scheme dark`). Animated backgrounds are ambience — keep
  text off their brightest parts, lower their opacity (`rgba()` colours) or tint the layer.
- Images: large, relevant, with `alt` text. `layout: image-right` + a short point on the left
  beats a small picture under bullets.
- Diagrams: `<Mermaid>` or `<Sketch>` with `steps` to tour a system one region per click.
- Align to the layout's grid (`<Cols>`, `<Grid>`); avoid absolute positioning except for
  annotations.
- Use theme tokens (`var(--deck-accent)`) rather than raw colours, so themes and dark mode work.

## Speaker notes

- Every slide gets notes: what to say, in the speaker's voice, plus any number or name they must
  not forget. Put `[click]` where each click's part starts.
- Notes carry the detail the slide leaves out — that is what keeps slides short.

## Before calling it done

1. `kadal-deck check` is clean (warnings understood).
2. Every slide rendered and looked at: no overflow, no clipped text, no orphan bullet, nothing
   unreadable, images present, live components on their own slides.
3. The title slide says what the talk is and who gives it; the last content slide states the
   takeaway.
4. Timing: slides × ~1 minute is close to the slot (`timing:` per slide feeds the presenter's
   pacing timer).
