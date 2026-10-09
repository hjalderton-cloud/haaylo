# Post images in the Content Bank

Post cards currently show a small "no image" dot and no way to add one. This adds a proper image zone to every card and to the post editor, with both AI generation and file upload.

## What you'll see

### On every post card

**No image yet** — a dashed box across the bottom of the card (80px tall) with two buttons:
- **Generate image** — writes an image from that post's own words, in your brand colours
- **Upload image** — file picker for PNG, JPG or WebP up to 10MB

The box lifts slightly on hover so it reads as clickable. While an image is being written or uploaded, the box shows progress in place.

**Image attached** — a thumbnail across the card (120px tall, cropped to fill). Hovering shows two small buttons on top of it:
- **Replace** — the same Generate / Upload choice
- **Remove** — asks "Remove this image from the post?" first

The little image marker in the row of pairing icons turns solid when an image is attached.

### In the post editor

A new **Post image** section under the caption box, same two states: dashed zone with Generate and Upload, or a large preview (up to 240px tall) with **Replace** and **Remove** underneath.

### Generating

Generate reads the post's caption and title, applies your Brand DNA (name, industry, colours, tone) and the post's platform, and picks the shape to suit: square for Instagram, landscape for LinkedIn and Facebook. The result attaches to the post straight away, and there's a **Try again** option if the first one isn't right. A link to the full Image Generator stays available for anyone who wants finer control.

### Uploading

The file is checked for type and size, uploaded with a 0–100% progress bar, and attached on success. Anything rejected says why in plain words.

Attaching, replacing or removing an image saves that image against the post immediately so it survives a refresh — the caption, title and schedule still only save when you press Save or Schedule, exactly as now.

## Technical detail

**Naming.** The request mentions `social_posts.paired_image_url`, `strategy_profile` and a `brand-assets` bucket. This project stores posts in `content_posts` with existing `media_url` and `media_path` columns, brand settings in `business_brains.data`, and files in the private `scheduler-media` bucket. The existing columns and bucket are used — no new column and no schema migration is needed, and nothing else that reads `media_url` (calendar, scheduler, Zernio publishing) breaks.

**Server work** in `src/lib/image.functions.ts` and a small addition to `src/lib/content.functions.ts`:
- `generatePostGraphic` already turns a caption into a brand-aware image and stores it. Extend it with an optional `platform` so the prompt requests 1:1 for Instagram and 16:9 for LinkedIn/Facebook, and keep the year-long signed URL it already returns.
- New `uploadPostImage` server function: validates mime type (`image/png`, `image/jpeg`, `image/webp`) and 10MB limit, stores at `{user_id}/post-images/{post_id}/{uuid}.{ext}` in `scheduler-media`, returns path plus signed URL.
- New `setPostImage` server function: writes `media_url` and `media_path` (or nulls both on Remove) for a post the caller owns.

**Client work:**
- New `src/components/content/PostImageZone.tsx` holding both states, the generate/upload actions, the hover overlay, the remove confirmation and the progress bar. Used by the card and by the editor with a `size` prop.
- `src/routes/_authenticated/bank.tsx`: render the zone at the bottom of each card, add it to `EditForm` under the caption, and update local post state on change so the card and editor refresh instantly. The pairing icon already keys off `media_url`, so it fills automatically.
- Upload progress uses `XMLHttpRequest` against the server route so real percentages can be shown rather than a fake bar.

**Not changed:** publishing, scheduling and campaign generation keep reading `media_url` as they do today.
