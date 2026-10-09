# UX Audit — Haaylo (post-restructure)

The new grouping (Set up → Strategy → Research → Create → Publish) reads well and the hover flyout keeps the sidebar calm. Below are the friction points I can see in the current code, ranked, with the fix I'd make for each.

## 1. Onboarding is the weakest link

**What happens today**

A new user lands on the Engine home (State A), is told "Set Up Your Brain", and is dropped into a 9-section, ~50-field wizard. Sections: Business, Brand, Audience, Marketing, Content, Proof, Founder, CTAs, Preferences. Brain "completeness" is a raw percentage of every field filled, so finishing the essentials still shows a low score.

**Problems**

- Too long before first value. Nothing is generated until the user has typed a lot.
- No sense of "how much is enough". 100% is unreachable for most people, so the percentage nags forever.
- The setup checklist on home ("Lock in your Brand Voice", "90-Day Plan", "Post", "Funnel", "Keywords") does not match the new nav order or the Strategy gate (Voice → Competitors → Trends → Plan).
- Finishing the wizard sends the user to `/director`, which is a bare redirect to `/engine` home — they land back on a dashboard rather than on their first win.
- Progress is only saved on step change; there's no explicit autosave reassurance.

**Fix**

- Split the Brain into **Essentials (3 sections: Business, Brand, Audience)** and **Deep dive (the other 6)**. Ship "Essentials done" as the milestone that unlocks everything; deep-dive sections become optional "sharpen your Brain" cards.
- Change the health score to weight Essentials heavily and cap the nag: show "Ready" once Essentials are complete, with "x optional sections left to sharpen" underneath.
- After the last Essentials step, route straight to **Brand Voice → Summarise for me**, so the very first thing the user sees is AI output written from what they just typed. That is the "aha" moment.
- Add a visible "Saved" indicator on each field blur.
- Rewrite the home checklist to mirror the real path: Brain Essentials → Brand Voice → Competitor Radar → Trend Radar → 90-Day Plan → First post.

## 2. Two doors into the same setup

Home State A's primary CTA goes to `/brain/setup`, but the "Skip for now" button jumps to Posts & Captions, where output will be generic. That's a fast route to a bad first impression.

**Fix:** keep the skip option but change it to a **60-second express setup** — three fields (what you do, who for, how you sound) that write a provisional Brain, then generate. Users still get instant output, but it's on-brand.

## 3. Strategy gating needs to explain itself

The 90-Day Plan is locked until Brand Voice, Competitor Radar and Trend Radar are complete. Currently the user sees a lock and one line of copy.

**Fix:** render the three prerequisites as a live 3-step tracker on the Plan screen, each row clickable and ticked as it completes, with a time estimate ("~2 min"). A lock that tells you exactly what to click next stops feeling like a wall.

## 4. Progress lives in two places and can disagree

Module completion is read from `localStorage` keys (`ie-mod-strategy-out`, `ie-mod-content-out`, etc.) while Brain and posts live in the database. Switching device or browser resets a user's apparent progress and can flip them back to the "new user" dashboard.

**Fix:** move module-completion flags onto the workspace record so progress follows the account, and treat localStorage as a cache only.

## 5. Per-client context is easy to lose

Brain, Voice, Strategy and Posts are all workspace-scoped, but the only signal of which client you're in is the top context bar.

**Fix:** put the active client name in the page header of every module, and show a brief inline confirmation when it changes ("Now working on: Very Nice Blinds").

## 6. Smaller items

- The `/director` route is a redirect stub still referenced by Brain setup and password reset — point those directly at their real destinations.
- Brand Voice: now that fields are read-only, add a single "Regenerate" and "Edit manually" affordance so users aren't stuck with a summary they dislike.
- "Images (Coming soon)" sits in Create alongside live tools; grey it out consistently with a "notify me" capture so the interest is measurable.
- Empty states in Content Bank, Planner and History should each offer the one action that fills them, rather than a blank panel.
- Mobile: the hover flyout has no hover — confirm the tap-to-pin path is the default on touch and that the bottom nav covers the five most-used destinations.

## Suggested order of work

1. Brain Essentials split + score change + route to Brand Voice on finish (biggest impact).
2. Home checklist rewritten to the real path; express setup replaces bare skip.
3. Strategy prerequisite tracker.
4. Progress flags moved to the database.
5. Client context in module headers, empty states, `/director` cleanup.

## Technical notes

- Brain sections are defined in `src/lib/brain-schema.ts` (`BRAIN_SECTIONS`, `brainFillScore`); the split and weighted score both belong there.
- The wizard is `src/routes/_authenticated/brain.setup.tsx`; the final-step navigation and skip links are the three `/director` calls.
- Home States A and B are `Home` / `HomeStateB` in `public/engine/index.html`; the checklist array and its `localStorage` reads are the pieces to replace.
- Strategy gating copy and lock live in the Strategy module of the same file.
- Nav groups are `NAV_GROUPS` in `src/components/WorkflowNav.tsx`.
