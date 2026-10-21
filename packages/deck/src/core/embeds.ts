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

/**
 * A Bluesky post from what a deck writes: an AT-URI (`at://did:plc:…/app.bsky.feed.post/<rkey>`)
 * or a post's address (`https://bsky.app/profile/<handle or did>/post/<rkey>`). Null otherwise.
 */
export function blueskyPost(uri: string): { authority: string; rkey: string } | null {
  const at = /^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([^/?#]+)$/.exec(uri.trim());
  if (at) return { authority: decodeURIComponent(at[1]!), rkey: decodeURIComponent(at[2]!) };
  const web = /^https?:\/\/(?:www\.)?bsky\.app\/profile\/([^/]+)\/post\/([^/?#]+)/.exec(uri.trim());
  if (web) return { authority: decodeURIComponent(web[1]!), rkey: decodeURIComponent(web[2]!) };
  return null;
}

/**
 * The size a post's poster is captured at: Bluesky draws its embed as a card at most 600px wide,
 * as tall as the post (a short one is about 200px; one with a picture, much more).
 */
export const BLUESKY_POSTER_SIZE: readonly [number, number] = [600, 420];

/**
 * Bluesky's own embed of a post, in a colour scheme. Bluesky's embed page needs the author's DID,
 * so a handle here is first resolved (`resolveBlueskyEmbed`); the address with the handle still
 * names the post's poster, so `deck export` and the slide agree without either asking the network.
 */
export function blueskyEmbedUrl(
  post: { authority: string; rkey: string },
  scheme: "light" | "dark",
): string {
  return `https://embed.bsky.app/embed/${post.authority}/app.bsky.feed.post/${encodeURIComponent(post.rkey)}?colorMode=${scheme}`;
}

const dids = new Map<string, Promise<string | null>>();

/** A handle's DID, from Bluesky's public API (once per handle); a DID is returned as it is. */
export function blueskyDid(authority: string): Promise<string | null> {
  if (authority.startsWith("did:")) return Promise.resolve(authority);
  let pending = dids.get(authority);
  if (!pending) {
    pending = fetch(
      `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(authority)}`,
    )
      .then((r) => (r.ok ? (r.json() as Promise<{ did?: string }>) : null))
      .then((j) => (j?.did && j.did.startsWith("did:") ? j.did : null))
      .catch(() => null);
    pending.then((d) => d ?? dids.delete(authority));
    dids.set(authority, pending);
  }
  return pending;
}

/** An embed address with a handle in it → the same with the handle's DID (what loads); others unchanged. */
export async function resolveBlueskyEmbed(url: string): Promise<string> {
  const m = /^https:\/\/embed\.bsky\.app\/embed\/([^/]+)(\/.*)$/.exec(url);
  if (!m || m[1]!.startsWith("did:")) return url;
  const did = await blueskyDid(decodeURIComponent(m[1]!));
  return did ? `https://embed.bsky.app/embed/${did}${m[2]}` : url;
}
