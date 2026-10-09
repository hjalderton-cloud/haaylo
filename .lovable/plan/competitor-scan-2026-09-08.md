# Competitor Scan

A new working screen under Strategy that reads a competitor's public website, compares what they publish against your Brand DNA and 90-day pillars, and hands back angles you can act on.

## What you'll see

**Competitor Scan** — "Point Haaylo at any competitor and surface the content gaps you can own."

- A box for the competitor's name or website, a dropdown for their main platform (LinkedIn, Instagram, Facebook, All platforms), and a **Scan competitor** button.
- Scanning reads their homepage and a few obvious pages (about, blog, services) and takes roughly 15–25 seconds. If the site can't be read — no address given, blocked, or offline — the scan still runs from the name and niche and says so on the results.
- Results appear as four cards:
  1. **Topics they're missing** — 4–6 topics or angles they aren't covering, judged against your audience.
  2. **Content gaps by pillar** — your gaps mapped onto the pillars in your 90-day plan, with the pillar holding the most open space called out. If that client has no plan yet, Haaylo proposes pillars from the Brand DNA and labels them as suggestions.
  3. **Tone & positioning gap** — one paragraph on how your voice can sit differently to theirs.
  4. **Recommended content angles** — 3–5 angles you can own, each with **Create post from this angle**, which opens New Post in Content Tools with that angle already written into the brief.
- Every card has **Use this angle**, which saves that card's content to your Content Bank as an idea, tagged to the competitor, so it's there when you plan.
- **Previous scans** sits below the input, collapsed by default: competitor name, date, and **View results** to load that scan back into the cards.

Scans are saved per client workspace, so switching clients shows that client's history.

## Technical notes

- Migration `0016_create_competitor_scans.sql`: `competitor_scans` with `id`, `user_id`, `project_id`, `competitor_name`, `competitor_url`, `platform`, `results_json`, `created_at`; grants for `authenticated`/`service_role`, RLS scoped to `auth.uid()`, index on `(user_id, project_id, created_at desc)`. Regenerate Supabase types afterwards.
- `src/lib/competitors.functions.ts` (authenticated server functions):
  - `scanCompetitor` — resolves the workspace, fetches the competitor's pages with the timed-fetch + html-to-text helpers already used by `trends.functions.ts` (short per-page timeout, best effort, no page-level failure aborts the scan), loads Brand DNA from `business_brains`/`brand_brain` and pillars from `strategy_plans`, calls the Lovable AI gateway for one strict JSON payload (topics, pillar gaps, tone paragraph, angles, plus a `siteRead` flag), stores the row, returns it.
  - `listCompetitorScans` / `getCompetitorScan` — history for the selected workspace.
  - `saveAngleToBank` — writes a `content_bank_items` row (`kind: "idea"`, tags `["competitor-scan"]`, meta carrying the scan id and competitor).
- `src/routes/_authenticated/competitors.tsx` replaces the placeholder: form, loading state, four result cards, collapsible history, workspace-change handling via the existing `CLIENT_CHANGED_EVENT`, and unique head metadata.
- "Create post from this angle" writes the angle to `sessionStorage` under `haaylo:post-topic` and navigates to `#m=content&t=post`, mirroring the existing `haaylo:repurpose` handoff; `public/engine/index.html` gains the matching read of that key on load.
- Gateway failures map to plain messages (busy, out of credits, try again) rather than raw errors; UK English throughout the copy and the prompt.
