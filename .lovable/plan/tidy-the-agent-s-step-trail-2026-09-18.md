# Tidy the agent's step trail

## No — that isn't right

Each step is printing everything it read or wrote as raw code. "Fetch brand context" dumps your entire Business Brain — offers, CTAs, bridge lines — as a wall of JSON that runs past the edge of the card and pushes the page sideways. It's the agent's internal plumbing on show, and it buries what actually matters: which step ran, whether it worked, and whether anything needs your approval.

## What it should look like

Each step becomes one calm line:

```text
Read your Brand DNA                    Done
Read your 90-day plan                  Done
Drafted 3 LinkedIn posts               Waiting on you   [Approve] [Turn down]
```

- A plain-English name for each step instead of the internal tool name (read your Brand DNA, read your 90-day plan, wrote a campaign, drafted posts, saved to the Content Bank, scheduled a post, and so on).
- A short result line where there's something worth saying — "3 posts drafted", "campaign created" — rather than the full record.
- The raw detail stays available behind a "Show details" toggle, closed by default, inside a box that scrolls on its own and can't stretch the page.
- Steps waiting on you keep the Approve and Turn down buttons exactly where they are.

Nothing changes about what the agent does or what gets approved — only how the trail reads.

## Technical detail

In `src/routes/_authenticated/agent/goals.tsx`:
- Add a `TOOL_LABEL: Record<string, string>` mapping each registry tool name to a plain label, with a fallback of the name with underscores replaced.
- Add `summariseResult(toolName, result)` returning a short string for the common shapes (counts of posts/emails, a campaign title, a saved item's title), and `""` when there's nothing useful — no JSON in the summary line.
- Replace the always-rendered `<pre>{JSON.stringify(...)}</pre>` inside `ToolContent` with a `CodeBlock`-style box constrained by `max-h-64 overflow-auto` and `min-w-0`, and truncate the serialised payload at ~4,000 characters with a trailing note.
- Keep `<Tool defaultOpen={false}>`; move the status label and approval buttons into the row above the collapsible so they stay visible when details are closed.

**Check before done:** typecheck and the test suite, then screenshots of a goal with completed steps at 390px and desktop width, confirming each step reads as one line, details open and close, and there's no sideways scroll.
