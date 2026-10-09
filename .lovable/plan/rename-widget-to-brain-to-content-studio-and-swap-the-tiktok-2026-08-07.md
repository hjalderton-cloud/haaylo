# Rename widget to "Brain-to-Content Studio" and swap the TikTok tab for an Instagram Reel script

Rename the widget to "Brain-to-Content Studio" and replace the first preview tab so it produces an Instagram Reel script instead of a TikTok one. The Instagram Carousel and LinkedIn tabs stay exactly as they are.

## What changes

- Tab 1 label becomes "Instagram Reel Script & Visual Cue".
- The generated script is retuned for Reels: hook in the first 1–2 seconds, on-screen text cues, vertical 9:16 framing notes, trending-audio cue, and a closing line suited to Reels rather than TikTok pacing.
- Trend injection, Brain-field reactivity, tone/strategy chips and the Copy draft button behave the same.
- Page meta text on the Orchestrator route is updated so it no longer advertises TikTok (reads Instagram Reels, LinkedIn and Instagram carousels).

## Technical details

- `src/components/OmniChannelOrchestrator.tsx`: rename the component to `BrainToContentStudio`, update the title inside the panel to "Brain-to-Content Studio", rename the tab entry `tiktok` to `reel` with the new label, rename `buildTikTok` to `buildReel` and rewrite its beat structure/visual cues for Reels, and update the default tab state and the `useMemo` branch.
- `src/routes/_authenticated/orchestrator.tsx`: update the route title, description, og:description meta strings and page heading to "Brain-to-Content Studio".

No backend, data or routing changes.
