import { createFileRoute } from "@tanstack/react-router";

/**
 * Live metrics for the Performance Analytics tab and the dashboard feed.
 *
 * Reads Zernio's analytics route server-side so the API key stays on the
 * server, and scopes every read to the caller's own Zernio profile so one
 * customer never sees another's numbers.
 */

const ZERNIO_BASE = "https://zernio.com/api/v1";

async function callerUserId(request: Request): Promise<string | null> {
  const auth = request.headers.get("authorization") || "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token) return null;
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return null;
  try {
    const res = await fetch(`${url}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: key },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { id?: string };
    return typeof body.id === "string" ? body.id : null;
  } catch {
    return null;
  }
}

const rec = (v: unknown): Record<string, unknown> => (v ?? {}) as Record<string, unknown>;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);

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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

const EMPTY = { metrics: {}, posts: [], totals: null, lastSync: null };

export const Route = createFileRoute("/api/public/zernio-metrics")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const userId = await callerUserId(request);
        if (!userId) return json({ error: "Unauthorised" }, 401);

        const apiKey = process.env["ZERNIO_API_KEY"];
        if (!apiKey) {
          return json({ ok: false, error: "Zernio is not configured yet.", ...EMPTY });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("zernio_profile_id")
          .eq("id", userId)
          .maybeSingle();
        const profileId = (profile?.zernio_profile_id as string | null) ?? null;
        if (!profileId) {
          return json({
            ok: true,
            error: null,
            ...EMPTY,
            note: "No channels connected yet.",
          });
        }

        const days = Number(new URL(request.url).searchParams.get("days") || "30");
        const safeDays = Number.isFinite(days) ? Math.min(Math.max(days, 1), 366) : 30;
        const fromDate = new Date(Date.now() - safeDays * 86_400_000).toISOString().slice(0, 10);
        const query = new URLSearchParams({
          profileId,
          fromDate,
          limit: "50",
          sortBy: "date",
        });

        let upstream: Response;
        try {
          upstream = await fetch(`${ZERNIO_BASE}/analytics?${query}`, {
            headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
          });
        } catch {
          return json({ ok: false, error: "Could not reach Zernio.", ...EMPTY });
        }

        const text = await upstream.text();
        if (!upstream.ok) {
          const error =
            upstream.status === 401 || upstream.status === 403
              ? "Zernio rejected the API key."
              : `Zernio returned ${upstream.status}.`;
          return json({ ok: false, error, ...EMPTY });
        }

        let parsed: unknown = null;
        try {
          parsed = text ? JSON.parse(text) : null;
        } catch {
          parsed = null;
        }

        const body = rec(parsed);
        const overview = rec(body["overview"]);
        const postRows = Array.isArray(body["posts"]) ? (body["posts"] as unknown[]) : [];
        const accountRows = Array.isArray(body["accounts"]) ? (body["accounts"] as unknown[]) : [];

        const posts = postRows.map((r) => {
          const row = rec(r);
          const a = rec(row["analytics"]);
          const platformRows = Array.isArray(row["platformAnalytics"])
            ? (row["platformAnalytics"] as unknown[])
            : [];
          const first = rec(platformRows[0]);
          return {
            id: str(row["postId"]) ?? str(row["_id"]) ?? "",
            platform: normalisePlatform(row["platform"] ?? first["platform"]),
            account: str(first["accountUsername"]) ?? str(row["accountUsername"]),
            content: str(row["content"]) ?? "",
            publishedAt: str(row["publishedAt"]) ?? str(row["scheduledFor"]),
            url: str(row["platformPostUrl"]) ?? str(first["platformPostUrl"]),
            thumbnailUrl: str(row["thumbnailUrl"]),
            impressions: num(a["impressions"]),
            reach: num(a["reach"]),
            likes: num(a["likes"]),
            comments: num(a["comments"]),
            shares: num(a["shares"]),
            clicks: num(a["clicks"]),
            engagementRate: num(a["engagementRate"]),
          };
        });

        // Platform roll-up, kept in the shape the analytics tab already reads.
        const metrics: Record<string, Record<string, number>> = {};
        const bump = (platform: string, field: string, value: number | null) => {
          if (value === null) return;
          metrics[platform] = metrics[platform] ?? {};
          metrics[platform][field] = (metrics[platform][field] ?? 0) + value;
        };
        for (const r of accountRows) {
          const row = rec(r);
          bump(
            normalisePlatform(row["platform"]),
            "followers",
            num(row["followerCount"]) ?? num(row["followers"]),
          );
        }
        for (const p of posts) {
          bump(p.platform, "impressions", p.impressions);
          bump(p.platform, "reach", p.reach);
          bump(
            p.platform,
            "engagements",
            (p.likes ?? 0) + (p.comments ?? 0) + (p.shares ?? 0) || null,
          );
          bump(p.platform, "posts", 1);
        }

        const totals = {
          posts: num(overview["totalPosts"]) ?? posts.length,
          published: num(overview["publishedPosts"]) ?? 0,
          scheduled: num(overview["scheduledPosts"]) ?? 0,
          impressions: posts.reduce((t, p) => t + (p.impressions ?? 0), 0),
          reach: posts.reduce((t, p) => t + (p.reach ?? 0), 0),
          engagements: posts.reduce(
            (t, p) => t + (p.likes ?? 0) + (p.comments ?? 0) + (p.shares ?? 0),
            0,
          ),
        };

        return json({
          ok: true,
          error: null,
          metrics,
          posts,
          totals,
          lastSync: str(overview["lastSync"]),
        });
      },
    },
  },
});
