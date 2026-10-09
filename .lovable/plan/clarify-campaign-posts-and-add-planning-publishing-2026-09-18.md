# Clarify campaign posts and add Planning & Publishing

## Campaign output

The campaign page will treat posts as real campaign output, rather than a planned “Social Posts” item.

- Remove the separate “Social Posts” / “30-Day Post Schedule” tile that currently appears from the campaign’s selected asset flag before any post rows exist.
- Rename the social preview card and post panel to **Campaign Posts**.
- Read and count only posts whose saved campaign ID matches the open campaign, using the existing campaign asset query.
- When no linked posts exist, show **No campaign posts generated yet** rather than implying posts have been created.
- Once generation finishes, show the real first post preview, real post count and the existing editable list.
- Remove the example likes and comments from the campaign post preview, because they are not live figures.
- Keep email, image, blog, landing-page and guide outputs unchanged.

## New main menu section

Add a sixth expandable sidebar section: **Planning & Publishing**.

It will contain:

- **Content Calendar** — the visual drag-and-drop calendar at `/calendar`
- **Schedule a Post** — the connected-channel composer at `/scheduler`
- **Publishing Queue** — opens the scheduler directly on its queue view
- **Connected Channels** — opens the scheduler directly on its connections view

The scheduler will accept a small `tab` link setting so these menu items open the correct existing view. No publishing logic or connection behaviour changes.

## Content and campaign tidy-up

- Remove Schedule & Publish from the Content dropdown so it has one clear home.
- Rename the campaign’s **Content studio & scheduler** tab to **Content studio**.
- Remove its duplicate Schedule & Publish shortcut; campaign posts keep their existing **Approve & schedule** action, which leads into Planning & Publishing.
- Move calendar and scheduler path matching to the new section so breadcrumbs and active highlighting are correct.
- Keep Content History inside Content because it records generated marketing work rather than publishing jobs.

## Phone behaviour

- Keep all six main sections permanently reachable in the bottom menu.
- Use a six-column phone bar with short labels and stable icon sizing.
- Tapping Planning & Publishing opens its dropdown in the existing drawer, matching every other section.
- Ensure the drawer scrolls and the page has no sideways overflow.

## Boundaries

- No database or campaign-generation changes.
- Existing posts, campaigns, schedules, connections and routes remain intact.
- No new publishing service is introduced; the new menu links organise the existing tools.

## Checks

- Verify a campaign with no generated posts shows the empty campaign-post state and no false completed tile.
- Verify a campaign with linked posts shows only those posts and the correct count.
- Check Content Calendar, Schedule a Post, Publishing Queue and Connected Channels open the intended views.
- Check all six dropdowns and bottom-menu items at desktop and phone widths.
- Run the full typecheck and test suite.
