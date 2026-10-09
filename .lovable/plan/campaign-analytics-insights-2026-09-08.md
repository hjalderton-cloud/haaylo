# Campaign Analytics (Insights)

Replace the placeholder at `/analytics/campaigns` with a working screen that shows how each campaign performed across content, leads and reach.

## What you'll see

- Heading "Campaign Analytics", subheading "Track how each campaign is performing across content, leads, and reach."
- A campaign picker at the top ("Viewing: [campaign name]"), newest first, scoped to the workspace you have selected.
- Four tiles: posts published, total reach, leads captured, average engagement rate.
- A sortable table of every post in the campaign: title, platform, published date, impressions, engagement rate, clicks, status. Sorted by published date, newest first, and clickable column headers to re-sort.
- A line chart of leads captured per day over the campaign, with one line per landing page when the campaign has more than one.
- A horizontal bar chart of reach by content pillar.
- Empty state when there is nothing yet: "Connect your social channels and publish your first post to start seeing analytics." with a "Connect channels" button going to the connected accounts screen.
- When the publishing service isn't connected, the reach/engagement columns show "Connect your channels to see engagement data" with a link, and the rest of the screen (posts, leads, pillars by post count) still works.

## How the data is put together

- Posts come from `content_posts` filtered by the selected campaign and workspace. Leads come from `landing_page_leads` filtered by `campaign_id`, joined to `landing_pages` for the per-page chart lines.
- Reach, impressions, clicks and engagement rate come from the existing live post analytics feed (`getZernioAnalytics`). There is no stored link between a Haaylo post and its published counterpart, so the two are matched on platform plus the opening text of the caption, with published date as a tiebreak. Unmatched posts show a dash rather than a zero, so nothing is invented.
- Pillar reach sums matched reach per `content_posts.pillar`; posts with no pillar group under "Unassigned".

## Technical notes

- New `src/lib/campaign-analytics.functions.ts`: one authenticated server function returning campaign list plus the selected campaign's posts, matched metrics, per-day/per-page lead series, pillar totals, and a `metricsConnected` flag. Uses `requireSupabaseAuth` and existing project resolution helpers.
- Rewrite `src/routes/_authenticated/analytics.campaigns.tsx` as a real screen (keeps its current head metadata), fetching with `useQuery` via `useServerFn`, skeletons while loading, and Recharts (already installed) for both charts.
- No schema changes. No changes to existing screens beyond the analytics route.
