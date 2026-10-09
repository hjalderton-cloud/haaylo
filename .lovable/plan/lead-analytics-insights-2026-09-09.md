# Lead Analytics (Insights)

Replace the placeholder at `/analytics/leads` with a working screen showing where leads come from and how they move through the funnel.

## What you'll see

- Heading "Lead Analytics", subheading "Track where your leads come from and how they move through your funnel."
- Date range buttons: Last 7 days | Last 30 days | Last 90 days | All time.
- Four tiles: total leads in the period, conversion rate, best converting page, and this week vs last week with an up/down arrow and percentage change.
- Leads by source: horizontal bar chart, one bar per landing page, coloured by the campaign's pillar colour.
- Leads over time: line chart of leads per day, one line per landing page, with toggles to show/hide each page.
- Lead status funnel: New, Contacted, Converted counts, with the step rates (Contacted/New, Converted/Contacted).
- Campaign comparison table: Campaign | Landing page | Leads captured | Conversion rate | First–last lead dates.
- Empty state when no leads yet: "No leads captured yet — publish a landing page and share it to start collecting." with a button to Landing Pages.

## One honest caveat

There is no page-visit tracking anywhere in the app today, so a true conversion rate (leads divided by visitors) cannot be calculated. Rather than invent a number, the conversion tiles and column will show a dash with the note "Visitor tracking isn't switched on yet", and "Best converting page" will fall back to the page with the most leads. If you want a real conversion rate, page-view counting is a separate piece of work I can plan next.

## How the data is put together

- Leads come from the landing page leads table, scoped to your account and the workspace you have selected, joined to landing pages for titles and to campaigns for names and pillar colours.
- Status counts use the existing status field on each lead (currently every lead is "new"; contacted/converted show zero until statuses are set).
- Week-on-week compares the last 7 days against the 7 before it.

## Technical notes

- New `src/lib/lead-analytics.functions.ts`: one authenticated server function (`requireSupabaseAuth`) returning leads joined to `landing_pages` and `campaigns`, scoped by `user_id` and active `project_id` (keeping legacy null-project rows, as Lead Tracker does). Aggregation happens on the client from the returned rows.
- Rewrite `src/routes/_authenticated/analytics.leads.tsx` as a real screen, keeping its head metadata, using `useServerFn` + `useQuery`, skeletons while loading, and Recharts (already installed) for both charts.
- Reuse the pillar colour helper pattern from `analytics.content.tsx`.
- No schema changes, no changes to lead capture.
