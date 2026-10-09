import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type Automation = {
  id: string;
  name: string;
  project_id: string | null;
  connection_id: string | null;
  scope: string;
  target_post_ids: string[];
  keywords: string[];
  match_mode: string;
  comment_reply_variants: string[];
  dm_message: string;
  followup_message: string | null;
  followup_delay_hours: number;
  handoff_email: string | null;
  handoff_enabled: boolean;
  handoff_delay_hours: number;
  dedupe_per_person: boolean;
  ignore_handles: string[];
  active: boolean;
  created_at: string;
};

export type Capture = {
  id: string;
  automation_id: string | null;
  platform: string;
  commenter_name: string | null;
  commenter_handle: string | null;
  avatar_url: string | null;
  comment_text: string;
  post_permalink: string | null;
  matched_keyword: string | null;
  reply_status: string;
  dm_status: string;
  last_error: string | null;
  created_at: string;
};

const SELECT_AUTOMATION =
  "id, name, project_id, connection_id, scope, target_post_ids, keywords, match_mode, comment_reply_variants, dm_message, followup_message, followup_delay_hours, handoff_email, handoff_enabled, handoff_delay_hours, dedupe_per_person, ignore_handles, active, created_at";

export const listAutomations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId?: string } | undefined) =>
    z.object({ projectId: z.string().uuid().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data: input, context }) => {
    let rulesQuery = context.supabase
      .from("lead_automations")
      .select(SELECT_AUTOMATION)
      .order("created_at", { ascending: false });
    if (input.projectId) {
      rulesQuery = rulesQuery.or(`project_id.eq.${input.projectId},project_id.is.null`);
    }
    const [rules, counts, connections] = await Promise.all([
      rulesQuery,
      context.supabase.from("lead_captures").select("automation_id"),
      context.supabase
        .from("social_connections")
        .select("id, provider, display_name, avatar_url, scopes, status")
        .order("created_at", { ascending: false }),
    ]);

    if (rules.error) throw rules.error;

    const tally: Record<string, number> = {};
    for (const row of counts.data ?? []) {
      const key = (row as { automation_id: string | null }).automation_id;
      if (key) tally[key] = (tally[key] ?? 0) + 1;
    }

    const { missingSendScopes } = await import("@/lib/leads.server");
    const accounts = (connections.data ?? []).map((c) => {
      const row = c as {
        id: string; provider: string; display_name: string | null;
        avatar_url: string | null; scopes: string | null; status: string;
      };
      return {
        id: row.id,
        provider: row.provider,
        display_name: row.display_name,
        avatar_url: row.avatar_url,
        status: row.status,
        missing_scopes: row.provider.startsWith("linkedin") ? [] : missingSendScopes(row.scopes),
        supported: !row.provider.startsWith("linkedin"),
      };
    });

    return {
      automations: (rules.data ?? []) as unknown as Automation[],
      counts: tally,
      accounts,
    };
  });

const automationSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(80),
  project_id: z.string().uuid().nullable().optional(),
  connection_id: z.string().uuid().nullable().optional(),
  scope: z.enum(["all_posts", "specific"]).default("all_posts"),
  target_post_ids: z.array(z.string().trim().max(120)).max(50).default([]),
  keywords: z.array(z.string().trim().min(1).max(40)).min(1).max(10),
  match_mode: z.enum(["exact", "contains"]).default("contains"),
  comment_reply_variants: z.array(z.string().trim().max(300)).max(5).default([]),
  dm_message: z.string().trim().max(1000).default(""),
  followup_message: z.string().trim().max(1000).nullable().optional(),
  followup_delay_hours: z.number().int().min(1).max(168).default(24),
  handoff_email: z.string().trim().email().max(200).nullable().optional(),
  handoff_enabled: z.boolean().default(false),
  handoff_delay_hours: z.number().int().min(0).max(168).default(0),
  dedupe_per_person: z.boolean().default(true),
  ignore_handles: z.array(z.string().trim().max(60)).max(20).default([]),
  active: z.boolean().default(true),
});

export const saveAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => automationSchema.parse(data))
  .handler(async ({ data, context }) => {
    const payload = {
      user_id: context.userId,
      name: data.name,
      project_id: data.project_id ?? null,
      connection_id: data.connection_id ?? null,
      scope: data.scope,
      target_post_ids: data.target_post_ids,
      keywords: data.keywords,
      match_mode: data.match_mode,
      comment_reply_variants: data.comment_reply_variants.filter(Boolean),
      dm_message: data.dm_message,
      followup_message: data.followup_message ?? null,
      followup_delay_hours: data.followup_delay_hours,
      handoff_email: data.handoff_email ?? null,
      handoff_enabled: data.handoff_enabled && !!data.handoff_email,
      handoff_delay_hours: data.handoff_delay_hours,
      dedupe_per_person: data.dedupe_per_person,
      ignore_handles: data.ignore_handles.filter(Boolean),
      active: data.active,
    };

    const q = data.id
      ? context.supabase.from("lead_automations").update(payload).eq("id", data.id).select("id").maybeSingle()
      : context.supabase.from("lead_automations").insert(payload).select("id").maybeSingle();

    const { data: row, error } = await q;
    if (error) throw error;
    return { id: row?.id ?? data.id ?? null };
  });

export const setAutomationActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), active: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("lead_automations")
      .update({ active: data.active })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true as const };
  });

export const deleteAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("lead_automations").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true as const };
  });

export const listLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      automationId: z.string().uuid().nullable().optional(),
      projectId: z.string().uuid().optional(),
      search: z.string().trim().max(120).optional(),
      limit: z.number().int().min(1).max(500).default(200),
    }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("lead_captures")
      .select(
        "id, automation_id, platform, commenter_name, commenter_handle, avatar_url, comment_text, post_permalink, matched_keyword, reply_status, dm_status, last_error, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (data.automationId) query = query.eq("automation_id", data.automationId);
    if (!data.automationId && data.projectId) {
      const { data: rules } = await context.supabase
        .from("lead_automations")
        .select("id")
        .or(`project_id.eq.${data.projectId},project_id.is.null`);
      const ids = (rules ?? []).map((r: { id: string }) => r.id);
      if (ids.length === 0) return { leads: [] as Capture[] };
      query = query.in("automation_id", ids);
    }
    if (data.search) {
      const term = `%${data.search}%`;
      query = query.or(
        `commenter_name.ilike.${term},commenter_handle.ilike.${term},comment_text.ilike.${term}`,
      );
    }

    const { data: rows, error } = await query;
    if (error) throw error;
    return { leads: (rows ?? []) as unknown as Capture[] };
  });

export type PageLead = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  phone: string | null;
  status: string;
  synced_at: string | null;
  sync_error: string | null;
  created_at: string;
  page_id: string;
  page_title: string | null;
  page_slug: string | null;
  campaign_id: string | null;
  campaign_title: string | null;
};

/** Sign-ups from the contact box on published landing pages. */
export const listPageLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        projectId: z.string().uuid().optional(),
        search: z.string().trim().max(120).optional(),
        limit: z.number().int().min(1).max(500).default(200),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Pages owned by this user, scoped to the selected client. Older pages
    // saved before clients existed have no project and stay visible.
    let pageQuery = supabase.from("landing_pages").select("id, title, slug, project_id").eq("user_id", userId);
    if (data.projectId) pageQuery = pageQuery.or(`project_id.eq.${data.projectId},project_id.is.null`);
    const { data: pages, error: pageError } = await pageQuery;
    if (pageError) throw pageError;

    const pageIds = (pages ?? []).map((p: { id: string }) => p.id);
    if (pageIds.length === 0) return { leads: [] as PageLead[] };

    let leadQuery = supabase
      .from("landing_page_leads")
      .select(
        "id, email, first_name, last_name, company, phone, status, synced_at, sync_error, created_at, page_id, campaign_id",
      )
      .in("page_id", pageIds)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.search) {
      const term = `%${data.search}%`;
      leadQuery = leadQuery.or(
        `email.ilike.${term},first_name.ilike.${term},last_name.ilike.${term},company.ilike.${term}`,
      );
    }
    const { data: rows, error } = await leadQuery;
    if (error) throw error;

    const campaignIds = Array.from(
      new Set((rows ?? []).map((r: { campaign_id: string | null }) => r.campaign_id).filter(Boolean) as string[]),
    );
    const campaignNames = new Map<string, string>();
    if (campaignIds.length > 0) {
      const { data: campaigns } = await supabase
        .from("campaigns")
        .select("id, campaign_title")
        .in("id", campaignIds);
      (campaigns ?? []).forEach((c: { id: string; campaign_title: string | null }) =>
        campaignNames.set(c.id, c.campaign_title ?? ""),
      );
    }

    const pageById = new Map(
      (pages ?? []).map((p: { id: string; title: string | null; slug: string | null }) => [p.id, p]),
    );

    const leads: PageLead[] = (rows ?? []).map((r) => {
      const page = pageById.get(r.page_id as string);
      return {
        id: r.id as string,
        email: r.email as string,
        first_name: (r.first_name as string | null) ?? null,
        last_name: (r.last_name as string | null) ?? null,
        company: (r.company as string | null) ?? null,
        phone: (r.phone as string | null) ?? null,
        status: (r.status as string | null) ?? "new",
        synced_at: (r.synced_at as string | null) ?? null,
        sync_error: (r.sync_error as string | null) ?? null,
        created_at: r.created_at as string,
        page_id: r.page_id as string,
        page_title: page?.title ?? null,
        page_slug: page?.slug ?? null,
        campaign_id: (r.campaign_id as string | null) ?? null,
        campaign_title: r.campaign_id ? campaignNames.get(r.campaign_id as string) ?? null : null,
      };
    });

    return { leads };
  });

export const leadStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [today, total] = await Promise.all([
      context.supabase.from("lead_captures").select("*", { count: "exact", head: true }).gte("created_at", since),
      context.supabase.from("lead_captures").select("*", { count: "exact", head: true }),
    ]);
    return { today: today.count ?? 0, total: total.count ?? 0 };
  });

/** Re-attempt the reply and DM for a capture that failed or was blocked. */
export const retryCapture = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: capture, error } = await context.supabase
      .from("lead_captures")
      .select("id, automation_id, external_comment_id")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw error;
    if (!capture?.automation_id) return { ok: false as const, error: "This lead has no rule attached." };

    const { data: rule } = await context.supabase
      .from("lead_automations")
      .select("*")
      .eq("id", capture.automation_id)
      .maybeSingle();
    if (!rule) return { ok: false as const, error: "The rule was deleted." };
    if (!rule.connection_id) return { ok: false as const, error: "The rule has no account attached." };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: connection } = await supabaseAdmin
      .from("social_connections")
      .select("id, user_id, provider, external_id, access_token_enc, scopes")
      .eq("id", rule.connection_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!connection) return { ok: false as const, error: "The connected account is missing." };

    const { missingSendScopes, runSends } = await import("@/lib/leads.server");
    const blocked = missingSendScopes(connection.scopes);
    if (blocked.length) {
      return { ok: false as const, error: `Awaiting Meta permissions: ${blocked.join(", ")}` };
    }

    await runSends(supabaseAdmin, {
      captureId: capture.id,
      rule: rule as never,
      connection,
      commentId: capture.external_comment_id,
    });
    return { ok: true as const };
  });

/** AI-drafted reply lines and DM, written in the project's Brain voice. */
export const suggestLeadReplies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      projectId: z.string().uuid().nullable().optional(),
      keyword: z.string().trim().min(1).max(40),
      offerLink: z.string().trim().max(300).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { draftLeadReplies } = await import("@/lib/leads-ai.server");
    let projectId = data.projectId ?? null;
    if (!projectId) {
      const { data: p } = await context.supabase
        .from("projects").select("id").eq("is_default", true)
        .order("created_at", { ascending: true }).limit(1).maybeSingle();
      projectId = p?.id ?? null;
    }
    let brain: Record<string, unknown> = {};
    if (projectId) {
      const { data: row } = await context.supabase
        .from("business_brains").select("data").eq("project_id", projectId).maybeSingle();
      brain = (row?.data ?? {}) as Record<string, unknown>;
    }
    return draftLeadReplies(brain, data.keyword, data.offerLink ?? "");
  });

/** Webhook URL + verify token for pasting into the Meta app config. Admins only. */
export const getMetaWebhookSetup = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");
    return {
      url: "https://haaylo.com/api/public/webhooks/meta",
      verifyToken: process.env["META_WEBHOOK_VERIFY_TOKEN"] ?? "",
      fields: ["comments"],
    };
  });

/**
 * Points an automation at one specific post so the rule fires on its comments.
 * Called from the calendar editor when a scheduled post is set to capture leads.
 */
export const linkPostToAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      automationId: z.string().uuid(),
      externalPostId: z.string().trim().min(1).max(120),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rule, error } = await context.supabase
      .from("lead_automations")
      .select("id, target_post_ids")
      .eq("id", data.automationId)
      .maybeSingle();
    if (error) throw error;
    if (!rule) return { ok: false as const, error: "That automation no longer exists." };

    const ids = Array.from(new Set([...(rule.target_post_ids ?? []), data.externalPostId])).slice(0, 50);
    const { error: updateError } = await context.supabase
      .from("lead_automations")
      .update({ target_post_ids: ids, scope: "specific", active: true })
      .eq("id", rule.id);
    if (updateError) throw updateError;
    return { ok: true as const, linked: ids.length };
  });

/** Manual public reply to a captured comment, sent from the leads tile or inbox. */
export const replyToLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      message: z.string().trim().min(1).max(500),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: capture } = await context.supabase
      .from("lead_captures")
      .select("id, automation_id, external_comment_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!capture?.external_comment_id) {
      return { ok: false as const, error: "That comment can no longer be replied to." };
    }

    const { data: rule } = capture.automation_id
      ? await context.supabase
          .from("lead_automations")
          .select("connection_id")
          .eq("id", capture.automation_id)
          .maybeSingle()
      : { data: null };
    if (!rule?.connection_id) return { ok: false as const, error: "No connected account for this lead." };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: connection } = await supabaseAdmin
      .from("social_connections")
      .select("id, user_id, access_token_enc, scopes")
      .eq("id", rule.connection_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!connection) return { ok: false as const, error: "The connected account is missing." };

    const { missingSendScopes, replyToComment, tokenFor } = await import("@/lib/leads.server");
    const blocked = missingSendScopes(connection.scopes);
    if (blocked.length) {
      return { ok: false as const, error: `Awaiting Meta permissions: ${blocked.join(", ")}` };
    }

    const result = await replyToComment(
      tokenFor(connection),
      capture.external_comment_id,
      data.message,
    );
    await supabaseAdmin
      .from("lead_captures")
      .update({
        reply_status: result.ok ? "sent" : "failed",
        last_error: result.ok ? null : (result.error ?? "Reply failed"),
      })
      .eq("id", capture.id);

    return result.ok
      ? { ok: true as const }
      : { ok: false as const, error: result.error ?? "Reply failed" };
  });

/** Move a landing page sign-up along the pipeline. */
export const setPageLeadStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["new", "contacted", "converted"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("landing_page_leads")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true as const };
  });

/** Remove a landing page sign-up. */
export const deletePageLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("landing_page_leads").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true as const };
  });
