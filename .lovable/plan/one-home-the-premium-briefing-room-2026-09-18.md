# One home: the premium Briefing Room

The Briefing Room becomes the single home screen. The old Engine dashboard stops being a second, competing home.

## 1. A calm top half

- Opens with "Welcome back, Hayley." followed by the line: "What are we working on? Tell Haaylo what you want to achieve and we'll work out the marketing you need."
- Below that, one centred input with the placeholder "e.g. I'm launching a new service next month and need a campaign to generate enquiries…" and a solid "Build with Haaylo" button.
- The quick-start chips stay, sitting quietly under the input.
- Nothing else above the fold: generous whitespace, no tiles, tables or long text blocks competing with the input.

## 2. The working area

Unchanged behaviour, shown in place under the input as you go: the thinking steps, the recommendation with Build campaign / Edit plan / Add something, and the build checklist.

The moment a campaign finishes compiling, the four-card row (Email, Social, Image, Blog) and its progress track appear right there in the Briefing Room, with a button through to the campaign. This already works and stays as it is.

## 3. The lower half

Stacked cleanly below, in this order:

1. Today's focus and Recent activity
2. Content status and Leads numbers
3. Channel performance — posts published and scheduled per channel over the last 30 days, and leads by source
4. Jump into a tool — Campaigns, Content Bank, 90-Day Plan, Schedule & Publish, Analytics, Lead Funnel

Channel performance is new on this screen. It reports what the app actually holds: counts per platform and lead sources. It does not show likes, reach or impressions, since those come from the connected accounts and are shown on the Analytics screens.

## 4. The old Engine dashboard

Its home view stops duplicating this screen: the greeting, Today's focus, content tiles, channel performance, leads, attention cards and quick actions come out of the Engine home, and it opens on the Briefing Room instead. Every Engine tool screen — voice, strategy, content, funnel, keywords, analytics — is untouched and reachable exactly as it is today.

## Technical notes

- `src/routes/_authenticated/home.tsx` keeps its route and server calls. The header block is replaced with the greeting plus subtitle, the input card is simplified, and the five lower cards are regrouped into the four stacked sections above. There is no `src/routes/_authenticated/index.tsx` in this project — the Briefing Room at `/home` is the dashboard, and `src/routes/index.tsx` already redirects signed-in visitors there.
- Greeting name comes from the signed-in profile's first name, falling back to "Welcome back." when there isn't one.
- Channel performance needs one new server function in `src/lib/dashboard.functions.ts` (workspace-scoped, `requireSupabaseAuth`): posts grouped by platform with published/scheduled counts over 30 days, plus lead counts grouped by `source_platform`/`source_slug`. No schema change.
- `CampaignAssetGrid` and `CampaignTimelineRail` stay as they are; the "done" stage already renders them.
- The Engine home view in `public/engine/index.html` has its dashboard sections removed and posts a navigate message to `/home`; the tool views, styling and data hooks are left alone. Nothing is deleted from the database, no routes are renamed, and no existing links break.
- Checks before done: typecheck, tests, and screenshots of the home screen at desktop and phone widths confirming the top half is clear and the lower sections stack in order.
