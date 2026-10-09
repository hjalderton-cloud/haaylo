/**
 * Email hub — sequences broken into individual emails so each one can be
 * edited the way you would in Mailchimp: subject, preview text, audience,
 * planned send date, body and one image.
 *
 * Additive: reuses the existing `email_sequences` table and the existing
 * Mailchimp credentials. Nothing here sends or schedules anything — the
 * planned date is Haaylo's own planning field until the owner presses Sync.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_CHAT = "https://ai.gateway.lovable.dev/v1/chat/completions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { userId: string; supabase: any };

const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");

async function assertOwnsProject(ctx: Ctx, projectId: string) {
  const { data } = await ctx.supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (!data) throw new Error("That workspace isn't yours.");
}

export type SequenceEmail = {
  id: string;
  order: number;
  phase: number;
  subject: string;
  previewText: string;
  body: string;
  audienceId: string | null;
  audienceName: string | null;
  plannedSendAt: string | null;
  heroImageUrl: string | null;
  heroImagePath: string | null;
  campaignId: string | null;
};

export type EmailSequenceGroup = {
  key: string;
  campaignId: string | null;
  title: string;
  emails: SequenceEmail[];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toEmail(r: any): SequenceEmail {
  return {
    id: r.id as string,
    order: Number(r.send_order ?? 1),
    phase: Number(r.phase ?? 1),
    subject: s(r.email_subject),
    previewText: s(r.preview_text),
    body: typeof r.email_body === "string" ? r.email_body : "",
    audienceId: r.audience_id ?? null,
    audienceName: r.audience_name ?? null,
    plannedSendAt: r.planned_send_at ?? null,
    heroImageUrl: r.hero_image_url ?? null,
    heroImagePath: r.hero_image_path ?? null,
    campaignId: r.campaign_id ?? null,
  };
}

const SELECT =
  "id, campaign_id, project_id, phase, send_order, email_subject, email_body, preview_text, audience_id, audience_name, planned_send_at, hero_image_url, hero_image_path";

/** Every sequence the owner has in this workspace, campaign ones first. */
export const listEmailSequences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<EmailSequenceGroup[]> => {
    const ctx = context as unknown as Ctx;
    await assertOwnsProject(ctx, data.projectId);

    const { data: campaigns } = await ctx.supabase
      .from("campaigns")
      .select("id, campaign_title")
      .eq("user_id", ctx.userId)
      .eq("project_id", data.projectId);
    const campaignIds = ((campaigns ?? []) as { id: string }[]).map((c) => c.id);
    const titleOf = new Map(
      ((campaigns ?? []) as { id: string; campaign_title: string | null }[]).map((c) => [
        c.id,
        s(c.campaign_title) || "Untitled campaign",
      ]),
    );

    const { data: rows, error } = await ctx.supabase
      .from("email_sequences")
      .select(SELECT)
      .eq("user_id", ctx.userId)
      .order("phase", { ascending: true })
      .order("send_order", { ascending: true });
    if (error) throw new Error(error.message);

    const groups = new Map<string, EmailSequenceGroup>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (rows ?? []) as any[]) {
      const cid = (r.campaign_id as string | null) ?? null;
      const belongs = cid ? campaignIds.includes(cid) : r.project_id === data.projectId;
      if (!belongs) continue;
      const key = cid ?? "funnel";
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          campaignId: cid,
          title: cid ? (titleOf.get(cid) ?? "Campaign") : "Nurture sequence",
          emails: [],
        });
      }
      groups.get(key)!.emails.push(toEmail(r));
    }
    return [...groups.values()];
  });

/** One email plus the position it holds in its sequence. */
export const getSequenceEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ email: SequenceEmail; total: number; position: number; sequenceTitle: string }> => {
    const ctx = context as unknown as Ctx;
    const { data: row, error } = await ctx.supabase
      .from("email_sequences")
      .select(SELECT)
      .eq("user_id", ctx.userId)
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("That email isn't here any more.");

    const email = toEmail(row);
    let q = ctx.supabase
      .from("email_sequences")
      .select("id, send_order, phase")
      .eq("user_id", ctx.userId)
      .order("phase", { ascending: true })
      .order("send_order", { ascending: true });
    q = email.campaignId ? q.eq("campaign_id", email.campaignId) : q.is("campaign_id", null);
    const { data: siblings } = await q;
    const list = ((siblings ?? []) as { id: string }[]).map((x) => x.id);

    let title = "Nurture sequence";
    if (email.campaignId) {
      const { data: c } = await ctx.supabase
        .from("campaigns")
        .select("campaign_title")
        .eq("user_id", ctx.userId)
        .eq("id", email.campaignId)
        .maybeSingle();
      title = s(c?.campaign_title) || "Campaign";
    }

    return {
      email,
      total: list.length || 1,
      position: Math.max(list.indexOf(email.id), 0) + 1,
      sequenceTitle: title,
    };
  });

const updateInput = z.object({
  id: z.string().uuid(),
  subject: z.string().trim().max(300).optional(),
  previewText: z.string().trim().max(300).optional(),
  body: z.string().max(40000).optional(),
  audienceId: z.string().trim().max(120).nullish(),
  audienceName: z.string().trim().max(200).nullish(),
  plannedSendAt: z.string().trim().max(60).nullish(),
  heroImageUrl: z.string().trim().max(2000).nullish(),
  heroImagePath: z.string().trim().max(500).nullish(),
  order: z.number().int().min(1).max(99).optional(),
});

export const updateSequenceEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateInput.parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const patch: Record<string, unknown> = {};
    if (data.subject !== undefined) patch["email_subject"] = data.subject;
    if (data.previewText !== undefined) patch["preview_text"] = data.previewText;
    if (data.body !== undefined) patch["email_body"] = data.body;
    if (data.audienceId !== undefined) patch["audience_id"] = data.audienceId || null;
    if (data.audienceName !== undefined) patch["audience_name"] = data.audienceName || null;
    if (data.plannedSendAt !== undefined) patch["planned_send_at"] = data.plannedSendAt || null;
    if (data.heroImageUrl !== undefined) patch["hero_image_url"] = data.heroImageUrl || null;
    if (data.heroImagePath !== undefined) patch["hero_image_path"] = data.heroImagePath || null;
    if (data.order !== undefined) patch["send_order"] = data.order;
    if (!Object.keys(patch).length) return { ok: true as const };

    const { error } = await ctx.supabase
      .from("email_sequences")
      .update(patch)
      .eq("user_id", ctx.userId)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/* ---------------------------------------------------------------- legacy */

type ParsedEmail = { subject: string; preview: string; body: string };

/** Splits one long written sequence into its individual emails. */
export function splitSequenceText(text: string): ParsedEmail[] {
  const clean = (text ?? "").replace(/\r\n/g, "\n").trim();
  if (!clean) return [];
  const marker = /^\s*(?:\*\*)?\s*email\s*#?\s*(\d{1,2})\b.*$/gim;
  const cuts: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = marker.exec(clean)) !== null) cuts.push(m.index);
  const chunks =
    cuts.length >= 2
      ? cuts.map((start, i) => clean.slice(start, cuts[i + 1] ?? clean.length))
      : [clean];

  return chunks
    .map((chunk) => {
      const lines = chunk.split("\n");
      let subject = "";
      let preview = "";
      const bodyLines: string[] = [];
      for (const line of lines) {
        const bare = line.replace(/\*\*/g, "").trim();
        if (/^email\s*#?\s*\d{1,2}\b[:.\s-]*$/i.test(bare)) continue;
        const subj = bare.match(/^subject(?:\s*line)?\s*:\s*(.+)$/i);
        if (subj && !subject) {
          subject = subj[1]!.trim();
          continue;
        }
        if (/^alternative\s+subject\s*:/i.test(bare)) continue;
        const prev = bare.match(/^preview(?:\s*text)?\s*:\s*(.+)$/i);
        if (prev && !preview) {
          preview = prev[1]!.trim();
          continue;
        }
        bodyLines.push(line);
      }
      return {
        subject: subject.slice(0, 300),
        preview: preview.slice(0, 300),
        body: bodyLines.join("\n").trim(),
      };
    })
    .filter((e) => e.body.length > 20 || e.subject);
}

/**
 * One-off import: turns the funnel's saved sequence text into editable rows.
 * Safe to call repeatedly — it does nothing once rows exist.
 */
export const importFunnelSequence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ imported: number }> => {
    const ctx = context as unknown as Ctx;
    await assertOwnsProject(ctx, data.projectId);

    const { data: funnel } = await ctx.supabase
      .from("funnels")
      .select("email_output, campaign_id")
      .eq("user_id", ctx.userId)
      .eq("project_id", data.projectId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // When the funnel was built for a campaign, its emails belong to that
    // campaign — so the sequence is named after it, not "Nurture sequence".
    const campaignId = (funnel?.campaign_id as string | null) ?? null;

    // Already imported but not yet linked to the campaign: relink them once.
    if (campaignId) {
      const { data: unlinked } = await ctx.supabase
        .from("email_sequences")
        .select("id")
        .eq("user_id", ctx.userId)
        .eq("project_id", data.projectId)
        .is("campaign_id", null);
      const ids = ((unlinked ?? []) as { id: string }[]).map((r) => r.id);
      if (ids.length) {
        await ctx.supabase
          .from("email_sequences")
          .update({ campaign_id: campaignId })
          .eq("user_id", ctx.userId)
          .in("id", ids);
        return { imported: 0 };
      }
    }

    let existingQ = ctx.supabase
      .from("email_sequences")
      .select("id")
      .eq("user_id", ctx.userId)
      .eq("project_id", data.projectId)
      .limit(1);
    existingQ = campaignId ? existingQ.eq("campaign_id", campaignId) : existingQ.is("campaign_id", null);
    const { data: existing } = await existingQ;
    if ((existing ?? []).length) return { imported: 0 };

    const parsed = splitSequenceText(s(funnel?.email_output));
    if (!parsed.length) return { imported: 0 };

    const rows = parsed.slice(0, 20).map((e, i) => ({
      user_id: ctx.userId,
      project_id: data.projectId,
      campaign_id: campaignId,
      phase: 1,
      send_order: i + 1,
      email_subject: e.subject || `Email ${i + 1}`,
      email_body: e.body,
      preview_text: e.preview || null,
      status: "draft",
    }));
    const { data: inserted, error } = await ctx.supabase.from("email_sequences").insert(rows).select("id");
    if (error) throw new Error(error.message);
    const { fileAssets } = await import("./packages.server");
    await fileAssets(ctx, { projectId: data.projectId, assetType: "email", ids: ((inserted ?? []) as { id: string }[]).map((r) => r.id), section: "Emails", fallbackType: "email_sequence", title: "Nurture email sequence", campaignId });
    return { imported: rows.length };
  });

/* -------------------------------------------------------------- mailchimp */

export const listMailchimpAudiences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ connected: boolean; audiences: { id: string; name: string }[] }> => {
    const ctx = context as unknown as Ctx;
    const { getMailchimpCreds } = await import("@/lib/mailchimp-leads.server");
    let creds: { key: string; prefix: string } | null = null;
    try {
      creds = await getMailchimpCreds(ctx.supabase, ctx.userId);
    } catch {
      return { connected: false, audiences: [] };
    }
    if (!creds) return { connected: false, audiences: [] };

    const res = await fetch(
      `https://${creds.prefix}.api.mailchimp.com/3.0/lists?count=50&fields=lists.id,lists.name`,
      { headers: { Authorization: `Basic ${btoa(`anystring:${creds.key}`)}` } },
    );
    if (!res.ok) return { connected: true, audiences: [] };
    const json = (await res.json()) as { lists?: { id: string; name: string }[] };
    return {
      connected: true,
      audiences: (json.lists ?? []).map((l) => ({ id: l.id, name: l.name })),
    };
  });

/* ---------------------------------------------------------------- titles */

export const suggestSubjectLines = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        body: z.string().trim().min(20).max(8000),
        current: z.string().trim().max(300).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ subjects: string[] }> => {
    const ctx = context as unknown as Ctx;
    await assertOwnsProject(ctx, data.projectId);
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI is not configured for this workspace.");

    const { loadBrandContext } = await import("@/lib/brand-context.server");
    const { prompt: voice, brain } = await loadBrandContext(ctx, data.projectId);

    const system = [
      "You write email subject lines for a British small business.",
      "UK English. Plain, direct, understated. Peer over coffee, not a press release.",
      "Banned: crucial, tapestry, dive deep, more than just, look no further, elevate, testament, game-changer, foster, unlock, supercharge, and 'not X, it's Y' constructions.",
      "No emoji, no ALL CAPS, no clickbait. Under 65 characters each.",
      "Return five subject lines, one per line, nothing else.",
    ].join("\n");

    const prompt = [
      voice && `Brand context:\n${voice}\n`,
      data.current ? `Current subject: ${data.current}` : "",
      `Email body:\n"""\n${data.body.slice(0, 4000)}\n"""`,
    ]
      .filter(Boolean)
      .join("\n");

    const res = await fetch(GATEWAY_CHAT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!res.ok) {
      if (res.status === 429) throw new Error("The AI is busy right now — try again in a moment.");
      if (res.status === 402) throw new Error("You've run out of AI credits. Top them up, then try again.");
      throw new Error(`Those titles didn't come back (${res.status}). Try again.`);
    }
    const json = await res.json();
    const raw = s(json?.choices?.[0]?.message?.content);
    const subjects = raw
      .split("\n")
      .map((l) => l.replace(/^\s*[-*\d.)]+\s*/, "").replace(/^["']|["']$/g, "").trim())
      .filter((l) => l.length > 3 && l.length <= 120)
      .slice(0, 5);
    const { validateAndCleanContent } = await import("@/lib/brand-compliance.server");
    const checked = subjects
      .map((sub) => validateAndCleanContent(sub, brain as Record<string, unknown>, { kind: "email_subject", verifiedContext: `${voice}\n${data.body}`, maxLength: 80 }))
      .filter((r) => r.valid && r.cleaned.length > 3)
      .map((r) => r.cleaned);
    if (!checked.length) throw new Error("No titles came back that passed the brand checks. Try again.");
    return { subjects: checked };
  });
