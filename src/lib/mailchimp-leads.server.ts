/**
 * Server-only helpers for pushing captured leads into the account owner's
 * Mailchimp audience. Kept apart from the campaign sync so a failure here can
 * never stop a sign-up from being saved.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type AnyClient = SupabaseClient<any, any, any>;

export type MailchimpCreds = { key: string; prefix: string };

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
      throw new Error(
        "Mailchimp rejected your API key. Check the key and server prefix on your Account page.",
      );
    }
    const j = json as { detail?: string; title?: string } | null;
    const detail = j?.detail || j?.title || text.slice(0, 200) || `HTTP ${res.status}`;
    throw new Error(`Mailchimp: ${detail}`);
  }
  return json;
}

/** Reads the owner's saved key, returning null when they haven't connected one. */
export async function getMailchimpCreds(
  supabase: AnyClient,
  userId: string,
): Promise<MailchimpCreds | null> {
  const { data } = await supabase
    .from("mailchimp_settings")
    .select("mailchimp_api_key, mailchimp_server_prefix")
    .eq("user_id", userId)
    .maybeSingle();

  const key = (data?.mailchimp_api_key as string | null)?.trim();
  if (!key) return null;
  let prefix = (data?.mailchimp_server_prefix as string | null)?.trim();
  if (!prefix && key.includes("-")) prefix = key.split("-").pop()!.trim();
  if (!prefix || !/^[a-z0-9]+$/i.test(prefix)) {
    throw new Error("Your Mailchimp server prefix is missing or invalid (it looks like 'us14').");
  }
  return { key, prefix };
}

/** The first audience on the account — what nearly everyone has. */
export async function getPrimaryAudienceId(creds: MailchimpCreds): Promise<string> {
  const lists = (await mcFetch(creds, "/lists?count=1&fields=lists.id,lists.name")) as {
    lists?: Array<{ id: string }>;
  };
  const id = lists?.lists?.[0]?.id;
  if (!id) throw new Error("There's no audience in your Mailchimp account yet — create one first.");
  return id;
}

async function md5Hex(value: string) {
  // Mailchimp keys members by the MD5 of the lowercased address.
  const { createHash } = await import("crypto");
  return createHash("md5").update(value.trim().toLowerCase()).digest("hex");
}

export type LeadForList = {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  tags?: string[];
};

/** Adds or updates one subscriber, then applies the campaign tag. */
export async function upsertSubscriber(
  creds: MailchimpCreds,
  audienceId: string,
  lead: LeadForList,
) {
  const hash = await md5Hex(lead.email);
  await mcFetch(creds, `/lists/${audienceId}/members/${hash}`, {
    method: "PUT",
    body: {
      email_address: lead.email,
      status_if_new: "subscribed",
      merge_fields: {
        ...(lead.firstName ? { FNAME: lead.firstName } : {}),
        ...(lead.lastName ? { LNAME: lead.lastName } : {}),
      },
    },
  });

  const tags = (lead.tags ?? []).filter(Boolean).slice(0, 5);
  if (tags.length) {
    await mcFetch(creds, `/lists/${audienceId}/members/${hash}/tags`, {
      method: "POST",
      body: { tags: tags.map((name) => ({ name, status: "active" })) },
    });
  }
}
