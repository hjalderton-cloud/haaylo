# 30-Day Launch Campaign phase engine

Turns a 30-day campaign into a four-stage launch: the campaign hub shows where you are, the public page changes shape as the launch moves on, and posts and emails are written in the right tone for the stage.

## The four stages

| Stage | Days | Tone |
| --- | --- | --- |
| Phase 1 — Tease & pre-launch | 1–10 | Problem-aware, teasing, waitlist building |
| Phase 2 — Reveal & value drop | 11–15 | Educational, value-led, doors opening soon |
| Phase 3 — Cart open | 16–25 | Social proof, objection handling, promotional |
| Phase 4 — Cart close | 26–30 | Urgency, scarcity, countdown |

## Campaign hub

- A progress bar at the top of a 30-day campaign with four labelled segments, the current one filled in your brand colour.
- A line reading e.g. "Phase 2 · 3 days remaining".
- An outline "Advance to Phase 3" button with the confirmation "Advance to Phase 3? This will update your landing page and content tone."
- After advancing, a prompt appears offering to write that phase's posts and emails. Nothing is generated until you press it, and existing content is left alone.
- Two new settings on a 30-day campaign: a checkout/booking link used by the phase 3 button, and a cart close date and time used by the phase 4 countdown.
- The existing follow-the-calendar / set-by-hand toggle stays.

## Public landing page

The page at haaylo.com/p/... re-renders on its own as the phase changes — no rebuild.

- Phase 1: minimal waitlist splash — headline, subheadline, email capture, no price.
- Phase 2: headline, value bullets, email capture, "doors opening soon" note.
- Phase 3: full sales page — headline, social proof, offer details, and a button using your checkout link (falls back to email capture if no link is set).
- Phase 4: scarcity headline, live countdown to your cart close time, final call to action. When the close time passes it shows a closed message with email capture.

## Content

- Post generation for a 30-day campaign is given the current phase, so tone and focus shift with the stage.
- Each generated post records its phase, and post cards in the Content Bank show a "Phase 1"/"Phase 2" label for 30-day campaigns.

## Emails

- A new email sequence store, so sequences live in their own place rather than the content bank.
- Phase-appropriate copy: phase 1 waitlist confirmation plus anticipation; phase 2 three "doors opening soon" educational emails; phase 3 sales emails with objection handling and proof; phase 4 close emails at 24 hours, 2 hours and last chance.
- Emails for the phase appear on the campaign hub as editable drafts, same as today's nurture emails.

## Technical notes

- `campaigns.current_phase`, `phase_override` and `phase_started_at` already exist and are reused; `phaseForDay` in `src/lib/landing.functions.ts` already maps days to phases. Adds nullable `campaigns.checkout_url` and `campaigns.cart_closes_at`.
- New table `public.email_sequences` (id, user_id, campaign_id, phase, email_subject, email_body, send_order, status default 'draft', created/updated timestamps) with grants for authenticated/service_role, RLS scoped to `auth.uid() = user_id`, and an index on campaign_id.
- `src/lib/campaign-generate.functions.ts`: phase context injected into the post and email prompts; posts store `meta.phase`; a new `generatePhaseAssets` server function writes the phase's posts and emails on demand. `genEmails` writes to `email_sequences` for 30-day campaigns and keeps existing behaviour for 90-day.
- `src/lib/campaigns.functions.ts`: extend `setCampaignPhase` handling and add save for checkout link and close date; `getPublicLandingPage` returns `checkoutUrl` and `cartClosesAt` alongside the existing phase.
- `src/routes/p.$slug.tsx`: split the current phase 1/3 branching into four layouts plus a client-side countdown component.
- `src/routes/_authenticated/campaign.$id.tsx`: replace `PhaseControl` with the progress bar, days-remaining line, advance button with confirmation, and the post-advance generation prompt.
- `src/routes/_authenticated/bank.tsx`: phase badge on post cards where `meta.phase` is set.
