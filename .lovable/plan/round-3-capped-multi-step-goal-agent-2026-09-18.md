# Round 3 — Capped multi-step goal agent

## Goal
Turn the agent from a single-shot drafter (the Briefing Room builds one campaign
from one brief) into a **goal-driven agent** that takes a natural-language goal,
plans a short sequence of registry tool calls itself, and executes them — reads
and drafts autonomously, anything riskier paused for your approval. It reuses the
existing tool-registry runners and approval queue; it duplicates no generation
logic and changes no schema, tier, manual screen, or existing route.

This is the "capped multi-step planning" step on the roadmap. Absorbing the
weekly planner into this loop is a later round.

## Architecture

A streaming chat route + `useChat` UI, because a multi-step reasoning run
routinely takes minutes and a buffered server function would be severed by the
hosting timeout. Bytes flow the whole time (reasoning summary + tool activity),
which is what survives those timeouts. The model is `openai/gpt-6-astra` on the
gateway Responses API (the enforced default), with reasoning on and tool
calling.

```
/agent/goals  (new tab under AI Agent)
   │  useChat  ──POST /api/agent-goal (streaming SSE)──►  server route
   │                                                        │
   │  renders: reasoning, tool calls, inline approvals       ├─ auth: bearer token (Supabase)
   │                                                        ├─ workspace ownership check
   │                                                        ├─ loads Brand DNA + strategy (grounding)
   │                                                        ├─ streamText, openai/gpt-6-astra, Responses
   │                                                        │    tools = registry runners, stopWhen stepCountIs(12)
   │                                                        ├─ LOW tools execute directly
   │                                                        ├─ MEDIUM/HIGH tools → needsApproval (inline)
   │                                                        └─ every executed step logged → agent_goal_steps
```

## What gets built

### 1. Schema (additive migration `0025_agent_goals.sql`)
Two new public tables, both RLS + grants (auth + service_role), no changes to
existing tables:

- `agent_goals` — id, user_id, project_id, goal text, status
  (`running`|`paused`|`completed`|`failed`), summary, created_at, updated_at.
- `agent_goal_steps` — id, goal_id (cascade), user_id, project_id, tool_name,
  input jsonb, status (`ok`|`awaiting_approval`|`approved`|`rejected`|`error`),
  result jsonb, error, approval_id (→ agent_approvals, nullable), created_at.

One row per executed tool call = the universal run trail. The existing
`agent_approvals` table is reused unchanged for any MEDIUM/HIGH action the agent
proposes (the inline approval also writes a row there for the audit).

### 2. Streaming route `src/routes/api/agent-goal.ts`
`createFileRoute` with a `server.handlers.POST`. It:
- Reads the Supabase bearer token from the `Authorization` header (same pattern as
  `src/routes/api/post-image.ts`), verifies the user, builds a user-scoped client.
- Reads `workspaceId` + the chat `messages` from the body; verifies the caller
  owns the workspace (reuses `assertOwnedWorkspace`).
- Loads Brand DNA + 90-day strategy via the registry runners (`runFetchBrandContext`,
  `runFetchStrategy`) for grounding.
- Builds the Responses provider (`@ai-sdk/openai` `createOpenAI`, gateway baseURL,
  `Lovable-API-Key`, run-id fetch wrapper from `ai-sdk-lovable-gateway`) and calls
  `streamText` with `lovable.responses("openai/gpt-6-astra")`, reasoning `low`,
  `store:false`, `include:["reasoning.encrypted_content"]`, `stopWhen: stepCountIs(12)`.
- Defines tools from the registry. Each tool's `execute` calls `executeTool`
  (from `runners.server`) with the user's ctx and persists a `agent_goal_steps`
  row. LOW-risk tools run straight through; MEDIUM/HIGH tools carry
  `needsApproval: true` so the model's call pauses for an inline yes/no, and on
  approval their execute also writes an `agent_approvals` row (reusing
  `requestToolApproval`'s shape) so the existing Approvals tab shows it.
- System prompt enforces the house writing rules (UK English, banned filler,
  no antithesis, plain British voice) and tells the agent the workspace is fixed.
- Returns `toUIMessageStreamResponse({ sendReasoning: true })` wrapped with the
  run-id header helper.

### 3. Goal CRUD server functions `src/lib/agent-goal.functions.ts`
`createServerFn` (auth + workspace check): `createGoal`, `listGoals`,
`getGoal` (goal + its steps), `resumeGoal` (continue a paused goal), `cancelGoal`.
These power the Goals tab and any non-streaming reads.

### 4. Goals tab `src/routes/_authenticated/agent/goals.tsx`
New route under the AI Agent tab bar. Light theme (reuses `@/lib/theme`). Shows:
- A "What do you want Haaylo to work towards?" input + Start button.
- Active/past goals as cards: goal text, status pill, step trail (tool name →
  outcome), link to any pending approval.
- The live agent panel: `useChat` against `/api/agent-goal` with a custom
  transport that attaches the Supabase bearer token. Renders reasoning summary,
  tool-call activity (which tool, inputs, result), and inline approve/reject
  controls for MEDIUM/HIGH tool calls. Matches the Briefing Room's calm light
  palette and Poppins type.

### 5. Nav
Add `{ to: "/agent/goals", label: "Goals" }` to the AI Agent tab bar in
`agent/route.tsx` (after Home). No other nav changes.

## Packages
Install `ai`, `@ai-sdk/openai`, `@ai-sdk/react` (none currently present). zod v4
is already installed; on AI SDK v5 zod tool schemas work on Responses, but tool
input schemas must be strict-compatible (every property required, optional
fields nullable) per the Responses contract.

## Caps & safety
- Hard step cap: `stepWhen: stepCountIs(12)`.
- Workspace is fixed for the whole run; the agent cannot switch it (the system
  prompt states it, and every tool's execute re-checks ownership).
- LOW tools (reads + `create_social_content` draft) run on the agent's authority.
- MEDIUM/HIGH tools pause for inline approval; their execute only runs after the
  user says yes, and the approval is also recorded in `agent_approvals`.
- Writing rules enforced in the system prompt (same banned list / UK English as
  `agent.server.ts`).
- No abort-on-timer; cancel is a user action (the Stop control) → 499.

## Verification
- `bunx tsgo --noEmit` passes.
- Playwright: signed in, open `/agent/goals`, submit a goal, confirm the route
  connects, the reasoning/tool stream renders, and the **current 402 "not enough
  credits" state is surfaced cleanly** (this proves auth, workspace scoping,
  provider wiring and error handling end-to-end). A full successful multi-step
  run needs the workspace's AI credits topped up first — that's an owner action,
  not a code fix, so I'll flag it and verify the happy path once credits exist.
- The two HIGH-severity owner-side monitoring findings (AI credits 402, invalid
  Stripe key) are not blockers for this build; they're flagged separately.

## Out of scope (later rounds)
- Absorbing the weekly planner (`agent.server.ts` runWeeklyPlan) into the goal loop.
- Autonomy settings / tier pricing changes.
- Light-passing the public marketing pages.
- The scheduler-upload storage fix and guest-project UX (offered separately).
