# Add AI image generation and Insights & Analytics to the homepage features

The "What you get" section on the homepage lists what Haaylo does across Plan, Create and Run, but two real features are missing: AI image generation and Insights & Analytics. Add them so the features grid reflects the whole platform.

## What changes

Edit `src/routes/index.tsx` only, inside the "What you get" features array (around line 1340).

### Create group — add one card
- **AI image generation** — Generate on-brand campaign images from your product, industry and brand colours, then open them in the Design Studio to add your logo, copy or overlays.

This replaces the lighter "Your own graphics" framing with an explicit AI generation card. "Your own graphics" stays as the Design Studio card it already describes.

### Run group — add one card
- **Insights & Analytics** — See how your campaigns and content are performing across reach, engagement, leads and channel breakdowns, all in one view.

Both are real, working screens today (image generation in the Design Studio and PostImageZone; analytics across content performance, campaign analytics and lead analytics), so the claims are honest.

### How it works step 4
The "Review, publish and learn" step already covers learning from results, so no change needed there.

## Out of scope
No changes to the hero, the before/after example, the 30-day plan showcase, pricing, FAQ, metadata, or any route other than the features array. No copy touching the phone number, no em dashes, UK English throughout.
