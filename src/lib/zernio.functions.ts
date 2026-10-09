import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ZERNIO_BASE = "https://zernio.com/api/v1";

// ── Low-level fetch helper ───────────────────────────────────────────────

type ZernioFetchResult = { ok: boolean; status: number; body: unknown };

async function zernioFetch(
  path: string,
  init: RequestInit & { apiKey: string },
): Promise<ZernioFetchResult> {
  const { apiKey, ...rest } = init;
  const res = await fetch(`${ZERNIO_BASE}${path}`, {
    ...rest,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      ...(rest.body ? { "Content-Type": "application/json" } : {}),
      ...(rest.headers as Record<string, string> | undefined),
    },
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) console.error("[zernio]", path, res.status, text.slice(0, 400));
  return { ok: res.ok, status: res.status, body };
}

function apiError(status: number): string {
  if (status === 401 || status === 403) return "Zernio rejected the API key.";
  if (status === 402) return "Your Zernio plan does not cover this yet.";
  return `Zernio returned ${status}.`;
}

const rec = (v: unknown): Record<string, unknown> => (v ?? {}) as Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

// ── Per-user Zernio profiles ─────────────────────────────────────────────

async function readStoredProfileId(userId: string): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("zernio_profile_id")
    .eq("id", userId)
    .maybeSingle();
  return (data?.zernio_profile_id as string | null) ?? null;
}

async function storeProfileId(userId: string, profileId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("profiles")
    .upsert({ id: userId, zernio_profile_id: profileId }, { onConflict: "id" });
  if (error) console.error("[zernio] could not store profile id", error.message);
}

function profileName(userId: string, email: string | null): string {
  return email ? `haaylo · ${email}` : `haaylo · ${userId.slice(0, 8)}`;
}

/** Creates (once) the caller's own Zernio profile and stores the id on their record. */
async function ensureProfileFor(
  userId: string,
  email: string | null,
): Promise<{ ok: true; profileId: string } | { ok: false; error: string }> {
  const apiKey = process.env["ZERNIO_API_KEY"];
  if (!apiKey) return { ok: false, error: "Zernio is not configured yet." };

  const existing = await readStoredProfileId(userId);
  if (existing) return { ok: true, profileId: existing };

  const name = profileName(userId, email);

  // Another tab or request may already have created it.
  const alreadyThere = await findProfileByName(apiKey, name);
  if (alreadyThere) {
    await storeProfileId(userId, alreadyThere);
    return { ok: true, profileId: alreadyThere };
  }

  let result: ZernioFetchResult;
  try {
    result = await zernioFetch("/profiles", {
      apiKey,
      method: "POST",
      headers: { "Idempotency-Key": `haaylo-profile-${userId}` },
      body: JSON.stringify({ name, description: "Created by haaylo" }),
    });
  } catch (error) {
    console.error("[zernio] profile create failed", error);
    return { ok: false, error: "Could not reach Zernio. Try again shortly." };
  }

  // 409 covers both a duplicate name and a create already in flight.
  if (result.status === 409) {
    const body409 = rec(result.body);
    const existingId = str(rec(body409["details"])["existingProfileId"]);
    if (existingId) {
      await storeProfileId(userId, existingId);
      return { ok: true, profileId: existingId };
    }
    for (const wait of [400, 900, 1800]) {
      await new Promise((r) => setTimeout(r, wait));
      const found = await findProfileByName(apiKey, name);
      if (found) {
        await storeProfileId(userId, found);
        return { ok: true, profileId: found };
      }
    }
    return { ok: false, error: "Setting up your workspace — try again in a moment." };
  }


  if (!result.ok) return { ok: false, error: apiError(result.status) };

  const body = rec(result.body);
  const profile = rec(body["profile"]);
  const profileId = str(profile["_id"]) ?? str(profile["id"]) ?? str(body["profileId"]);
  if (!profileId) return { ok: false, error: "Zernio did not return a profile id." };

  await storeProfileId(userId, profileId);
  return { ok: true, profileId };
}

async function findProfileByName(apiKey: string, name: string): Promise<string | null> {
  try {
    const res = await zernioFetch(`/profiles?name=${encodeURIComponent(name)}`, { apiKey });
    if (!res.ok) return null;
    const rows = rec(res.body)["profiles"];
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return str(rec(rows[0])["_id"]);
  } catch {
    return null;
  }
}

/** Idempotent: called on first load of the app and from the Connect screen. */
export const ensureZernioProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const email = (context.claims as { email?: string } | undefined)?.email ?? null;
    return ensureProfileFor(context.userId, email);
  });

// ── Connected accounts ───────────────────────────────────────────────────

export type ZernioConnection = {
  id: string;
  platform: string;
  displayName: string | null;
  avatarUrl: string | null;
  status: string;
};

const PLATFORM_ALIASES: Record<string, string> = {
  ig: "instagram",
  instagram_business: "instagram",
  fb: "facebook",
  facebook_page: "facebook",
  yt: "youtube",
  li: "linkedin",
  linkedin_company: "linkedin",
};

function normalisePlatform(value: unknown): string {
  const raw = typeof value === "string" ? value.toLowerCase().trim() : "unknown";
  return PLATFORM_ALIASES[raw] ?? raw;
}

function mapAccount(row: unknown): ZernioConnection {
  const r = rec(row);
  return {
    id: str(r["_id"]) ?? str(r["id"]) ?? "",
    platform: normalisePlatform(r["platform"]),
    displayName: str(r["displayName"]) ?? str(r["username"]) ?? str(r["name"]),
    avatarUrl: str(r["profilePictureUrl"]) ?? str(r["avatarUrl"]) ?? str(r["picture"]),
    status: r["isActive"] === false ? "needs reconnecting" : "active",
  };
}

async function fetchAccounts(
  apiKey: string,
  profileId: string,
): Promise<{ ok: true; connections: ZernioConnection[] } | { ok: false; error: string }> {
  let result: ZernioFetchResult;
  try {
    result = await zernioFetch(`/accounts?profileId=${encodeURIComponent(profileId)}`, { apiKey });
  } catch (error) {
    console.error("[zernio] accounts request failed", error);
    return { ok: false, error: "Could not reach Zernio." };
  }
  if (!result.ok) return { ok: false, error: apiError(result.status) };

  const rows = rec(result.body)["accounts"];
  const list = Array.isArray(rows) ? rows : [];
  return { ok: true, connections: list.map(mapAccount).filter((c) => c.id) };
}

/** Lists the accounts attached to the caller's own Zernio profile. */
export const listZernioConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const apiKey = process.env["ZERNIO_API_KEY"];
    if (!apiKey) {
      return {
        ok: false as const,
        error: "Zernio is not configured yet.",
        connections: [] as ZernioConnection[],
      };
    }
    const email = (context.claims as { email?: string } | undefined)?.email ?? null;
    const ensured = await ensureProfileFor(context.userId, email);
    if (!ensured.ok) {
      return { ok: false as const, error: ensured.error, connections: [] as ZernioConnection[] };
    }

    const res = await fetchAccounts(apiKey, ensured.profileId);
    if (!res.ok) return { ok: false as const, error: res.error, connections: [] as ZernioConnection[] };
    return { ok: true as const, connections: res.connections };
  });

export const ZERNIO_PLATFORMS = ["instagram", "facebook", "linkedin", "youtube", "tiktok"] as const;
export type ZernioPlatform = (typeof ZERNIO_PLATFORMS)[number];

const connectSchema = z.object({
  platform: z.enum(ZERNIO_PLATFORMS),
  returnUrl: z.string().url(),
});

/** Returns the platform OAuth URL for the caller's own profile. */
export const startZernioConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => connectSchema.parse(data))
  .handler(async ({ data, context }) => {
    const apiKey = process.env["ZERNIO_API_KEY"];
    if (!apiKey) return { ok: false as const, error: "Zernio is not configured yet." };

    const email = (context.claims as { email?: string } | undefined)?.email ?? null;
    const ensured = await ensureProfileFor(context.userId, email);
    if (!ensured.ok) return { ok: false as const, error: ensured.error };

    const query = new URLSearchParams({
      profileId: ensured.profileId,
      redirect_url: data.returnUrl,
    });

    let result: ZernioFetchResult;
    try {
      result = await zernioFetch(`/connect/${encodeURIComponent(data.platform)}?${query}`, {
        apiKey,
      });
    } catch (error) {
      console.error("[zernio] connect request failed", error);
      return { ok: false as const, error: "Could not reach Zernio. Try again shortly." };
    }

    if (!result.ok) return { ok: false as const, error: apiError(result.status) };

    const body = rec(result.body);
    const url = str(body["authUrl"]) ?? str(body["url"]) ?? str(rec(body["data"])["authUrl"]);
    if (!url) return { ok: false as const, error: "Zernio did not return a connect link." };
    return { ok: true as const, url };
  });

const disconnectSchema = z.object({ accountId: z.string().trim().min(1).max(200) });

export const disconnectZernioAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => disconnectSchema.parse(data))
  .handler(async ({ data, context }) => {
    const apiKey = process.env["ZERNIO_API_KEY"];
    if (!apiKey) return { ok: false as const, error: "Zernio is not configured yet." };
    const profileId = await readStoredProfileId(context.userId);
    if (!profileId) return { ok: false as const, error: "No Zernio profile yet." };

    // Only ever remove an account that belongs to this user's own profile.
    const owned = await fetchAccounts(apiKey, profileId);
    if (!owned.ok) return { ok: false as const, error: owned.error };
    if (!owned.connections.some((c) => c.id === data.accountId)) {
      return { ok: false as const, error: "That account is not on your workspace." };
    }

    try {
      const result = await zernioFetch(`/accounts/${encodeURIComponent(data.accountId)}`, {
        apiKey,
        method: "DELETE",
      });
      if (!result.ok) return { ok: false as const, error: apiError(result.status) };
    } catch (error) {
      console.error("[zernio] disconnect failed", error);
      return { ok: false as const, error: "Could not reach Zernio." };
    }
    return { ok: true as const };
  });

// ── Scheduling ───────────────────────────────────────────────────────────

const platformSchema = z.object({
  name: z.string().trim().min(1).max(40),
  id: z.string().trim().max(120).nullable().optional(),
});

const scheduleSchema = z.object({
  caption: z.string().trim().min(1).max(5000),
  scheduled_at: z.string().datetime(),
  media_url: z.string().url().nullable().optional(),
  platforms: z.array(platformSchema).min(1).max(10),
});

/**
 * Pushes a single post to Zernio's scheduling endpoint, on the caller's own
 * profile. The API key never leaves the server.
 */
export const scheduleWithZernio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => scheduleSchema.parse(data))
  .handler(async ({ data, context }) => {
    const apiKey = process.env["ZERNIO_API_KEY"];
    if (!apiKey) return { ok: false as const, error: "Zernio is not configured yet." };

    const email = (context.claims as { email?: string } | undefined)?.email ?? null;
    const ensured = await ensureProfileFor(context.userId, email);
    if (!ensured.ok) return { ok: false as const, error: ensured.error };

    // Zernio needs a real account id per platform, so match against the
    // accounts actually linked to this person's profile.
    const owned = await fetchAccounts(apiKey, ensured.profileId);
    if (!owned.ok) return { ok: false as const, error: owned.error };

    const targets = data.platforms
      .map((p) => {
        const wanted = normalisePlatform(p.name);
        const match =
          (p.id && owned.connections.find((c) => c.id === p.id)) ??
          owned.connections.find((c) => c.platform === wanted);
        return match ? { platform: match.platform, accountId: match.id } : null;
      })
      .filter((t): t is { platform: string; accountId: string } => t !== null);

    if (targets.length === 0) {
      return {
        ok: false as const,
        error: "Connect that channel on the Connect accounts page first.",
      };
    }

    const payload = {
      content: data.caption,
      scheduledFor: data.scheduled_at,
      timezone: "UTC",
      mediaItems: data.media_url ? [{ type: "image", url: data.media_url }] : [],
      platforms: targets,
    };

    let result: ZernioFetchResult;
    try {
      result = await zernioFetch("/posts", {
        apiKey,
        method: "POST",
        headers: { "x-request-id": crypto.randomUUID() },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      console.error("[zernio] request failed", error);
      return { ok: false as const, error: "Could not reach Zernio. Try again shortly." };
    }

    if (result.status === 409) {
      return { ok: false as const, error: "That exact post already went out in the last 24 hours." };
    }
    if (!result.ok) return { ok: false as const, error: apiError(result.status) };

    const body = rec(result.body);
    const post = rec(body["post"] ?? body["existingPost"] ?? body);
    return { ok: true as const, id: str(post["_id"]) ?? str(post["id"]) };
  });

// ── Analytics ────────────────────────────────────────────────────────────

export type ZernioPostStat = {
  id: string;
  /** The Zernio post this row belongs to, kept so Haaylo posts can match exactly. */
  sourceId: string;
  platform: string;
  accountName: string | null;
  content: string;
  publishedAt: string | null;
  url: string | null;
  thumbnailUrl: string | null;
  impressions: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  clicks: number | null;
  engagementRate: number | null;
};


export type ZernioAccountStat = {
  id: string;
  platform: string;
  name: string | null;
  followers: number | null;
};

export type ZernioAnalytics = {
  totals: {
    posts: number;
    published: number;
    scheduled: number;
    impressions: number;
    reach: number;
    engagements: number;
  };
  posts: ZernioPostStat[];
  accounts: ZernioAccountStat[];
  lastSync: string | null;
};

const analyticsSchema = z.object({
  days: z.number().int().min(1).max(366).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

const EMPTY_ANALYTICS: ZernioAnalytics = {
  totals: { posts: 0, published: 0, scheduled: 0, impressions: 0, reach: 0, engagements: 0 },
  posts: [],
  accounts: [],
  lastSync: null,
};

/**
 * One Zernio post can go out to LinkedIn, Instagram and Facebook at once, and
 * each channel reports its own numbers. Split those out so every channel gets
 * its own row instead of only the first one counting.
 */
function mapPostStats(row: unknown): ZernioPostStat[] {
  const r = rec(row);
  const a = rec(r["analytics"]);
  const platformRows = Array.isArray(r["platformAnalytics"])
    ? (r["platformAnalytics"] as unknown[])
    : [];
  const sourceId =
    str(r["postId"]) ?? str(r["_id"]) ?? str(r["id"]) ?? crypto.randomUUID();
  const content = str(r["content"]) ?? "";
  const publishedAt = str(r["publishedAt"]) ?? str(r["scheduledFor"]);
  const thumbnailUrl = str(r["thumbnailUrl"]);

  const build = (p: Record<string, unknown>, fallback: Record<string, unknown>): ZernioPostStat => {
    const pick = (key: string) => num(p[key]) ?? num(fallback[key]);
    const impressions = pick("impressions");
    const likes = pick("likes");
    const comments = pick("comments");
    const shares = pick("shares");
    const reach = pick("reach") ?? impressions;
    const engagements =
      likes == null && comments == null && shares == null
        ? null
        : (likes ?? 0) + (comments ?? 0) + (shares ?? 0);
    const rate =
      pick("engagementRate") ??
      (engagements != null && impressions && impressions > 0
        ? (engagements / impressions) * 100
        : null);
    const platform = normalisePlatform(p["platform"] ?? r["platform"]);
    return {
      id: `${sourceId}:${platform}`,
      sourceId,
      platform,
      accountName: str(p["accountUsername"]) ?? str(r["accountUsername"]),
      content,
      publishedAt: str(p["publishedAt"]) ?? publishedAt,
      url: str(p["platformPostUrl"]) ?? str(r["platformPostUrl"]),
      thumbnailUrl,
      impressions,
      reach,
      likes,
      comments,
      shares,
      clicks: pick("clicks"),
      engagementRate: rate,
    };
  };

  if (platformRows.length === 0) return [build(a, a)];
  return platformRows.map((entry) => {
    const p = rec(entry);
    return build({ ...rec(p["analytics"]), ...p }, a);
  });
}


/** Reads the caller's live post-level analytics for the dashboard feed. */
export const getZernioAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => analyticsSchema.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const apiKey = process.env["ZERNIO_API_KEY"];
    if (!apiKey) {
      return {
        ok: false as const,
        error: "Zernio is not configured yet.",
        analytics: EMPTY_ANALYTICS,
      };
    }

    const email = (context.claims as { email?: string } | undefined)?.email ?? null;
    const ensured = await ensureProfileFor(context.userId, email);
    if (!ensured.ok) {
      return { ok: false as const, error: ensured.error, analytics: EMPTY_ANALYTICS };
    }

    const days = data.days ?? 30;
    const from = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    const query = new URLSearchParams({
      profileId: ensured.profileId,
      fromDate: from,
      limit: String(data.limit ?? 25),
      sortBy: "date",
    });

    let result: ZernioFetchResult;
    try {
      result = await zernioFetch(`/analytics?${query}`, { apiKey });
    } catch (error) {
      console.error("[zernio] analytics request failed", error);
      return { ok: false as const, error: "Could not reach Zernio.", analytics: EMPTY_ANALYTICS };
    }
    if (!result.ok) {
      return { ok: false as const, error: apiError(result.status), analytics: EMPTY_ANALYTICS };
    }

    const body = rec(result.body);
    const overview = rec(body["overview"]);
    const postRows = Array.isArray(body["posts"]) ? (body["posts"] as unknown[]) : [];
    const posts = postRows.flatMap(mapPostStats);

    const accountRows = Array.isArray(body["accounts"]) ? (body["accounts"] as unknown[]) : [];
    const accounts: ZernioAccountStat[] = accountRows.map((row) => {
      const r = rec(row);
      return {
        id: str(r["_id"]) ?? str(r["id"]) ?? "",
        platform: normalisePlatform(r["platform"]),
        name: str(r["displayName"]) ?? str(r["username"]),
        followers: num(r["followerCount"]) ?? num(r["followers"]),
      };
    });

    const sum = (pick: (p: ZernioPostStat) => number | null) =>
      posts.reduce((total, p) => total + (pick(p) ?? 0), 0);

    const analytics: ZernioAnalytics = {
      totals: {
        posts: num(overview["totalPosts"]) ?? posts.length,
        published: num(overview["publishedPosts"]) ?? 0,
        scheduled: num(overview["scheduledPosts"]) ?? 0,
        impressions: sum((p) => p.impressions),
        reach: sum((p) => p.reach),
        engagements: sum((p) => (p.likes ?? 0) + (p.comments ?? 0) + (p.shares ?? 0)),
      },
      posts,
      accounts,
      lastSync: str(overview["lastSync"]),
    };

    return { ok: true as const, analytics };
  });

/** Kept for the older platform-level charts. */
export type ZernioMetric = {
  platform: string;
  followers: number | null;
  impressions: number | null;
  engagements: number | null;
  posts: number | null;
};

export const getZernioMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ days: z.number().int().min(1).max(366).optional() }).parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const apiKey = process.env["ZERNIO_API_KEY"];
    if (!apiKey) {
      return { ok: false as const, error: "Zernio is not configured yet.", metrics: [] as ZernioMetric[] };
    }
    const email = (context.claims as { email?: string } | undefined)?.email ?? null;
    const ensured = await ensureProfileFor(context.userId, email);
    if (!ensured.ok) return { ok: false as const, error: ensured.error, metrics: [] as ZernioMetric[] };

    const days = data.days ?? 30;
    const from = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    const query = new URLSearchParams({
      profileId: ensured.profileId,
      fromDate: from,
      limit: "100",
    });

    let result: ZernioFetchResult;
    try {
      result = await zernioFetch(`/analytics?${query}`, { apiKey });
    } catch (error) {
      console.error("[zernio] metrics request failed", error);
      return { ok: false as const, error: "Could not reach Zernio.", metrics: [] as ZernioMetric[] };
    }
    if (!result.ok) {
      return { ok: false as const, error: apiError(result.status), metrics: [] as ZernioMetric[] };
    }

    const body = rec(result.body);
    const postRows = Array.isArray(body["posts"]) ? (body["posts"] as unknown[]) : [];
    const posts = postRows.flatMap(mapPostStats);
    const accountRows = Array.isArray(body["accounts"]) ? (body["accounts"] as unknown[]) : [];

    const byPlatform = new Map<string, ZernioMetric>();
    for (const row of accountRows) {
      const r = rec(row);
      const platform = normalisePlatform(r["platform"]);
      const entry = byPlatform.get(platform) ?? {
        platform,
        followers: null,
        impressions: 0,
        engagements: 0,
        posts: 0,
      };
      const followers = num(r["followerCount"]) ?? num(r["followers"]);
      if (followers !== null) entry.followers = (entry.followers ?? 0) + followers;
      byPlatform.set(platform, entry);
    }
    for (const p of posts) {
      const entry = byPlatform.get(p.platform) ?? {
        platform: p.platform,
        followers: null,
        impressions: 0,
        engagements: 0,
        posts: 0,
      };
      entry.impressions = (entry.impressions ?? 0) + (p.impressions ?? 0);
      entry.engagements =
        (entry.engagements ?? 0) + (p.likes ?? 0) + (p.comments ?? 0) + (p.shares ?? 0);
      entry.posts = (entry.posts ?? 0) + 1;
      byPlatform.set(p.platform, entry);
    }

    return { ok: true as const, metrics: [...byPlatform.values()] };
  });
