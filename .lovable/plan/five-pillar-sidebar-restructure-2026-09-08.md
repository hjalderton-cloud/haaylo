# Five-pillar sidebar restructure

Replace the whole sidebar menu with five pillars, a primary "New Campaign" button, and a locked AI Agent item at the bottom. Routing and labelling only — no existing page logic changes.

## New sidebar, top to bottom

1. Haaylo logo — links to home.
2. New Campaign — filled pink button, full sidebar width, opens the Campaign Engine.
3. STRATEGY — Brand DNA, Competitor Scan, Persona Builder
4. DESIGN — Brand Assets, Image Generator
5. LEADS — Landing Pages, Lead Capture, Lead Tracker
6. CONTENT — Content Bank, Content Tools, Content Calendar
7. INSIGHTS — Campaign Analytics, Content Performance, Lead Analytics
8. AI Agent — single item, lock icon for standard tier
9. Account avatar / initials at the very bottom, dropdown: Profile, Settings, Billing, Sign out

Each pillar is collapsible; the open pillar and the current page are both highlighted, as they are today.

## Where each item points

Existing pages reused:
- Brand DNA → Strategy Profile setup
- Image Generator → the current image page
- Landing Pages → landing pages list
- Lead Capture → lead funnel builder
- Lead Tracker → lead inbox
- Content Bank, Content Tools, Content Calendar → existing pages

New placeholder pages (Haaylo-styled panel, heading and a short "in build" note, nothing else):
- Competitor Scan, Persona Builder
- Brand Assets
- Campaign Analytics, Content Performance, Lead Analytics
- Campaign Engine (target of the New Campaign button)

Pages no longer listed in the sidebar stay live and reachable by direct link: 90-Day Plan, Content Pillars, Brand Voice, Connected Accounts, Scheduling, Automations, Projects, History, Director, First post, Welcome.

## Technical notes

- Rewrite `NAV_GROUPS` in `src/components/WorkflowNav.tsx` with the five pillars plus the agent group; keep the existing flyout/collapse behaviour, `useActiveNav`, `useGroupState`, `useAgentLocked` and `AccountMenu` as they are.
- Add the New Campaign button inside `WorkflowSidebar` above the pillar list (or in `AppShell` directly under the wordmark), styled with the pink accent.
- Ensure the wordmark in `src/components/AppShell.tsx` is a link to `/`.
- New route files under `src/routes/_authenticated/`: `campaign.tsx`, `competitors.tsx`, `personas.tsx`, `brand-assets.tsx`, `analytics.campaigns.tsx`, `analytics.content.tsx`, `analytics.leads.tsx`, each with its own `head()` metadata and an `AppShell` wrapper.
- Reuse existing nav icon assets; no new artwork.
- Mobile menu uses the same component, so it picks up the change automatically.
