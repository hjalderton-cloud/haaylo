# Fix: "The agent couldn't put a plan together"

## What's actually wrong

I reproduced it against your own Haaylo brand profile. The model answers correctly every time — the plan comes back complete, with the title, goal, audience, channels, angle and asset list. The app then throws it away on a technicality.

The brief asks for the asset list as separate lines ("5 LinkedIn posts", "3 emails", "1 landing page"). The model instead returns them as one sentence:

```text
"assetSummary": "5 LinkedIn posts, 3 Instagram posts, 1 landing page, 3 email sequence, 1 image pack."
```

The app only accepts a list there, so the whole plan is rejected and you get the generic "couldn't put a plan together" message. Rewording the brief can't help — the wording of the brief isn't the problem.

The same all-or-nothing rejection would also fire if the model wrote the length as "30 days" instead of "30-day", named a channel outside the five allowed, or ran slightly over a length limit.

## The fix

**1. Accept what the model sends.** Before checking the plan, tidy it:
- an asset summary written as a sentence is split on commas into separate lines;
- a length written as "30 days", "1 month", "3 months", "13 weeks" etc. is read as 30-day or 90-day;
- channels are matched to the five supported ones and anything else dropped;
- over-long text is trimmed rather than rejected.

**2. One retry.** If a plan still can't be read, the agent is asked once more with a short correction naming what was wrong, before giving up.

**3. Say what happened.** If it genuinely fails twice, the message names the reason — no answer from the AI, credits, or a plan that couldn't be read — rather than blaming your wording. The raw reason is logged server-side so the next report is diagnosable.

## Technical detail

All in `src/lib/agent-brief.functions.ts`:
- New `coerceBlueprint(raw: unknown)` runs before `blueprintSchema.safeParse`: `assetSummary` string → `String.split(/[,\n•]/)` trimmed and filtered; `duration` normalised via a regex on digits (≤45 → "30-day", else "90-day"); `channels` filtered against `CHANNELS` case-insensitively; `title`/`goal`/`theme`/`audience`/`grounding` truncated to their schema maxima.
- `parseBlueprint` returns a discriminated result (`{ ok, blueprint }` or `{ ok: false, reason }`) instead of throwing a single generic string; `planBrief` retries `callGateway` once with an appended correction line quoting the reason, then throws a message naming the failure mode.
- `console.error` of the reason plus the first 400 characters of the raw reply on each failure, so the server-function logs show the cause.
- No schema, UI, route or workspace-scoping change; `blueprintSchema` stays the contract, the coercion only feeds it.

**Check before done:** typecheck and the existing tests; then run a real brief end to end against this workspace and confirm a blueprint comes back, including one deliberately malformed reply to prove the retry and the clearer message.
