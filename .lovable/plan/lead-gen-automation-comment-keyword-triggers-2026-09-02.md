# Lead Gen Automation — comment keyword triggers

Set a keyword on a post ("GUIDE", "WAITLIST"). When someone comments it, Haaylo captures them as a lead, replies publicly, and sends the DM with the link — all automatic.

## What you get

**1. Automations page (under Publish)**
- List of your rules, each with: name, keyword(s), which connected account it watches, which post(s) it applies to (a specific post, or all posts on that account), and on/off toggle.
- Live counter of leads captured per rule.

**2. Rule editor**
- Keyword(s), plus match mode: exact word or "contains".
- Public comment reply — a short line ("Just sent it over ✉️"). AI suggests three options written in your Brain's voice; you can edit or write your own. Optional spintax-style variants so replies don't look robotic.
- DM message — the delivery message with your link. Same AI-suggested-then-editable treatment.
- Optional follow-up DM after 24h if they don't reply.
- Reply-once-per-person guard, and an ignore list (your own account, team accounts).

**3. Leads inbox**
- Every capture: name/handle, avatar, platform, the comment text, the post it came from, timestamp, and status (replied / DM sent / DM failed / manual).
- Search, filter by rule, export CSV.
- Optional email digest to you when leads land.

**4. Homepage + dashboard tie-in**
- "X new leads today" on the logged-in home, linking through to the inbox.

## Platform reality — read this bit

- **Instagram and Facebook**: fully supported for comment triggers, public replies and DMs, but Meta requires the extra permissions `instagram_manage_comments`, `instagram_manage_messages` and `pages_manage_engagement`, which go through Meta app review. Until that's approved the rules will run in **capture-and-notify mode**: the comment is caught and logged as a lead, and you get notified, but the auto reply/DM stays queued. The moment review passes, the same rules start sending with no rebuild. I'll build a clear banner explaining exactly which permission is missing.
- **LinkedIn**: no public API for reading post comments or sending DMs. LinkedIn rules will be capture-only via manual/CSV import, or left out — I'd suggest leaving it out and marking it "not available via LinkedIn's API" rather than faking it.
- **TikTok and YouTube**: comment APIs exist but need their own app approvals; out of scope for now, shown as coming soon.

So: the engine, rules, inbox and AI reply writing all get built now and work end to end. Live Meta sending switches on with permission approval.

## Technical detail

**Database (one migration, with GRANTs and RLS scoped to `auth.uid()`):**
- `lead_automations` — user_id, project_id, name, connection_id → `social_connections`, scope (`all_posts` | `specific`), target post refs, keywords text[], match_mode, comment_reply_variants text[], dm_message, followup_message, followup_delay_hours, dedupe_per_person bool, active bool.
- `lead_captures` — automation_id, user_id, platform, external_comment_id (unique, for idempotency), commenter_external_id, commenter_name, commenter_handle, avatar_url, comment_text, post_external_id, matched_keyword, reply_status, dm_status, last_error, created_at.
- `lead_automation_events` — audit trail of each send attempt for debugging.

**Ingestion:**
- `src/routes/api/public/webhooks/meta.ts` — Meta Graph webhook for `comments` on Instagram/Facebook. Verifies `X-Hub-Signature-256` HMAC against `META_APP_SECRET` before touching the payload, handles the GET verify challenge, dedupes on comment id.
- `src/routes/api/public/cron/lead-sweep.ts` — pg_cron every 5 minutes as a backstop, pulls recent comments via Graph API for connected accounts and fills any webhook gaps. Also drives the 24h follow-up queue.

**Sending:**
- `src/lib/leads.server.ts` — Graph API calls for reply-to-comment and private-reply-to-comment (the private reply window is 7 days from the comment; the code respects it and marks anything outside as expired). Tokens decrypted with the existing `TOKEN_ENCRYPTION_KEY` helper in `scheduler-crypto.server.ts`.
- `src/lib/leads.functions.ts` — authenticated server functions for CRUD on rules, listing captures, CSV export, and manual retry.

**AI reply suggestions:**
- Server function using Lovable AI (Gemini 3.7 Flash) reading the project's Brain (voice, offer, caption-to-CTA bridge) to draft three reply lines and a DM. Runs through the existing UK-English and banned-phrasing guards.

**UI:**
- `src/routes/_authenticated/automations.tsx` (rules + editor) and `src/routes/_authenticated/leads.tsx` (inbox), both added to the Publish group in `src/components/WorkflowNav.tsx`.
- Calendar post editor gains a small "Lead capture" section so a keyword can be attached while writing the post.

**Gating:** lead automation sits behind membership, consistent with the other Pro surfaces.
