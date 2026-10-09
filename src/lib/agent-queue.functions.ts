import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * The AI Agent's own queue. Agent posts live in `agent_posts` and never touch
 * the standard Content Bank, calendar or insights. Nothing here schedules or
 * publishes by itself: approval with an explicit date is the only route out.
 */

export type AgentPostRow = {
  id: string;
  platform: string;
  pillar: string | null;
  title: string | null;
  caption: string;
  status: string;
  reject_reason: string | null;
  scheduled_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  published_at: string | null;
  external_post_id: string | null;
  media_url: string | null;
  created_at: string;
};

const POST_COLS =
  "id, platform, pillar, title, caption, status, reject_reason, scheduled_at, approved_at, approved_by, published_at, external_post_id, media_url, created_at";

type Ctx = {
  userId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
};

async function resolveProjectId(ctx: Ctx, projectId?: string | null): Promise<string | null> {
  if (projectId) return projectId;
  const { data } = await ctx.supabase
    .from("projects")
    .select("id")
    .eq("user_id", ctx.userId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

const scopeSchema = z.object({
  projectId: z.string().uuid().nullish(),
  status: z.enum(["pending", "scheduled", "rejected", "published", "all"]).default("pending"),
});

/** Agent posts in this workspace, filtered by status. */
export const listAgentPosts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => scopeSchema.parse(d ?? {}))
  .handler(async ({ data, context }): Promise<{ posts: AgentPostRow[] }> => {
    const ctx = context as unknown as Ctx;
    const projectId = await resolveProjectId(ctx, data.projectId ?? null);
    if (!projectId) return { posts: [] };

    let query = ctx.supabase
      .from("agent_posts")
      .select(POST_COLS)
      .eq("user_id", ctx.userId)
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status !== "all") query = query.eq("status", data.status);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return { posts: (rows ?? []) as AgentPostRow[] };
  });

/**
 * Approves one agent draft for a time the user picked, and queues it against
 * their connected accounts. The publish cron sends it at that time.
 */
export const approveAgentPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), scheduled_at: z.string().datetime() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const { data: post } = await ctx.supabase
      .from("agent_posts")
      .select("id, caption, platform, pillar, media_url, media_path, status, scheduled_post_id")
      .eq("id", data.id)
      .eq("user_id", ctx.userId)
      .maybeSingle();
    if (!post) return { ok: false as const, error: "That post is no longer here" };
    if (post.status === "scheduled" || post.scheduled_post_id) {
      return { ok: false as const, error: "That post is already scheduled" };
    }
    if (new Date(data.scheduled_at).getTime() < Date.now()) {
      return { ok: false as const, error: "Pick a time in the future" };
    }

    const { listLiveConnections, queueToLiveAccounts, matchConnections } = await import(
      "./agent-publish.server"
    );
    const connections = await listLiveConnections(ctx.supabase, ctx.userId);
    if (!matchConnections(connections, post.platform ?? "").length) {
      return {
        ok: false as const,
        error: `Connect a ${post.platform || "social"} account first, then approve again.`,
      };
    }

    const result = await queueToLiveAccounts(ctx.supabase, {
      userId: ctx.userId,
      caption: post.caption,
      platform: post.platform ?? "linkedin",
      pillar: post.pillar,
      mediaUrl: post.media_url,
      mediaPath: post.media_path,
      scheduledAt: data.scheduled_at,
      connections,
    });
    if (!result.ok) return { ok: false as const, error: result.error };

    const email = (context as { claims?: { email?: string } }).claims?.email ?? null;
    await ctx.supabase
      .from("agent_posts")
      .update({
        status: "scheduled",
        scheduled_at: data.scheduled_at,
        scheduled_post_id: result.scheduledPostId,
        approved_at: new Date().toISOString(),
        approved_by: email,
      })
      .eq("id", post.id);

    return { ok: true as const, scheduledAt: result.scheduledAt, accounts: result.accounts };
  });

/** Rejects a draft, with an optional reason the agent learns from. */
export const rejectAgentPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), reason: z.string().max(600).nullish() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const { data: post } = await ctx.supabase
      .from("agent_posts")
      .select("id, project_id, platform, pillar, caption")
      .eq("id", data.id)
      .eq("user_id", ctx.userId)
      .maybeSingle();
    if (!post) return { ok: false as const, error: "That post is no longer here" };

    const { error } = await ctx.supabase
      .from("agent_posts")
      .update({ status: "rejected", reject_reason: data.reason ?? null })
      .eq("id", post.id);
    if (error) return { ok: false as const, error: error.message };

    const reason = (data.reason ?? "").trim();
    if (reason) {
      await ctx.supabase.from("agent_learnings").insert({
        user_id: ctx.userId,
        project_id: post.project_id,
        insight: `Rejected a ${post.platform} ${post.pillar ?? "post"}: ${reason}`.slice(0, 600),
        score: -1,
      });
    }
    return { ok: true as const };
  });

export type AgentActivity = { id: string; text: string; at: string; status: string };

/** Home dashboard: this week's agent activity in one call. */
export const getAgentHome = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid().nullish() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const projectId = await resolveProjectId(ctx, data.projectId ?? null);
    const empty = {
      generated: 0,
      pending: 0,
      scheduled: 0,
      rejected: 0,
      leads: 0,
      activity: [] as AgentActivity[],
    };
    if (!projectId) return empty;

    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();

    const [{ data: posts }, { data: runs }, { data: pages }] = await Promise.all([
      ctx.supabase
        .from("agent_posts")
        .select("id, status, created_at, scheduled_at")
        .eq("user_id", ctx.userId)
        .eq("project_id", projectId)
        .limit(500),
      ctx.supabase
        .from("agent_runs")
        .select("id, status, summary, created_at")
        .eq("user_id", ctx.userId)
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(12),
      ctx.supabase.from("landing_pages").select("id").eq("user_id", ctx.userId).eq("project_id", projectId),
    ]);

    const rows = (posts ?? []) as Array<{ status: string; created_at: string; scheduled_at: string | null }>;
    const generated = rows.filter((r) => r.created_at >= weekAgo).length;
    const pending = rows.filter((r) => r.status === "pending").length;
    const scheduled = rows.filter(
      (r) => r.status === "scheduled" && (r.scheduled_at ?? "") >= weekAgo,
    ).length;
    const rejected = rows.filter((r) => r.status === "rejected").length;

    let leads = 0;
    const pageIds = ((pages ?? []) as Array<{ id: string }>).map((p) => p.id);
    if (pageIds.length) {
      const { count } = await ctx.supabase
        .from("landing_page_leads")
        .select("id", { count: "exact", head: true })
        .in("page_id", pageIds)
        .gte("created_at", weekAgo);
      leads = count ?? 0;
    }

    const activity: AgentActivity[] = ((runs ?? []) as Array<{
      id: string;
      status: string;
      summary: string | null;
      created_at: string;
    }>).map((r) => ({
      id: r.id,
      status: r.status,
      at: r.created_at,
      text: r.summary || "Agent run",
    }));

    return { generated, pending, scheduled, rejected, leads, activity };
  });
