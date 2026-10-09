# Schedule & Publish workspace

Rebuild `/calendar` as a full-screen scheduling workspace: a draggable content bank on the left, a visual calendar in the middle, and a split editor with live platform previews. Dropping a post sets its date and time and queues it for live publishing to connected accounts.

## Left: Asset Repository panel

- Vertical scrollable panel listing unscheduled posts for the selected workspace and campaign.
- Grouped under their content pillar (Authority, Promotion, Value, etc.), each group collapsible with a count.
- Each card shows: caption snippet, thumbnail of the paired image (placeholder tile when none), platform icon, and a small "Link" badge when a landing page is attached.
- Filters at the top: campaign, platform, search.
- Cards are draggable with native HTML5 drag and drop onto the calendar.

## Middle: Visual calendar

- Month view and Week view toggle, with month/year stepper and "Today".
- Each day cell has three drop zones: Morning (09:00), Afternoon (13:00), Evening (18:00). Dropping into a zone sets that time; the exact time can be edited afterwards in the editor.
- Dropping a card saves the schedule, marks the post Scheduled, and queues it to the connected accounts for that platform. If no matching account is connected, the post is still scheduled and the card shows a "not connected" warning with a link to Connect accounts.
- Chips inside cells: grey Draft, indigo Scheduled, green Published. Chips are draggable between slots to reschedule, and dragging back to the panel unschedules.
- Skeleton placeholders while a new month or week loads; the previous month stays visible until the new one is ready.

## Right: Editor and preview drawer

Opens when a card or chip is clicked, as a sliding right-hand drawer.

- Left half — workbench: editable caption, pillar and platform selectors, date and time fields, image thumbnail, Save / Schedule / Unschedule / Delete.
  - Platform Variator: quick actions to shorten for X, add line breaks for LinkedIn, and add a hook plus hashtags for Instagram, reusing the existing Caption Variator wording rules.
  - Link Injector: appends the campaign's live landing page URL (haaylo.com/p/...) to the caption.
- Right half — simulator: LinkedIn / Instagram / Facebook tabs rendering the post in each platform's native frame, with account name and avatar from Brand Assets, correct text clamping and "see more", and the right image aspect for each platform.

## Responsive behaviour

- Desktop: fixed 7-column grid that cannot break, panel and calendar side by side.
- Under 768px: the grid collapses to a chronological feed list of upcoming scheduled posts, the asset panel becomes a sheet opened by a button, and scheduling uses a date/time picker instead of drag and drop.

## Technical notes

- Data stays in `content_posts` (`scheduled_at`, `status`, `pillar`, `campaign_id`, `paired_landing_page_id`, `media_url`) — no schema change needed.
- New `src/lib/schedule.functions.ts` with authenticated functions for listing posts in a date range, scheduling/rescheduling/unscheduling a post, and queueing it live; live queueing reuses the existing scheduler/Zernio path (`savePost`, `scheduleWithZernio`) and records the queue result on the post's `meta` so failures are visible without blocking the schedule.
- New components under `src/components/schedule/`: `AssetPanel`, `CalendarGrid`, `PostChip`, `PostEditorDrawer`, `PlatformPreview`.
- `/calendar` is rewritten in place; the sidebar label under Content becomes "Schedule & Publish" and the route stays `/calendar` so existing links keep working.
- Optimistic UI on drop with rollback and a toast if the save fails.
