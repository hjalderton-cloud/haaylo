/**
 * Marketing Orchestrator.
 *
 * Decision-making and coordination only. It never calls the AI itself and never
 * writes copy. Every asset goes through the same path as a manual request:
 *
 *   Orchestrator -> existing generator (loadBrandContext) -> runCompliant -> draft -> calendar -> user approval
 *
 * Runs are executed one action per request (the browser drives the loop) so
 * each request stays short and progress reflects real work.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { loadBrandContext } from "./brand-context.server";
import { runPostBatch } from "./post-batch.functions";
import { runCampaignAsset } from "./campaign-generate.functions";
import { runCreateCampaign, runCreateStrategy } from "./tool-registry/runners.server";
import { assertOwnedWorkspace } from "./tool-registry/guards";
import { angleSimilarity, DUPLICATE_THRESHOLD, validateAndCleanContent } from "./brand-compliance.server";

export type Ctx = { userId: string; supabase: any };

export const GOALS = {
  leads: "Generate leads",
  launch: "Launch a product or service",
  visibility: "Increase visibility",
  bookings: "Drive bookings",
  event: "Promote an event",
  nurture: "Nurture my existing audience",
  sell: "Sell a specific offer",
} as const;
export type GoalKey = keyof typeof GOALS;

export type OrchestratorInput = {
  workspaceId: string;
  goal: GoalKey;
  offer: string;
  launchDate: string | null; // YYYY-MM-DD
  platforms: string[];
  postsPerWeek: number;
};

export type Slot = {
  date: string;
  channel: string;
  assetType: "social_post";
  pillar: string;
  objective: string;
  ctaType: string;
  priority: "high" | "normal";
  campaign: boolean;
  reason: string;
  postId?: string | null;
};

export type Action = {
  key: string;
  label: string;
  stage: string;
  status: "pending" | "running" | "done" | "needs_review" | "failed" | "skipped";
  detail?: string;
  error?: string;
  ids?: string[];
};

const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const DAY = 86_400_000;
const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const PATTERNS: Record<number, number[]> = {
  1: [2], 2: [2, 4], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 4, 5], 6: [1, 2, 3, 4, 5, 6], 7: [0, 1, 2, 3, 4, 5, 6],
};
const CTA_TYPE: Record<GoalKey, string> = {
  leads: "Sign-up", launch: "Register interest", visibility: "Comment or follow", bookings: "Book",
  event: "Save your place", nurture: "Reply", sell: "Enquire or buy",
};
const SOCIAL = ["linkedin", "instagram", "facebook", "tiktok", "x", "youtube", "pinterest"];

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** First real line of the products list, without bullets or numbering. */
export function firstOffer(text: string): string {
  const line = text
    .split(/\n|;/)
    .map((l) => l.replace(/^\s*(?:[-*\u2022]|\d+[.)])\s*/, "").trim())
    .find((l) => l.length > 3);
  return (line ?? "").replace(/[.:]$/, "").slice(0, 140);
}

const OFFER_HINTS: Record<GoalKey, RegExp> = {
  leads: /guide|free|download|beta|founding|member|waitlist|trial|audit|checklist|sign.?up|newsletter/i,
  bookings: /consult|survey|visit|appointment|book|quote|measure|session|call|demo|assessment/i,
  launch: /new|launch|founding|beta|early|introduc/i,
  sell: /package|plan|bundle|product|service|install|membership|course|£|\d/i,
  event: /event|webinar|workshop|open day|launch|talk|class/i,
  visibility: /./,
  nurture: /./,
};

/** Every distinct offer in the Business Brain, scored for the chosen goal. */
export function offerCandidates(brain: any, goal: GoalKey, activeCampaignTitles: string[] = []) {
  const lines = s(brain?.business?.products_services)
    .split(/\n|;|\s[\u00b7|]\s/)
    .map((l) => l.replace(/^\s*(?:[-*\u2022]|\d+[.)])\s*/, "").replace(/[.:]$/, "").trim())
    .filter((l) => l.length > 3)
    .map((l) => l.slice(0, 140));
  const current = s(brain?.ctas?.current_offer);
  const all = [...new Set([...(current ? [current.slice(0, 140)] : []), ...lines])];
  const scored = all.map((label) => {
    let score = 0;
    if (label === current.slice(0, 140)) score += 3;
    if (OFFER_HINTS[goal].test(label)) score += 2;
    if (activeCampaignTitles.some((t) => angleSimilarity(t, label) > 0.2)) score += 2;
    return { label, score };
  });
  return scored.sort((a, b) => b.score - a.score);
}

/* ------------------------------- analysis -------------------------------- */

export async function analyseWorkspace(ctx: Ctx, input: OrchestratorInput) {
  await assertOwnedWorkspace(ctx, input.workspaceId);
  const pid = input.workspaceId;
  const now = new Date();
  const end = new Date(now.getTime() + 31 * DAY);

  const [brand, strat, camps, cal, sched, recent, learn, comp] = await Promise.all([
    loadBrandContext(ctx, pid),
    ctx.supabase.from("strategy_plans").select("id, plan, updated_at").eq("project_id", pid).maybeSingle(),
    ctx.supabase.from("campaigns").select("id, campaign_title, status, cart_closes_at, created_at").eq("project_id", pid).eq("status", "active").order("created_at", { ascending: false }).limit(10),
    ctx.supabase.from("content_posts").select("scheduled_at, status").eq("project_id", pid).gte("scheduled_at", now.toISOString()).lte("scheduled_at", end.toISOString()),
    ctx.supabase.from("scheduled_posts").select("scheduled_at, status").eq("user_id", ctx.userId).in("status", ["scheduled", "draft"]).gte("scheduled_at", now.toISOString()).lte("scheduled_at", end.toISOString()),
    ctx.supabase.from("content_posts").select("id, status").eq("project_id", pid).order("created_at", { ascending: false }).limit(50),
    ctx.supabase.from("agent_learnings").select("id").eq("project_id", pid).limit(20),
    ctx.supabase.from("competitor_scans").select("id").eq("project_id", pid).limit(1),
  ]);

  const brain = brand.brain ?? {};
  const plan = (strat.data?.plan ?? null) as any;
  const busyDays = new Set<string>(
    [...(cal.data ?? []), ...(sched.data ?? [])].map((r: any) => String(r.scheduled_at).slice(0, 10)),
  );
  const strategyAgeDays = strat.data?.updated_at ? Math.round((now.getTime() - new Date(strat.data.updated_at).getTime()) / DAY) : null;
  const pillars: string[] = (plan?.pillars ?? []).map((p: any) => s(p?.name)).filter(Boolean);
  const recentRows = (recent.data ?? []) as any[];

  return {
    business: brand.name || s(brain?.business?.name) || "this business",
    audience: brand.audience || s(brain?.audience?.ideal_customer),
    offer: input.offer,
    channels: brand.channels,
    hasStrategy: !!plan,
    strategyAgeDays,
    strategyGoal: s(plan?.goal),
    pillars,
    activeCampaigns: ((camps.data ?? []) as any[]).map((c) => ({ id: c.id, title: c.campaign_title })),
    busyDays: [...busyDays].sort(),
    recentPosts: recentRows.length,
    recentPublished: recentRows.filter((r) => r.status === "published" || r.status === "scheduled").length,
    learnings: (learn.data ?? []).length,
    competitorSignals: (comp.data ?? []).length > 0,
    trendSignals: /TREND/i.test(brand.prompt),
    emailActive:
      input.platforms.includes("email") || /email|newsletter/i.test(`${s(brain?.marketing?.channels)} ${s(brain?.content?.preferred_platforms)}`),
  };
}
export type Analysis = Awaited<ReturnType<typeof analyseWorkspace>>;

/* -------------------------------- planning ------------------------------- */

export function decideCampaign(input: OrchestratorInput, a: Analysis) {
  const g = input.goal;
  const needs =
    g === "launch" || g === "event" || g === "sell" || g === "leads" ||
    (g === "bookings" && (!!input.offer || !!input.launchDate));
  if (!needs) {
    return {
      needed: false as const,
      why:
        g === "visibility"
          ? "Visibility is built by steady posting, so no landing page or lead magnet is needed this month."
          : g === "nurture"
            ? "Nurturing an existing audience doesn't need a new sign-up page, so this month is posts only."
            : "No offer or date was given, so posts alone serve this goal.",
    };
  }
  const assets: Record<string, boolean> = { socialPosts: true, landingPage: true, imagePack: true };
  if (g === "leads") assets["leadMagnet"] = true;
  if (a.emailActive && g !== "bookings") assets["emailSequence"] = true;
  if (g === "launch") assets["blog"] = true;
  const offer = input.offer || a.offer;
  const label = GOALS[g];
  return {
    needed: true as const,
    assets,
    title: `${label}${offer ? `: ${offer}` : ""}`.slice(0, 150),
    theme: `${label}${offer ? ` for ${offer}` : ""}${input.launchDate ? `, key date ${input.launchDate}` : ""}${a.audience ? `. Audience: ${a.audience.slice(0, 200)}` : ""}`.slice(0, 600),
    why:
      g === "leads"
        ? "A lead-generation goal needs somewhere to send people, so this includes a sign-up page and a guide to give away."
        : g === "bookings"
          ? "Bookings need a page people can book from, so this includes one alongside the posts."
          : input.launchDate
          ? `You have a key date on ${input.launchDate}, so this needs a campaign that builds towards it.`
          : `Selling a specific offer works best with a page people can act on, so this includes one.`,
  };
}

export function strategyCheck(input: OrchestratorInput, a: Analysis) {
  if (!a.hasStrategy) return { action: "create" as const, note: "You don't have a 90-day strategy yet, so Haaylo will write one first." };
  const conflicts: string[] = [];
  if (a.strategyAgeDays != null && a.strategyAgeDays > 100) conflicts.push(`your strategy is ${a.strategyAgeDays} days old`);
  if (input.offer) {
    const word = input.offer.toLowerCase().split(/\s+/).find((w) => w.length > 4);
    if (word && !a.strategyGoal.toLowerCase().includes(word) && !a.pillars.join(" ").toLowerCase().includes(word)) {
      conflicts.push(`your strategy doesn't mention "${input.offer}"`);
    }
  }
  if ((input.goal === "launch" || input.goal === "event") && !/launch|event|open/i.test(a.strategyGoal)) {
    conflicts.push("your strategy wasn't written around a launch or event");
  }
  if (conflicts.length) {
    return { action: "flag" as const, note: `Using your current strategy, but ${conflicts.join(" and ")}. Consider updating it on the 90-day plan page. Nothing has been overwritten.` };
  }
  return { action: "reuse" as const, note: "Your current 90-day strategy fits this goal, so Haaylo reused it." };
}

export function planSlots(input: OrchestratorInput, a: Analysis, campaign: boolean, pillars: string[]): Slot[] {
  const per = Math.min(7, Math.max(1, Math.round(input.postsPerWeek)));
  const days = PATTERNS[per] ?? PATTERNS[3]!;
  const busy = new Set(a.busyDays);
  const used = new Set<string>();
  const channels = (input.platforms.filter((p) => SOCIAL.includes(p)).length ? input.platforms.filter((p) => SOCIAL.includes(p)) : a.channels.length ? a.channels : ["linkedin"]);
  const pillarList = pillars.length ? pillars : ["Educational", "Story", "Proof", "Offer"];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const launch = input.launchDate ? new Date(`${input.launchDate}T00:00:00Z`) : null;
  const slots: Slot[] = [];
  let lastOffer = -10;

  for (let i = 1; i <= 30; i += 1) {
    const d = new Date(today.getTime() + i * DAY);
    if (!days.includes(d.getUTCDay())) continue;
    let target = d;
    let shifted = false;
    // Respect existing content: move to the next free weekday within two days.
    for (let k = 0; k < 3; k += 1) {
      const c = new Date(d.getTime() + k * DAY);
      const key = isoDay(c);
      if (!busy.has(key) && !used.has(key) && c.getUTCDay() !== 0) { target = c; shifted = k > 0; break; }
      if (k === 2) target = null as any;
    }
    if (!target || i > 30) continue;
    const date = isoDay(target);
    used.add(date);
    const n = slots.length;
    let pillar = pillarList[n % pillarList.length]!;
    const isOfferPillar = /offer|convert|sell|promo/i.test(pillar);
    // Space promotion: never two offer posts within three slots of each other.
    if (isOfferPillar && n - lastOffer < 3) pillar = pillarList[(n + 1) % pillarList.length]!;
    if (/offer|convert|sell|promo/i.test(pillar)) lastOffer = n;
    const channel = channels[n % channels.length]!;
    const daysToLaunch = launch ? Math.round((launch.getTime() - target.getTime()) / DAY) : null;
    const inCampaign = campaign && (daysToLaunch == null ? n % 2 === 0 : daysToLaunch >= 0);
    const weekday = WEEKDAY[target.getUTCDay()];

    let reason: string;
    if (inCampaign && daysToLaunch != null && daysToLaunch >= 0) {
      reason = daysToLaunch <= 7
        ? `Your key date is ${daysToLaunch} day${daysToLaunch === 1 ? "" : "s"} away, so this post pushes people to act.`
        : `Your key date is ${daysToLaunch} days away, so this post starts building interest.`;
    } else if (shifted) {
      reason = `Your usual day was already booked, so this moves to ${weekday} to avoid doubling up.`;
    } else if (inCampaign) {
      reason = `Part of your ${GOALS[input.goal].toLowerCase()} campaign, sending people to the sign-up page.`;
    } else {
      reason = `Fills a ${weekday} ${channel === "linkedin" ? "LinkedIn" : channel[0]!.toUpperCase() + channel.slice(1)} gap and covers your "${pillar}" pillar, supporting your goal to ${GOALS[input.goal].toLowerCase()}.`;
    }
    slots.push({
      date, channel, assetType: "social_post", pillar, objective: GOALS[input.goal], ctaType: CTA_TYPE[input.goal],
      priority: inCampaign ? "high" : "normal", campaign: inCampaign, reason,
    });
  }
  return slots;
}

export function buildActions(strategy: ReturnType<typeof strategyCheck>, camp: ReturnType<typeof decideCampaign>, organicCount: number): Action[] {
  const actions: Action[] = [
    { key: "strategy", label: "90-day strategy", stage: "Checking your strategy", status: "pending" },
    { key: "plan", label: "30-day plan", stage: "Planning your month from your strategy", status: "pending" },
  ];
  if (camp.needed) {
    actions.push({ key: "campaign", label: "Campaign", stage: "Building your campaign", status: "pending" });
    const map: Array<[string, string, string, string]> = [
      ["socialPosts", "social_posts", "Campaign posts", "Writing your posts"],
      ["landingPage", "landing_page", "Sign-up page", "Building your campaign"],
      ["leadMagnet", "lead_magnet", "Guide to give away", "Building your campaign"],
      ["emailSequence", "email_sequence", "Email sequence", "Preparing emails"],
      ["blog", "blog", "Blog article", "Building your campaign"],
      ["imagePack", "image_pack", "Campaign visuals", "Creating visuals"],
    ];
    for (const [flag, key, label, stage] of map) {
      if (camp.assets[flag]) actions.push({ key: `asset:${key}`, label, stage, status: "pending" });
    }
  }
  if (organicCount > 0) actions.push({ key: "posts", label: `${organicCount} social posts`, stage: "Writing your posts", status: "pending" });
  actions.push({ key: "checks", label: "Brand checks", stage: "Running brand checks", status: "pending" });
  actions.push({ key: "calendar", label: "Calendar", stage: "Filling your calendar", status: "pending" });
  return actions;
}

/* ------------------------------- execution ------------------------------- */

export async function startRun(ctx: Ctx, input: OrchestratorInput) {
  const analysis = await analyseWorkspace(ctx, input);
  const strategy = strategyCheck(input, analysis);
  const camp = decideCampaign(input, analysis);
  // Slot counts don't depend on pillars, but themes do: the real 30-day plan is
  // only built after the strategy has been resolved (see the "plan" action).
  const organic = planSlots(input, analysis, camp.needed, []).filter((x) => !x.campaign).length;
  const actions = buildActions(strategy, camp, organic);

  const { data, error } = await ctx.supabase
    .from("orchestration_runs")
    .insert({
      user_id: ctx.userId,
      project_id: input.workspaceId,
      goal: GOALS[input.goal],
      inputs: input,
      status: "running",
      stage: "Planning your month",
      analysis: { ...analysis, strategy, campaign: { needed: camp.needed, why: camp.why, ...(camp.needed ? { title: camp.title, assets: camp.assets, theme: camp.theme } : {}) } },
      plan: [],
      actions,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { runId: data.id as string };
}

async function loadRun(ctx: Ctx, runId: string) {
  const { data, error } = await ctx.supabase.from("orchestration_runs").select("*").eq("id", runId).eq("user_id", ctx.userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("That run isn't here any more.");
  return data as any;
}

/** Runs the next pending action. Failures are recorded and the run carries on. */
export async function stepRun(ctx: Ctx, runId: string) {
  const run = await loadRun(ctx, runId);
  if (run.status !== "running") return run;
  const actions: Action[] = run.actions ?? [];
  const idx = actions.findIndex((a) => a.status === "pending");
  if (idx < 0) {
    const { data } = await ctx.supabase.from("orchestration_runs").update({ status: "review_ready", stage: "Ready for review" }).eq("id", runId).select("*").single();
    return data;
  }
  const action = actions[idx]!;
  const input = run.inputs as OrchestratorInput;
  const analysis = run.analysis as any;
  const ids: Record<string, string[]> = run.created_asset_ids ?? {};
  let campaignId: string | null = run.campaign_id ?? null;
  let placements = run.placements ?? [];
  const slots: Slot[] = run.plan ?? [];

  await ctx.supabase.from("orchestration_runs").update({ stage: action.stage }).eq("id", runId);

  try {
    if (action.key === "strategy") {
      if (analysis.strategy?.action === "create") {
        await runCreateStrategy(ctx, { workspaceId: input.workspaceId, goal: GOALS[input.goal] + (input.offer ? ` (${input.offer})` : ""), postsPerWeek: input.postsPerWeek });
        action.status = "done";
        action.detail = "Written and saved as your 90-day strategy.";
      } else {
        action.status = analysis.strategy?.action === "flag" ? "needs_review" : "done";
        action.detail = analysis.strategy?.note;
      }
    } else if (action.key === "plan") {
      // Reload the strategy as saved, then build the month on its real pillars.
      const { data: strat } = await ctx.supabase.from("strategy_plans").select("plan").eq("project_id", input.workspaceId).maybeSingle();
      const pillars: string[] = ((strat?.plan as any)?.pillars ?? []).map((p: any) => s(p?.name)).filter(Boolean);
      if (!pillars.length) throw new Error("No strategy pillars were found, so the month can't be planned yet.");
      const fresh = planSlots(input, { ...analysis, busyDays: analysis.busyDays ?? [] }, !!analysis.campaign?.needed, pillars);
      slots.splice(0, slots.length, ...fresh);
      await ctx.supabase.from("orchestration_runs").update({ plan: slots, analysis: { ...analysis, pillars } }).eq("id", runId);
      action.status = "done";
      action.detail = `${slots.length} slots planned across ${pillars.join(", ")}.`;
    } else if (action.key === "campaign") {
      const c = analysis.campaign;
      const row = (await runCreateCampaign(ctx, {
        workspaceId: input.workspaceId, title: c.title, theme: c.theme, duration: "30-day", assets: c.assets,
        brief: { goal: run.goal, offer: input.offer, launchDate: input.launchDate, orchestration_run_id: runId },
      })) as { id: string };
      campaignId = row.id;
      ids["campaigns"] = [row.id];
      action.status = "done";
      action.detail = c.why;
    } else if (action.key.startsWith("asset:")) {
      if (!campaignId) {
        action.status = "skipped";
        action.detail = "Skipped because the campaign couldn't be created.";
      } else {
        const key = action.key.slice(6) as any;
        const plannedPlatforms = key === "social_posts" ? slots.filter((x) => x.campaign).map((x) => x.channel) : undefined;
        await runCampaignAsset(ctx, { campaignId, key, plannedPlatforms: plannedPlatforms?.length ? plannedPlatforms : undefined });
        action.status = "done";
      }
    } else if (action.key === "posts") {
      const organic = slots.filter((x) => !x.campaign);
      const pillarHint = [...new Set(organic.map((x) => x.pillar))].join(", ");
      const platforms = [...new Set(organic.map((x) => x.channel))].slice(0, 5);
      // Keep the month varied: collect every angle already covered this period.
      const avoid: string[] = [];
      if (campaignId) {
        const { data: cp } = await ctx.supabase.from("content_posts").select("title, caption").eq("project_id", input.workspaceId).eq("campaign_id", campaignId).limit(30);
        avoid.push(...((cp ?? []) as any[]).map((r) => `${s(r.title)} ${s(r.caption).slice(0, 200)}`.trim()));
      }
      const { data: recent } = await ctx.supabase.from("content_posts").select("title, caption").eq("project_id", input.workspaceId).is("campaign_id", null).gte("created_at", new Date(Date.now() - 30 * DAY).toISOString()).limit(30);
      avoid.push(...((recent ?? []) as any[]).map((r) => `${s(r.title)} ${s(r.caption).slice(0, 200)}`.trim()));
      const r = await runPostBatch(ctx, {
        workspaceId: input.workspaceId,
        topic: `${run.goal}${input.offer ? ` for ${input.offer}` : ""}. Spread across these pillars: ${pillarHint}. Call to action style: ${organic[0]?.ctaType ?? "soft"}. These posts complement the campaign: objections, behind-the-scenes, proof and education rather than repeating its hooks.`.slice(0, 7900),
        count: Math.min(30, organic.length),
        platforms,
        weekFrom: null,
        weekTo: null,
        collection: `Build My Marketing: ${run.goal}`.slice(0, 120),
        extraMeta: { orchestration_run_id: runId },
        plannedSlots: organic.slice(0, 30).map((x) => ({ platform: x.channel, pillar: x.pillar })),
        avoidAngles: avoid.filter(Boolean),
      });
      ids["posts"] = r.ids;
      action.status = r.report.needsReview ? "needs_review" : "done";
      action.ids = r.ids;
      action.detail = `${r.created} drafts written: ${r.report.passed} passed, ${r.report.repaired} repaired, ${r.report.needsReview} need a look.`;
    } else if (action.key === "checks") {
      const postIds = await runPostIds(ctx, input.workspaceId, ids, campaignId);
      const { data: rows } = postIds.length
        ? await ctx.supabase.from("content_posts").select("id, meta").in("id", postIds)
        : { data: [] };
      const list = (rows ?? []) as any[];
      // Final cross-check: campaign vs regular posts. Flag only the later duplicate.
      const { data: full } = postIds.length ? await ctx.supabase.from("content_posts").select("id, title, caption, campaign_id, meta").in("id", postIds).order("created_at") : { data: [] };
      const seen: Array<{ id: string; angle: string }> = [];
      let dups = 0;
      for (const row of (full ?? []) as any[]) {
        const angle = `${s(row.title)} ${s(row.caption).slice(0, 260)}`;
        const hit = seen.find((x) => angleSimilarity(angle, x.angle) >= DUPLICATE_THRESHOLD);
        seen.push({ id: row.id, angle });
        if (hit && !row.meta?.duplicate_of) {
          dups += 1;
          const comp = { ...(row.meta?.compliance ?? {}), status: "needs_review", violations: [...(row.meta?.compliance?.violations ?? []), "Repeats another post in this month"] };
          await ctx.supabase.from("content_posts").update({ meta: { ...row.meta, compliance: comp, duplicate_of: hit.id } }).eq("id", row.id).eq("status", "draft");
        }
      }
      const statusOf = (r: any) => r.meta?.compliance?.status;
      const fresh = dups ? (((await ctx.supabase.from("content_posts").select("id, meta").in("id", postIds)).data ?? []) as any[]) : list;
      const passed = fresh.filter((r) => statusOf(r) === "pass").length;
      const repaired = fresh.filter((r) => statusOf(r) === "repaired").length;
      const flagged = fresh.filter((r) => statusOf(r) === "needs_review").length;
      action.status = flagged ? "needs_review" : "done";
      action.detail = `${fresh.length} posts checked individually: ${passed} passed, ${repaired} repaired, ${flagged} need your attention${dups ? ` (${dups} repeat another post)` : ""}.`;
    } else if (action.key === "calendar") {
      placements = await placeOnCalendar(ctx, input.workspaceId, runId, slots, ids, campaignId);
      action.status = "done";
      action.detail = `${placements.length} drafts placed on your calendar. Nothing is scheduled to publish.`;
    }
  } catch (e) {
    action.status = "failed";
    action.error = e instanceof Error ? e.message.slice(0, 300) : "Something went wrong.";
  }

  actions[idx] = action;
  const done = !actions.some((a) => a.status === "pending");
  const { data } = await ctx.supabase
    .from("orchestration_runs")
    .update({
      actions, created_asset_ids: ids, campaign_id: campaignId, placements,
      ...(done ? { status: "review_ready", stage: "Ready for review" } : {}),
    })
    .eq("id", runId)
    .select("*")
    .single();
  return data;
}

async function runPostIds(ctx: Ctx, pid: string, ids: Record<string, string[]>, campaignId: string | null) {
  const out = [...(ids["posts"] ?? [])];
  if (campaignId) {
    const { data } = await ctx.supabase.from("content_posts").select("id").eq("project_id", pid).eq("campaign_id", campaignId);
    out.push(...((data ?? []) as any[]).map((r) => r.id));
  }
  return [...new Set(out)];
}

/** Gives each draft a planned date. Status stays "draft": the publisher only sends approved, scheduled items. */
async function placeOnCalendar(ctx: Ctx, pid: string, runId: string, slots: Slot[], ids: Record<string, string[]>, campaignId: string | null) {
  const organic = [...(ids["posts"] ?? [])];
  let campaignPosts: string[] = [];
  if (campaignId) {
    const { data } = await ctx.supabase.from("content_posts").select("id").eq("project_id", pid).eq("campaign_id", campaignId).is("scheduled_at", null).order("created_at");
    campaignPosts = ((data ?? []) as any[]).map((r) => r.id);
  }
  const platformOf = new Map<string, string>();
  const allIds = [...organic, ...campaignPosts];
  if (allIds.length) {
    const { data: pf } = await ctx.supabase.from("content_posts").select("id, platform").in("id", allIds);
    for (const r of (pf ?? []) as any[]) platformOf.set(r.id, String(r.platform).toLowerCase());
  }
  const placements: Array<Slot & { postId: string }> = [];
  for (const slot of slots) {
    const pool = slot.campaign && campaignPosts.length ? campaignPosts : organic.length ? organic : campaignPosts;
    // Prefer a post written for this slot's channel.
    let pick = 0;
    if (platformOf.size) {
      const m = pool.findIndex((id) => platformOf.get(id) === slot.channel);
      if (m >= 0) pick = m;
    }
    const postId = pool.splice(pick, 1)[0];
    if (!postId) continue;
    const { data: row } = await ctx.supabase.from("content_posts").select("meta, status, platform").eq("id", postId).eq("project_id", pid).maybeSingle();
    if (!row || row.status !== "draft") continue; // never touch anything the owner has already moved on
    const { error } = await ctx.supabase
      .from("content_posts")
      .update({
        scheduled_at: `${slot.date}T08:00:00Z`,
        plan_slot: slot.date,
        ...(slot.campaign && campaignId ? { campaign_id: campaignId } : {}),
        meta: { ...(row.meta ?? {}), orchestration_run_id: runId, planned: true, rationale: slot.reason, cta_type: slot.ctaType, objective: slot.objective },
      })
      .eq("id", postId)
      .eq("status", "draft");
    if (!error) placements.push({ ...slot, channel: row.platform || slot.channel, postId });
  }
  return placements;
}

export async function getRun(ctx: Ctx, runId: string) {
  return loadRun(ctx, runId);
}

export async function latestRun(ctx: Ctx, workspaceId: string) {
  const { data } = await ctx.supabase.from("orchestration_runs").select("*").eq("project_id", workspaceId).eq("user_id", ctx.userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data ?? null;
}

export async function defaultsFor(ctx: Ctx, workspaceId: string) {
  await assertOwnedWorkspace(ctx, workspaceId);
  const [brand, settings, camps] = await Promise.all([
    loadBrandContext(ctx, workspaceId),
    ctx.supabase.from("agent_settings").select("cadence, platforms").eq("project_id", workspaceId).maybeSingle(),
    ctx.supabase.from("campaigns").select("campaign_title").eq("project_id", workspaceId).eq("status", "active").limit(10),
  ]);
  const b = brand.brain ?? {};
  const goals = s(b?.marketing?.business_goals).toLowerCase();
  const goal: GoalKey = /lead|enquir|sign.?up|waitlist/.test(goals) ? "leads" : /book|appointment|consult/.test(goals) ? "bookings" : /launch/.test(goals) ? "launch" : /sale|sell|revenue/.test(goals) ? "sell" : "visibility";
  const settingsPlatforms = ((settings.data?.platforms ?? []) as string[]).map((p) => p.toLowerCase());
  const platforms = brand.channels.length ? brand.channels : settingsPlatforms.length ? settingsPlatforms : ["linkedin"];
  const titles = ((camps.data ?? []) as any[]).map((c) => s(c.campaign_title));
  // Candidate offers per goal; the page shows them and only preselects when one clearly fits.
  const offersByGoal = Object.fromEntries(
    (Object.keys(GOALS) as GoalKey[]).map((g) => [g, offerCandidates(b, g, titles).slice(0, 6)]),
  ) as Record<GoalKey, Array<{ label: string; score: number }>>;
  return {
    goal,
    offersByGoal,
    platforms: /email|newsletter/i.test(`${s(b?.marketing?.channels)} ${s(b?.content?.preferred_platforms)}`) ? [...platforms, "email"] : platforms,
    postsPerWeek: settings.data?.cadence === "daily" ? 5 : 3,
  };
}

/* ------------------------------- review ---------------------------------- */

const okStatus = (m: any) => ["pass", "repaired"].includes(m?.compliance?.status);

/** Everything the run produced, with each item's own compliance state. */
export async function runReview(ctx: Ctx, runId: string) {
  const run = await loadRun(ctx, runId);
  const pid = run.project_id;
  const ids: Record<string, string[]> = run.created_asset_ids ?? {};
  const postIds = await runPostIds(ctx, pid, ids, run.campaign_id);
  const [posts, pages, bank, emails] = await Promise.all([
    postIds.length ? ctx.supabase.from("content_posts").select("id, title, caption, platform, pillar, status, scheduled_at, campaign_id, meta").in("id", postIds).eq("project_id", pid).order("scheduled_at", { ascending: true, nullsFirst: false }) : { data: [] },
    run.campaign_id ? ctx.supabase.from("landing_pages").select("id, title, status").eq("campaign_id", run.campaign_id).eq("project_id", pid) : { data: [] },
    run.campaign_id ? ctx.supabase.from("content_bank_items").select("id, kind, title, meta").eq("project_id", pid).filter("meta->>campaign_id", "eq", run.campaign_id) : { data: [] },
    run.campaign_id ? ctx.supabase.from("email_sequences").select("id").eq("campaign_id", run.campaign_id) : { data: [] },
  ]);
  const { data: camp } = run.campaign_id ? await ctx.supabase.from("campaigns").select("id, guide_title, has_lead_magnet").eq("id", run.campaign_id).maybeSingle() : { data: null };
  const postRows = ((posts.data ?? []) as any[]).map((p) => ({
    id: p.id, title: p.title, caption: p.caption, platform: p.platform, pillar: p.pillar, status: p.status,
    date: p.scheduled_at ? String(p.scheduled_at).slice(0, 10) : null, campaign: !!p.campaign_id,
    compliance: p.meta?.compliance?.status ?? "unchecked",
    violations: (p.meta?.compliance?.violations ?? []).slice(0, 4),
    reason: p.meta?.rationale ?? null,
  }));
  const images = ((bank.data ?? []) as any[]).filter((b) => b.kind === "image" || b.kind === "image_prompt").map((b) => ({ id: b.id, title: b.title, url: b.meta?.url ?? null, visual: b.meta?.visual_approval ?? "required", imageStatus: (b.meta?.image_status as string | undefined) ?? (b.meta?.url ? "ready" : "brief"), imageError: (b.meta?.image_error as string | null | undefined) ?? null }));
  const blogs = ((bank.data ?? []) as any[]).filter((b) => b.kind === "blog").length;
  const comp = postRows.map((p) => p.compliance);
  return {
    posts: postRows,
    images,
    summary: {
      socialDrafts: postRows.length,
      campaigns: run.campaign_id ? 1 : 0,
      landingPages: (pages.data ?? []).length,
      guides: camp && run.actions?.some((a: any) => a.key === "asset:lead_magnet" && a.status === "done") ? 1 : 0,
      emails: (emails.data ?? []).length,
      blogs,
      imagesAwaiting: images.filter((i) => i.visual !== "approved").length,
      passed: comp.filter((c) => c === "pass").length,
      repaired: comp.filter((c) => c === "repaired").length,
      needsReview: comp.filter((c) => c === "needs_review").length,
      approved: postRows.filter((p) => p.status === "approved").length,
    },
  };
}

/** Approves drafts that passed or were repaired. needs_review, visuals and anything not a draft are left alone. Nothing is scheduled. */
export async function approveCompliant(ctx: Ctx, runId: string) {
  const run = await loadRun(ctx, runId);
  const postIds = await runPostIds(ctx, run.project_id, run.created_asset_ids ?? {}, run.campaign_id);
  if (!postIds.length) return { approved: 0, skipped: 0 };
  const { data } = await ctx.supabase.from("content_posts").select("id, status, meta").in("id", postIds).eq("project_id", run.project_id);
  const rows = (data ?? []) as any[];
  const ok = rows.filter((r) => r.status === "draft" && okStatus(r.meta)).map((r) => r.id);
  if (ok.length) {
    const { error } = await ctx.supabase.from("content_posts").update({ status: "approved" }).in("id", ok).eq("status", "draft");
    if (error) throw new Error(error.message);
  }
  return { approved: ok.length, skipped: rows.filter((r) => r.status === "draft").length - ok.length };
}

async function ownedPost(ctx: Ctx, postId: string) {
  const { data } = await ctx.supabase.from("content_posts").select("id, project_id, caption, title, platform, pillar, campaign_id, status, meta").eq("id", postId).maybeSingle();
  if (!data) throw new Error("That post isn't here any more.");
  await assertOwnedWorkspace(ctx, data.project_id);
  return data as any;
}

/** Explicit single approval: the owner has looked at it, whatever its check said. */
export async function approvePost(ctx: Ctx, postId: string) {
  const p = await ownedPost(ctx, postId);
  if (p.status !== "draft") return { ok: true };
  await ctx.supabase.from("content_posts").update({ status: "approved" }).eq("id", postId).eq("status", "draft");
  return { ok: true };
}

/** Saves an edit and re-runs the deterministic brand checks on the new wording. */
export async function editPost(ctx: Ctx, postId: string, caption: string) {
  const p = await ownedPost(ctx, postId);
  const { data: bb } = await ctx.supabase.from("business_brains").select("data").eq("project_id", p.project_id).maybeSingle();
  const r = validateAndCleanContent(caption, (bb?.data ?? {}) as any, { kind: "social_post", platform: p.platform, verifiedContext: p.caption });
  const compliance = { ...(p.meta?.compliance ?? {}), status: r.valid ? (r.repaired.length ? "repaired" : "pass") : "needs_review", violations: r.violations, warnings: r.warnings, edited: true };
  await ctx.supabase.from("content_posts").update({ caption: r.cleaned, meta: { ...p.meta, compliance, duplicate_of: undefined } }).eq("id", postId).in("status", ["draft", "approved"]);
  return { caption: r.cleaned, compliance: compliance.status, violations: r.violations };
}

/** Rejects one post and writes a replacement for the same slot through the normal generator. */
export async function regeneratePost(ctx: Ctx, postId: string) {
  const p = await ownedPost(ctx, postId);
  if (p.status !== "draft" && p.status !== "approved") throw new Error("Only drafts can be regenerated.");
  const r = await runPostBatch(ctx, {
    workspaceId: p.project_id,
    topic: `Replacement post${p.pillar ? ` for the "${p.pillar}" pillar` : ""}. Take a fresh angle.`,
    count: 1, platforms: [p.platform], weekFrom: null, weekTo: null,
    collection: p.meta?.batch_title ?? "Build My Marketing",
    campaignId: p.campaign_id,
    plannedSlots: [{ platform: p.platform, pillar: p.pillar ?? undefined }],
    avoidAngles: [`${s(p.title)} ${s(p.caption).slice(0, 200)}`],
    extraMeta: {
      orchestration_run_id: p.meta?.orchestration_run_id, planned: p.meta?.planned, rationale: p.meta?.rationale,
      cta_type: p.meta?.cta_type, objective: p.meta?.objective, replaces: postId,
    },
  });
  const newId = r.ids[0];
  if (newId && p.meta?.orchestration_run_id) {
    const { data: old } = await ctx.supabase.from("content_posts").select("scheduled_at, plan_slot").eq("id", postId).maybeSingle();
    await ctx.supabase.from("content_posts").update({ scheduled_at: old?.scheduled_at ?? null, plan_slot: old?.plan_slot ?? null }).eq("id", newId);
    const { data: run } = await ctx.supabase.from("orchestration_runs").select("id, created_asset_ids, placements").eq("id", p.meta.orchestration_run_id).maybeSingle();
    if (run) {
      const ids = run.created_asset_ids ?? {};
      ids["posts"] = [...(ids["posts"] ?? []).filter((x: string) => x !== postId), newId];
      const placements = (run.placements ?? []).map((pl: any) => (pl.postId === postId ? { ...pl, postId: newId } : pl));
      await ctx.supabase.from("orchestration_runs").update({ created_asset_ids: ids, placements }).eq("id", run.id);
    }
  }
  await ctx.supabase.from("content_posts").delete().eq("id", postId).in("status", ["draft", "approved"]);
  return { id: newId };
}

/** Visuals are never bulk-approved: the owner signs each one off. */
export async function approveVisual(ctx: Ctx, itemId: string) {
  const { data } = await ctx.supabase.from("content_bank_items").select("id, project_id, meta").eq("id", itemId).maybeSingle();
  if (!data) throw new Error("That image isn't here any more.");
  await assertOwnedWorkspace(ctx, data.project_id);
  await ctx.supabase.from("content_bank_items").update({ meta: { ...(data.meta ?? {}), visual_approval: "approved" } }).eq("id", itemId);
  return { ok: true };
}
