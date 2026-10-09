# Fix the two broken Campaigns menu links

Both highlighted links point at the wrong place.

## What's wrong

- **Lead Magnets** — this page no longer exists on its own. It immediately bounces to the Lead Capture page, so the link is a dead duplicate of the "Lead Capture" item just above it.
- **Pop-up Snippets** — this opens the Saved Snippets library, which is saved content, not pop-up code. The actual pop-up and embed code lives inside Lead Capture, under "Embed & Connect".

## The fix

1. Remove **Lead Magnets** from the Campaigns section. The lead magnet builder is still reachable through Lead Capture exactly as it is today.
2. Remove **Pop-up Snippets** from the Campaigns section, and add **Saved Snippets** to the Content section instead, where that page belongs.

Campaigns is then: All Campaigns, Lead Capture, Landing Pages, Lead Tracker.

## Technical notes

- Changes are limited to the hub definitions in `src/components/HubTabs.tsx`.
- No routes are deleted: `/magnet` keeps its redirect to `/funnel` and `/snippets` keeps working, so any existing links or bookmarks still resolve.
- Checks before done: typecheck, the full test run, and a click through each remaining Campaigns link plus the new Content link on desktop and phone widths.
