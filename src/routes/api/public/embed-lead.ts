import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
} as const;

const schema = z.object({
  slug: z.string().trim().min(1).max(80),
  firstName: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(255),
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

/**
 * Sign-ups from an embedded form on someone else's website. Saves into the
 * same lead table the hosted opt-in page uses, then pushes to the owner's
 * Mailchimp audience with the campaign tag applied automatically.
 */
export const Route = createFileRoute("/api/public/embed-lead")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        let input: z.infer<typeof schema>;
        try {
          input = schema.parse(await request.json());
        } catch {
          return json({ ok: false, error: "Please check your name and email." }, 400);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: page } = await supabaseAdmin
          .from("landing_pages")
          .select("id, title, slug, campaign_id, user_id")
          .eq("slug", input.slug)
          .maybeSingle();
        if (!page) return json({ ok: false, error: "This form is no longer active." }, 404);

        const campaignId = (page.campaign_id as string | null) ?? null;
        const { data: inserted, error } = await supabaseAdmin
          .from("landing_page_leads")
          .insert({
            page_id: page.id as string,
            first_name: input.firstName,
            email: input.email,
            campaign_id: campaignId,
            source_slug: (page.slug as string | null) ?? null,
            status: "new",
          })
          .select("id")
          .single();
        if (error || !inserted) return json({ ok: false, error: "Could not save that — try again." }, 500);

        try {
          const { getMailchimpCreds, getPrimaryAudienceId, upsertSubscriber } = await import(
            "@/lib/mailchimp-leads.server"
          );
          const creds = await getMailchimpCreds(supabaseAdmin, page.user_id as string);
          if (creds) {
            let tag = (page.title as string | null) ?? "Haaylo";
            if (campaignId) {
              const { data: c } = await supabaseAdmin
                .from("campaigns")
                .select("campaign_title")
                .eq("id", campaignId)
                .maybeSingle();
              tag = (c?.campaign_title as string | null)?.trim() || tag;
            }
            const audienceId = await getPrimaryAudienceId(creds);
            await upsertSubscriber(creds, audienceId, {
              email: input.email,
              firstName: input.firstName,
              tags: ["Haaylo", "Embed", tag],
            });
            await supabaseAdmin
              .from("landing_page_leads")
              .update({ synced_at: new Date().toISOString(), sync_error: null })
              .eq("id", inserted.id);
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Email list sync failed.";
          await supabaseAdmin
            .from("landing_page_leads")
            .update({ sync_error: msg.slice(0, 400) })
            .eq("id", inserted.id);
        }

        // Hand the guide over straight away, same as the hosted sign-up page,
        // but only when the campaign actually has guide content, otherwise the
        // lead would land on an empty "guide isn't available yet" page.
        let guideUrl: string | null = null;
        if (campaignId) {
          const { data: c } = await supabaseAdmin
            .from("campaigns")
            .select("lead_magnet_content, guide_sections")
            .eq("id", campaignId)
            .maybeSingle();
          const hasSections = Array.isArray(c?.guide_sections) && (c.guide_sections as unknown[]).length > 0;
          const hasMagnet =
            c?.lead_magnet_content != null &&
            (typeof c.lead_magnet_content === "string"
              ? c.lead_magnet_content.trim().length > 0
              : Array.isArray(c.lead_magnet_content)
                ? (c.lead_magnet_content as unknown[]).length > 0
                : Object.keys(c.lead_magnet_content as object).length > 0);
          if (hasSections || hasMagnet) guideUrl = `${new URL(request.url).origin}/guide/${campaignId}`;
        }
        return json({ ok: true, guideUrl });
      },
    },
  },
});
