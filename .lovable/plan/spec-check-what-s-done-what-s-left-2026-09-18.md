# Spec check: what's done, what's left

I went through your specification against the actual code. Most of it is built. Four things are genuinely missing or half-done.

## Already built and matching the spec

- Briefing Room home screen with "What are we working on?", the large input and the "Build with Haaylo" button.
- Staged loader: understanding your brief, checking your Brand DNA, reviewing your audience and strategy, identifying the best approach.
- "Here's what I recommend" blueprint with goal, length, audience, channels and the asset list, plus a grounding sentence naming which brand facts were used.
- Missing Brand DNA values are asked for conversationally and written back before the build continues.
- Build checklist that ticks off each asset, saves the campaign and drops you into the campaign workspace.
- Campaign workbench tabs: Overview, Strategy, Content, Email, Lead Generation, Schedule, Analytics.
- Per-asset actions: Edit, Regenerate, Make shorter, Make more conversational, Change the call to action, Approve and schedule.
- "+ New Campaign" kept as a smaller neutral secondary option with its wizard untouched.
- Light palette, Poppins, rounded flat cards, purple and pink as accents only, across the signed-in app and the public pages.

## Gaps to close

1. **Two quick-start chips are missing.** The screen shows six; the spec lists eight. Add "Analyse my marketing" and "Repurpose my latest content", each routed to the right kind of brief.
2. **"Add something" doesn't add anything.** It currently just opens the same edit view as "Edit plan". Make it a short free-text box: you say what else you want in the campaign, and the recommendation is rebuilt with it included.
3. **Lower home doesn't show Today's Focus or Recent Activity.** It shows Content status, Leads and Jump back in. Add a Today's Focus card (what's due or unscheduled today) and a Recent Activity list (latest campaigns, posts and leads).
4. **Long-term memory isn't used when planning.** The goal agent can read past content, but the Briefing Room recommendation doesn't look at your previous posts. Feed a short summary of your recent and best-performing posts into the recommendation so it can match what already works.

## Points worth confirming with you

- Your first spec asked for a dark navy canvas; the later version asked for the light theme, and light is what's built. Assuming light stays.
- The home screen lives at its own address rather than replacing the old dashboard page, and campaigns open at `/campaign/<id>` rather than `/campaigns/<id>`, because those are the existing routes. Renaming them would break saved links, so I left them.

## Technical notes

- Chips: `CHIPS` in `src/routes/_authenticated/home.tsx`.
- "Add something": new state in the proposal block, passing an extra instruction into `planBrief` in `src/lib/agent-brief.functions.ts` for a re-plan.
- Today's Focus and Recent Activity: read from the existing dashboard snapshot plus recent `campaigns`, content bank and leads rows; no schema change.
- Long-term memory: reuse the existing `fetch_previous_content` runner inside `planBrief` and add its summary to the prompt context; no new tables, no vector store.
- No changes to tables, tiers, manual tools or existing action names.
