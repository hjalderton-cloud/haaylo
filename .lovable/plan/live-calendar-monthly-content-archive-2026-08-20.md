# Live calendar + monthly content archive

## 1. Calendar is anchored to today

- Opens on the current month every time (it already does, but you can currently page back into the past).
- Days before today are greyed out: no click-to-schedule, no drop target, dimmed styling and a "past" look.
- Today gets a highlighted ring so it's obvious where you are.
- The back arrow stops at the current month; forward paging still covers the 90-day window ahead.
- Posts already scheduled on past days stay visible (read-only) so history is intact.

## 2. End-of-month wrap-up into the Content Bank

- When a month has finished, everything scheduled in it gets filed into the Content Bank as a single collection, e.g. "September 2026".
- Happens automatically when you open the Calendar or Content Bank and a completed month hasn't been filed yet, and there's a manual "Wrap up <month>" button on the calendar for control.
- Filed items keep the caption, title, platform, pillar and the date it was scheduled for.
- Wrapping up is idempotent — running it twice never duplicates items.
- The original calendar entries stay where they are; the bank copy is the reusable archive.

## 3. Reuse, repurpose and refresh in the Content Bank

- New "Month" filter in the Content Bank so you can jump straight to "September 2026", "October 2026" etc.
- Each archived post gets two actions:
  - **Repurpose** — opens Posts & Captions with the Repurpose tab pre-filled with that post, so you can spin it into other formats.
  - **Refresh with Brain** — rewrites the post against your current Business Brain (offer, voice, objective), so older content is brought up to date. The refreshed version is saved as a new bank item; the original is never overwritten.

## Technical notes

- `src/routes/_authenticated/calendar.tsx`: clamp `cursor` to the current month minimum, compute `isPast` per cell, block `onDrop`/click handlers and drag-over styling for past days, add the wrap-up button.
- New server function `archiveMonthToBank` in `src/lib/content.functions.ts`: takes `{ year, month }`, reads `content_posts` for that month with a `scheduled_at` in the past, and inserts into `content_bank_items` with `collection = "<Month> <Year>"`, `kind = "post"`, and `meta.source_post_id` for dedupe. Existing rows with the same `source_post_id` are skipped.
- Archived posts are moved to `status: 'published'` only if they were `scheduled` and their date has passed; nothing is deleted.
- `src/routes/_authenticated/bank.tsx`: collection dropdown populated from distinct `collection` values, plus the two new item actions.
- **Refresh with Brain** reuses the existing generation path with the current brain context and the archived body as source, then `saveToBank` with the same collection and a "refreshed" tag.
- **Repurpose** navigates to `/engine` and posts an `engine:repurpose` message that `public/engine/index.html` handles by switching to the Repurpose tab and filling the source textarea.
