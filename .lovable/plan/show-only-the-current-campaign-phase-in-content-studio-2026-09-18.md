# Show only the current campaign phase in Content Studio

## What will change

For 30-day campaigns, the **Content Studio** panel will show only posts belonging to the campaign phase displayed in the phase banner.

- Phase 1 banner → only Phase 1 campaign posts
- Phase 2 banner → only Phase 2 campaign posts
- Phase 3 banner → only Phase 3 campaign posts
- Phase 4 banner → only Phase 4 campaign posts

The heading will read **Phase 1 campaign posts (6)**, for example, rather than the confusing combined **Social posts (24)**.

## Behaviour

- Advancing or manually changing the campaign phase refreshes the list immediately.
- Posts from earlier and later phases remain saved and available in the Content Bank; they are simply hidden from this phase-specific campaign view.
- If the current phase has no posts, show **No campaign posts generated for Phase X yet** with the existing phase-generation control nearby.
- Campaigns without launch phases continue to show all posts linked to that campaign.
- The overview’s Campaign Posts preview will use the current phase for a 30-day campaign, so its count and first preview match Content Studio.

## Technical notes

- Include the saved phase number from each campaign post’s metadata in the existing campaign-assets response.
- Pass the campaign’s resolved current phase into the asset grid and campaign panels.
- Filter after the existing strict campaign-ID query; no unlinked Content Bank posts can enter the campaign view.
- No data will be deleted or rewritten, and no database change is needed.

## Checks

- Confirm the Founder member launch shows Phase 1 posts only while its banner is on Phase 1, rather than all 24 Phase 1 and Phase 2 posts.
- Advance to Phase 2 and confirm the list switches to Phase 2 content.
- Check a phase with no posts shows the correct empty message.
- Check a 90-day campaign still shows all its linked campaign posts.
- Run the full typecheck and test suite, then verify at desktop and phone widths.
