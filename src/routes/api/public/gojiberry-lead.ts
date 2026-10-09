import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-haaylo-token, authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
} as const;

/** Gojiberry payloads vary by event; only the contact details are required. */
const schema = z.object({
  email: z.string().trim().email().max(255),
  firstName: z.string().trim().max(80).optional(),
  lastName: z.string().trim().max(80).optional(),
  company: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(60).optional(),
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

/** Reads the shared secret from a header, a bearer token or the query string. */
function tokenFrom(request: Request): string {
  const header = request.headers.get("x-haaylo-token");
  if (header) return header.trim();
  const auth = request.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return new URL(request.url).searchParams.get("token")?.trim() ?? "";
}

/** Accepts the loosest sensible shape Gojiberry might post. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalise(raw: any) {
  const c = raw?.contact ?? raw?.lead ?? raw?.data ?? raw ?? {};
  const full = typeof c.name === "string" ? c.name.trim() : "";
  const [first = "", ...rest] = full.split(/\s+/);
  return {
    email: c.email ?? c.email_address ?? raw?.email ?? "",
    firstName: c.firstName ?? c.first_name ?? (first || undefined),
    lastName: c.lastName ?? c.last_name ?? (rest.length ? rest.join(" ") : undefined),
    company: c.company ?? c.organisation ?? c.organization ?? undefined,
    phone: c.phone ?? c.phone_number ?? undefined,
  };
}

/**
 * Inbound contacts from a connected Gojiberry account. Only requests carrying
 * the workspace's secret are accepted. Contacts land in the Lead Tracker
 * tagged as coming from the Gojiberry Intent Agent, then sync to Mailchimp
 * exactly like a form sign-up.
 */
export const Route = createFileRoute("/api/public/gojiberry-lead")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const token = tokenFrom(request);
        if (!token || token.length < 20) return json({ ok: false, error: "Missing token." }, 401);

        let input: z.infer<typeof schema>;
        try {
          input = schema.parse(normalise(await request.json()));
        } catch {
          return json({ ok: false, error: "A valid email address is required." }, 400);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: hook } = await supabaseAdmin
          .from("inbound_webhook_tokens")
          .select("id, user_id, project_id, landing_page_id, platform")
          .eq("token", token)
          .eq("platform", "gojiberry")
          .maybeSingle();
        if (!hook?.landing_page_id) return json({ ok: false, error: "Unknown token." }, 401);

        const { data: inserted, error } = await supabaseAdmin
          .from("landing_page_leads")
          .insert({
            page_id: hook.landing_page_id as string,
            first_name: input.firstName ?? null,
            last_name: input.lastName ?? null,
            email: input.email,
            company: input.company ?? null,
            phone: input.phone ?? null,
            status: "new",
            source_platform: "Gojiberry Intent Agent",
          })
          .select("id")
          .single();
        if (error || !inserted) {
          return json({ ok: false, error: "Could not save that contact." }, 500);
        }

        try {
          const { getMailchimpCreds, getPrimaryAudienceId, upsertSubscriber } = await import(
            "@/lib/mailchimp-leads.server"
          );
          const creds = await getMailchimpCreds(supabaseAdmin, hook.user_id as string);
          if (creds) {
            const audienceId = await getPrimaryAudienceId(creds);
            await upsertSubscriber(creds, audienceId, {
              email: input.email,
              firstName: input.firstName ?? null,
              lastName: input.lastName ?? null,
              tags: ["Haaylo", "Gojiberry"],
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

        return json({ ok: true });
      },
    },
  },
});
