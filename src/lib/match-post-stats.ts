import type { ZernioPostStat } from "@/lib/zernio.functions";

export type MatchablePost = {
  id: string;
  title: string;
  caption: string;
  platform: string | null;
  externalId: string | null;
};

export type PostStats = {
  impressions: number | null;
  clicks: number | null;
  reach: number | null;
  engagementRate: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  url: string | null;
};

function normalise(text: string) {
  return text.toLowerCase().replace(/\s+/g, " ").replace(/[^a-z0-9 ]/g, "").trim();
}

const EMPTY: PostStats = {
  impressions: null,
  clicks: null,
  reach: null,
  engagementRate: null,
  likes: null,
  comments: null,
  shares: null,
  url: null,
};

/**
 * Matches Haaylo posts to the live LinkedIn, Instagram and Facebook numbers.
 * Posts sent through Haaylo carry the id of the published post, so those match
 * exactly; anything published before that link existed falls back to matching
 * on channel and the opening of the caption.
 */
export function matchPostStats<T extends MatchablePost>(
  posts: T[],
  stats: ZernioPostStat[],
): (T & PostStats)[] {
  const used = new Set<string>();
  const samePlatform = (post: MatchablePost, s: ZernioPostStat) =>
    !post.platform || !s.platform || s.platform.toLowerCase() === post.platform.toLowerCase();

  return posts.map((post) => {
    let best: ZernioPostStat | null = null;

    if (post.externalId) {
      const exact = stats.filter((s) => s.sourceId === post.externalId && !used.has(s.id));
      best = exact.find((s) => samePlatform(post, s)) ?? exact[0] ?? null;
    }

    if (!best) {
      const key = normalise(post.caption || post.title).slice(0, 60);
      if (key.length >= 12) {
        const candidates = stats.filter((s) => {
          if (used.has(s.id)) return false;
          if (!samePlatform(post, s)) return false;
          return normalise(s.content).slice(0, 60).startsWith(key.slice(0, 30));
        });
        candidates.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
        best = candidates[0] ?? null;
      }
    }

    if (best) used.add(best.id);
    if (!best) return { ...post, ...EMPTY };

    return {
      ...post,
      impressions: best.impressions ?? null,
      clicks: best.clicks ?? null,
      reach: best.reach ?? best.impressions ?? null,
      engagementRate: best.engagementRate ?? null,
      likes: best.likes ?? null,
      comments: best.comments ?? null,
      shares: best.shares ?? null,
      url: best.url ?? null,
    };
  });
}
