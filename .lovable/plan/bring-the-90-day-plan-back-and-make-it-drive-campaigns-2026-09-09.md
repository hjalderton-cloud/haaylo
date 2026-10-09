# Bring the 90-day plan back and make it drive campaigns

Your 90-day plan was never deleted. It is still saved against your workspace and the page still works at `/plan` — it just lost its sidebar link when the five-pillar navigation was rebuilt, so there was no way to reach it. Campaign generation was built separately and never reads the plan, which is the disconnect you are feeling.

## 1. Put the plan back under Strategy

- Add "90-Day Plan" to the Strategy group in the sidebar, directly under Brand DNA.
- The page itself is unchanged: pillars, weekly themes, timeline, edit and save all work as before, scoped to the selected workspace.

## 2. The plan drives campaign content

When a campaign generates posts, it will be given your plan's pillars and the themes of the weeks the campaign covers, so:

- Post pillars come from your own pillar names rather than generic labels.
- Topics and angles follow the weekly themes instead of being invented fresh.
- If no plan exists for the workspace, generation behaves exactly as it does today.

## 3. Campaigns become chapters of the plan

- A new campaign asks which stretch of plan weeks it covers (e.g. weeks 5–8), defaulting to the weeks nearest today, and it can be left blank.
- The Campaign Hub shows the covered weeks and their themes, with a link through to the plan.
- The 90-Day Plan page shows, against each week, which campaign owns it — so the plan reads as the spine and campaigns as chapters, with any uncovered weeks visible.

## Technical notes

- `WorkflowNav.tsx`: add `{ id: "plan", label: "90-Day Plan", to: "/plan" }` to the `strategy` group. Route `src/routes/_authenticated/plan.tsx` already exists.
- Migration: add nullable `campaigns.plan_week_start` and `campaigns.plan_week_end` (integer, 1–13). Additive only.
- `src/lib/campaign-generate.functions.ts`: load `strategy_plans` for the campaign's project (same pattern as `agent.server.ts:128`), and inject pillar names, descriptions and the covered weeks' themes into the post prompt alongside the existing Brand DNA and phase context. Constrain the returned `pillar` to plan pillar names when a plan exists.
- `src/lib/campaigns.functions.ts`: accept and return the week range; validate start <= end.
- `CampaignEngineModal.tsx`: week-range selector on the basics step, prefilled from the plan's current week; optional.
- `campaign.$id.tsx`: covered-weeks strip with themes and a link to `/plan`.
- `plan.tsx`: fetch the workspace's campaigns and badge each week row with its campaign.
