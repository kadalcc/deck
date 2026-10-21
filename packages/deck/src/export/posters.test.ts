import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { TWEET_POSTER_SIZE, tweetEmbedUrl, youtubeEmbedUrl } from "../core/embeds.ts";
import { posterName } from "../core/poster.ts";
import { posterJobs } from "./index.ts";

const deck = (body: string) => {
  const dir = mkdtempSync(join(tmpdir(), "deck-posters-"));
  writeFileSync(join(dir, "deck.mdx"), `---\ntitle: t\n---\n\n${body}\n`);
  return posterJobs(dir, { width: 1920, height: 1080 });
};

describe("posterJobs", () => {
  test("a <Youtube> gets the poster its frame looks for", () => {
    const jobs = deck(`<Youtube id="aqz-KE-bpKQ" />`);
    const url = youtubeEmbedUrl({ id: "aqz-KE-bpKQ" });
    expect(jobs.map((j) => j.file)).toEqual([posterName(url, 1600, 900)]);
    expect(jobs[0]?.url).toBe(url);
  });

  test("start and autoplay are part of the address, so part of the name", () => {
    const [job] = deck(`<Youtube url="https://youtu.be/aqz-KE-bpKQ" start={30} autoplay />`);
    expect(job?.url).toBe(youtubeEmbedUrl({ id: "aqz-KE-bpKQ", start: 30, autoplay: true }));
  });

  test("a <Tweet> gets one poster per colour scheme", () => {
    const jobs = deck(`<Tweet id={20} />`);
    expect(jobs.map((j) => j.url).sort()).toEqual(
      [tweetEmbedUrl("20", "dark"), tweetEmbedUrl("20", "light")].sort(),
    );
    // Named at the size the Tweet's frame asks for, and taken at twice the pixels.
    expect(jobs[0]?.file).toBe(posterName(jobs[0]!.url, ...TWEET_POSTER_SIZE));
    expect(jobs[0]?.scale).toBe(2);
  });

  test("a named poster, or a placeholder id, means nothing to capture", () => {
    expect(deck(`<Youtube id="aqz-KE-bpKQ" poster="media/yt.jpg" />`)).toEqual([]);
    expect(deck(`<Tweet id="…" />\n\n<Youtube id="x" />`)).toEqual([]);
  });
});

describe("posterJobs: Bluesky", () => {
  test("a <BlueSky> gets one poster per colour scheme, named after the post as written", async () => {
    const { BLUESKY_POSTER_SIZE, blueskyEmbedUrl } = await import("../core/embeds.ts");
    const jobs = deck(`<BlueSky uri="https://bsky.app/profile/sli.dev/post/3la7gcgfwpe2n" />`);
    const post = { authority: "sli.dev", rkey: "3la7gcgfwpe2n" };
    expect(jobs.map((j) => j.url).sort()).toEqual(
      [blueskyEmbedUrl(post, "dark"), blueskyEmbedUrl(post, "light")].sort(),
    );
    expect(jobs[0]?.file).toBe(posterName(jobs[0]!.url, ...BLUESKY_POSTER_SIZE));
    expect(deck(`<BlueSky uri="not a post" />`)).toEqual([]);
  });
});
