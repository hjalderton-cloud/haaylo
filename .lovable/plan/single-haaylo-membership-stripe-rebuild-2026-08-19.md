# Single Haaylo Membership: Stripe rebuild

## What exists today (audit)

Conflicting logic I will replace — flagging before removal:

- **`engine_access` table + tier model** (`starter` / `pro` / `expert`, `founding_member`, `credits_limit`, `credits_used`, `comp_access`). This drives every gate in the app today. Keep the table and its rows (historic records), stop using it for new entitlement decisions.
- **`subscriptions` table** — currently only used for the separate "Scheduler" subscription. This is the table I will extend into the single membership record.
- **Edge functions**: `create-engine-payment` (tier→price map, inline `price_data` fallback), `verify-engine-payment`, `create-scheduler-subscription`, `create-billing-portal-session`, `stripe-webhook` (writes `engine_access` and `subscriptions`).
- **`src/lib/tier.ts` feature matrix + `TIER_GENERATION_LIMIT`** — per-tier feature booleans and 150/500/unlimited generation caps.
- **`engine-ai` credits gate** — refuses generation by tier rank and credit balance.
- **`src/routes/pricing.tsx`** — Starter/Pro/Expert cards + Agency card.
- **Brain lock screen** — "🔒 Pro plan required" in `brain.setup.tsx`.
- **Redemption codes** (`redeem_code`) grant comp access with a tier. I will keep these working, mapping any code to full membership access.
- **Free trial**: 5 free generations for `tier = none` (`engine_usage`). Kept as-is unless you say otherwise.

## Open questions (answer in feedback, or I use the defaults)

1. Generation caps: default is **unlimited generations for paid members** (no credit counter). Say if you want a cap.
2. Existing paying Pro/Starter/Expert customers: default is **grandfathered — they keep full access** while their Stripe subscription stays active; no forced migration.

## Database

New migration (additive, nothing dropped):

- Extend `public.subscriptions` with: `stripe_schedule_id`, `stripe_price_id`, `membership_type` (`founding_early` | `founding_launch` | `standard`), `current_period_start`, `founding_period_end`, `founding_renewal_reminder_sent_at`. Rename-free: existing `status`, `current_period_end`, `cancel_at_period_end`, `stripe_customer_id`, `stripe_subscription_id` are reused.
- New `public.stripe_webhook_events (event_id primary key, type, processed_at)` for idempotency.
- RLS: user can **read** only their own subscription row; no client insert/update/delete. All writes are service-role from the webhook.
- `public.has_membership(_user_id)` security-definer function returning true for `active` / `trialing` / `past_due`-within-grace, used by RLS and server entitlement checks.

## Edge functions

- **`create-checkout-session`** (JWT required): resolves the price purely from server UTC date — `< 2026-11-01` → early £49/yr, `2026-11-01…2026-12-31` → launch £99/yr, `≥ 2027-01-01` → standard £49/mo. Reuses an existing `stripe_customer_id` if stored, otherwise looks up by email then creates. Subscription-mode Stripe-hosted Checkout with `client_reference_id` + metadata (`user_id`, `membership_type`), success `/engine?checkout=success`, cancel `/pricing?canceled=1`.
- **`stripe-webhook`** (rewrite, `verify_jwt = false`): signature-verified, idempotent via `stripe_webhook_events`. Handles `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.paid`, `invoice.payment_failed`. On a founding checkout it creates a **subscription schedule** from the existing subscription: phase 1 = current annual price, 1 iteration, `start_date: now` from the live subscription (no new charge, no second subscription); phase 2 = standard monthly price, open-ended. Guarded by `stripe_schedule_id` already being set and by re-reading the subscription's `schedule` field, so retries are safe.
- **`create-customer-portal-session`** (JWT required): replaces `create-billing-portal-session`, returns portal URL for the caller's stored customer.

Old `create-engine-payment` / `verify-engine-payment` / `create-scheduler-subscription` stay deployed (so historic links don't 500) but nothing in the app calls them.

## App changes

- `src/lib/tier.ts` → membership model: `getMyMembership()` server fn reads `subscriptions` (falls back to legacy `engine_access` comp/paid rows so comped and existing customers keep access) and returns `{ member: boolean, membershipType, status, currentPeriodEnd, foundingPeriodEnd, cancelAtPeriodEnd }`. Feature matrix collapses to member / non-member; every currently live feature (Brain, Engine, Strategy, Planner, Content Bank, Radar, all formats) unlocks for any member. Analytics stays visible + "Coming soon".
- `engine-ai`: tier-rank and credit gates replaced by a single membership check plus the existing 5-free-generation trial.
- **Pricing page**: one membership card, copy and CTA driven by the current pricing stage, with the explicit "£X for your first 12 months, then £49/month" disclosure. Agency/Starter/Pro/Expert cards removed.
- **Brain lock screen**: "Unlock the full Haaylo experience" + dynamic price + "Join Haaylo" CTA → checkout.
- **Billing section** in account settings: membership name, status, founding rate, individual transition date, "Manage billing" → portal.
- **Payment-failure banner** (non-destructive) and **cancellation notice** ("Your membership will end on …") in the app shell.

## Renewal reminder

A `/api/public/cron/founding-renewal` route selects members whose `founding_period_end` is 6–8 days away with `founding_renewal_reminder_sent_at IS NULL`, sends a branded email through the project's existing transactional email pipeline (`src/lib/email-templates/*` + `/lovable/email/transactional/send`), and stamps the column. Scheduled with pg_cron daily. No new email provider needed — the existing pipeline is already configured.

## Secrets

Needed: `STRIPE_FOUNDING_EARLY_PRICE_ID`, `STRIPE_FOUNDING_LAUNCH_PRICE_ID`, `STRIPE_STANDARD_MONTHLY_PRICE_ID`. `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` already exist — confirm they are the **test-mode** values for end-to-end testing, since the price IDs you gave must live in the same mode as the secret key.

## Testing

Stripe test mode, driving the live preview: sign up → checkout → test card → return → assert `subscriptions` row has customer, subscription, schedule IDs and the two phases; replay the webhook twice to prove idempotency; verify Brain unlocks, portal opens, cancel-at-period-end keeps access, and failed payment shows the banner.
