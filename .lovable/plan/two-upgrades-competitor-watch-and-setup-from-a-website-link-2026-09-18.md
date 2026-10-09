# Two upgrades: competitor watch and setup from a website link

Both are additive. Nothing existing moves, no routes or data are removed.

## 1. Set up your Business Brain from a website link

Today the auto-fill on Brand DNA only accepts an uploaded document. You'll also be able to paste a link — your own site, an About page, or a blog post — and Haaylo reads it and suggests values for the same Strategy Profile fields.

- A "Or paste a link" box sits beside the existing upload button on the Brand DNA setup page.
- Haaylo reads the page (plus obvious sub-pages like /about and /services when you give the homepage) and suggests field values.
- Suggestions appear in exactly the same review panel as the document version — nothing is saved to your profile until you press save.
- If the site can't be read (login wall, blocked, empty), you get a plain message and the upload route still works.
- The uploaded-document path is untouched.

## 2. Competitor watch, weekly, suggestions only

You pick competitors to keep an eye on. Once a week Haaylo re-reads them and, if something has moved, it tells you and proposes a response post. It writes nothing on its own — no drafts, no calendar entries.

- On the Competitors page, each scan gains a "Watch weekly" toggle, plus a list of watched competitors with when they were last checked.
- A check runs automatically when a watched competitor hasn't been looked at for seven days and you open Haaylo, and you can press "Check now" at any time.
- When the new read differs from the last one, Haaylo records a signal: what changed, which of your pillars it touches, and a suggested response-post angle.
- Signals show in two places: a "Competitors have moved" card on Home, and a Signals section on the Competitors page.
- Each signal has two buttons: "Save as an idea" (goes to the Content Bank as an idea, as competitor angles already do) and "Dismiss".
- Nothing changed means no signal and no noise.

## Technical notes

- Shared site reader: lift the existing `readSite`/`htmlToText`/`timedFetch` helpers out of `src/lib/competitors.functions.ts` into `src/lib/site-read.server.ts`; both features use it. Behaviour of the current scan is unchanged.
- New server fn `extractBrainFromUrl` in `src/lib/brain-extract.functions.ts`, mirroring `extractBrainFromDocument`: same `BRAIN_SECTIONS` field list, same system prompt and schema filtering, text input instead of base64. URL input added to the auto-fill card in `src/routes/_authenticated/brain.setup.tsx`.
- Migration `competitor_watch`:
  - `competitor_watch` (id, user_id, project_id NOT NULL, competitor_name, competitor_url, platform, enabled bool, last_checked_at, last_fingerprint text, created_at) — unique on (project_id, competitor_url/name).
  - `competitor_signals` (id, user_id, project_id, watch_id FK cascade, summary, pillar, angle_title, angle_brief, status text default 'new', created_at).
  - RLS on both scoped to `auth.uid()`, plus `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated` and `GRANT ALL ... TO service_role`.
- New `src/lib/competitor-watch.functions.ts`: `listWatches`, `setWatch`, `runWatchCheck` (re-reads the site, hashes the extracted text as the fingerprint, only calls the AI when the hash differs, writes at most one signal per check), `listSignals`, `dismissSignal`. Saving an idea reuses the existing `saveAngleToBank`.
- All reads and writes take an explicit owned `projectId`; no default-workspace fallback.
- Weekly trigger is visit-based (stale > 7 days, fired once per session in the background) plus the manual button — no background scheduler is added.
- AI calls go through the existing Lovable gateway helper and the same UK-English writing rules.
- Light palette, Poppins, navy headings, purple primary, pink accents throughout.

## Out of scope

- No automatic drafting or calendar scheduling from competitor signals.
- No changes to existing scans, the Content Bank, or the plan.
