# Launch readiness — your 8 steps, checked

I verified each step against the live code, the database and the email/payment config. Here's where each one actually stands, then the short list of work to close the gaps.

## Step-by-step status

**1. User understands Haaylo within five seconds — OK**
Homepage hero, title and meta are in place ("Your whole marketing operation, in one place") with a single primary CTA.

**2. They choose the £49 founding-member offer — OK, untested**
Pricing page runs the single-membership model (Founding Early / Founding Launch / Standard monthly) and all three Stripe price IDs are configured as secrets, alongside the secret key and webhook secret.

**3. Stripe payment and account creation work — needs a live test**
The flow is wired correctly: signed-out users are sent to `/auth` first, then checkout opens in subscription mode, returning to `/engine?checkout=success`. The webhook handles checkout completion, subscription created/updated/deleted, and invoice succeeded/failed.
Gap: `subscriptions` has **0 rows** and `engine_access` has **1** — no real checkout has ever completed end to end. This needs one live test purchase before launch, not more code.

**4. Onboarding gathers Business Brain information — OK**
The wizard is now essentials-only (Business, Brand, Audience), autosaves, and finishes into Brand Voice. 14 business brains exist.

**5. Haaylo produces genuinely useful, on-brand content — OK**
310 rows in marketing history across modules, all grounded in the Brain.

**6. Work saves correctly and is easy to find again — mostly OK, one gap**
History, Content Bank and the database-backed post lifecycle all work. Gap: only **2 rows in `content_posts`** against 310 history rows, so the newer saved-post path is barely exercised — worth a manual pass through generate → approve → calendar to confirm it holds.

**7. They know what to do next without your help — OK**
Home checklist now mirrors the real path (Voice → Competitors → Trends → Plan), with the strategy gate and suggested next action in place.

**8. Confirmation, welcome and payment-reminder emails arrive — the weakest step**
- Sender domain `notify.haaylo.com` is verified, auth emails enabled, live queue healthy.
- Auth confirmation, recovery, magic link, invite templates all exist and are registered.
- Founding renewal reminder exists with a daily cron.
- **There is no post-purchase welcome/confirmation email.** Someone who pays £49 gets a Stripe receipt and nothing from Haaylo.
- **9 `waitlist-welcome` emails are stuck at `pending`** on the dev/test instance (9 sent, 9 pending, 1 bounced).

## What to fix before launch

1. **Add a membership welcome email.** New template `membership-welcome`, registered in the template registry, enqueued from the Stripe webhook on `checkout.session.completed` (idempotent on the session id so retries don't double-send). Content: confirmation of the plan and price, renewal date, and the one link that matters — start your Brain.
2. **Add a payment-failed email.** Trigger on `invoice.payment_failed` pointing at the billing portal, so a card decline doesn't silently kill someone's access.
3. **Clear the stuck waitlist queue.** Investigate the 9 pending rows and re-drive them, so waitlist signups get their welcome before you push volume at it.
4. **Run one live end-to-end purchase** on haaylo.com: sign up fresh → pay £49 → confirm the `subscriptions` row appears, access unlocks, and both the auth confirmation and the new welcome email land.
5. **Manual pass on save/find:** generate a post, approve it, drop it on the calendar, reload on a second browser, confirm it's still there.

## Technical notes

- New templates go in `src/lib/email-templates/` and must be added to `registry.ts`.
- Enqueue happens in `supabase/functions/stripe-webhook/index.ts` at the existing `checkout.session.completed` and `invoice.payment_failed` cases, via the existing `enqueue_email` path used elsewhere.
- No changes needed to pricing, checkout, or the billing portal — those read correct.
- Nothing here touches the Brain, Strategy or Engine flows.
