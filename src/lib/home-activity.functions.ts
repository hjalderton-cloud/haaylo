/**
 * Briefing Room lower-home data: Today's Focus and Recent Activity.
 *
 * Read-only, workspace-scoped, no schema change. The dashboard snapshot already
 * covers the counters and recent leads; this adds what's happening today and a
 * merged trail of the latest campaigns and posts.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertOwnedWorkspace } from "@/lib/tool-registry/guards";

export type FocusPost = {
  id: string;
  label: string;
  platform: string;
  at: string | null;
};

export type ActivityItem = {
  id: string;
  kind: "campaign" | "post";
  label: string;
  at: string;
};

export type HomeActivity = {
  scheduledToday: FocusPost[];
  drafts: FocusPost[];
  recent: ActivityItem[];
  /** Command centre counters. */
  awaitingApproval: number;
  imagesAwaiting: number;
  upcomingWeek: number;
  /** Weekdays in the next 30 days with no post placed. */
  calendarGaps: number;
  upcomingCampaigns: Array<{ id: string; label: string }>;
  /** Drafts whose brand check passed (or was repaired): safe for one-click approval. */
  readyDrafts: FocusPost[];
  /** Drafts held back because the brand check flagged them. */
  flaggedDrafts: FocusPost[];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { userId: string; supabase: any };

const trim = (v: unknown, fallback: string) => {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return fallback;
  return s.length > 70 ? `${s.slice(0, 67)}…` : s;
};

export const getHomeActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ workspaceId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<HomeActivity> => {
    const ctx = context as unknown as Ctx;
    await assertOwnedWorkspace(ctx, data.workspaceId);

    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const base = () =>
      ctx.supabase
        .from("content_posts")
        .select("id, title, caption, platform, status, scheduled_at, created_at")
        .eq("user_id", ctx.userId)
        .eq("project_id", data.workspaceId);

    const in30 = new Date(dayStart);
    in30.setDate(in30.getDate() + 30);
    const in7 = new Date(dayStart);
    in7.setDate(in7.getDate() + 7);

    const [todayRes, draftRes, recentPostRes, campaignRes, approvalRes, imagesRes, weekRes, monthRes, checkRes] = await Promise.all([
      base()
        .not("scheduled_at", "is", null)
        .gte("scheduled_at", dayStart.toISOString())
        .lt("scheduled_at", dayEnd.toISOString())
        .order("scheduled_at", { ascending: true })
        .limit(6),
      base()
        .eq("status", "draft")
        .is("scheduled_at", null)
        .order("created_at", { ascending: false })
        .limit(4),
      base().order("created_at", { ascending: false }).limit(5),
      ctx.supabase
        .from("campaigns")
        .select("id, campaign_title, created_at")
        .eq("user_id", ctx.userId)
        .eq("project_id", data.workspaceId)
        .order("created_at", { ascending: false })
        .limit(5),
      base().eq("status", "draft").then((r: { data: unknown[] | null }) => ({ count: (r.data ?? []).length })),
      ctx.supabase
        .from("content_bank_items")
        .select("id, meta")
        .eq("user_id", ctx.userId)
        .eq("project_id", data.workspaceId)
        .in("kind", ["image", "image_prompt"])
        .limit(200),
      base()
        .not("scheduled_at", "is", null)
        .gte("scheduled_at", dayStart.toISOString())
        .lt("scheduled_at", in7.toISOString()),
      base()
        .not("scheduled_at", "is", null)
        .gte("scheduled_at", dayStart.toISOString())
        .lt("scheduled_at", in30.toISOString()),
      ctx.supabase
        .from("content_posts")
        .select("id, title, caption, platform, scheduled_at, meta")
        .eq("user_id", ctx.userId)
        .eq("project_id", data.workspaceId)
        .eq("status", "draft")
        .order("created_at", { ascending: false })
        .limit(40),
    ]);

    type PostRow = {
      id: string;
      title: string | null;
      caption: string | null;
      platform: string | null;
      scheduled_at: string | null;
      created_at: string;
    };

    const asFocus = (rows: unknown): FocusPost[] =>
      ((rows ?? []) as PostRow[]).map((r) => ({
        id: r.id,
        label: trim(r.title ?? r.caption, "Untitled post"),
        platform: (r.platform ?? "").trim() || "Post",
        at: r.scheduled_at,
      }));

    const recent: ActivityItem[] = [
      ...((campaignRes.data ?? []) as Array<{ id: string; campaign_title: string | null; created_at: string }>).map(
        (c) => ({
          id: c.id,
          kind: "campaign" as const,
          label: trim(c.campaign_title, "Untitled campaign"),
          at: c.created_at,
        }),
      ),
      ...((recentPostRes.data ?? []) as PostRow[]).map((p) => ({
        id: p.id,
        kind: "post" as const,
        label: trim(p.title ?? p.caption, "Untitled post"),
        at: p.created_at,
      })),
    ]
      .sort((a, b) => (a.at < b.at ? 1 : -1))
      .slice(0, 6);

    const imagesAwaiting = ((imagesRes.data ?? []) as Array<{ meta?: { visual_approval?: string } }>).filter(
      (b) => (b.meta?.visual_approval ?? "required") !== "approved",
    ).length;

    // Calendar gaps: weekdays in the next 30 days with nothing placed.
    const busyDays = new Set(
      ((monthRes.data ?? []) as Array<{ scheduled_at: string }>).map((r) => r.scheduled_at.slice(0, 10)),
    );
    let calendarGaps = 0;
    for (let d = new Date(dayStart); d < in30; d.setDate(d.getDate() + 1)) {
      const dow = d.getDay();
      if (dow === 0 || dow === 6) continue;
      if (!busyDays.has(d.toISOString().slice(0, 10))) calendarGaps += 1;
    }

    type CheckRow = PostRow & { meta?: { compliance?: { status?: string } } | null };
    const checkRows = (checkRes.data ?? []) as CheckRow[];
    const isReady = (r: CheckRow) => {
      const st = r.meta?.compliance?.status;
      return st === "pass" || st === "repaired";
    };

    const upcomingCampaigns = ((campaignRes.data ?? []) as Array<{ id: string; campaign_title: string | null }>)
      .slice(0, 3)
      .map((c) => ({ id: c.id, label: trim(c.campaign_title, "Untitled campaign") }));

    return {
      scheduledToday: asFocus(todayRes.data),
      drafts: asFocus(draftRes.data),
      recent,
      awaitingApproval: approvalRes.count ?? 0,
      imagesAwaiting,
      upcomingWeek: (weekRes.data ?? []).length,
      calendarGaps,
      upcomingCampaigns,
      readyDrafts: asFocus(checkRows.filter((r) => isReady(r))).slice(0, 8),
      flaggedDrafts: asFocus(checkRows.filter((r) => !isReady(r))).slice(0, 8),
    };
  });

/**
 * One-click "Approve all" for the Monday Brief. Only drafts whose brand check
 * passed or was repaired are approved; flagged drafts and visuals are never
 * touched. Approval is not scheduling: nothing is published.
 */
export const approveReadyDrafts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ workspaceId: z.string().uuid(), ids: z.array(z.string().uuid()).min(1).max(50) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertOwnedWorkspace(ctx, data.workspaceId);
    const { data: rows, error } = await ctx.supabase
      .from("content_posts")
      .select("id, meta")
      .eq("user_id", ctx.userId)
      .eq("project_id", data.workspaceId)
      .eq("status", "draft")
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    const ok = ((rows ?? []) as Array<{ id: string; meta?: { compliance?: { status?: string } } | null }>)
      .filter((r) => ["pass", "repaired"].includes(r.meta?.compliance?.status ?? ""))
      .map((r) => r.id);
    if (ok.length === 0) return { approved: [] as string[] };
    const { error: upErr } = await ctx.supabase
      .from("content_posts")
      .update({ status: "approved" })
      .in("id", ok)
      .eq("user_id", ctx.userId)
      .eq("status", "draft");
    if (upErr) throw new Error(upErr.message);
    return { approved: ok };
  });

/**
 * Delete draft posts from the Home review list. Only drafts belonging to the
 * caller and this workspace are touched; approved, scheduled and published
 * posts are never deleted here.
 */
export const deleteDraftPosts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ workspaceId: z.string().uuid(), ids: z.array(z.string().uuid()).min(1).max(100) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertOwnedWorkspace(ctx, data.workspaceId);
    const { error } = await ctx.supabase
      .from("content_posts")
      .delete()
      .eq("user_id", ctx.userId)
      .eq("project_id", data.workspaceId)
      .eq("status", "draft")
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    return { deleted: data.ids.length };
  });
