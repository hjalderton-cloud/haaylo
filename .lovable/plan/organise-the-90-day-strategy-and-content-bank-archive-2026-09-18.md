# Organise the 90-day strategy and Content Bank archive

## Agreed direction
- Browse the strategy by **month, then week**.
- Automatically file **all Content Bank posts created more than 30 days ago**, including drafts, into an archive.
- Keep future scheduled posts in the active bank, regardless of their age.
- Preserve the light palette, navy text, campaign links and workspace separation. Nothing is deleted or automatically published.

## 1. A clearer 90-day strategy
Replace the long weekly list with three expandable sections:

```text
90-day strategy
  Strategy overview · goal · content pillars
  Month 1 — Weeks 1–4
    Week 1 — theme · focus · pillar · linked campaign
    Week 2 …
  Month 2 — Weeks 5–8
  Month 3 — Weeks 9–12 (and Week 13 when present)
```

- Keep the strategy overview short; put detailed pillar descriptions in an expandable section.
- Each month shows its week range and linked campaigns without repeating campaign names unnecessarily.
- Each week has a compact summary; expand it for the full focus and existing editing controls.
- Open Month 1 initially and remember expanded sections per workspace. Do not invent a current month or calendar dates.
- Preserve existing generation, editing, saving and campaign navigation. Do not regenerate or rewrite the strategy during this reorganisation.
- Keep all saved weeks visible, including a thirteenth week if present. Month labels are planning sections, not dated calendar months.

## 2. Active content and Archive inside Content Bank
Add **Active content** and **Archive** tabs, each with an accurate count for the selected workspace and filters.

### Automatic filing
- Use the original creation date and a rolling 30-day cutoff, including drafts, approved posts and published posts.
- Exclude anything scheduled for a future date from the archive.
- Determine the correct section whenever content is loaded; refresh the classification while the page stays open so ageing content moves without a manual filing task.
- Editing an older item does not reset its age.
- Items with missing or invalid dates stay active rather than disappearing.

### Archive organisation
- Group by **creation month/year → campaign → phase**, newest month first.
- Use **Standalone content** for items without a campaign and a neutral group for items without a phase.
- Retain the existing campaign, platform, pillar and status filters; hide empty groups.
- Archived posts retain their text, images, carousel slides, campaign links and existing editing/reuse actions.
- Scheduling an archived item for a future date puts it back in Active content automatically.
- Keep the existing campaign/phase grouping in Active content.

## 3. Protect existing workflows
- Archiving changes where a post appears in Content Bank only. Campaign pages, calendar history, publishing queues and analytics keep their existing records and behaviour.
- Never infer publication from a scheduled date having passed.
- Do not copy posts into a second library or create duplicate records.
- Saved Snippets remains a separate library; this change applies to the posts displayed in Content Bank.
- No automatic deletion, plan-history archive, new scheduling automation or publishing changes are included.

## Technical approach
Source review confirmed:
- The strategy currently renders a flat weekly timeline with campaign links. Generation requests 12 weeks, while validation allows 13; preserve both shapes without changing generation rules.
- Content Bank displays `content_posts`; Saved Snippets uses the separate `content_bank_items` table.
- An unused monthly archive helper copies posts into the snippets table and can mark scheduled posts as published. Do **not** wire that helper into this feature.

Implementation:
- Add small month/week presentation components around the existing strategy data, preserving original week indexes during editing.
- Add a shared, tested age-classification helper and archive grouping for Content Bank. No schema change or background job is needed because filing is derived from existing dates.
- Keep archive filtering specific to Content Bank rather than changing shared fetchers used by campaigns and the calendar.
- Verify the actual scheduling fields and statuses used by the publishing flow before implementing the future-schedule exception.
- Require the selected, owned workspace for all reads and actions; include workspace identity in cached and remembered state.

## Verification
- Test month grouping with 12 weeks, 13 weeks and incomplete plans; verify editing updates the correct week.
- Test posts just below, exactly at and above the 30-day boundary, old drafts, future scheduled posts and invalid dates.
- Check archive counts and filters, standalone content, campaign/phase groups, images and carousel preservation.
- Verify switching workspaces never retains another workspace’s content or open-state assumptions.
- Check strategy and archive interactions on phone and desktop, including no horizontal overflow.
- Run relevant regression tests and inspect the platform build result before reporting completion.

Publishing is separate and will only happen when requested.
