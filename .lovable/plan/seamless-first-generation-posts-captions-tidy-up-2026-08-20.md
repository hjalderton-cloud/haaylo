# Seamless first generation + Posts & Captions tidy-up

Three changes: a dedicated first-post page for the onboarding generation, moving Written posts below the tabs, and making "Pull from Brain" actually produce topics instead of pointing at Strategy.

## 1. Dedicated first-generation page

New page at `/first-post`, shown immediately after the Brain wizard finishes instead of dropping the user into the full Engine.

What it does:

- Reads the Business Brain the user just filled in.
- Shows 3 suggested post topics generated from the Brain (industry, ideal customer, pain points, offer) — pick one, or type your own in a single field.
- One format choice, pre-selected from the Brain's preferred platform (chips: LinkedIn / Instagram / Facebook), no other dropdowns.
- One button: "Write my post". The post streams in on the same screen using the existing generation pipeline (this is the one metered free generation).
- After the post appears: Copy, Save to Content Bank, and "Continue into Haaylo" — which is where the founding-member offer appears, since the free generation has now been used.

No Ideas / Write Post / Repurpose tabs, no workspace bar, no Written posts panel, no sidebar clutter — nothing on the page except the topic, the button and the result. Users who land there again after already generating are sent straight to the Engine.

## 2. Written posts moved below

In Posts & Captions the "Written posts" panel currently sits above the tabs, so the first thing after the Brain is a list, not the thing you came to do. Move it below the tab content, so the order is: header → tabs → inputs/output → Written posts.

## 3. "Pull from Brain" fills the topic tab

Today "Pull from Brain" only quietly prefills fields, and the "From Strategy" tab says "Head to the Strategy module and hit Build my plan" even when the Brain is full.

Change:

- Rename the tab to "Suggested topics" and make it the default landing tab.
- When a 90-day strategy exists, it shows strategy topics as it does now.
- When no strategy exists but the Brain has content, "Pull from Brain" populates that tab with Brain-derived topic cards, each clickable to write the post — no dead-end message.
- The "go build a plan" empty state only shows when both the strategy and the Brain are empty.

## Technical notes

- New route `src/routes/_authenticated/first-post.tsx`, reusing the existing generation server path and `GeneratedContentCard` for the result.
- `src/routes/_authenticated/brain.setup.tsx`: final-step navigation changes from `/engine#m=content` to `/first-post`; skip to Engine if a generation has already been used.
- `public/engine/index.html`: move `WrittenPostsPanel` below the tab bodies in `Content`; extend `pullFromBrain` to write Brain-derived topics into the suggestion source; update `SuggestionPanel` to accept Brain topics and change its empty-state condition and label.
- Free-generation accounting stays exactly as-is (`window.IE.tryUse`), so the paywall still appears only after the user's own explicit generate.
