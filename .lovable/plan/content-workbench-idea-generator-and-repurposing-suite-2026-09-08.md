# Content workbench: Idea Generator and Repurposing Suite

Split the old combined writing screen into clean, separate tools that share one tab bar, matching the look of the newer tools (Caption Variator, Hashtags, Trending Scan).

## The workbench tab bar

A single row of tabs appears at the top of each workbench screen, so all four feel like one workspace:

- Write Post
- Pull from Campaigns
- Idea Generator
- Repurposing Suite

The current tab is highlighted; switching tabs moves between screens without losing saved work.

## 1. Idea Generator

- Pick a campaign theme (list of your campaigns, newest first; optional).
- One keyword box.
- Generates 3 post concept hooks, written to your Brand DNA voice, audience and pillars.
- Each concept card shows the hook, a one-line why-this-works note and the pillar it fits.
- "Send to Editor" opens the Write Post tab with the hook pre-filled. Nothing is saved until you save it there.
- "Regenerate" for a fresh set of three.

## 2. Repurposing Suite

- Load an existing caption from your Content Bank (searchable picker of your saved posts), or paste text in.
- Choose a conversion target:
  - Convert to Multi-Slide Carousel Script
  - Convert to Short-Form Video Script
  - Expand into Email Newsletter
- Output shown in a readable panel with Copy, Regenerate, and Save to Content Bank as a draft.

## 3. Pull from Campaigns

Pick a campaign and see the posts it already generated, with Open in editor and Copy on each.

## 4. Content Hub tidy-up

The Content Hub cards for "Generate Ideas" and "Repurpose Content" point at the two new screens instead of the old combined tabs. The old Ideas and Repurpose tabs inside the legacy writing screen are removed so there is only one place for each tool. Write Post and the 90-day captions flow in that screen are untouched.

## Technical notes

- New routes: `src/routes/_authenticated/ideas.tsx`, `repurpose.tsx`, `campaign-posts.tsx`; shared `src/components/content/WorkbenchTabs.tsx`.
- New server functions in `src/lib/idea-generator.functions.ts` and `src/lib/repurpose.functions.ts`, following the `trends.functions.ts` pattern: workspace/project resolution, Brand DNA context from `business_brains`, Lovable AI Gateway (Gemini), strict JSON parsing and normalisation.
- Campaign theme list from `campaigns`; caption picker and saves use `content_posts` (owner-scoped).
- Send to Editor reuses the existing `sessionStorage` `haaylo:post-topic` handoff plus the `#m=content&t=post` deep link into the engine's Write Post tab.
- No schema changes.
