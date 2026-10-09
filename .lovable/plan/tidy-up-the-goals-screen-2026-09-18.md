# Tidy up the Goals screen

## What it looks like now

The Goals screen is cluttered. The same goal is listed five times, four of them stuck on "Running" from earlier test sessions. And when you open a goal, its wording appears twice — once in the "Working on" card and again in the list right below it. The step-by-step trail shows under every goal even when nothing is happening.

## The tidy-up

**Progress shows only while something is happening.** The step trail and live conversation appear only for a goal that is actually running or waiting on your approval. Completed, stopped and failed goals collapse to one line — status, wording, and what it finished with. You can still open one to see what it did.

**One wording, one place.** The goal's text stays in the list row. The live panel keeps just the status, the Stop button, and whatever needs your approval — it no longer repeats the goal above it.

**Stuck goals stop pretending to run.** When the page loads, any goal still marked Running that hasn't moved in 15 minutes is quietly marked Stopped, so the list tells the truth. Continue still works on those.

**You can clear the list.** Each goal row gets a small Remove so you can delete duplicates and dead runs yourself. Removing a goal deletes it and its step trail, but never anything the agent actually created (posts, campaigns, approvals already actioned stay where they are).

Nothing changes about what the agent does, approvals, or any other screen.

## Technical detail

- `src/lib/agent-goal.functions.ts`:
  - New `deleteGoal` server fn: workspace-scoped, deletes the goal row; `agent_goal_steps` rows go with it via the existing `goal_id` cascade (verified — the FK is `on delete cascade` in 0026). Approvals rows are left untouched.
  - `listGoals` handler: before returning, mark any `status = 'running'` goal with `updated_at` older than 15 minutes as `paused` (same update shape as `cancelGoal`), scoped to the user and workspace. Cheap, no migration needed.
- `src/routes/_authenticated/agent/goals.tsx`:
  - GoalRun panel: remove the repeated goal text; header becomes status + Stop/Continue only.
  - Step trail + conversation render only when `detail.status === 'running'` or any step is `awaiting_approval`; otherwise the panel shows the goal's summary line (or "Stopped — press Continue in the list to pick it back up").
  - Goal rows: add a Remove button next to Continue, with a confirm toast/second click. After removal, if it was the active goal, clear the panel.

## Checks before done

Typecheck, full test suite, then screenshots at 390px and desktop: one running goal (steps visible), one completed goal (single line, expands), a stuck goal flipped to Stopped on load, and Remove clearing a duplicate.
