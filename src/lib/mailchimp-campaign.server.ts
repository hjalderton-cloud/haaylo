/**
 * Server-only helpers for putting a generated email into the owner's Mailchimp
 * account as a campaign and booking its send time. Reuses the same stored key
 * as the lead sync.
 */
import type { MailchimpCreds } from "./mailchimp-leads.server";

async function mcFetch(
  creds: MailchimpCreds,
  path: string,
  init?: { method?: string; body?: unknown },
) {
  const res = await fetch(`https://${creds.prefix}.api.mailchimp.com/3.0${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Basic ${btoa(`anystring:${creds.key}`)}`,
      "Content-Type": "application/json",
    },
    ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* provider returned something that isn't JSON */
  }
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error("Mailchimp rejected your API key. Check it on your Account page.");
    }
    const j = json as { detail?: string; title?: string } | null;
    throw new Error(`Mailchimp: ${j?.detail || j?.title || text.slice(0, 200) || `HTTP ${res.status}`}`);
  }
  return json;
}

/** Plain-text body into the simple, responsive layout the preview shows. */
export function emailHtml(subject: string, body: string, brandColour = "#553EA2"): string {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#171D41;">${p
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/\n/g, "<br/>")}</p>`,
    )
    .join("");
  return `<!doctype html><html><body style="margin:0;background:#F6F7FA;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F7FA;padding:24px 0;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFFFF;border-radius:14px;padding:28px;font-family:Poppins,Helvetica,Arial,sans-serif;">
<tr><td style="border-top:4px solid ${brandColour};padding-bottom:18px;"></td></tr>
<tr><td><h1 style="margin:0 0 18px;font-size:21px;line-height:1.3;color:#171D41;">${subject
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")}</h1>${paragraphs}
<p style="margin:26px 0 0;font-size:12px;color:#7A7F9A;">*|UNSUB|*</p></td></tr>
</table></td></tr></table></body></html>`;
}

export type MailchimpSendResult = {
  campaignWebId: string | number | null;
  campaignId: string;
  scheduledAt: string | null;
};

/**
 * Creates the campaign, sets its content and, when a time is given, schedules
 * it. Mailchimp only accepts send times on a quarter hour.
 */
export async function createAndScheduleCampaign(
  creds: MailchimpCreds,
  args: {
    audienceId: string;
    subject: string;
    body: string;
    fromName: string;
    replyTo: string;
    title: string;
    scheduledAt: string | null;
    brandColour?: string;
  },
): Promise<MailchimpSendResult> {
  const created = (await mcFetch(creds, "/campaigns", {
    method: "POST",
    body: {
      type: "regular",
      recipients: { list_id: args.audienceId },
      settings: {
        subject_line: args.subject.slice(0, 150),
        title: args.title.slice(0, 100),
        from_name: args.fromName.slice(0, 100),
        reply_to: args.replyTo,
      },
    },
  })) as { id?: string; web_id?: number };

  const campaignId = created?.id;
  if (!campaignId) throw new Error("Mailchimp didn't return a campaign to work with.");

  await mcFetch(creds, `/campaigns/${campaignId}/content`, {
    method: "PUT",
    body: { html: emailHtml(args.subject, args.body, args.brandColour) },
  });

  let scheduledAt: string | null = null;
  if (args.scheduledAt) {
    const d = new Date(args.scheduledAt);
    d.setUTCSeconds(0, 0);
    d.setUTCMinutes(Math.ceil(d.getUTCMinutes() / 15) * 15 % 60);
    scheduledAt = d.toISOString();
    await mcFetch(creds, `/campaigns/${campaignId}/actions/schedule`, {
      method: "POST",
      body: { schedule_time: scheduledAt },
    });
  }

  return { campaignId, campaignWebId: created.web_id ?? null, scheduledAt };
}
