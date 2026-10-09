# Four-hub navigation

Fold every screen into four permanent sidebar hubs. Nothing is deleted — each tool moves into a tab, and its old address quietly redirects to the new place so bookmarks and in-app links keep working.

The light look stays (off-white pages, navy text, purple and pink accents), with more padding and breathing space across the hub pages.

## The sidebar

The sidebar loses all groups, accordions and flyouts. It shows exactly four items, plus the workspace picker and the smaller "New Campaign" button that already sit above it:

```text
🏠  Home
📂  Campaigns
🧠  Business Brain
⚙️  Settings & Integrations
```

## Hub 1 — Home

A toggle at the top right: `[ ✨ Agent Briefing ]` | `[ 🛠️ Manual Engine ]`, remembered between visits.

- **Agent Briefing** (default): today's greeting, the "What are we working on?" input, quick-start chips, the staged loader, the recommendation and the four-card asset row after a build. Underneath, the agent's own tabs: Goals, Approvals, Post Queue, Agent Calendar, Agent Analytics, Agent Settings.
- **Manual Engine**: today's focus, recent activity, content and lead numbers, quick links, and one **Insights & Analytics** card block merging campaign, content and lead analytics into a single summary grid.

## Hub 2 — Campaigns

The list of campaigns, and inside an open campaign three tabs:

1. **Overview & Asset Gallery** — the four asset cards (Email, Social, Image, Blog), the timeline rail, the "Built by Haaylo" brief panel, and the existing per-asset editors and actions.
2. **Lead Generation** — landing page builder, pop-up and embed snippets, the Gojiberry connection, and the lead capture and tracker tables.
3. **Content Studio & Scheduler** — Content Bank, Content Hub / repurposing, idea generator, brainstorm, and the schedule and publish calendar.

Tabs 2 and 3 default to the campaign you are in, with a "Show everything in this workspace" switch on each table and list.

The image generator keeps no page of its own — it opens inside the post editor drawer, as it does now.

## Hub 3 — Business Brain

Four tabs: **Brand DNA** (profile, logos, brand colours, brand assets), **Niche Persona Builder**, **90-Day Strategy Plan**, **Competitor Radar**.

## Hub 4 — Settings & Integrations

Account and billing, workspaces, connected channels, and the one-click Mailchimp bridge.

## Where each current page ends up

| Today | New home |
| --- | --- |
| /bank, /tools, /ideas, /repurpose, /calendar, /engine#m=chat | Campaigns › Content Studio & Scheduler |
| /funnel, /landing, /leads, /magnet, /snippets | Campaigns › Lead Generation |
| /analytics/campaigns, /analytics/content, /analytics/leads | Home › Manual Engine › Insights |
| /brain/setup, /brand-assets | Business Brain › Brand DNA |
| /personas, /plan, /competitors | Business Brain › own tabs |
| /agent/* | Home › Agent Briefing |
| /account, /connect, /projects, /automations | Settings & Integrations |
| /image, /hashtags, /caption-variator, /trends, /history | Kept, reached from inside the editor or the Content Studio tab, not the sidebar |

## Technical notes

- `NAV_GROUPS` in `src/components/WorkflowNav.tsx` collapses to a flat four-item list; the flyout submenu, group-collapse state and `useActiveNav` group logic are replaced by simple path matching. `ContextBar` breadcrumbs and `MobileTabs` follow the same four hubs.
- Hub pages are new thin route files (`/brain`, `/settings`) that render a tab bar and mount the **existing** page components unchanged — no screen is rewritten, so no generation, saving or workspace-scoping logic moves.
- Old routes become redirects to `?tab=` on the owning hub. No route file is deleted outright.
- Campaign-scoped filtering passes the campaign id into the existing list queries as an optional filter, with a local toggle to clear it. No schema change, no new tables, no API renames.
- Pro gating on the agent tabs stays exactly as it is.

## Checks before done

Typecheck and the test suite pass; every old address lands on the right tab; the four hubs render at desktop and phone widths; content, leads and calendar still show the right rows with the filter on and off.
