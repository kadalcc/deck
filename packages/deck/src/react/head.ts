import { useEffect } from "react";

import { type HeadInput, headTags } from "../core/head.ts";

/**
 * The deck's head in the live document (core/head.ts): description, Open Graph, Twitter,
 * canonical, favicon and `<html lang>`. A built deck has them in index.html already (the Vite
 * plugin writes them there, which is what a link preview reads); this keeps the document in
 * step with deck.config.ts, and gives a deck the prebuilt shell compiles in the browser all it
 * can have. The title stays react/Deck.tsx's. `ogImage: auto` is a build product, so it is left
 * to the build; theme-color only when the deck names one.
 */
export function useDocumentHead(config: HeadInput, base: string, on = true): void {
  const key = JSON.stringify([
    config.info,
    config.author,
    config.lang,
    config.favicon,
    config.seoMeta,
    config.title,
    base,
  ]);
  useEffect(() => {
    // An embedded deck is a guest on someone else's page: the head is theirs.
    if (!on || typeof document === "undefined") return;
    const head = document.head;
    // The build's og:image (an `auto` picture) stands: it is passed back in, so the tags agree.
    const built = head.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content || null;
    const tags = headTags(config, { base, ogImageFile: built }).filter((t) => t.tag !== "title");
    const made: Element[] = [];
    const restore: Array<() => void> = [];
    for (const t of tags) {
      if (t.tag === "link") {
        const el = head.querySelector<HTMLLinkElement>(`link[rel="${t.rel}"]`);
        if (el) {
          if (el.getAttribute("href") !== t.href) {
            const was = el.getAttribute("href");
            el.setAttribute("href", t.href);
            restore.push(() =>
              was === null ? el.removeAttribute("href") : el.setAttribute("href", was),
            );
          }
          continue;
        }
        const link = document.createElement("link");
        link.rel = t.rel;
        link.href = t.href;
        if (t.type) link.type = t.type;
        head.appendChild(link);
        made.push(link);
        continue;
      }
      if (t.tag !== "meta") continue;
      const sel = `meta[${t.key}="${t.name}"]${t.media ? `[media="${t.media}"]` : ""}`;
      const el = head.querySelector<HTMLMetaElement>(sel);
      if (el) {
        if (el.content !== t.content) {
          const was = el.content;
          el.content = t.content;
          restore.push(() => (el.content = was));
        }
        continue;
      }
      const meta = document.createElement("meta");
      meta.setAttribute(t.key, t.name);
      meta.content = t.content;
      if (t.media) meta.media = t.media;
      head.appendChild(meta);
      made.push(meta);
    }
    const lang = typeof config.lang === "string" ? config.lang.trim() : "";
    const html = document.documentElement;
    const wasLang = html.getAttribute("lang");
    if (lang && wasLang !== lang) html.setAttribute("lang", lang);
    return () => {
      for (const el of made) el.remove();
      for (const r of restore) r();
      if (lang && wasLang !== lang) {
        if (wasLang === null) html.removeAttribute("lang");
        else html.setAttribute("lang", wasLang);
      }
    };
    // `key` stands for the config's head fields: a new object with the same values changes nothing.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [key, on]);
}
