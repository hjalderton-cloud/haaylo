# Content Performance (Insights)

Replace the placeholder at `/analytics/content` with a working screen that shows which posts, pillars and platforms are performing, using your real LinkedIn, Instagram and Facebook numbers.

## What you'll see

Heading "Content Performance", subheading "See what content is working — by platform, pillar, and format."

**Date range** at the top: Last 7 days | Last 30 days | Last 90 days | All time. Everything on the page reacts to this choice.

**Top performers** — three cards:
- Best performing post: title, platform, engagement rate, and a "View post" link straight to the live post (or to the post in Content Bank when no live link exists).
- Best performing pillar: pillar name in its own colour, average reach, number of posts.
- Best performing day: day of the week with the highest average engagement, plus that rate.

**Platform breakdown** — one row per connected channel: icon and name, posts published in range, total impressions, average engagement rate, and an up/down/flat arrow comparing with the previous equivalent period (hidden for "All time", which has no previous period).

**Pillar performance table** — Pillar | Posts published | Avg impressions | Avg engagement | Best post, sortable, with the pillar colour dot.

**Insights callout** — one short paragraph written by the AI from the numbers in the selected range, in the Haaylo voice: which pillar outperforms where, the strongest posting times and days, and one suggestion. Regenerates whenever the date range changes.

**Empty and partial states**: if no channels are connected, or nothing has been published yet, the page shows the same "Connect your social channels and publish your first post" prompt used on Campaign Analytics rather than zeroes. Metrics a channel hasn't reported show a dash, never a made-up zero.

## Technical notes

- Posts are read from `content_posts` (this project's posts table; there is no `social_posts` table), scoped to the signed-in user and the selected workspace, filtered by published/scheduled date for the range.
- Live impressions, reach, clicks and engagement come from the existing Zernio analytics server function, which already returns one row per channel per post. Matching reuses the id link stored on each post (`meta.external_post_id`) with the caption fallback, exactly as Campaign Analytics does — the matching helper moves into a shared module so both screens use one implementation.
- New `src/lib/content-performance.functions.ts` with two authenticated server functions: one returning posts plus derived aggregates for the range and the previous period; one generating the insights paragraph through the Lovable AI gateway (`google/gemini-2.5-flash`) from the aggregate numbers only, with a plain computed sentence as fallback if the AI call fails.
- Engagement rate per post is the platform-reported rate where available, otherwise (likes + comments + shares) / impressions.
- "Best posting time/day" is derived from published timestamps grouped by weekday and hour band (morning/afternoon/evening).
- Pillar colours reuse the existing pillar palette used on the calendar and Content Bank.
- No schema changes.
