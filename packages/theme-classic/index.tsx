import type { LayoutProps, SlideBackground } from "@kadal/deck";

/**
 * Classic: Slidev's default theme (@slidev/theme-default, MIT) for Kadal Deck.
 *
 * Slidev's theme ships six layouts: cover, intro, fact, quote, section and statement. Five of them
 * are a `.slidev-layout <name>` box with the slot centred inside, which is exactly the markup
 * Kadal's built-in layouts of the same names already give (`.deck-layout-<name>`), so style.css
 * styles those and nothing here replaces them. The cover is the one with behaviour: a
 * `background:` that is a picture gets Slidev's dim (a #0005 → #0008 gradient) and white words.
 * The picture itself is painted by the engine's background layer, as on any slide.
 */

/** Is this background a picture or a film, rather than a colour (Slidev's handleBackground)? */
function isPicture(bg: SlideBackground | null | undefined): boolean {
  return !!bg && !!(bg.image || bg.video);
}

/** `layout: cover` with Slidev's `background:` behaviour. */
function Cover({ options, children }: LayoutProps) {
  const picture = isPicture(options.background);
  return (
    <div className={`deck-layout deck-layout-cover${picture ? " classic-on-image" : ""}`}>
      {picture ? <div className="classic-dim" aria-hidden="true" /> : null}
      {children}
    </div>
  );
}

export default {
  layouts: { cover: Cover },
};
