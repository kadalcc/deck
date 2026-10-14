import type { Page } from "playwright";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PDF  —  the deck as the browser draws it, with its text still text
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Chromium's printer turns CSS effects into PDF constructs, and PDF viewers draw those
 * differently or not at all. Found on a real deck, checked in Preview, Poppler, pdfium and MuPDF:
 *   - a `mask-composite` (the Glass card's gradient edge) is dropped everywhere, so the edge's
 *     gradient fills the whole card;
 *   - a blurred `box-shadow` (cards, chips, halos, frames) becomes a soft-masked image that
 *     Preview and Quick Look paint as a grey slab;
 *   - a gradient `mask` (the rays background) washes the whole slide out in Preview;
 *   - text clipped to a gradient picks up hairlines in Poppler.
 * None of that is on screen, and every new effect would find a new way to break.
 *
 * So this PDF never asks the printer for an effect. Each page is made of two layers:
 *   1. ART: the page with its text made invisible, screenshotted. Every gradient, blur, mask,
 *      canvas and WebGL figure is exactly what the browser draws.
 *   2. TEXT: the same page with everything BUT its text made invisible, printed over that
 *      picture. Words stay sharp at any zoom and can be selected, searched and read aloud.
 * Both layers are laid out under the print media from the same DOM, and only paint properties
 * change between them, so each word lands on its own pixels.
 *
 * What stays in the picture only: text an SVG draws (Excalidraw sketches, figure labels) and
 * the glyphs of gradient text, which the text layer covers with all-but-invisible ink so a search
 * still finds the words.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** On `<html>` while the art is screenshotted, then while the text is printed. */
const ART = "kadal-pdf-art";
const TEXT = "kadal-pdf-text";
/** Gradient text: the art has its colours, the text layer gives it ink nobody can see. */
const INK = "kadal-pdf-ink";

export const PDF_LAYER_CSS = `
html.${ART} .deck-print-page *,
html.${ART} .deck-print-page *::before,
html.${ART} .deck-print-page *::after {
  -webkit-text-fill-color: transparent !important;
  -webkit-text-stroke-color: transparent !important;
  text-decoration-color: transparent !important;
  text-emphasis-color: transparent !important;
}
html.${ART} .deck-print-page ::marker {
  color: transparent !important;
}
/* a media element's own controls (the time, "0:00") are part of its picture */
html.${ART} .deck-print-page :is(audio, video) {
  -webkit-text-fill-color: initial !important;
}

html.${TEXT} .deck-print-page *,
html.${TEXT} .deck-print-page *::before,
html.${TEXT} .deck-print-page *::after {
  background: none !important;
  border-color: transparent !important;
  outline-color: transparent !important;
  column-rule-color: transparent !important;
  box-shadow: none !important;
  text-shadow: none !important;
  filter: none !important;
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
  -webkit-mask: none !important;
  mask: none !important;
}
html.${TEXT} .deck-print-page :is(img, picture, video, audio, canvas, iframe, object, embed, progress, meter, input:is([type="range"], [type="checkbox"], [type="radio"], [type="color"]), svg),
html.${TEXT} .deck-print-page .deck-background {
  visibility: hidden !important;
}
html.${TEXT} .deck-print-page svg foreignObject,
html.${TEXT} .deck-print-page svg foreignObject * {
  visibility: visible !important;
}
html.${TEXT} .deck-print-page .${INK} {
  -webkit-text-fill-color: rgb(0 0 0 / 0.01) !important;
}
`;

/**
 * Wait for every picture and video on the print pages. Images are `loading="lazy"` and a video
 * shows nothing until its first frame is decoded, so a page captured before it scrolled near
 * would show a gap or a black box. Gives up after `timeout` and captures what there is.
 */
export async function settleMedia(page: Page, timeout = 15_000): Promise<void> {
  await page.evaluate(async (timeout) => {
    const done = (el: HTMLElement, events: string[]) =>
      new Promise<void>((r) => {
        for (const e of events) el.addEventListener(e, () => r(), { once: true });
      });
    const waits: Promise<unknown>[] = [];
    for (const img of document.querySelectorAll<HTMLImageElement>(".deck-print-page img")) {
      img.loading = "eager";
      waits.push(
        (img.complete ? Promise.resolve() : done(img, ["load", "error"])).then(() =>
          img.decode().catch(() => {}),
        ),
      );
    }
    for (const video of document.querySelectorAll<HTMLVideoElement>(".deck-print-page video")) {
      if (!video.getAttribute("src") || video.readyState >= 2) continue;
      video.preload = "auto";
      waits.push(done(video, ["loadeddata", "error"]));
      if (video.networkState === video.NETWORK_EMPTY) video.load();
    }
    await Promise.race([Promise.all(waits), new Promise((r) => setTimeout(r, timeout))]);
  }, timeout);
}

/**
 * Bring print page `i` into view and wait until it is painted. A video draws its frame only
 * once it has been on screen for a moment, so a page captured the instant it scrolls in shows a
 * black box: each video is re-seeked to where it is and the capture waits for that frame.
 */
export async function showPrintPage(page: Page, i: number): Promise<void> {
  await page.evaluate(async (i) => {
    const el = document.querySelectorAll<HTMLElement>(".deck-print-page")[i];
    if (!el) return;
    el.scrollIntoView({ block: "start" });
    const videos = [...el.querySelectorAll("video")].filter((v) => v.readyState >= 2);
    await Promise.all(
      videos.map(
        (v) =>
          new Promise<void>((r) => {
            setTimeout(r, 2000);
            if (!("requestVideoFrameCallback" in v)) return r();
            v.requestVideoFrameCallback(() => r());
            v.currentTime = v.currentTime;
          }),
      ),
    );
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  }, i);
}

const frame = (page: Page) =>
  page.evaluate(
    () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
  );

/**
 * Print the open print view (`?print-pdf`, print media already emulated) to `path` as a faithful
 * PDF. The page is left as it was found, so PNG and PPTX captures can follow.
 */
export async function printFaithfulPdf(
  page: Page,
  path: string,
  size: { width: number; height: number },
  { quality = 90 }: { quality?: number } = {},
): Promise<void> {
  await page.addStyleTag({ content: PDF_LAYER_CSS });
  // Gradient text is found before the text layer's `background: none` resets its clip.
  await page.evaluate(
    ({ art, ink }) => {
      for (const el of document.querySelectorAll<HTMLElement>(".deck-print-page *"))
        if (getComputedStyle(el).backgroundClip === "text") el.classList.add(ink);
      document.documentElement.classList.add(art);
    },
    { art: ART, ink: INK },
  );
  await frame(page);

  try {
    const pages = await page.$$(".deck-print-page");
    for (let i = 0; i < pages.length; i++) {
      await showPrintPage(page, i);
      const shot = await pages[i]!.screenshot({ type: "jpeg", quality });
      // A blob URL per page: same-origin, so no content policy refuses it, and no network.
      await page.evaluate(
        async ({ i, b64 }) => {
          const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          const url = URL.createObjectURL(new Blob([bytes], { type: "image/jpeg" }));
          const img = new Image();
          img.src = url;
          await img.decode();
          const el = document.querySelectorAll<HTMLElement>(".deck-print-page")[i]!;
          el.dataset.kadalPdfArt = url;
        },
        { i, b64: shot.toString("base64") },
      );
    }

    await page.evaluate(
      ({ art, text }) => {
        for (const el of document.querySelectorAll<HTMLElement>(".deck-print-page"))
          el.style.setProperty(
            "background",
            `url("${el.dataset.kadalPdfArt}") 0 0 / 100% 100% no-repeat`,
            "important",
          );
        document.documentElement.classList.replace(art, text);
      },
      { art: ART, text: TEXT },
    );
    await frame(page);

    await page.pdf({
      path,
      width: `${size.width}px`,
      height: `${size.height}px`,
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });
  } finally {
    await page.evaluate(
      ({ art, text, ink }) => {
        document.documentElement.classList.remove(art, text);
        for (const el of document.querySelectorAll<HTMLElement>(".deck-print-page")) {
          if (el.dataset.kadalPdfArt) URL.revokeObjectURL(el.dataset.kadalPdfArt);
          delete el.dataset.kadalPdfArt;
          el.style.removeProperty("background");
        }
        for (const el of document.querySelectorAll(`.${ink}`)) el.classList.remove(ink);
      },
      { art: ART, text: TEXT, ink: INK },
    );
  }
}
