import { defineRoutes, type RoutePageProps, useDeck } from "@kadal/deck";

/**
 * A page of this deck's own (Slidev's `setup/routes.ts`): /handout lists every slide with a link
 * into the deck, drawn inside the deck's providers, so `useDeck()` reads the deck itself.
 */
function Handout(_props: RoutePageProps) {
  const deck = useDeck();
  return (
    <main className="sc-handout">
      <h1>{deck.config.title || "Handout"}</h1>
      <p>Every slide, with a link into the deck. This page is the deck's own route (routes.tsx).</p>
      <ol>
        {deck.manifest.slides
          .filter((s) => !s.frontmatter.hidden)
          .map((s) => (
            <li key={s.index}>
              <a href={`${deck.base}#/${s.id ?? s.index + 1}`}>
                {s.title || `Slide ${s.index + 1}`}
              </a>
            </li>
          ))}
      </ol>
    </main>
  );
}

export default defineRoutes([
  { path: "handout", component: Handout, title: "Handout · Kadal Deck" },
]);
