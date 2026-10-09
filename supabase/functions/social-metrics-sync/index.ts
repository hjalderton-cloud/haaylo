// Pulls live analytics from a user's connected social accounts.
// Currently supports Meta (Facebook Page + Instagram Business).
// LinkedIn returns a friendly "not available" until analytics scopes are added.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Mirror scheduler-crypto.server.ts: iv(12) || ciphertext || tag(16), base64.
async function importKey(): Promise<CryptoKey> {
  const raw = Deno.env.get("TOKEN_ENCRYPTION_KEY") ?? "";
  if (!raw) throw new Error("TOKEN_ENCRYPTION_KEY not set");
  let bytes: Uint8Array;
  try {
    const buf = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
    bytes = buf.length === 32
      ? buf
      : new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw)));
  } catch {
    bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw)));
  }
  return crypto.subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, ["decrypt"]);
}

async function decryptToken(payload: string): Promise<string> {
  const buf = Uint8Array.from(atob(payload), (c) => c.charCodeAt(0));
  const iv = buf.subarray(0, 12);
  const body = buf.subarray(12); // ct || tag — Web Crypto expects this concatenated
  const key = await importKey();
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, body);
  return new TextDecoder().decode(pt);
}

async function fetchJson(url: string): Promise<any> {
  const r = await fetch(url);
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body?.error?.message || `HTTP ${r.status}`);
  return body;
}

async function metricsForFacebookPage(pageId: string, token: string) {
  // Page-level: fan_count (page likes), followers_count
  const page = await fetchJson(
    `https://graph.facebook.com/v21.0/${pageId}?fields=fan_count,followers_count&access_token=${encodeURIComponent(token)}`,
  );
  // Sum engagement from last 25 posts (30d proxy)
  let reactions = 0, comments = 0, shares = 0, impressions = 0, video_views = 0;
  let topUrl = "", topScore = 0, topMetric = "";
  try {
    const since = Math.floor((Date.now() - 30 * 864e5) / 1000);
    const posts = await fetchJson(
      `https://graph.facebook.com/v21.0/${pageId}/posts?fields=permalink_url,reactions.summary(true),comments.summary(true),shares,insights.metric(post_impressions,post_video_views)&since=${since}&limit=25&access_token=${encodeURIComponent(token)}`,
    );
    for (const p of posts.data || []) {
      const r = p.reactions?.summary?.total_count || 0;
      const c = p.comments?.summary?.total_count || 0;
      const s = p.shares?.count || 0;
      reactions += r; comments += c; shares += s;
      const ins = p.insights?.data || [];
      const imp = ins.find((x: any) => x.name === "post_impressions")?.values?.[0]?.value || 0;
      const vv = ins.find((x: any) => x.name === "post_video_views")?.values?.[0]?.value || 0;
      impressions += imp; video_views += vv;
      const score = r + c * 3 + s * 5;
      if (score > topScore && p.permalink_url) {
        topScore = score;
        topUrl = p.permalink_url;
        topMetric = `${r} reactions, ${c} comments, ${s} shares`;
      }
    }
  } catch { /* insights sometimes gated by scope; skip silently */ }

  return {
    page_likes: page.fan_count,
    followers_change_30d: undefined,
    reach: undefined,
    impressions: impressions || undefined,
    engagements: reactions + comments + shares || undefined,
    reactions: reactions || undefined,
    comments: comments || undefined,
    shares: shares || undefined,
    video_views: video_views || undefined,
    top_post_url: topUrl || undefined,
    top_post_metric: topMetric || undefined,
  };
}

async function metricsForInstagram(igId: string, token: string) {
  const acc = await fetchJson(
    `https://graph.facebook.com/v21.0/${igId}?fields=followers_count,media_count&access_token=${encodeURIComponent(token)}`,
  );
  let likes = 0, comments = 0, reach = 0, impressions = 0, saves = 0, reel_plays = 0;
  let topUrl = "", topScore = 0, topMetric = "";
  try {
    const media = await fetchJson(
      `https://graph.facebook.com/v21.0/${igId}/media?fields=permalink,media_type,like_count,comments_count,insights.metric(reach,impressions,saved,plays)&limit=25&access_token=${encodeURIComponent(token)}`,
    );
    for (const m of media.data || []) {
      const l = m.like_count || 0, c = m.comments_count || 0;
      likes += l; comments += c;
      const ins = m.insights?.data || [];
      reach += ins.find((x: any) => x.name === "reach")?.values?.[0]?.value || 0;
      impressions += ins.find((x: any) => x.name === "impressions")?.values?.[0]?.value || 0;
      saves += ins.find((x: any) => x.name === "saved")?.values?.[0]?.value || 0;
      if (m.media_type === "VIDEO" || m.media_type === "REELS") {
        reel_plays += ins.find((x: any) => x.name === "plays")?.values?.[0]?.value || 0;
      }
      const score = l + c * 3;
      if (score > topScore && m.permalink) {
        topScore = score; topUrl = m.permalink; topMetric = `${l} likes, ${c} comments`;
      }
    }
  } catch { /* ignore */ }

  return {
    followers: acc.followers_count,
    reach: reach || undefined,
    impressions: impressions || undefined,
    likes: likes || undefined,
    comments: comments || undefined,
    saves: saves || undefined,
    reel_plays: reel_plays || undefined,
    top_post_url: topUrl || undefined,
    top_post_metric: topMetric || undefined,
  };
}

function liHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "LinkedIn-Version": "202405",
    "X-Restli-Protocol-Version": "2.0.0",
  };
}

/** Real page analytics for a LinkedIn company page (Community Management API). */
async function metricsForLinkedInCompany(orgId: string, token: string) {
  const headers = liHeaders(token);
  const orgUrn = `urn:li:organization:${orgId}`;
  const enc = encodeURIComponent(orgUrn);
  const get = async (url: string) => {
    const r = await fetch(url, { headers });
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    return await r.json();
  };

  let followers: number | undefined;
  let impressions: number | undefined, unique_impressions: number | undefined;
  let clicks: number | undefined, reactions: number | undefined, comments: number | undefined;
  let reposts: number | undefined, engagement_rate: number | undefined;
  let page_views: number | undefined;
  let impressions_30d: number | undefined, clicks_30d: number | undefined, engagements_30d: number | undefined;
  let topUrl = "", topMetric = "", topScore = -1;
  let posts_30d: number | undefined;
  const errors: string[] = [];

  try {
    const n = await get(`https://api.linkedin.com/rest/networkSizes/${enc}?edgeType=COMPANY_FOLLOWED_BY_MEMBER`);
    followers = n.firstDegreeSize;
  } catch (e) { errors.push(`followers: ${e instanceof Error ? e.message : e}`); }

  // Lifetime share statistics
  try {
    const s = await get(
      `https://api.linkedin.com/rest/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${enc}`,
    );
    const t = s.elements?.[0]?.totalShareStatistics || {};
    impressions = t.impressionCount ?? undefined;
    unique_impressions = t.uniqueImpressionsCount ?? undefined;
    clicks = t.clickCount ?? undefined;
    reactions = t.likeCount ?? undefined;
    comments = t.commentCount ?? undefined;
    reposts = t.shareCount ?? undefined;
    engagement_rate = typeof t.engagement === "number" ? Math.round(t.engagement * 10000) / 100 : undefined;
  } catch (e) { errors.push(`share stats: ${e instanceof Error ? e.message : e}`); }

  // Last 30 days
  try {
    const end = Date.now();
    const start = end - 30 * 864e5;
    const s = await get(
      `https://api.linkedin.com/rest/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${enc}` +
        `&timeIntervals=(timeRange:(start:${start},end:${end}),timeGranularityType:ALL)`,
    );
    const t = s.elements?.[0]?.totalShareStatistics || {};
    impressions_30d = t.impressionCount ?? undefined;
    clicks_30d = t.clickCount ?? undefined;
    engagements_30d =
      (t.likeCount || 0) + (t.commentCount || 0) + (t.shareCount || 0) + (t.clickCount || 0) || undefined;
  } catch (e) { errors.push(`30d stats: ${e instanceof Error ? e.message : e}`); }

  // Page views
  try {
    const p = await get(
      `https://api.linkedin.com/rest/organizationPageStatistics?q=organization&organization=${enc}`,
    );
    page_views = p.elements?.[0]?.totalPageStatistics?.views?.allPageViews?.pageViews ?? undefined;
  } catch (e) { errors.push(`page views: ${e instanceof Error ? e.message : e}`); }

  // Best performing recent post
  try {
    const posts = await get(
      `https://api.linkedin.com/rest/posts?q=author&author=${enc}&count=20&sortBy=LAST_MODIFIED`,
    );
    const elements: any[] = posts.elements || [];
    posts_30d = elements.filter((p) => {
      const t = p.createdAt || p.firstPublishedAt || 0;
      return t > Date.now() - 30 * 864e5;
    }).length;
    for (const p of elements.slice(0, 10)) {
      const urn: string = p.id || p.urn;
      if (!urn) continue;
      try {
        const stat = await get(
          `https://api.linkedin.com/rest/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${enc}` +
            `&shares=List(${encodeURIComponent(urn)})`,
        );
        const t = stat.elements?.[0]?.totalShareStatistics || {};
        const imp = t.impressionCount || 0;
        const eng = (t.likeCount || 0) + (t.commentCount || 0) + (t.shareCount || 0) + (t.clickCount || 0);
        const score = imp + eng * 10;
        if (score > topScore && imp + eng > 0) {
          topScore = score;
          topUrl = `https://www.linkedin.com/feed/update/${urn}/`;
          topMetric = `${imp.toLocaleString()} impressions, ${eng.toLocaleString()} engagements`;
        }
      } catch { /* per-post stats are best effort */ }
    }
  } catch (e) { errors.push(`posts: ${e instanceof Error ? e.message : e}`); }

  return {
    followers,
    impressions: impressions_30d ?? impressions,
    impressions_lifetime: impressions,
    unique_impressions,
    post_clicks: clicks_30d ?? clicks,
    reactions,
    comments,
    reposts,
    engagements:
      engagements_30d ??
      ((reactions || 0) + (comments || 0) + (reposts || 0) + (clicks || 0) || undefined),
    engagement_rate,
    profile_views: page_views,
    posts_30d,
    top_post_url: topUrl || undefined,
    top_post_metric: topMetric || undefined,
    _partial: errors.length ? errors.join(" · ") : undefined,
  };
}

async function metricsForLinkedIn(personSub: string, token: string) {

  // Best-effort with w_member_social + openid scopes.
  // Try REST posts + socialActions; fall back to a "connected, no data yet" shape.
  const headers = {
    Authorization: `Bearer ${token}`,
    "LinkedIn-Version": "202405",
    "X-Restli-Protocol-Version": "2.0.0",
  };
  let posts_count: number | undefined;
  let likes = 0, comments = 0, shares = 0;
  let topUrl = "", topScore = 0, topMetric = "";
  try {
    const author = `urn:li:person:${personSub}`;
    const postsResp = await fetch(
      `https://api.linkedin.com/rest/posts?q=author&author=${encodeURIComponent(author)}&count=25`,
      { headers },
    );
    if (postsResp.ok) {
      const postsBody = await postsResp.json();
      const elements: any[] = postsBody.elements || [];
      posts_count = elements.length;
      for (const p of elements) {
        const shareUrn: string = p.id || p.urn;
        if (!shareUrn) continue;
        try {
          const sa = await fetch(
            `https://api.linkedin.com/rest/socialActions/${encodeURIComponent(shareUrn)}`,
            { headers },
          );
          if (!sa.ok) continue;
          const saBody = await sa.json();
          const l = saBody.likesSummary?.totalLikes || 0;
          const c = saBody.commentsSummary?.aggregatedTotalComments || 0;
          likes += l; comments += c;
          const score = l + c * 3;
          if (score > topScore) {
            topScore = score;
            topUrl = `https://www.linkedin.com/feed/update/${encodeURIComponent(shareUrn)}/`;
            topMetric = `${l} reactions, ${c} comments`;
          }
        } catch { /* skip */ }
      }
    }
  } catch { /* fall through */ }

  return {
    posts_30d: posts_count,
    reactions: likes || undefined,
    comments: comments || undefined,
    shares: shares || undefined,
    engagements: (likes + comments + shares) || undefined,
    top_post_url: topUrl || undefined,
    top_post_metric: topMetric || undefined,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Not signed in" }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const user = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: u } = await user.auth.getUser();
    if (!u.user) return json({ error: "Invalid session" }, 401);

    const admin = createClient(url, service);
    const { data: conns, error } = await admin
      .from("social_connections")
      .select("provider, external_id, access_token_enc, display_name, metadata")
      .eq("user_id", u.user.id)
      .eq("status", "active");
    if (error) throw error;

    const results: Record<string, any> = {};
    const connected: Record<string, { name: string }> = {};

    const norm = (p: string) => (p === "facebook_page" ? "facebook" : p === "linkedin_company" ? "linkedin" : p);

    for (const c of conns || []) {
      const key = norm(c.provider);
      connected[key] = { name: c.display_name };
      try {
        const accessToken = await decryptToken(c.access_token_enc);
        if (c.provider === "facebook_page") {
          results.facebook = await metricsForFacebookPage(c.external_id, accessToken);
        } else if (c.provider === "instagram") {
          results.instagram = await metricsForInstagram(c.external_id, accessToken);
        } else if (c.provider === "linkedin_company") {
          // Company page analytics are the real source of impressions/clicks — always win.
          results.linkedin = {
            ...(results.linkedin || {}),
            ...await metricsForLinkedInCompany(c.external_id, accessToken),
          };
        } else if (c.provider === "linkedin") {
          const member = await metricsForLinkedIn(c.external_id, accessToken);
          results.linkedin = { ...member, ...(results.linkedin || {}) };
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "sync failed";
        if (!results[key] || results[key]._error) results[key] = { _error: msg };
      }
    }


    return json({ connected, metrics: results });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
