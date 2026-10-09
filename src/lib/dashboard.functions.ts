import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type DashboardLead = {
  id: string;
  name: string;
  email: string;
  source: string;
  created_at: string;
};

export type DashboardSnapshot = {
  drafts: number;
  scheduledThisWeek: number;
  scheduledNext7: number;
  publishedThisMonth: number;
  scheduledPlatforms: string[];
  totalPosts: number;
  agentDrafts: number;
  landingPages: number;
  landingPagesLive: number;
  leadsTotal: number;
  leadsThisWeek: number;
  leads: DashboardLead[];
  commentLeadsNew: number;
};

const startOfWeek = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
};

/** Everything the home dashboard needs, in one round trip. */
export const getDashboardSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { projectId?: string | null } | undefined) =>
    z.object({ projectId: z.string().uuid().nullish() }).default({}).parse(data ?? {})
  )
  .handler(async ({ data, context }): Promise<DashboardSnapshot> => {
    const uid = context.userId;

    let postsQ = context.supabase
      .from("content_posts")
      .select("status, platform, scheduled_at, published_at, created_at, meta")
      .eq("user_id", uid)
      .limit(2000);
    if (data.projectId) postsQ = postsQ.eq("project_id", data.projectId);

    let pagesQ = context.supabase
      .from("landing_pages")
      .select("id, title, status, landing_page_leads(count)")
      .eq("user_id", uid);
    if (data.projectId) pagesQ = pagesQ.or(`project_id.eq.${data.projectId},project_id.is.null`);

    const [postsRes, pagesRes, capturesRes] = await Promise.all([
      postsQ,
      pagesQ,
      context.supabase
        .from("lead_captures")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid)
        .gte("created_at", startOfWeek().toISOString()),
    ]);

    const rows = (postsRes.data ?? []) as Array<{
      status: string;
      platform: string | null;
      scheduled_at: string | null;
      published_at: string | null;
      created_at: string;
      meta: Record<string, unknown> | null;
    }>;

    const weekStart = startOfWeek();
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const now = new Date();
    const next7 = new Date(now.getTime() + 7 * 86400000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    let drafts = 0;
    let scheduledThisWeek = 0;
    let scheduledNext7 = 0;
    let publishedThisMonth = 0;
    let agentDrafts = 0;
    const platforms = new Set<string>();

    for (const r of rows) {
      if (r.status === "draft" || r.status === "approved") {
        drafts += 1;
        if ((r.meta as Record<string, unknown> | null)?.["source"] === "agent") agentDrafts += 1;
      }
      if (r.status === "scheduled" && r.scheduled_at) {
        const when = new Date(r.scheduled_at);
        if (when >= weekStart && when < weekEnd) {
          scheduledThisWeek += 1;
          if (r.platform) platforms.add(r.platform);
        }
        if (when >= now && when < next7) scheduledNext7 += 1;
      }
      if (r.status === "published") {
        const when = new Date(r.published_at ?? r.created_at);
        if (when >= monthStart) publishedThisMonth += 1;
      }
    }

    const pages = (pagesRes.data ?? []) as Array<{
      id: string;
      title: string;
      status: string;
      landing_page_leads: Array<{ count: number }> | null;
    }>;
    const pageTitles = new Map(pages.map((p) => [p.id, p.title]));
    const leadsTotal = pages.reduce((n, p) => n + (p.landing_page_leads?.[0]?.count ?? 0), 0);

    let leads: DashboardLead[] = [];
    let leadsThisWeek = 0;
    if (pages.length) {
      const ids = pages.map((p) => p.id);
      const { data: leadRows } = await context.supabase
        .from("landing_page_leads")
        .select("id, first_name, last_name, email, page_id, created_at")
        .in("page_id", ids)
        .order("created_at", { ascending: false })
        .limit(50);
      const all = (leadRows ?? []) as Array<{
        id: string; first_name: string | null; last_name: string | null;
        email: string; page_id: string; created_at: string;
      }>;
      leadsThisWeek = all.filter((l) => new Date(l.created_at) >= weekStart).length;
      leads = all.slice(0, 5).map((l) => ({
        id: l.id,
        name: [l.first_name, l.last_name].filter(Boolean).join(" ").trim() || l.email.split("@")[0]!,
        email: l.email,
        source: pageTitles.get(l.page_id) ?? "Landing page",
        created_at: l.created_at,
      }));
    }

    return {
      drafts,
      scheduledThisWeek,
      scheduledNext7,
      publishedThisMonth,
      scheduledPlatforms: [...platforms],
      totalPosts: rows.length,
      agentDrafts,
      landingPages: pages.length,
      landingPagesLive: pages.filter((p) => p.status === "published").length,
      leadsTotal,
      leadsThisWeek,
      leads,
      commentLeadsNew: capturesRes.count ?? 0,
    };
  });

export type ChannelRow = { channel: string; published: number; scheduled: number };
export type SourceRow = { source: string; leads: number };

export type ChannelPerformance = {
  channels: ChannelRow[];
  sources: SourceRow[];
  windowDays: number;
};

const DAYS = 30;

/**
 * What the last 30 days actually produced, per channel, plus where the leads
 * came from. These are counts the app holds itself — reach and engagement
 * belong to the connected accounts and live on the Analytics screens.
 */
export const getChannelPerformance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { projectId?: string | null } | undefined) =>
    z.object({ projectId: z.string().uuid().nullish() }).default({}).parse(data ?? {}),
  )
  .handler(async ({ data, context }): Promise<ChannelPerformance> => {
    const uid = context.userId;
    const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString();

    let postsQ = context.supabase
      .from("content_posts")
      .select("platform, status, scheduled_at, published_at, created_at")
      .eq("user_id", uid)
      .gte("created_at", since)
      .limit(2000);
    if (data.projectId) postsQ = postsQ.eq("project_id", data.projectId);

    let pagesQ = context.supabase.from("landing_pages").select("id, title").eq("user_id", uid);
    if (data.projectId) pagesQ = pagesQ.or(`project_id.eq.${data.projectId},project_id.is.null`);

    const [postsRes, pagesRes] = await Promise.all([postsQ, pagesQ]);

    const posts = (postsRes.data ?? []) as Array<{
      platform: string | null;
      status: string | null;
      scheduled_at: string | null;
      published_at: string | null;
    }>;

    const byChannel = new Map<string, ChannelRow>();
    for (const p of posts) {
      const channel = (p.platform ?? "unassigned").toLowerCase();
      const row = byChannel.get(channel) ?? { channel, published: 0, scheduled: 0 };
      if (p.status === "published" || p.published_at) row.published += 1;
      else if (p.scheduled_at) row.scheduled += 1;
      byChannel.set(channel, row);
    }

    const pages = (pagesRes.data ?? []) as Array<{ id: string; title: string | null }>;
    const pageTitles = new Map(pages.map((p) => [p.id, p.title ?? "Landing page"]));

    const sources: SourceRow[] = [];
    if (pages.length > 0) {
      const { data: leadRows } = await context.supabase
        .from("landing_page_leads")
        .select("page_id, source_platform, created_at")
        .in(
          "page_id",
          pages.map((p) => p.id),
        )
        .gte("created_at", since)
        .limit(2000);

      const bySource = new Map<string, number>();
      for (const l of (leadRows ?? []) as Array<{ page_id: string; source_platform: string | null }>) {
        const key = l.source_platform?.trim() || pageTitles.get(l.page_id) || "Landing page";
        bySource.set(key, (bySource.get(key) ?? 0) + 1);
      }
      for (const [source, leads] of bySource) sources.push({ source, leads });
      sources.sort((a, b) => b.leads - a.leads);
    }

    return {
      channels: [...byChannel.values()].sort(
        (a, b) => b.published + b.scheduled - (a.published + a.scheduled),
      ),
      sources: sources.slice(0, 6),
      windowDays: DAYS,
    };
  });
