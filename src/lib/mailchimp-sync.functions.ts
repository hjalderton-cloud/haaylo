import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const syncInput = z.object({
  subject: z.string().trim().min(1).max(150).default("Your nurture sequence"),
  /** Plain text (or HTML) body of the sequence to push into the campaign. */
  body: z.string().trim().min(20).max(200_000),
});

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function toHtml(body: string) {
  if (/<\/(p|div|table|body|h1|h2)>/i.test(body)) return body;
  const blocks = escapeHtml(body)
    .split(/\n{2,}/)
    .map((b) => `<p style="margin:0 0 16px;line-height:1.6">${b.replace(/\n/g, "<br/>")}</p>`)
    .join("");
  return `<div style="font-family:Helvetica,Arial,sans-serif;font-size:16px;color:#141B3D;max-width:600px;margin:0 auto;padding:24px">${blocks}</div>`;
}

async function mcFetch(
  prefix: string,
  key: string,
  path: string,
  init?: { method?: string; body?: unknown },
) {
  const res = await fetch(`https://${prefix}.api.mailchimp.com/3.0${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Basic ${btoa(`anystring:${key}`)}`,
      "Content-Type": "application/json",
    },
    ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON error body */
  }
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error("Mailchimp rejected your API key. Check the key and server prefix on your Account page.");
    }
    const detail = json?.detail || json?.title || text.slice(0, 200) || `HTTP ${res.status}`;
    throw new Error(`Mailchimp: ${detail}`);
  }
  return json;
}

export const syncSequenceToMailchimp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => syncInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: settings } = await supabase
      .from("mailchimp_settings")
      .select("mailchimp_api_key, mailchimp_server_prefix")
      .eq("user_id", userId)
      .maybeSingle();

    const key = settings?.mailchimp_api_key?.trim();
    let prefix = settings?.mailchimp_server_prefix?.trim();
    if (!key) {
      throw new Error("No Mailchimp API key saved. Add one on your Account page first.");
    }
    if (!prefix && key.includes("-")) prefix = key.split("-").pop()!.trim();
    if (!prefix || !/^[a-z0-9]+$/i.test(prefix)) {
      throw new Error("Your Mailchimp server prefix is missing or invalid (it looks like 'us14').");
    }

    // Pick the first audience and reuse its campaign defaults.
    const lists = await mcFetch(prefix, key, "/lists?count=1");
    const list = lists?.lists?.[0];
    if (!list?.id) {
      throw new Error("No Mailchimp audience found. Create an audience in Mailchimp, then try again.");
    }

    const defaults = list.campaign_defaults ?? {};
    const campaign = await mcFetch(prefix, key, "/campaigns", {
      method: "POST",
      body: {
        type: "regular",
        recipients: { list_id: list.id },
        settings: {
          subject_line: data.subject,
          title: `Haaylo — ${data.subject}`.slice(0, 100),
          from_name: defaults.from_name || "Haaylo",
          reply_to: defaults.from_email || "",
        },
      },
    });

    const campaignId = campaign?.id as string | undefined;
    if (!campaignId) throw new Error("Mailchimp did not return a campaign id.");

    await mcFetch(prefix, key, `/campaigns/${campaignId}/content`, {
      method: "PUT",
      body: { html: toHtml(data.body) },
    });

    return {
      ok: true as const,
      campaignId,
      audience: (list.name as string) ?? "your audience",
      webUrl: (campaign?.archive_url as string) ?? null,
    };
  });
