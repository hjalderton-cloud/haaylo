# Launch Readiness — Combined Audit & Fix Plan

Covers the scheduler audit, the homepage audit, and a full sweep of the app. Everything below was verified against the live database, the secrets store, and the code.

---

## Launch blockers (fix before going live)

### 1. Anonymous sign-in is creating a junk account for every visitor

**629 of your 637 user accounts are anonymous.** Only 8 are real, confirmed users. The Scheduler (`src/routes/scheduler.tsx:128-136`) and the Engine silently call `signInAnonymously()` for anyone who lands on the page, and each one creates a permanent auth user plus a `profiles` and `engine_usage` row. That's why you have 637 profiles but only 3 users who have ever generated anything.

Consequences: your user numbers are meaningless, free-generation limits are trivially reset by clearing cookies, and the database fills with dead rows.

**Fix**: remove the anonymous sign-in fallback. Send signed-out visitors to `/auth` like every other gated page. Then clean up the orphaned anonymous accounts.

### 2. The Scheduler paywall is switched off

`src/routes/scheduler.tsx:85` reads `const locked = false; // TEMP: gate disabled for testing`. That single flag drives every gate in the file — the subscribe banner, the composer, and the connections tab. There is also **no server-side backstop**: the server functions in `src/lib/scheduler.functions.ts` only check that the user is signed in, never that they've paid.

Result: anyone can connect a social account and publish posts for free. There are currently **0 rows in `subscriptions`** — nobody has ever paid.

**Fix**: restore the real subscription check in the UI *and* add a subscription check inside the scheduler server functions so the gate can't be bypassed by calling the API directly.

### 3. Scheduler sits outside the auth gate

`src/routes/scheduler.tsx` is a top-level route, not under `_authenticated/`. It rolls its own auth instead of using the shared gate in `src/routes/_authenticated/route.tsx`. Combined with blockers 1 and 2, an unauthenticated stranger gets the full planner.

**Fix**: move it under `_authenticated/` and delete the ad-hoc auth code.

### 4. Meta (Facebook / Instagram) cannot connect

The OAuth redirect is hard-pinned to `https://haaylo.com/api/public/oauth/callback` (`src/lib/scheduler.functions.ts:8-20`). The secrets `META_APP_ID` and `META_APP_SECRET` **are** configured, so the credentials aren't the problem. Two real causes:

1. Connecting from the preview domain always sends Meta a redirect URI it doesn't recognise → the "Can't load URL" error. Connecting only ever works on `haaylo.com`.
2. Even on the live domain, Meta refuses unless the app is in **Live** mode with `pages_manage_posts`, `instagram_content_publish`, `pages_show_list` and `instagram_basic` approved via App Review, and the user administers a Facebook Page linked to an Instagram Business account.

There are **zero Meta connections in the database** — it has never once succeeded.

To be clear about the mobile idea: posting from the user's phone doesn't bypass this. The OAuth handshake and the publish call both happen on our server, not on their device. What genuinely works is **manual posting** — we produce the schedule and the caption, they post from their phone. See the Manual Mode plan below.

### 5. OAuth state signing degrades silently without a key

In `src/lib/scheduler-crypto.server.ts`, `getKey()` throws loudly when `TOKEN_ENCRYPTION_KEY` is missing, but `signState`/`verifyState` (lines 44-56) fall back to `?? ""` — signing OAuth state with an empty key instead of failing. The secret *is* set today, so this isn't live-broken, but it's a silent security hole waiting for a misconfigured deploy.

**Fix**: make sign/verify throw the same way encrypt/decrypt does.

---

## Should-fix before launch

### 6. Grey out Analytics

Analytics can't do what it implies. LinkedIn returns "not available" because we never request the `r_organization_social` / `rw_organization_admin` scopes. Google Analytics is an unimplemented stub. The Meta pull works but only on a manual button press — nothing runs on a schedule, and Meta tokens expire.

**Fix**: present Analytics as "Coming soon", keep the connect-account affordance, and remove the metrics dashboard until daily sync and the LinkedIn scopes exist.

### 7. Dead iframe message

`public/engine/index.html:1193` posts `engine:goto`, which `src/routes/engine.tsx` never handles. Whatever button triggers it does nothing. Either handle it or route it through the existing `engine:navigate`.

### 8. Missing page metadata

`src/routes/_authenticated/director.tsx` — your main post-login dashboard — has no `head()`, so it inherits the generic root title and OG tags.

### 9. Email queue is half-stuck

`email_send_log` shows 9 `sent` and **9 stuck at `pending`** for `waitlist-welcome`, plus 1 `bounced`. Roughly half your waitlist welcomes never went out, even though all 8 signups are flagged `notified`. Worth investigating the queue processor before you drive real signup volume.

### 10. Security scan — email table policies

Three tables (`email_send_log`, `email_send_state`, `email_unsubscribe_tokens`) have policies on the `public` role relying on `auth.role() = 'service_role'`, which reaches `anon`. Rescope them to `TO service_role`.

### 11. Stripe price IDs are missing

`STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are set, but `STRIPE_ENGINE_PRICE_ID`, `STRIPE_STARTER_PRICE_ID`, `STRIPE_EXPERT_PRICE_ID` and `STRIPE_FOUNDING_YEARLY_PRICE_ID` are **not**. Checkout still works because the code falls back to inline `price_data` (`create-engine-payment/index.ts:97`), but that creates a throwaway price per checkout instead of a proper Stripe product — so reporting, plan changes, and the billing portal all get messier. Create the four prices in Stripe and set the secrets.

### 12. You're selling features that don't exist

`src/routes/pricing.tsx:91-94` sells "Image Generation (50 images/month once live)" inside the paid Expert tier, and an "Agency plan — Coming soon". Taking money for unshipped features is a refund and trust risk. Either remove them from paid tiers or clearly mark them as roadmap, not entitlements.

---

## Scheduler — what to actually build

**Auto mode (LinkedIn)** — this genuinely works. 5 active connections, 1 post published cleanly, and the cron publisher has run 62,188 times with zero failures. Leave it alone.

**Manual mode (Instagram / Facebook / TikTok)** — the calendar still plans the post, but marks the slot "Post manually" and gives the user everything they need on their phone:
- One-tap copy of caption + hashtags
- Download the image
- Per-post `.ics` reminder
- Whole month exported as `.ics`, `.csv`, and a printable PDF

Label Instagram/Facebook "Manual for now — auto-posting once Meta approves the app" instead of showing a connect button that always fails.

**Calendar improvements**
1. Monthly view as the default, colour-coded by content pillar to match the 90-day plan, so the two screens read as one system.
2. Pillar and platform filters, plus a month/quarter toggle to see all 90 days.
3. Month export: CSV, ICS, printable PDF.
4. Plain-English connect errors instead of raw codes.
5. A preview-domain guard that explains connecting must happen on the live site, rather than dumping the user into a Meta error page.

---

## 90-day plan → posts → captions

The chain works but leaks at the joins:

- **The plan and the scheduler are bridged only through browser localStorage** (`ie-written-posts`). Nothing is stored server-side, so approved posts vanish on a different browser or device. This is the single biggest robustness gap in the content flow.
- There's no status chain — a post is either "written" or "scheduled". No Draft → Approved → Scheduled → Published, so the same content appears in the plan, the bank, and the calendar with no shared source of truth.
- Captions carry no pillar or platform metadata into the calendar, which is exactly why the calendar can't colour-code by pillar today.
- If the user closes the tab mid-flow, the draft spec handed to the Content module is orphaned.

**Fix**: one database record per generated post with `pillar`, `platform`, `status`, `scheduled_at` and `caption`. The plan, the bank, and the calendar then become three views of one list.

---

## Homepage — "What you get" boxes

The section at `src/routes/index.tsx:285-356` renders 7 cards in a `repeat(auto-fit, minmax(240px, 1fr))` grid with only a 14px gap — a dense 4-then-3 wall with an orphaned bottom row. Each card stacks four competing accents: an emoji, a gradient fill, a purple border, and an uppercase yellow title. Multiplied across 7 tiles, that's what makes it feel like overkill, and it's far louder than the calm Business Brain card directly above it.

**Soften it, keep all 7 benefits:**
1. Larger gap (24-28px) and more internal padding; balance the rows so nothing is orphaned.
2. Drop the solid purple border — use a faint hairline or go borderless with a barely-there tint.
3. Drop uppercase yellow titles; sentence case in soft off-white, with the icon as the only colour accent.
4. Remove the gradient fill; flat near-transparent surface so cards float rather than shout.
5. Optional gentle hover lift so they feel tactile without being heavy at rest.

---

## Verified healthy — no action needed

- The cron publisher: 62,188 consecutive successful runs, most recent this morning.
- LinkedIn OAuth and publishing.
- Engine generation limits are enforced **server-side** in `engine-ai` (402/429 on exhaustion), not just in the UI.
- No dead links anywhere in the app; the deleted `/orchestrator` route left no references behind.
- The `/auth` redirect handling correctly validates same-origin and avoids loops.
- Stripe checkout → webhook → database is wired end to end.

---

## Suggested order

**Phase 1 — Blockers**
1. Remove anonymous sign-in; gate Scheduler under `_authenticated`
2. Restore the Scheduler paywall, client and server
3. Fix silent OAuth state signing
4. Clean up the 629 orphaned anonymous accounts

**Phase 2 — Honesty & polish**
5. Manual mode + honest Meta messaging
6. Grey out Analytics
7. Soften the homepage boxes
8. Remove unshipped features from paid tiers
9. Add `head()` to the dashboard; fix the dead `engine:goto` message

**Phase 3 — Robustness**
10. Move written posts into the database with a proper status lifecycle
11. Monthly pillar-coloured calendar + CSV/ICS/PDF export
12. Fix the stuck email queue; rescope the email table policies; create real Stripe prices

**Phase 4 — After launch**
13. Meta auto-posting once App Review passes
14. Daily analytics sync + LinkedIn analytics scopes

---

## Technical notes

- Phase 1 touches `src/routes/scheduler.tsx` (auth + gate), `src/lib/scheduler.functions.ts` (server-side subscription check), `src/lib/scheduler-crypto.server.ts` (throw on missing key), and a route move into `src/routes/_authenticated/`.
- Deleting anonymous users must cascade through `profiles`, `projects`, and `engine_usage`; do it as a single migration with a `WHERE is_anonymous` filter and verify the count first.
- Phase 3 needs a new `content_posts` table with RLS and grants, plus a one-time import of existing `ie-written-posts` from localStorage on first load.
- Homepage changes are confined to `src/routes/index.tsx:311-355`.
- No change needed to the cron publisher — it is healthy.
