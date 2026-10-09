import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  generateEmailSequence,
  generateLeadMagnet,
  type FunnelInputs,
} from "@/lib/funnel.server";

export type FunnelRecord = {
  problem: string;
  offer: string;
  magnet_type: string;
  price: string;
  magnet_output: string;
  email_output: string;
  updated_at: string | null;
};

const inputsSchema = z.object({
  problem: z.string().max(12000).default(""),
  offer: z.string().max(12000).default(""),
  magnetType: z.string().max(200).default("PDF guide / checklist"),
  price: z.string().max(200).default(""),
});

type FunnelContext = {
  userId: string;
  // Typed loosely: the auth middleware provides a fully typed client.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
};

/**
 * The workspace must be named explicitly. Falling back to a "default"
 * workspace is how copy written for one business ends up saved against
 * another, so there is no fallback here.
 */
async function resolveProjectId(context: FunnelContext, projectId?: string): Promise<string> {
  if (!projectId) throw new Error("Pick a workspace first, then try again.");
  const { data } = await context.supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", context.userId)
    .maybeSingle();
  if (!data?.id) throw new Error("That workspace isn't yours.");
  return data.id as string;
}


async function loadBrain(context: FunnelContext, projectId: string | null): Promise<Record<string, unknown>> {
  if (!projectId) return {};
  const { data: row } = await context.supabase
    .from("business_brains")
    .select("data")
    .eq("project_id", projectId)
    .maybeSingle();
  return (row?.data as Record<string, unknown> | undefined) ?? {};
}

async function upsertFunnel(
  context: FunnelContext,
  projectId: string | null,
  patch: Record<string, unknown>,
): Promise<void> {
  let q = context.supabase.from("funnels").select("id").eq("user_id", context.userId);
  q = projectId ? q.eq("project_id", projectId) : q.is("project_id", null);
  const { data: existing } = await q.maybeSingle();
  if (existing?.id) {
    const { error } = await context.supabase.from("funnels").update(patch).eq("id", existing.id);
    if (error) throw new Error(error.message);
    return;
  }
  const { data: created, error } = await context.supabase
    .from("funnels")
    .insert({ user_id: context.userId, project_id: projectId, ...patch })
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (created?.id) {
    const { fileAssets } = await import("./packages.server");
    await fileAssets(context, {
      projectId,
      assetType: "funnel",
      ids: [created.id],
      section: "Lead magnet",
      fallbackType: "lead_magnet",
      title: typeof patch.problem === "string" && patch.problem ? `Lead magnet: ${patch.problem}`.slice(0, 200) : "Lead magnet",
      campaignId: typeof patch.campaign_id === "string" ? patch.campaign_id : null,
    });
  }
}

export const getFunnel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId?: string } | undefined) =>
    z.object({ projectId: z.string().uuid().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const ctx = { userId: context.userId, supabase: context.supabase };
    const projectId = await resolveProjectId(ctx, data.projectId);
    let sel = context.supabase
      .from("funnels")
      .select("problem, offer, magnet_type, price, magnet_output, email_output, updated_at")
      .eq("user_id", context.userId);
    sel = projectId ? sel.eq("project_id", projectId) : sel.is("project_id", null);
    const { data: row } = await sel.maybeSingle();

    const funnel: FunnelRecord = {
      problem: row?.problem ?? "",
      offer: row?.offer ?? "",
      magnet_type: row?.magnet_type ?? "PDF guide / checklist",
      price: row?.price ?? "",
      magnet_output: row?.magnet_output ?? "",
      email_output: row?.email_output ?? "",
      updated_at: row?.updated_at ?? null,
    };

    // Prefill any blank field from the Strategy Profile — whether the funnel
    // row exists yet or not — so brain updates flow through, without
    // overwriting anything the user has typed.
    const brain = await loadBrain(ctx, projectId);
    const b = brain as Record<string, Record<string, unknown>>;
    const str = (v: unknown) => (typeof v === "string" ? v : "");
    const brainProblem = str(b?.audience?.pain_points);
    const brainOffer = str(b?.offer?.current_offer) || str(b?.business?.products_services);
    if (!funnel.problem.trim()) funnel.problem = brainProblem;
    if (!funnel.offer.trim()) funnel.offer = brainOffer;
    const brainAvailable = !!(brainProblem.trim() || brainOffer.trim());

    return { funnel, brainPrefill: brainAvailable ? { problem: brainProblem, offer: brainOffer } : null };
  });

export const getFunnelOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [funnelRes, pagesRes, leadsRes] = await Promise.all([
      context.supabase
        .from("funnels")
        .select("magnet_output, email_output")
        .eq("user_id", context.userId)
        .maybeSingle(),
      context.supabase
        .from("landing_pages")
        .select("id, title, status")
        .eq("user_id", context.userId)
        .order("updated_at", { ascending: false }),
      context.supabase.from("lead_captures").select("*", { count: "exact", head: true }),
    ]);

    const funnelRow = funnelRes.data;
    return {
      magnetDone: !!(funnelRow?.magnet_output && funnelRow.magnet_output.trim().length > 20),
      emailsDone: !!(funnelRow?.email_output && funnelRow.email_output.trim().length > 20),
      landingPages: (pagesRes.data ?? []).map((p) => ({
        id: p.id as string,
        title: p.title as string,
        status: p.status as string,
      })),
      leadsCaptured: leadsRes.count ?? 0,
    };
  });

async function assertOwnsCampaign(context: FunnelContext, campaignId: string): Promise<string> {
  const { data } = await context.supabase
    .from("campaigns")
    .select("id")
    .eq("id", campaignId)
    .eq("user_id", context.userId)
    .maybeSingle();
  if (!data?.id) throw new Error("That campaign isn't yours.");
  return data.id as string;
}

export const saveFunnel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    inputsSchema
      .extend({
        projectId: z.string().uuid().optional(),
        campaignId: z.string().uuid().optional(),
        magnetOutput: z.string().max(60000).optional(),
        emailOutput: z.string().max(60000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = { userId: context.userId, supabase: context.supabase };
    const projectId = await resolveProjectId(ctx, data.projectId);
    const patch: Record<string, unknown> = {
      problem: data.problem,
      offer: data.offer,
      magnet_type: data.magnetType,
      price: data.price,
      updated_at: new Date().toISOString(),
    };
    if (data.magnetOutput !== undefined) patch.magnet_output = data.magnetOutput;
    if (data.emailOutput !== undefined) patch.email_output = data.emailOutput;
    if (data.campaignId) patch.campaign_id = await assertOwnsCampaign(ctx, data.campaignId);

    await upsertFunnel(ctx, projectId, patch);
    return { ok: true };
  });

async function runGeneration(
  context: FunnelContext,
  data: FunnelInputs & { projectId?: string; campaignId?: string },
  kind: "magnet" | "emails",
): Promise<string> {
  const projectId = await resolveProjectId(context, data.projectId);
  const { loadBrandContext } = await import("@/lib/brand-context.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { prompt: grounding } = await loadBrandContext(context as any, projectId);
  const output =
    kind === "magnet" ? await generateLeadMagnet(grounding, data) : await generateEmailSequence(grounding, data);

  await upsertFunnel(context, projectId, {
    problem: data.problem,
    offer: data.offer,
    magnet_type: data.magnetType,
    price: data.price,
    ...(kind === "magnet" ? { magnet_output: output } : { email_output: output }),
    ...(data.campaignId ? { campaign_id: await assertOwnsCampaign(context, data.campaignId) } : {}),
    updated_at: new Date().toISOString(),
  });
  return output;
}

const generationSchema = inputsSchema.extend({
  projectId: z.string().uuid().optional(),
  campaignId: z.string().uuid().optional(),
});

export const generateMagnet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => generationSchema.parse(d))
  .handler(async ({ data, context }) => {
    const output = await runGeneration(
      { userId: context.userId, supabase: context.supabase },
      data,
      "magnet",
    );
    return { output };
  });

export const generateEmails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => generationSchema.parse(d))
  .handler(async ({ data, context }) => {
    const output = await runGeneration(
      { userId: context.userId, supabase: context.supabase },
      data,
      "emails",
    );
    return { output };
  });
