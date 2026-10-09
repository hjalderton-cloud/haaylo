# Bring Brand Assets into the Design Studio

## Goal
Make the Design Studio use the active workspace’s saved Brand Assets consistently, wherever the studio is opened.

## Changes
- Pass the saved primary, secondary and accent colours into the studio instead of reading the older empty colour field. Very Nice Blinds will therefore show black, yellow and pink rather than Haaylo’s default navy, purple and yellow.
- Pass the saved typography choice into the studio and make it the default for new text and studio templates.
- Keep the saved logo available through **+ Logo**, with clearer wording if that workspace has no logo.
- Add a **Brand assets** picker inside the studio containing the reusable graphics saved in the Brand Assets library. Clicking one will add it to the canvas as a movable, resizable image.
- Apply the same brand kit when the studio opens from a post, campaign image, carousel slide or the Image Generator page.
- Preserve the existing canvas editing, template, export and save behaviour.

## Technical details
- Extend the studio inputs to accept the saved font preference and the workspace’s image assets.
- Build the colour string from `primary_color`, `secondary_color` and `accent_color`, while retaining the older combined colour field as a fallback.
- Update each studio entry point to load and pass the same normalised brand kit.
- Keep signed asset URLs scoped to the active workspace; no database change is required.

## Checks
- Open a Very Nice Blinds image in the studio and confirm the palette is black, yellow and pink.
- Add the saved logo and drag it to a new position.
- Add a reusable Brand Asset, resize and reposition it, then save the image.
- Repeat from the Image Generator and a post/carousel entry point to confirm consistent results.
