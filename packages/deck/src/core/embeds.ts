/**
 * The addresses `<Youtube>` and `<Tweet>` embed. They live here, not in the components, because
 * `deck export --posters` has to derive exactly the same URL from the MDX source: a captured
 * poster is named after the URL it stands in for (core/poster.ts), so the two sides must agree.
 */

/** The video id from an `id`, or from a watch, short or embed URL. */
export function youtubeId({ id, url }: { id?: string; url?: string }): string {
  return id ?? (url ? (/(?:v=|youtu\.be\/|embed\/)([\w-]{6,})/.exec(url)?.[1] ?? "") : "");
}

/** The privacy-enhanced player for a video. */
export function youtubeEmbedUrl(opts: {
  id?: string;
  url?: string;
  autoplay?: boolean;
  start?: number;
}): string {
  const params = new URLSearchParams({
    rel: "0",
    modestbranding: "1",
    ...(opts.autoplay ? { autoplay: "1", mute: "1" } : {}),
    ...(opts.start ? { start: String(opts.start) } : {}),
  });
  return `https://www.youtube-nocookie.com/embed/${youtubeId(opts)}?${params}`;
}

/** The post id from an `id`, or from a status URL. */
export function tweetId({ id, url }: { id?: string | number; url?: string }): string {
  return String(id ?? (url ? (/status\/(\d+)/.exec(url)?.[1] ?? "") : ""));
}

/**
 * The size a post's poster is captured at. X draws a post as a card at most 550px wide, so a
 * capture at the slide's size would be a small card in a corner of a blank page.
 */
export const TWEET_POSTER_SIZE: readonly [number, number] = [550, 350];

/** The post, drawn in the deck's colour scheme and without tracking. */
export function tweetEmbedUrl(id: string, scheme: "light" | "dark"): string {
  return `https://platform.twitter.com/embed/Tweet.html?id=${id}&theme=${scheme}&dnt=true`;
}
