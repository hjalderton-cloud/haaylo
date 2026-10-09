# Rename "Content Tools" to "Content Hub"

There is no separate "Content Hub" page — the page the user means is the existing Content Tools screen (the 2x2 grid: Plan Posts, New Post, Repurpose Content, Generate Ideas), already at `/tools` and already linked in the sidebar under Content. The job is a label change only.

## Changes

- `src/components/WorkflowNav.tsx` — change the Content pillar item label from "Content Tools" to "Content Hub" (same `/tools` route, same icon).
- `src/routes/_authenticated/tools.tsx` — update the on-page heading/subheading to say "Content Hub" so the menu and the page match.
- Check for any other visible "Content Tools" text (e.g. campaign hub links) and update those labels too.

## No changes to

- The route path (`/tools` stays, so existing links keep working).
- Any functionality — labelling only.

## Verify

- `bunx tsgo --noEmit` passes.
- `/tools` loads and the sidebar shows "Content Hub" under Content, highlighted when active.
