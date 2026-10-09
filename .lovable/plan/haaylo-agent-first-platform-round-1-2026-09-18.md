# Haaylo — Agent-First Platform, Round 1

Everything is additive. No existing campaign data, navigation, tools or backend actions are removed or renamed.

## What you'll see first (before anything real is built)

A throwaway preview page at `/preview/agent` showing two full screens in the new light palette:

1. The new home screen with the Agent box
2. The campaign workbench with its tab bar and per-asset controls

It uses dummy content and no live data, so nothing in your app changes. You review the layout and colours there, tell me what to adjust, and only then do I wire it up for real. The preview page is deleted once you sign off.

## Visual system (light)

- Backgrounds: `#FAFAFC` page, `#F6F7FA` cards
- Text: navy `#171D41` headings, indigo `#2D2964` secondary, grey `#CECDD4` inactive
- Accents only (buttons, active tabs, links, small icons): purple `#553EA2`, pink `#E54683`
- Status tints at about 10% strength: green scheduled, pink draft, purple strategy/AI, blue-grey campaign
- Poppins throughout — 600/700 headings, 400/500 body. Loaded via a font link in the root route
- Cards 12–16px radius, flat, no gradients or glow, generous whitespace
- Logo: pink rounded-square monogram with a lowercase "h", wordmark recoloured navy

Because most existing screens use hard-coded dark colours inline rather than theme tokens, the light theme rolls out in two passes: the new home and campaign workbench first, then the older screens (funnel, bank, plan, calendar, analytics, agent, brand) converted in a follow-up round. The shell, sidebar and header get converted in the first pass so the app doesn't look half-and-half.

## Home screen

New route at `/home`, and signing in lands there instead of dropping you on Campaigns.

```text
Welcome back, Hayley
--------------------------------------------------
  What are we working on?
  [ e.g. I'm launching a new service next month... ]
                              [ Build with Haaylo ]

  Launch my new service   Plan my marketing for October
  Create this week's content   Generate more leads
  Build me a lead magnet   Create an email campaign
  Analyse my marketing   Repurpose my latest content
--------------------------------------------------
Today's Focus | Content status | Channel performance
Recent activity
```

Chips drop their text into the box. Metric cards sit below the Agent block in the pale tints. Campaigns stays exactly where it is as its own section.

## Plan before build

Pressing "Build with Haaylo" runs a staged loader: understanding your brief, checking your Brand DNA, reviewing your audience and strategy, identifying the best approach.

It then returns a proposal — not generated content — with goal, duration, audience, channels, and a list of assets it intends to create (for example 4 LinkedIn posts, 2 carousels, 3 emails, 1 landing page). A line states plainly what it based this on: your Brand DNA, your audience, your tone. Buttons: **Build Campaign**, **Edit Plan**, **Add Something**.

If your Business Brain is missing something the proposal needs (no service defined, no audience), it pauses and asks for it in the chat instead of guessing. What you type is saved back to your strategy profile before it carries on.

## Build

"Build Campaign" runs a live checklist — campaign strategy, LinkedIn posts, email sequence, landing-page copy, schedule — ticking off as each piece is saved. Then it opens the new campaign at `/campaign/$id`.

Everything the Agent writes goes through the existing tool registry, so drafting happens on its own and anything that publishes, schedules or emails still lands in Approvals.

## Campaign workbench

`/campaign/$id` gets a horizontal tab bar: Overview, Strategy, Content, Email, Lead Generation, Schedule, Analytics. The existing tiles and asset panels move under the matching tabs; nothing is dropped.

Each copy card (post, email, landing block) gets a small menu: Edit, Regenerate, Make Shorter, Make More Conversational, Change CTA, Approve & Schedule. Each acts on that one item only.

## Manual route kept

"+ New Campaign" stays in the side navigation as a smaller, neutral-grey secondary option. The existing wizard is untouched.

## Technical notes

- New: `src/routes/_authenticated/home.tsx`, `src/components/agent/*` (input, chips, staged loader, proposal card, build checklist, brain-gap questions), `src/lib/agent-brief.functions.ts` (interpret brief, compile campaign), preview route `src/routes/_authenticated/preview.agent.tsx` (temporary).
- Modified: `src/styles.css` (light tokens), `src/routes/__root.tsx` (Poppins link), `AppShell.tsx` / `WorkflowNav.tsx` (light chrome, de-emphasised New Campaign), `src/routes/index.tsx` (signed-in redirect to `/home`), `campaign.$id.tsx` (tabs + card action menu).
- Brief interpretation and compilation run as server functions with an explicit workspace id, reusing the registry runners (`create_campaign`, `create_social_content`, `create_email_draft`, `create_lead_magnet`, `create_landing_page`, `fetch_brand_context`). No duplicate generation logic.
- Short-term memory: the active brief, proposal and campaign id held in session state so follow-ups ("another post for this campaign") resolve. Long-term: past campaigns and posts read from existing tables for comparison — no new vector store in this round.
- Database: no schema change needed for the home or workbench. One additive table for agent conversation threads if you want history to survive a refresh — flag if you'd rather skip it for now.
- Writing rules, workspace scoping and approval gating all stay as they are.

## Not in this round

Converting every older screen to the light theme (second pass), vector search for historic post matching, and any pricing or tier changes.
