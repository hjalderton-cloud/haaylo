# Drag-and-drop scheduling: what exists and what's missing

Partly. The Schedule & Publish calendar already lets you drag a post from the right-hand queue onto the calendar, with highlight-on-hover drop zones and an instant save. What it does not do is the confirmation flow you described.

## Already working
- Draft posts in the side panel are draggable; already-scheduled chips can be dragged too.
- Dropping onto a day slot saves the schedule, moves the post out of the queue, and queues it to connected accounts.
- The existing click-to-open editor flow for setting date and time is untouched.
- On phones the calendar grid is replaced by a simple list, so dragging isn't used there.

## Missing (to build)
1. Time picker on drop. Right now a drop lands in a fixed morning/afternoon/evening slot and saves immediately. Add a small popover on the dropped day: "What time?", defaulting to 9:00am, with a "Confirm schedule" button. Nothing saves until Confirm is pressed; Cancel returns the post to the queue.
2. Past-date guard. Dropping on a day/time already gone shows an inline message "You can't schedule to a past date — try a future date" and does not save.
3. Clash warning. If another post already sits at that exact date and time, the popover shows "You already have a post at this time — schedule anyway?" with Confirm and Change time buttons.
4. Explicit mobile lockout. Below 768px, dragging is turned off outright (not just visually hidden), leaving click-to-schedule as the only route.

## Technical notes
- All changes sit in `src/routes/_authenticated/calendar.tsx`. Replace the immediate `applySchedule` call inside `onDropCell` with pending-drop state (`postId`, `date`, `slot`), rendered as a popover anchored to the target day cell.
- Reuse the existing `applySchedule` for the actual save, so optimistic update, rollback and Zernio queuing behaviour stay identical.
- Clash detection compares the composed ISO timestamp against existing `scheduled_at` values for the same project.
- Mobile lockout via a `matchMedia("(max-width: 767px)")` check that sets `draggable={false}` and skips drop handlers.
- No database, server function, or schema changes.
