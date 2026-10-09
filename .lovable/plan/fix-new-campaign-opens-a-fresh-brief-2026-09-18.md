# Fix: New Campaign opens a fresh brief

## What's wrong

"New Campaign" under Campaigns points at the same page as Home (the Briefing Room). If you are already on that page — which you usually are — clicking it does nothing visible: no fresh start, no cursor in the box, and if a previous plan is still on screen it stays there.

## What it should do

Clicking "New Campaign" always gives you an empty Briefing Room: the box cleared, any earlier plan or build result cleared away, and the cursor already in the box ready to type.

## Changes

1. `src/components/HubTabs.tsx` — the Campaigns tab "New Campaign" gains a marker on its link (`search: { new: "1" }`) so it is distinguishable from plain Home.
2. `src/routes/_authenticated/home.tsx` —
   - add `validateSearch` accepting an optional `new` flag;
   - when the flag is present on mount or on a repeat click, reset brief text, questions, blueprint, build state and error back to idle, focus the brief textarea, and scroll it into view;
   - immediately replace the URL back to `/home` so a refresh doesn't re-trigger the reset.
3. The Home hub's own "Briefing Room" tab is left as-is, so returning there keeps whatever you had in progress.

No routes removed, no backend or schema changes, no visual changes beyond the cleared state.

## Still pending from the ideas you pasted

The two ideas in your screenshot (competitor gaps triggering response posts, and building the Business Brain from just a website URL) are a separate, larger piece of work. I'll come back with a plan for those once this fix is approved.
