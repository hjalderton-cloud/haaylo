# AI Agent: a self-contained section

Build the AI Agent as its own walled-off area with five screens. Nothing it produces shows up in the Content Bank, the calendar, the home dashboard or the insights screens, and nothing it produces goes live until you approve it.

## Access

Pro and above get in. Standard tier sees the AI Agent item in the sidebar with a lock; clicking it opens the upgrade prompt. Today the feature matrix only unlocks the agent for Expert while the sidebar lock allows Pro — these are brought into line on Pro.

## The five screens

**Agent Home** — this week at a glance: posts generated, posts scheduled, leads captured, engagement summary. Below that, an activity feed in plain sentences ("Agent generated 3 LinkedIn posts from your strategy profile", "Agent scheduled 2 posts for Tuesday", "Agent flagged 1 post for your review"), newest first.

**Agent Queue** — every post the agent has written, waiting on you. Each card shows platform, pillar and the full post preview, with two actions:
- Approve and schedule — opens a date and time picker; the post is only scheduled once you confirm.
- Reject — removes it from the queue, with an optional reason box that is stored as a learning note so later runs lean away from it.
Generation draws on the Strategy Profile, Brand Voice and 90-Day Plan for the selected workspace. Nothing is ever scheduled on its own.

**Agent Calendar** — the same split layout as the standard calendar (queue on the left, month grid on the right), but showing agent posts only. Every scheduled entry is labelled "Scheduled by AI Agent — approved by [name] on [date]".

**Agent Analytics** — performance of approved agent posts by platform (impressions, clicks, engagement rate), best performing pillar this month, best performing day and time, and a short recommendation drawn from those figures. Where a platform gives us no figures, the screen shows a dash rather than a guess.

**Agent Settings** — posts per week slider (1–7), a toggle per platform, an optional tone override that replaces the default Brand Voice for agent writing only, and a pause switch that stops new generation until resumed.

## Separation

Agent posts live in their own store. They do not appear in the Content Bank, the standard calendar, the home dashboard or the Insights screens. Only on approval is a copy pushed to the publishing queue for the connected account, and it stays tagged as agent-approved.

## Technical notes

- New tables: `agent_posts` (user_id, project_id, run_id, platform, pillar, caption, title, status draft/approved/rejected/scheduled/published, reject_reason, scheduled_at, approved_by, approved_at, external ids, media fields) and `agent_metrics` cache; extend `agent_settings` with `tone_override` and `paused`. Each table gets GRANTs plus owner-scoped RLS.
- `src/lib/agent.server.ts` `runWeeklyPlan` writes to `agent_posts` instead of `content_posts`, and pulls Brand Voice plus 90-Day Plan alongside the Brain. Auto-queue-on-generate is removed: approval is the only path to the publish queue.
- New `src/lib/agent-queue.functions.ts`: list queue, approve (validates time, writes to `scheduled_posts` via existing `agent-publish.server` helpers, records approver), reject (writes `agent_learnings`), plus home stats and analytics aggregations reusing the Zernio metric matcher.
- Routes under `src/routes/_authenticated/agent/`: `route.tsx` (tier gate + agent-only sub-nav), `index.tsx`, `queue.tsx`, `calendar.tsx`, `analytics.tsx`, `settings.tsx`, each with its own head metadata. The current `/agent` settings page becomes `/agent/settings`.
- Agent screens use their own components under `src/components/agent/`; no imports from bank/calendar/insights modules beyond shared primitives (AppShell, cards, PlatformIcon).
- `tier.ts`: `agent: true` for `pro`, `FEATURE_UNLOCK_TIER.agent = "pro"`; sidebar keeps the single locked AI Agent entry pointing at `/agent`.
- Existing content-bank filters gain an explicit exclusion so no legacy agent-sourced drafts leak in.
