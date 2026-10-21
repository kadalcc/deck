/**
 * "Made with Kadal Deck" on every slide of a deck the host serves on its free plan (the host says
 * so with `badge`, see `withHostOverride`). It is part of the slide, drawn by `SlideFrame`, so it
 * scales with the slide and goes wherever the slide goes: the stage, the presenter's previews, the
 * overview, thumbnails, and every export made from the print view (PDF, PNG, PPTX). In a PDF the
 * mark stays a link. A deck on a paid plan, or one hosted anywhere else, has none.
 */
export function Watermark() {
  return (
    <a
      className="deck-watermark"
      href="https://deck.kadal.cc/?ref=watermark"
      target="_blank"
      rel="noopener"
      aria-label="Made with Kadal Deck"
      // A click here opens the link; it is not a click on the slide (which would turn the page).
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <rect
          x="1.5"
          y="2.5"
          width="13"
          height="9"
          rx="2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path d="M5 14h6M8 11.5V14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <span>
        Made with <strong>Kadal Deck</strong>
      </span>
    </a>
  );
}
