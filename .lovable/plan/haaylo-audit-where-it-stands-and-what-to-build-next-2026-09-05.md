# Haaylo audit — where it stands and what to build next

## What you already have

Brain (voice, offer, audience, testimonials, objective), Engine (strategy, research, create), 90-day plan, content bank, calendar with drag-and-drop scheduling, Zernio publishing, Design Studio + template library + AI image generation, competitor and trend radar, lead automations with nurture sequence and leads inbox, LinkedIn/Meta connections, MCP agent integrations, and a single membership at £49 (founding stages through to Jan 2027).

That's a lot of surface. The gap isn't features — it's that the user still drives every step. Everything waits for a click.

## The main recommendation: an AI Marketing Agent tier

A second, higher tier where haaylo does the work on a schedule instead of on demand. Call it something like **haaylo Autopilot** at £149–£199/month, sitting above the £49 membership.

What the agent does, unprompted:

1. **Weekly plan run** — reads the Brain, last week's analytics and the trend/competitor radar, then drafts next week's posts into the calendar as pending approval. You get one email: "7 posts ready, approve or edit."
2. **Performance loop** — after each post, it reads impressions/engagement and writes what it learned back into a `agent_learnings` store, so the next batch leans towards what worked. This is the bit no competitor at this price does well.
3. **Lead follow-through** — watches the leads inbox, drafts a personalised reply per lead using the Brain and the actual comment, and either sends or queues for approval.
4. **Monthly report** — a plain-English summary: what went out, what worked, what to change, delivered as a PDF/email.
5. **Agent chat with memory** — a persistent thread that already knows the client, the plan and last month's numbers, so you're not re-briefing it.

Approval mode is the safety valve: Draft (nothing sends), Review (queued, you approve), Auto (it just runs). Start everyone in Review.

## Other improvements worth making, roughly in priority order

**Trust and evidence**
- The homepage claims a lot with no proof. Add real screenshots of the calendar and a generated post, plus a "what it actually produces" sample. No invented testimonials — only use ones you actually hold in the Brain.
- Publish an example 90-day plan as a public page. It's the single best SEO and conversion asset you have.

**Onboarding**
- The free generation is good but one-shot. Give it a visible "here's what the paid version would have done next" step — the calendar view greyed out with the other 8 posts in it.
- Brain completion is the strongest predictor of output quality. Add a nudge sequence (email at day 1 and 3) for anyone stuck below 60%.

**Output quality**
- Add a per-client "rejected phrasing" list that grows when a user edits a caption heavily — feed those edits back into the prompt. Right now every generation starts from the same baseline.
- Let users rate a caption thumbs up/down and store it; use the up-rated ones as few-shot examples for that client.

**Analytics**
- Currently reports platform numbers. Add "what to do about it": the three posts to repeat, the format underperforming, best posting time based on actual data.

**Commercial**
- Annual billing at ~10 months' price — cash up front and lower churn.
- An agency/multi-client price step, since Clients already exists in the product.

## Technical notes for the agent tier

- New table `agent_runs` (user_id, project_id, kind, status, summary, created_at) and `agent_settings` (mode: draft/review/auto, cadence, channels, approval email) — both with GRANTs and `auth.uid()` RLS.
- Scheduled work via `src/routes/api/public/cron/agent-run.ts`, driven by pg_cron with the service-role bearer, matching the existing `lead-sweep` pattern.
- Generation reuses the existing Brain-grounded prompts and UK-English/banned-phrasing guards; no new writing engine.
- Tier gate: `tier.ts` gains an `agent` feature key; the subscription check in `tier.functions.ts` extends to a second Stripe price rather than one flat "pro".
- Agent surface at `src/routes/_authenticated/agent.tsx`, added to the nav under Publish or as its own top-level entry.

## Suggested order

1. Agent settings + weekly plan run in Review mode (the core value).
2. Lead reply drafting.
3. Performance loop and monthly report.
4. Auto mode, once you trust the output.
