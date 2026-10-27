import {
  EMOJI_BASE,
  type EmojiIndex,
  IMGFLIP_API,
  type ImgflipTemplate,
  type KadalCatalog,
  type KadalItem,
  type KlipyConfig,
  type KlipyKind,
  type MediaKind,
  type MediaProvider,
  type MediaResult,
  POPULAR_ICON_SETS,
  emojiResult,
  emojiSetName,
  filterTemplates,
  iconResult,
  iconSearchUrl,
  iconSetsUrl,
  imgflipResult,
  kadalCatalogUrl,
  kadalResult,
  klipyResult,
  klipySearchUrl,
  klipyShareRequest,
  parseEmojiIndex,
  parseIconSearch,
  parseIconSets,
  parseImgflip,
  parseKadalCatalog,
  parseKlipyPage,
  parseKlipyRef,
  popularEmoji,
  searchEmoji,
  searchKadal,
} from "./sources.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SEARCH AND TRENDING ACROSS THE SOURCES  (the network side of sources.ts)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `findMedia` asks every source a kind has, in the order the builder shows them, and returns
 * each source's results as one block (a source's own order is never touched — KLIPY's least of
 * all). A source that can't answer is a note, not an error: KLIPY needs the CLI's sign-in (its
 * key comes from the host's `/api/v1/media/config`), Kadal's library needs a host that serves
 * it. The answers that don't change (the emoji index, Imgflip's top 100, Kadal's catalog, the
 * KLIPY key) are kept for the life of the `MediaSession` — the MCP server keeps one.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface MediaSessionOptions {
  /** The Kadal Deck host (for the KLIPY key and Kadal's library). */
  host: string;
  /** The CLI's token, or null when signed out (KLIPY is skipped then). */
  token: string | null;
  fetch?: typeof fetch;
  emojiBase?: string;
}

export interface SourceReport {
  provider: MediaProvider;
  count: number;
  /** Why it has nothing, when it couldn't answer. */
  note?: string;
}

export interface MediaFind {
  kind: MediaKind;
  query: string;
  trending: boolean;
  results: MediaResult[];
  sources: SourceReport[];
}

export interface FindOptions {
  kind: MediaKind;
  /** Empty: trending. */
  query?: string;
  /** Results per source (default 12, at most 50). */
  limit?: number;
  /** Emoji set for emoji and emoji stickers (fluent-3d by default). */
  set?: string;
}

class Skip extends Error {}

const KLIPY_OF: Partial<Record<MediaKind, KlipyKind>> = {
  gif: "gifs",
  sticker: "stickers",
  meme: "static-memes",
};

export class MediaSession {
  private readonly f: typeof fetch;
  private klipy: Promise<KlipyConfig> | null = null;
  private emoji: Promise<EmojiIndex> | null = null;
  private imgflip: Promise<ImgflipTemplate[]> | null = null;
  private kadal: Promise<KadalCatalog> | null = null;
  /** KLIPY results this session handed out, by slug: a later use is reported with its query. */
  readonly handedOut = new Map<string, { kind: KlipyKind; query: string }>();
  /** Slugs already reported, so a use is counted once. */
  readonly reported = new Set<string>();

  constructor(readonly options: MediaSessionOptions) {
    this.f = options.fetch ?? ((...a) => fetch(...a));
  }

  private async json(
    url: string,
    init: RequestInit = {},
  ): Promise<{ status: number; data: unknown }> {
    const res = await this.f(url, { ...init, credentials: "omit" } as RequestInit);
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    return { status: res.status, data };
  }

  /** The host's KLIPY key and this person's customer id, or a Skip saying why not. */
  klipyConfig(): Promise<KlipyConfig> {
    this.klipy ??= (async () => {
      if (!this.options.token)
        throw new Skip("not signed in — run `kadal-deck login` to search KLIPY");
      const { status, data } = await this.json(`${this.options.host}/api/v1/media/config`, {
        headers: { authorization: `Bearer ${this.options.token}`, accept: "application/json" },
      });
      if (status === 401) throw new Skip("the saved sign-in was refused — run `kadal-deck login`");
      if (status < 200 || status >= 300)
        throw new Skip(`the host answered ${status} for the KLIPY key`);
      const k = (data as { klipy?: Partial<KlipyConfig> | null } | null)?.klipy;
      if (!k || typeof k.key !== "string" || typeof k.customerId !== "string")
        throw new Skip("the host has no KLIPY key set up");
      return {
        key: k.key,
        customerId: k.customerId,
        contentFilter: "high",
        ...(typeof k.locale === "string" ? { locale: k.locale } : {}),
      };
    })();
    // A failure is not kept: signing in later in the same MCP session should work.
    this.klipy.catch(() => {
      this.klipy = null;
    });
    return this.klipy;
  }

  private emojiIndex(): Promise<EmojiIndex> {
    this.emoji ??= this.json(`${this.options.emojiBase ?? EMOJI_BASE}/index.json`).then(
      ({ status, data }) => {
        if (status !== 200) throw new Skip(`the emoji index answered ${status}`);
        return parseEmojiIndex(data);
      },
    );
    this.emoji.catch(() => {
      this.emoji = null;
    });
    return this.emoji;
  }

  private templates(): Promise<ImgflipTemplate[]> {
    this.imgflip ??= this.json(IMGFLIP_API).then(({ status, data }) => {
      if (status !== 200) throw new Skip(`Imgflip answered ${status}`);
      return parseImgflip(data);
    });
    this.imgflip.catch(() => {
      this.imgflip = null;
    });
    return this.imgflip;
  }

  private kadalCatalog(): Promise<KadalCatalog> {
    this.kadal ??= this.json(kadalCatalogUrl(this.options.host), {
      headers: { accept: "application/json" },
    }).then(({ status, data }) => {
      if (status === 404 || status === 401 || status === 403)
        throw new Skip("this host doesn't serve Kadal's library yet");
      if (status !== 200) throw new Skip(`the host answered ${status} for Kadal's library`);
      return parseKadalCatalog(data);
    });
    this.kadal.catch(() => {
      this.kadal = null;
    });
    return this.kadal;
  }

  private async fromKlipy(kind: KlipyKind, query: string, limit: number): Promise<MediaResult[]> {
    const cfg = await this.klipyConfig();
    const { status, data } = await this.json(klipySearchUrl(cfg, kind, query, limit));
    if (status !== 200) throw new Skip(`KLIPY answered ${status}`);
    const results = parseKlipyPage(data).map((item) => klipyResult(item, kind));
    for (const r of results) {
      const ref = parseKlipyRef(r.id);
      if (ref) this.handedOut.set(ref.slug, { kind: ref.kind, query });
    }
    return results;
  }

  private async fromKadal(kinds: KadalItem["kind"][] | null, query: string, limit: number) {
    const cat = await this.kadalCatalog();
    const items = searchKadal(
      cat.items.filter((i) => !kinds || kinds.includes(i.kind)),
      query,
    );
    return items.slice(0, limit).map((i) => kadalResult(i, this.options.host, cat.version));
  }

  private async fromEmoji(query: string, limit: number, set: string, asSticker: boolean) {
    const index = await this.emojiIndex();
    const list = index.emoji.filter((e) => e.s.includes(set));
    const found = query ? searchEmoji(list, query) : popularEmoji(list);
    return found
      .slice(0, limit)
      .map((e) => emojiResult(index, e, set, asSticker, this.options.emojiBase ?? EMOJI_BASE));
  }

  private async fromIconify(query: string, limit: number): Promise<MediaResult[]> {
    if (query) {
      const { status, data } = await this.json(iconSearchUrl(query, Math.max(limit * 2, 32)));
      if (status !== 200) throw new Skip(`Iconify answered ${status}`);
      const { icons, sets } = parseIconSearch(data);
      return icons.slice(0, limit).map((n) => iconResult(n, sets[n.split(":")[0]!]));
    }
    // No trending in Iconify: the popular sets' own samples, a few from each.
    const { status, data } = await this.json(iconSetsUrl(POPULAR_ICON_SETS));
    if (status !== 200) throw new Skip(`Iconify answered ${status}`);
    const sets = parseIconSets(data);
    const out: MediaResult[] = [];
    const per = Math.max(1, Math.ceil(limit / POPULAR_ICON_SETS.length));
    for (const p of POPULAR_ICON_SETS)
      for (const s of (sets[p]?.samples ?? []).slice(0, per))
        out.push(iconResult(`${p}:${s}`, sets[p]));
    return out.slice(0, limit);
  }

  async find(o: FindOptions): Promise<MediaFind> {
    const query = (o.query ?? "").trim();
    const limit = Math.max(1, Math.min(50, Math.round(o.limit ?? 12)));
    const set = emojiSetName(o.set);
    if (!set)
      throw new RangeError(
        `No emoji set "${o.set}". Sets: fluent, fluent-3d, fluent-color, fluent-flat, noto, noto-animated, twemoji.`,
      );
    const jobs: Array<[MediaProvider, () => Promise<MediaResult[]>]> = [];
    const klipy = KLIPY_OF[o.kind];
    switch (o.kind) {
      case "icon":
        jobs.push(["iconify", () => this.fromIconify(query, limit)]);
        break;
      case "emoji":
        jobs.push(["emoji", () => this.fromEmoji(query, limit, set, false)]);
        break;
      case "sticker":
        jobs.push(["kadal", () => this.fromKadal(["sticker", "emoji"], query, limit)]);
        jobs.push(["klipy", () => this.fromKlipy(klipy!, query, limit)]);
        jobs.push(["emoji", () => this.fromEmoji(query, limit, set, true)]);
        break;
      case "gif":
        jobs.push(["kadal", () => this.fromKadal(["gif"], query, limit)]);
        jobs.push(["klipy", () => this.fromKlipy(klipy!, query, limit)]);
        break;
      case "meme":
        jobs.push(["klipy", () => this.fromKlipy(klipy!, query, limit)]);
        break;
      case "template":
        jobs.push(["kadal", () => this.fromKadal(["meme-template"], query, limit)]);
        jobs.push([
          "imgflip",
          async () =>
            filterTemplates(await this.templates(), query)
              .slice(0, limit)
              .map(imgflipResult),
        ]);
        break;
      case "kadal":
        jobs.push(["kadal", () => this.fromKadal(null, query, limit)]);
        break;
    }
    const settled = await Promise.all(
      jobs.map(async ([provider, run]) => {
        try {
          const results = await run();
          return { provider, results, report: { provider, count: results.length } };
        } catch (e) {
          const note =
            e instanceof Skip
              ? e.message
              : `couldn't reach it (${e instanceof Error ? e.message : String(e)})`;
          return { provider, results: [] as MediaResult[], report: { provider, count: 0, note } };
        }
      }),
    );
    return {
      kind: o.kind,
      query,
      trending: !query,
      results: settled.flatMap((s) => s.results),
      sources: settled.map((s) => s.report),
    };
  }

  /**
   * Report that a result went into a deck. Only KLIPY counts uses (its share trigger); for the
   * other sources this says so and does nothing. `id` is the result's id (`gifs/<slug>`).
   */
  async used(
    provider: string,
    id: string,
    query?: string,
  ): Promise<{ reported: boolean; note: string }> {
    if (provider.toLowerCase() !== "klipy")
      return { reported: false, note: `${provider} doesn't count uses; nothing to report.` };
    const ref = parseKlipyRef(id);
    if (!ref) return { reported: false, note: `"${id}" isn't a KLIPY result id (gifs/<slug>).` };
    if (this.reported.has(ref.slug)) return { reported: true, note: "Already reported." };
    let cfg: KlipyConfig;
    try {
      cfg = await this.klipyConfig();
    } catch (e) {
      return { reported: false, note: `KLIPY: ${(e as Error).message}` };
    }
    const q = query ?? this.handedOut.get(ref.slug)?.query ?? "";
    const { url, init } = klipyShareRequest(cfg, ref.kind, ref.slug, q);
    try {
      const res = await this.f(url, { ...init, credentials: "omit" } as RequestInit);
      if (!res.ok) return { reported: false, note: `KLIPY answered ${res.status}.` };
    } catch (e) {
      return { reported: false, note: `KLIPY didn't answer (${(e as Error).message}).` };
    }
    this.reported.add(ref.slug);
    return { reported: true, note: "Reported to KLIPY." };
  }

  /**
   * KLIPY results this session handed out that `text` now uses (a `<Gif provider="klipy"
   * slug="…">`), not yet reported: the MCP server reports these after every edit, so a use counts
   * even when the agent forgets `media_used`.
   */
  usedIn(text: string): Array<{ kind: KlipyKind; slug: string; query: string }> {
    const out: Array<{ kind: KlipyKind; slug: string; query: string }> = [];
    if (!this.handedOut.size || !text.includes("klipy")) return out;
    for (const m of text.matchAll(/\bslug=(?:"([^"]+)"|\{"([^"]+)"\})/g)) {
      const slug = m[1] ?? m[2]!;
      const got = this.handedOut.get(slug);
      if (got && !this.reported.has(slug)) out.push({ ...got, slug });
    }
    return out;
  }
}
