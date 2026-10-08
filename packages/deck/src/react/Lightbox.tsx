import { lazy, Suspense } from "react";

import { useActions, useUi } from "./hooks.ts";

const SketchCanvas = lazy(() => import("../sketch/Canvas.tsx"));

/** A full-screen overlay for an image, a video or a web page (reveal.js 5.2's lightbox). */
export function Lightbox() {
  const box = useUi((s) => s.lightbox);
  const actions = useActions();
  if (!box) return null;
  return (
    <div
      className="deck-lightbox"
      role="dialog"
      aria-label="Preview"
      onClick={actions.closeLightbox}
    >
      <button
        type="button"
        className="deck-lightbox-close"
        aria-label="Close"
        onClick={actions.closeLightbox}
      >
        ×
      </button>
      <div className="deck-lightbox-media" data-fit={box.fit} onClick={(e) => e.stopPropagation()}>
        {box.kind === "image" ? <img src={box.src} alt="" /> : null}
        {box.kind === "video" ? <video src={box.src} controls autoPlay playsInline /> : null}
        {box.kind === "iframe" ? (
          <iframe src={box.src} title="Preview" allow="fullscreen; autoplay" />
        ) : null}
        {box.kind === "sketch" ? (
          <Suspense fallback={<div className="deck-sketch-loading">Opening the canvas…</div>}>
            <SketchCanvas id={box.src} />
          </Suspense>
        ) : null}
      </div>
    </div>
  );
}
