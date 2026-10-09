# Prompt-to-tweak image editing

## Goal
Let people describe an image change in plain English wherever Haaylo shows generated artwork, then replace only that selected image with a revised, on-brand version.

## User experience
- Add a compact **Tweak image** action beside the existing image controls.
- Open an inline prompt field with clear examples such as “make the desk brighter”, “use fewer objects”, or “change the background to navy”.
- Show **Apply tweak** and **Cancel**, with a clear working state while the revised image is produced.
- Keep the current image visible until the revised version succeeds. A failed request leaves the original untouched and shows the gateway’s safe error message.
- Save the successful revision in the same place as the original so it remains after refresh.

## Coverage
- Content Bank and post editor images, including the screen shown.
- Each carousel slide from both the thumbnail strip and full-size viewer.
- Campaign image-pack artwork.
- Landing-page hero and feature images.
- Lead-magnet cover artwork.

## Brand and editing rules
- Require the explicitly selected, owned workspace for every request; never infer or switch workspace.
- Apply the selected workspace’s Brand DNA, palette, typography direction, logo and saved brand-guideline references to every revision.
- Send the current image and the user’s instruction together, preserving its subject and composition unless the instruction says otherwise.
- For carousel slides, keep the existing editable text, logo and layout layers. Prompted visual changes update the relevant editable design properties rather than flattening the slide into an uneditable picture.
- Do not alter other carousel slides, page copy, campaign content or saved originals when one image is tweaked.

## Implementation
- Reuse and harden the existing prompt-based image refinement action rather than creating a second editing path.
- Add a shared prompt editor component so controls, validation, loading and error behaviour stay consistent.
- Extend saved-image update actions only where required to persist revised URLs and paths for campaign, landing-page and lead-magnet image fields.
- Keep all current Generate, Regenerate, Replace, Upload, Studio and Remove actions.
- Preserve existing routes, schemas, tiers and backend action names; no database migration is planned.

## Verification
- Test workspace ownership, prompt validation, safe failure handling and successful persistence.
- Confirm a revision uses the correct workspace’s Brand DNA and never changes another workspace’s asset.
- Check post, carousel, campaign, landing-page and lead-magnet flows on desktop and mobile.
- Confirm carousel Studio editing still works after a prompted tweak and all untouched slides remain unchanged.
