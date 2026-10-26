import { lazy } from "react";

/**
 * The audience page, `/<slug>/join` (audience/page.tsx). Every deck passes it to <Deck pages>, so
 * this module is in every deck's bundle; the page itself is a chunk of its own, fetched on /join
 * alone (the deck renders its pages inside <Suspense>), the way the phone remote and the
 * teleprompter are. A deck's projector and presenter never download it.
 */
export const AudiencePage = lazy(() =>
  import("./page.tsx").then((m) => ({ default: m.AudiencePage })),
);
