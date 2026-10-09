# What's left for you to do manually

Everything that can be built in code is done and verified. What remains can only be confirmed by you running real money and a real device, because those can't be simulated. Two items, each ~10 minutes.

## 1. One live £49 purchase on haaylo.com

The whole payment → access → email chain has never run end-to-end with real money (`subscriptions` has 0 rows; `engine_access` has 1 from a legacy/manual grant, not a checkout). This is the single biggest unknown before launch.

Do this on haaylo.com (the published site, not the preview):

1. Open an incognito window and go to **haaylo.com/pricing**.
2. Sign up fresh with a real email you can check.
3. Choose the **Founding Member £49/yr** offer.
4. Complete the Stripe checkout with a real card (use a card that succeeds).
5. Confirm all of the following within a minute or two:
   - You land back in the app at `/engine?checkout=success`.
   - Access is unlocked — you can generate content without hitting a paywall.
   - A **welcome email** from haaylo arrives at that inbox (subject "You're in — welcome to haaylo").
   - A **Stripe receipt** arrives.
6. Then run the decline path: in the Stripe dashboard (or by reusing a test card that fails), trigger a failed renewal and confirm the **payment-failed email** ("Your haaylo payment didn't go through") lands. This proves the nudge works before a real customer hits it.

Why it matters: the webhook, the `subscriptions` row write, the access grant, and both new emails all fire from this one checkout. If any of them silently fail, this is the only way you'd know.

## 2. Generate → approve → calendar pass on a second browser

The database-backed content lifecycle (`content_posts`) has only 2 rows against 310 history rows, so the newer save path is barely exercised. Confirm work survives across devices.

1. On your usual browser: complete enough Brain to unlock the 90-Day Plan, generate a post, **approve** it, and **drag it onto the calendar**.
2. Reload the page — confirm the post is still approved and still on the calendar.
3. On a **different browser/device** (signed into the same account), open the Content Bank and the Calendar — confirm that approved post is visible there too.

Why it matters: this is the "their work saves and is easy to find again" promise. If the post vanishes on reload or doesn't show on the second device, the sync is broken.

## Already done — no action needed

- Membership welcome + payment-failed emails: built, registered, deployed in the Stripe webhook, idempotent.
- The 9 "stuck" waitlist emails: confirmed all actually sent (the `pending` rows are the normal pending→sent pair, not failures); one real bounce.
- Onboarding, homepage hero, content generation, strategy gate, nav sync: verified in code.

## If either manual check fails

Tell me which step broke and what you saw (the URL, the email subject that didn't arrive, or whether the post vanished). I'll fix the code path. These are verification steps, so a failure here means real code work, not a setting.
