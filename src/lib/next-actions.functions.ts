/**
 * Proactive suggestions for the Briefing Room.
 *
 * Reads what the workspace already knows (strategy plan, drafts waiting,
 * competitor gaps, what is scheduled) and turns it into two or three concrete
 * one-click proposals, so the agent opens with work rather than a blank box.
 *
 * Read-only, workspace-scoped, no AI call, so it lands in well under a second.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertOwnedWorkspace } from "@/lib/tool-registry/guards";

export type NextAction = {
  id: string;
  /** Short heading, in the owner's terms. */
  title: string;
  /** Why the agent is suggesting this now. */
  why: string;
  /** What the button does. */
  cta: string;
  /** When set, tapping fills the brief and runs it. */
  brief: string | null;
  /** How many posts to write when brief is a post batch. */
  count: number | null;
  /** When set, tapping navigates here instead. */
  href: string | null;
};

type Ctx = { userId: string; supabase: any };

const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Which week of the 90-day plan we are in, 1-based, capped at the plan length. */
function weekIndex(startedAt: string | null, total: number): number {
  if (!startedAt || total < 1) return 1;
  const days = Math.floor((Date.now() - new Date(startedAt).getTime()) / 86_400_000);
  return Math.min(total, Math.max(1, Math.floor(days / 7) + 1));
}

export const getNextActions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<NextAction[]> => {
    const ctx = context as unknown as Ctx;
    await assertOwnedWorkspace(ctx, data.workspaceId);

    const weekAhead = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const now = new Date().toISOString();

    const [draftRes, scheduledRes, planRes, scanRes, brainRes] = await Promise.all([
      ctx.supabase
        .from("content_posts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", ctx.userId)
        .eq("project_id", data.workspaceId)
        .eq("status", "draft"),
      ctx.supabase
        .from("content_posts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", ctx.userId)
        .eq("project_id", data.workspaceId)
        .not("scheduled_at", "is", null)
        .gte("scheduled_at", now)
        .lt("scheduled_at", weekAhead),
      ctx.supabase
        .from("strategy_plans")
        .select("plan, updated_at")
        .eq("user_id", ctx.userId)
        .eq("project_id", data.workspaceId)
        .maybeSingle(),
      ctx.supabase
        .from("competitor_scans")
        .select("competitor_name, results_json")
        .eq("user_id", ctx.userId)
        .eq("project_id", data.workspaceId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      ctx.supabase
        .from("business_brains")
        .select("data")
        .eq("user_id", ctx.userId)
        .eq("project_id", data.workspaceId)
        .maybeSingle(),
    ]);

    const out: NextAction[] = [];

    const brain = (brainRes?.data?.data ?? {}) as Record<string, any>;
    const hasVoice = Boolean(s(brain?.founder?.sample_posts) || s(brain?.brand?.tone_of_voice));

    // 1. Nothing to write from yet.
    if (!hasVoice) {
      out.push({
        id: "brain",
        title: "Fill in your Brand DNA first",
        why: "Without your own posts and sign-offs saved, anything written here will sound generic.",
        cta: "Open Brand DNA",
        brief: null,
        count: null,
        href: "/brain/setup",
      });
    }

    // 2. This week's theme from the plan.
    const plan = (planRes?.data?.plan ?? null) as any;
    const weeks: any[] = Array.isArray(plan?.weeks) ? plan.weeks : [];
    if (weeks.length) {
      const idx = weekIndex(s(planRes?.data?.updated_at) || null, weeks.length);
      const wk = weeks[idx - 1] ?? weeks[0];
      const theme = s(wk?.theme) || s(wk?.focus);
      const focus = s(wk?.focus).replace(/[.\s]+$/, "");
      if (theme) {
        out.push({
          id: "plan-week",
          title: `Draft this week's posts on "${theme}"`,
          why: `Week ${idx} of your plan is running${focus && focus !== theme ? `: ${focus}` : ""}.`,
          cta: "Draft 3 posts",
          brief: `Write this week's posts on the theme "${theme}"${focus ? `, focusing on ${focus}` : ""}.`,
          count: 3,
          href: null,
        });
      }

    }

    // 3. Drafts sitting unread.
    const drafts = Number(draftRes?.count ?? 0);
    if (drafts > 0) {
      out.push({
        id: "drafts",
        title: `${drafts} draft${drafts === 1 ? "" : "s"} waiting for you`,
        why: "They stay in your Content Bank until you approve or schedule them.",
        cta: "Review them",
        brief: null,
        count: null,
        href: "/bank",
      });
    }

    // 4. A gap the competition is not covering.
    const scan = (scanRes?.data ?? null) as any;
    const topics: string[] = Array.isArray(scan?.results_json?.topics)
      ? scan.results_json.topics.map((t: unknown) => s(t)).filter(Boolean)
      : [];
    if (topics[0]) {
      out.push({
        id: "gap",
        title: `Claim the gap: ${topics[0]}`,
        why: `Your last competitor read flagged this as ground ${s(scan?.competitor_name) || "the competition"} is not covering.`,
        cta: "Draft 3 posts",
        brief: `Write posts that take ownership of "${topics[0]}", a subject our competitors are not covering.`,
        count: 3,
        href: null,
      });
    }

    // 5. An empty week ahead.
    if (Number(scheduledRes?.count ?? 0) === 0) {
      out.push({
        id: "empty-week",
        title: "Nothing is scheduled for the next seven days",
        why: "A month of posts written now gives you something to edit and queue.",
        cta: "Write next month",
        brief: "Write next month's social posts across my usual themes.",
        count: 12,
        href: null,
      });
    }

    return out.slice(0, 3);
  });
