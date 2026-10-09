import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Sends leads that haven't reached the email list yet — used both for a
 * one-off catch-up on older sign-ups and to retry anything that failed.
 */
export const pushLeadsToMailchimp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        campaignId: z.string().uuid().optional(),
        includeSynced: z.boolean().optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { getMailchimpCreds, getPrimaryAudienceId, upsertSubscriber } = await import(
      "./mailchimp-leads.server"
    );

    const creds = await getMailchimpCreds(supabase, userId);
    if (!creds) {
      throw new Error("No Mailchimp API key saved. Add one on your Account page first.");
    }

    const { data: pages, error: pagesErr } = await supabase
      .from("landing_pages")
      .select("id, title, campaign_id")
      .eq("user_id", userId);
    if (pagesErr) throw new Error(pagesErr.message);

    const wanted = (pages ?? []).filter(
      (p) => !data.campaignId || (p.campaign_id as string | null) === data.campaignId,
    );
    if (!wanted.length) return { sent: 0, failed: 0, total: 0 };

    const titles = new Map(wanted.map((p) => [p.id as string, (p.title as string) ?? "Haaylo"]));
    let query = supabase
      .from("landing_page_leads")
      .select("id, page_id, email, first_name, last_name, campaign_id, synced_at")
      .in(
        "page_id",
        wanted.map((p) => p.id as string),
      )
      .order("created_at", { ascending: true })
      .limit(500);
    if (!data.includeSynced) query = query.is("synced_at", null);

    const { data: leads, error: leadsErr } = await query;
    if (leadsErr) throw new Error(leadsErr.message);
    if (!leads?.length) return { sent: 0, failed: 0, total: 0 };

    // Campaign names make the tags readable inside Mailchimp.
    const campaignIds = [
      ...new Set(leads.map((l) => l.campaign_id as string | null).filter(Boolean) as string[]),
    ];
    const names = new Map<string, string>();
    if (campaignIds.length) {
      const { data: cs } = await supabase
        .from("campaigns")
        .select("id, campaign_title")
        .in("id", campaignIds);
      for (const c of cs ?? []) names.set(c.id as string, (c.campaign_title as string) ?? "");
    }

    const audienceId = await getPrimaryAudienceId(creds);
    let sent = 0;
    let failed = 0;

    for (const lead of leads) {
      const tag =
        names.get((lead.campaign_id as string | null) ?? "") ||
        titles.get(lead.page_id as string) ||
        "Haaylo";
      try {
        await upsertSubscriber(creds, audienceId, {
          email: lead.email as string,
          firstName: lead.first_name as string | null,
          lastName: lead.last_name as string | null,
          tags: ["Haaylo", tag],
        });
        await supabase
          .from("landing_page_leads")
          .update({ synced_at: new Date().toISOString(), sync_error: null })
          .eq("id", lead.id as string);
        sent += 1;
      } catch (e) {
        failed += 1;
        const msg = e instanceof Error ? e.message : "Could not add this lead to the email list.";
        await supabase
          .from("landing_page_leads")
          .update({ sync_error: msg.slice(0, 400) })
          .eq("id", lead.id as string);
        // A rejected key won't get better on the next lead.
        if (/rejected your API key/i.test(msg)) throw new Error(msg);
      }
    }

    return { sent, failed, total: leads.length };
  });

/** Counts what's still waiting to reach the list, for the funnel page. */
export const getLeadSyncStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ campaignId: z.string().uuid().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: settings } = await supabase
      .from("mailchimp_settings")
      .select("mailchimp_api_key")
      .eq("user_id", userId)
      .maybeSingle();
    const connected = !!(settings?.mailchimp_api_key as string | null)?.trim();

    let pageQuery = supabase.from("landing_pages").select("id").eq("user_id", userId);
    if (data.campaignId) pageQuery = pageQuery.eq("campaign_id", data.campaignId);
    const { data: pages } = await pageQuery;
    const ids = (pages ?? []).map((p) => p.id as string);
    if (!ids.length) return { connected, pending: 0, synced: 0 };

    const [{ count: pending }, { count: synced }] = await Promise.all([
      supabase
        .from("landing_page_leads")
        .select("id", { count: "exact", head: true })
        .in("page_id", ids)
        .is("synced_at", null),
      supabase
        .from("landing_page_leads")
        .select("id", { count: "exact", head: true })
        .in("page_id", ids)
        .not("synced_at", "is", null),
    ]);

    return { connected, pending: pending ?? 0, synced: synced ?? 0 };
  });
