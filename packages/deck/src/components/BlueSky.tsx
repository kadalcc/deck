import { useEffect, useId, useRef, useState } from "react";

import { BLUESKY_POSTER_SIZE, blueskyDid, blueskyEmbedUrl, blueskyPost } from "../core/embeds.ts";
import { posterName } from "../core/poster.ts";
import { useSlideOptional } from "../react/context.ts";
import { FrameShell } from "../react/Frame.tsx";
import { useEffectiveScheme } from "./Contextual.tsx";

/**
 * A Bluesky post, through Bluesky's own embed, in the slide's colour scheme — Slidev's `<BlueSky>`,
 * with `<Tweet>`'s manners: it loads with its slide, sits behind the click-to-interact shield, and
 * `deck export` captures a poster of it in each scheme for print, the overview and the next-slide
 * box (named after the post as written, so the slide finds it with no network).
 *
 *   <BlueSky uri="https://bsky.app/profile/sli.dev/post/3la7gcgfwpe2n" />
 *   <BlueSky uri="at://did:plc:432mbsu2xucyvxl6sluohidu/app.bsky.feed.post/3la7gcgfwpe2n" />
 *
 * Bluesky's embed page wants the author's DID; a handle is resolved through Bluesky's public API
 * first (once per handle per visit). The embed reports its height, and the frame takes it, so a
 * one-line post is a short card and one with pictures a tall one.
 */
export function BlueSky({
  uri,
  scale = 1,
  poster,
  className,
}: {
  /** The post: its bsky.app address or its AT-URI. */
  uri: string;
  /** Scale factor. */
  scale?: number | string;
  /** Stands in for the post in print, the overview and while it loads. */
  poster?: string;
  className?: string;
}) {
  const scheme = useEffectiveScheme();
  const slide = useSlideOptional();
  const post = blueskyPost(uri);
  const [did, setDid] = useState<string | null | undefined>(
    post?.authority.startsWith("did:") ? post.authority : undefined,
  );
  const box = useRef<HTMLDivElement>(null);
  const frameId = `kadal${useId().replace(/[^\w]/g, "")}`;
  const [height, setHeight] = useState<number | null>(null);
  // Bluesky's embed posts { id, height } to its parent as it lays out (what its embed.js listens for).
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.origin !== "https://embed.bsky.app") return;
      const d = e.data as { id?: unknown; height?: unknown } | null;
      if (d?.id === frameId && typeof d.height === "number" && d.height > 0)
        setHeight(Math.ceil(d.height));
    };
    window.addEventListener("message", on);
    return () => window.removeEventListener("message", on);
  }, [frameId]);
  useEffect(() => {
    if (!post || post.authority.startsWith("did:")) return;
    let alive = true;
    void blueskyDid(post.authority).then((d) => alive && setDid(d));
    return () => {
      alive = false;
    };
  }, [post?.authority]);

  // The DID can arrive after the slide was shown and its frames were started (SlideFrame starts
  // each one once, on arrival): a frame mounted late starts itself.
  const active = !!slide?.active && !slide.preview;
  useEffect(() => {
    if (!did || !active) return;
    const id = setTimeout(() => {
      const frame = box.current?.querySelector<HTMLIFrameElement>("iframe[data-src]");
      if (frame && !frame.getAttribute("src")) frame.setAttribute("src", frame.dataset.src!);
    }, 800);
    return () => clearTimeout(id);
  }, [did, active]);

  if (!post)
    return (
      <div className="deck-bluesky is-invalid" role="note">
        Not a Bluesky post: {uri}
      </div>
    );
  const named = blueskyEmbedUrl(post, scheme);
  const live = did
    ? `${blueskyEmbedUrl({ authority: did, rkey: post.rkey }, scheme)}&id=${frameId}`
    : null;
  // A thumbnail or a printed page never loads the post, only shows its poster, so it needs no DID
  // (and no network): the address as written names the poster.
  const url = live ?? (slide?.preview ? named : null);
  return (
    <div
      ref={box}
      className={["deck-bluesky", className].filter(Boolean).join(" ")}
      style={{ zoom: Number(scale) || 1, ...(height ? { height } : null) }}
    >
      {url ? (
        <FrameShell
          key={url}
          url={url}
          title="Bluesky post"
          poster={poster ?? posterName(named, ...BLUESKY_POSTER_SIZE)}
          posterSize={BLUESKY_POSTER_SIZE}
        />
      ) : (
        <div className="deck-bluesky-pending" aria-busy={did === undefined}>
          {did === null ? `Could not load the Bluesky post ${uri}` : null}
        </div>
      )}
    </div>
  );
}
