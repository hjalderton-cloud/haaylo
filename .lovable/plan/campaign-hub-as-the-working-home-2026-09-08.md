# Campaign Hub as the working home

Turn the campaign page into the place you start from: your campaign at the top, every asset you asked for as a status card, and a switcher to move between campaigns.

## Top bar

- Campaign title, large and bold.
- Type badge next to it: "90-Day" in blue, "30-Day Launch" in purple.
- Campaign theme on one muted line beneath the title.
- "Switch campaign" dropdown on the right: all your campaigns, newest first, with "New Campaign +" at the bottom that opens the Campaign Engine.

## Asset status grid

One card per asset selected when the campaign was created. Each card shows the asset name and a status badge:

- Generating… — animated spinner and "Usually takes about 30–45 seconds".
- Ready to review — an "Open [asset name]" button that goes to the matching section, filtered to this campaign.
- Complete — same open button, marked done.

Status is stored per asset on the campaign, so it survives a refresh and updates as work is finished in each tool. New campaigns start their selected assets in "Generating…" and settle to "Ready to review"; a tool marks its asset "Complete" once the real thing exists (posts written, page published, guide exported, emails saved, images made).

Cards use flexible wrapping so long titles or short ones never overlap.

## Empty state

No campaigns yet: a centred panel with "Start your first campaign" and one large "New Campaign" button.

## Where it sits

- After signing in, returning users go straight to their most recent campaign hub. Anyone with no campaigns lands on the empty state.
- The Engine dashboard stays reachable from the menu.
- The side menu gains the current campaign name with the same switcher, so you can change campaign from any page.

## Technical notes

- Migration: add `asset_status jsonb not null default '{}'` to `public.campaigns` (keys: social_posts, landing_page, lead_magnet, email_sequence, image_pack; values: generating | ready | complete). Additive only.
- `src/lib/campaigns.functions.ts`: include `asset_status` in the selected columns; add `setCampaignAssetStatus` (auth-scoped, validates key and value) and `getLatestCampaign`.
- `src/routes/_authenticated/campaign.$id.tsx`: rebuild as the hub — top bar, switcher (reuses `listCampaigns`), status grid, skeleton while loading, `CampaignEngineModal` mounted for "New Campaign +".
- `src/routes/_authenticated/campaign.index.tsx`: redirect to the latest campaign, or render the empty state when there are none.
- Post-login: change the `/` signed-in redirect (`src/routes/index.tsx`) to `/campaign`, preserving the existing `session_id` / `canceled` search params.
- `src/components/WorkflowNav.tsx`: add a compact current-campaign switcher above the pillars, sharing one `CampaignSwitcher` component with the hub.
- "Open" links carry `?campaign=<id>` to the target route; targets that already read a filter param honour it, others simply ignore it for now.
- Statuses are client-driven: launching a campaign sets the selected assets to "generating", then to "ready" after the timed window. No fake data is written into posts, pages or guides.