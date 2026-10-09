// Server-only lead automation engine: keyword matching, Meta Graph sends,
// capture persistence. Never import this from client-reachable modules.
import { decryptToken } from "@/lib/scheduler-crypto.server";

const GRAPH = "https://graph.facebook.com/v21.0";

/** Permissions Meta requires before we may reply publicly or DM a commenter. */
export const REQUIRED_SEND_SCOPES = [
  "instagram_manage_comments",
  "instagram_manage_messages",
  "pages_manage_engagement",
] as const;

export function missingSendScopes(scopes: string | null | undefined): string[] {
  const granted = (scopes ?? "").split(/[,\s]+/).filter(Boolean);
  return REQUIRED_SEND_SCOPES.filter((s) => !granted.includes(s));
}

export type AutomationRow = {
  id: string;
  user_id: string;
  connection_id: string | null;
  scope: string;
  target_post_ids: string[];
  keywords: string[];
  match_mode: string;
  comment_reply_variants: string[];
  dm_message: string;
  followup_message?: string | null;
  followup_delay_hours?: number;
  handoff_email?: string | null;
  handoff_enabled?: boolean;
  handoff_delay_hours?: number;
  dedupe_per_person: boolean;
  ignore_handles: string[];
  active: boolean;
};

/** Returns the keyword that matched, or null. */
export function matchKeyword(
  text: string,
  keywords: string[],
  mode: string,
): string | null {
  const haystack = (text ?? "").toLowerCase();
  for (const raw of keywords) {
    const kw = raw.trim().toLowerCase();
    if (!kw) continue;
    if (mode === "exact") {
      const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(kw)}([^\\p{L}\\p{N}]|$)`, "u");
      if (re.test(haystack)) return raw.trim();
    } else if (haystack.includes(kw)) {
      return raw.trim();
    }
  }
  return null;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function pickVariant(variants: string[]): string | null {
  const clean = variants.map((v) => v.trim()).filter(Boolean);
  if (!clean.length) return null;
  return clean[Math.floor(Math.random() * clean.length)] ?? null;
}

/** Does this rule apply to the post the comment sits on? */
export function ruleAppliesToPost(rule: AutomationRow, postId: string | null): boolean {
  if (rule.scope !== "specific") return true;
  if (!postId) return false;
  return rule.target_post_ids.includes(postId);
}

export function isIgnored(rule: AutomationRow, handle: string | null): boolean {
  if (!handle) return false;
  const h = handle.replace(/^@/, "").toLowerCase();
  return rule.ignore_handles.some((x) => x.replace(/^@/, "").trim().toLowerCase() === h);
}

async function graph(
  path: string,
  token: string,
  init?: { method?: string; body?: Record<string, unknown> },
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const url = `${GRAPH}${path}`;
  const res = await fetch(url, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
  });
  const text = await res.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { ok: res.ok, status: res.status, body };
}

export function tokenFor(connection: { access_token_enc: string }): string {
  return decryptToken(connection.access_token_enc);
}

/** Public reply on the comment thread. */
export async function replyToComment(
  token: string,
  commentId: string,
  message: string,
): Promise<{ ok: boolean; error?: string }> {
  const r = await graph(`/${commentId}/replies`, token, {
    method: "POST",
    body: { message },
  });
  if (r.ok) return { ok: true };
  return { ok: false, error: describeGraphError(r.body, r.status) };
}

/**
 * Private reply — the DM sent in response to a comment.
 * Meta only allows this within 7 days of the comment.
 */
export async function privateReply(
  token: string,
  pageOrIgUserId: string,
  commentId: string,
  message: string,
): Promise<{ ok: boolean; error?: string }> {
  const r = await graph(`/${pageOrIgUserId}/messages`, token, {
    method: "POST",
    body: { recipient: { comment_id: commentId }, message: { text: message } },
  });
  if (r.ok) return { ok: true };
  return { ok: false, error: describeGraphError(r.body, r.status) };
}

/** Recent comments on an account's media — the sweep fallback for missed webhooks. */
export async function recentComments(
  token: string,
  accountId: string,
  provider: string,
): Promise<Array<{
  commentId: string;
  postId: string;
  text: string;
  fromId: string | null;
  fromName: string | null;
  createdAt: string | null;
  permalink: string | null;
}>> {
  const edge = provider === "instagram" ? "media" : "posts";
  const fields =
    provider === "instagram"
      ? "id,permalink,comments{id,text,timestamp,username,from}"
      : "id,permalink_url,comments{id,message,created_time,from}";
  const r = await graph(`/${accountId}/${edge}?limit=10&fields=${encodeURIComponent(fields)}`, token);
  if (!r.ok) return [];
  const data = (r.body as { data?: unknown[] } | null)?.data ?? [];
  const out: Array<{
    commentId: string; postId: string; text: string;
    fromId: string | null; fromName: string | null;
    createdAt: string | null; permalink: string | null;
  }> = [];
  for (const mRaw of data) {
    const m = (mRaw ?? {}) as Record<string, unknown>;
    const postId = String(m["id"] ?? "");
    const permalink = (m["permalink"] as string) ?? (m["permalink_url"] as string) ?? null;
    const comments = ((m["comments"] as { data?: unknown[] } | undefined)?.data ?? []) as unknown[];
    for (const cRaw of comments) {
      const c = (cRaw ?? {}) as Record<string, unknown>;
      const from = (c["from"] ?? {}) as Record<string, unknown>;
      out.push({
        commentId: String(c["id"] ?? ""),
        postId,
        text: String(c["text"] ?? c["message"] ?? ""),
        fromId: (from["id"] as string) ?? null,
        fromName: (c["username"] as string) ?? (from["name"] as string) ?? (from["username"] as string) ?? null,
        createdAt: (c["timestamp"] as string) ?? (c["created_time"] as string) ?? null,
        permalink,
      });
    }
  }
  return out.filter((c) => c.commentId);
}

function describeGraphError(body: unknown, status: number): string {
  const err = ((body ?? {}) as { error?: { message?: string; code?: number } }).error;
  if (err?.message) return `${err.message}${err.code ? ` (code ${err.code})` : ""}`;
  return `Meta returned ${status}`;
}

export type IncomingComment = {
  platform: string;
  commentId: string;
  postId: string | null;
  postPermalink: string | null;
  text: string;
  fromId: string | null;
  fromName: string | null;
  fromHandle: string | null;
  avatarUrl: string | null;
};

type AdminClient = Awaited<
  typeof import("@/integrations/supabase/client.server")
>["supabaseAdmin"];

/**
 * Core pipeline: match a comment against the user's rules, store the lead,
 * then attempt the public reply and the DM when Meta permissions allow it.
 * Sending failures never lose the lead — the capture row is written first.
 */
export async function processComment(
  admin: AdminClient,
  comment: IncomingComment,
  connection: {
    id: string; user_id: string; provider: string; external_id: string;
    access_token_enc: string; scopes: string | null;
  },
): Promise<{ captured: boolean; reason?: string }> {
  const { data: rules } = await admin
    .from("lead_automations")
    .select("*")
    .eq("user_id", connection.user_id)
    .eq("active", true);

  const candidates = ((rules ?? []) as AutomationRow[]).filter(
    (r) =>
      (!r.connection_id || r.connection_id === connection.id) &&
      ruleAppliesToPost(r, comment.postId),
  );

  for (const rule of candidates) {
    const matched = matchKeyword(comment.text, rule.keywords, rule.match_mode);
    if (!matched) continue;
    if (isIgnored(rule, comment.fromHandle)) continue;

    if (rule.dedupe_per_person && comment.fromId) {
      const { data: seen } = await admin
        .from("lead_captures")
        .select("id")
        .eq("automation_id", rule.id)
        .eq("commenter_external_id", comment.fromId)
        .limit(1)
        .maybeSingle();
      if (seen) return { captured: false, reason: "duplicate person" };
    }

    const sendBlocked = missingSendScopes(connection.scopes);
    const pending = sendBlocked.length > 0 ? "blocked" : "pending";

    const { data: capture, error } = await admin
      .from("lead_captures")
      .upsert(
        {
          user_id: connection.user_id,
          automation_id: rule.id,
          platform: comment.platform,
          external_comment_id: comment.commentId,
          commenter_external_id: comment.fromId,
          commenter_name: comment.fromName,
          commenter_handle: comment.fromHandle,
          avatar_url: comment.avatarUrl,
          comment_text: comment.text.slice(0, 4000),
          post_external_id: comment.postId,
          post_permalink: comment.postPermalink,
          matched_keyword: matched,
          reply_status: pending,
          dm_status: pending,
          followup_status: (rule.followup_message ?? "").trim() ? pending : "skipped",
          handoff_status: rule.handoff_enabled && (rule.handoff_email ?? "").trim() ? "pending" : "skipped",
        },
        { onConflict: "platform,external_comment_id", ignoreDuplicates: true },
      )
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("[leads] capture insert failed", error.message);
      return { captured: false, reason: error.message };
    }
    if (!capture) return { captured: false, reason: "already captured" };

    if (sendBlocked.length) {
      await admin.from("lead_automation_events").insert({
        user_id: connection.user_id,
        capture_id: capture.id,
        automation_id: rule.id,
        kind: "send_blocked",
        ok: false,
        detail: `Awaiting Meta permissions: ${sendBlocked.join(", ")}`,
      });
      return { captured: true };
    }

    await runSends(admin, {
      captureId: capture.id,
      rule,
      connection,
      commentId: comment.commentId,
    });
    return { captured: true };
  }

  return { captured: false, reason: "no rule matched" };
}

/** Attempt the public reply and DM for a capture, recording each outcome. */
export async function runSends(
  admin: AdminClient,
  args: {
    captureId: string;
    rule: AutomationRow;
    connection: { user_id: string; external_id: string; access_token_enc: string };
    commentId: string;
  },
): Promise<void> {
  const { captureId, rule, connection, commentId } = args;
  let token: string;
  try {
    token = tokenFor(connection);
  } catch (err) {
    await admin.from("lead_captures").update({
      reply_status: "failed",
      dm_status: "failed",
      last_error: "Could not read the account token. Reconnect the account.",
    }).eq("id", captureId);
    console.error("[leads] token decrypt failed", err);
    return;
  }

  const patch: {
    reply_status?: string;
    dm_status?: string;
    last_error?: string;
  } = {};

  const replyText = pickVariant(rule.comment_reply_variants);
  if (replyText) {
    const r = await replyToComment(token, commentId, replyText);
    patch.reply_status = r.ok ? "sent" : "failed";
    if (!r.ok) patch.last_error = r.error ?? "Reply failed";
    await admin.from("lead_automation_events").insert({
      user_id: connection.user_id, capture_id: captureId, automation_id: rule.id,
      kind: "comment_reply", ok: r.ok, detail: r.ok ? replyText : (r.error ?? null),
    });
  } else {
    patch.reply_status = "skipped";
  }

  const dm = rule.dm_message.trim();
  if (dm) {
    const r = await privateReply(token, connection.external_id, commentId, dm);
    patch.dm_status = r.ok ? "sent" : "failed";
    if (!r.ok) patch.last_error = r.error ?? "DM failed";
    await admin.from("lead_automation_events").insert({
      user_id: connection.user_id, capture_id: captureId, automation_id: rule.id,
      kind: "dm", ok: r.ok, detail: r.ok ? "DM sent" : (r.error ?? null),
    });
  } else {
    patch.dm_status = "skipped";
  }

  await admin.from("lead_captures").update(patch).eq("id", captureId);
}


/**
 * Nurture sequence sweeper: sends the timed follow-up DM, then hands the lead
 * over by email once its delay has passed. Safe to run repeatedly — every step
 * flips the capture's status so it is only ever attempted once.
 */
export async function runNurtureQueue(admin: AdminClient): Promise<{ followups: number; handoffs: number }> {
  const now = Date.now();
  let followups = 0;
  let handoffs = 0;

  const { data: dueFollowups } = await admin
    .from("lead_captures")
    .select("id, user_id, automation_id, external_comment_id, created_at, commenter_name")
    .eq("followup_status", "pending")
    .order("created_at", { ascending: true })
    .limit(100);

  for (const capture of dueFollowups ?? []) {
    if (!capture.automation_id) continue;
    const { data: rule } = await admin
      .from("lead_automations")
      .select("*")
      .eq("id", capture.automation_id)
      .maybeSingle();
    const typed = rule as AutomationRow | null;
    const message = (typed?.followup_message ?? "").trim();
    if (!typed || !typed.active || !message) {
      await admin.from("lead_captures").update({ followup_status: "skipped" }).eq("id", capture.id);
      continue;
    }
    const dueAt = new Date(capture.created_at).getTime() + (typed.followup_delay_hours ?? 24) * 3600_000;
    if (dueAt > now) continue;

    const { data: connection } = typed.connection_id
      ? await admin
          .from("social_connections")
          .select("user_id, external_id, access_token_enc, scopes")
          .eq("id", typed.connection_id)
          .maybeSingle()
      : { data: null };

    if (!connection || !capture.external_comment_id) {
      await admin.from("lead_captures").update({ followup_status: "failed", last_error: "No connected account for the follow-up." }).eq("id", capture.id);
      continue;
    }
    if (missingSendScopes(connection.scopes).length) {
      await admin.from("lead_captures").update({ followup_status: "blocked" }).eq("id", capture.id);
      continue;
    }

    let sent = { ok: false, error: "Could not read the account token." } as { ok: boolean; error?: string };
    try {
      sent = await privateReply(tokenFor(connection), connection.external_id, capture.external_comment_id, message);
    } catch { /* token failure falls through as a failed send */ }

    await admin.from("lead_captures").update({
      followup_status: sent.ok ? "sent" : "failed",
      ...(sent.ok ? {} : { last_error: sent.error ?? "Follow-up failed" }),
    }).eq("id", capture.id);
    await admin.from("lead_automation_events").insert({
      user_id: capture.user_id, capture_id: capture.id, automation_id: typed.id,
      kind: "followup", ok: sent.ok, detail: sent.ok ? "Follow-up sent" : (sent.error ?? null),
    });
    if (sent.ok) followups += 1;
  }

  const { data: dueHandoffs } = await admin
    .from("lead_captures")
    .select("id, user_id, automation_id, created_at, commenter_name, commenter_handle, comment_text, matched_keyword, platform, post_permalink")
    .eq("handoff_status", "pending")
    .order("created_at", { ascending: true })
    .limit(100);

  for (const capture of dueHandoffs ?? []) {
    if (!capture.automation_id) continue;
    const { data: rule } = await admin
      .from("lead_automations")
      .select("*")
      .eq("id", capture.automation_id)
      .maybeSingle();
    const typed = rule as AutomationRow | null;
    const to = (typed?.handoff_email ?? "").trim();
    if (!typed || !typed.handoff_enabled || !to) {
      await admin.from("lead_captures").update({ handoff_status: "skipped" }).eq("id", capture.id);
      continue;
    }
    const dueAt = new Date(capture.created_at).getTime() + (typed.handoff_delay_hours ?? 0) * 3600_000;
    if (dueAt > now) continue;

    const who = capture.commenter_name || capture.commenter_handle || "Someone";
    const subject = `New lead: ${who}${capture.matched_keyword ? ` (${capture.matched_keyword})` : ""}`;
    const lines = [
      `${who} commented on your ${capture.platform.replace("_", " ")} post.`,
      capture.matched_keyword ? `Keyword: ${capture.matched_keyword}` : "",
      `Comment: ${(capture.comment_text ?? "").slice(0, 600)}`,
      capture.post_permalink ? `Post: ${capture.post_permalink}` : "",
      `They have had the welcome message and the follow-up. Over to you.`,
    ].filter(Boolean);
    const html = lines.map((l) => `<p style="margin:0 0 12px">${l.replace(/</g, "&lt;")}</p>`).join("");

    const messageId = `lead-handoff-${capture.id}`;
    const { sendLovableEmail, EmailAPIError } = await import("@lovable.dev/email-js");
    const apiKey = process.env["LOVABLE_API_KEY"];

    let error: { message: string } | null = null;
    let suppressed = false;
    if (!apiKey) {
      error = { message: "LOVABLE_API_KEY is not configured" };
    } else {
      try {
        await sendLovableEmail(
          {
            to,
            from: "Haaylo <noreply@haaylo.com>",
            sender_domain: "notify.haaylo.com",
            subject,
            html,
            text: lines.join("\n\n"),
            purpose: "transactional",
            label: "lead_handoff",
            idempotency_key: messageId,
          },
          { apiKey, sendUrl: process.env["LOVABLE_SEND_URL"] },
        );
      } catch (err) {
        if (err instanceof EmailAPIError && err.code === "recipient_suppressed") {
          suppressed = true;
        } else {
          error = { message: err instanceof Error ? err.message : String(err) };
        }
      }
    }

    const { error: logError } = await admin.from("email_send_log").insert({
      message_id: null,
      template_name: "lead_handoff",
      recipient_email: to,
      status: error ? "failed" : suppressed ? "suppressed" : "sent",
      metadata: { capture_id: capture.id },
      ...(error ? { error_message: error.message.slice(0, 1000) } : {}),
    });
    if (logError) console.error("[lead-handoff] send log write failed", logError.message);

    await admin.from("lead_captures").update({
      handoff_status: error ? "failed" : "sent",
      ...(error ? { last_error: error.message } : {}),
    }).eq("id", capture.id);
    await admin.from("lead_automation_events").insert({
      user_id: capture.user_id, capture_id: capture.id, automation_id: typed.id,
      kind: "handoff_email", ok: !error, detail: error ? error.message : to,
    });
    if (!error) handoffs += 1;
  }

  return { followups, handoffs };
}
