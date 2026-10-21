import type { LayoutProps, SlideBackground } from "@kadal/deck";

/**
 * Seriph: Slidev's seriph theme (@slidev/theme-seriph, MIT) for Kadal Deck.
 *
 * Slidev's theme ships six layouts: cover, intro, fact, quote, section and statement. Five of them
 * are a `.slidev-layout <name>` box with the slot centred inside, which is exactly the markup
 * Kadal's built-in layouts of the same names already give (`.deck-layout-<name>`), so style.css
 * styles those and nothing here replaces them. The cover is the one with behaviour: a
 * `background:` that is a picture gets Slidev's dim (a #0005 → #0008 gradient) and white words,
 * centred. (Slidev's seriph also falls back to a random picture from source.unsplash.com when the
 * cover names none; that service is gone, so a Kadal cover without `background:` stays plain.)
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
    <div className={`deck-layout deck-layout-cover${picture ? " seriph-on-image" : ""}`}>
      {picture ? <div className="seriph-dim" aria-hidden="true" /> : null}
      {children}
    </div>
  );
}

export default {
  layouts: { cover: Cover },
};
