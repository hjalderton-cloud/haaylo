# Final quality calibration before the weekly agent

No new screens or modules. Weekly automatic operation is not started.

## 1. Re-run the outstanding Haaylo test
Run Build My Marketing for Haaylo, goal "Recruit 25 Founding Members". Check and report:
- regular posts generate (JSON retry works)
- campaign and regular posts use different angles, with the overlap score for each pair above the threshold
- planned channel vs actual channel for every post
- existing calendar posts before and after the run are unchanged (count and IDs compared)

## 2. Cut unnecessary "needs review" flags
- Pull every Very Nice Blinds post flagged in the last run from the database, along with its stored violations.
- Sort each trigger into: unsupported fact, banned brand wording, AI/slop wording, formatting, or wrongly flagged.
- Fix the checker so that:
  - formatting problems (hashtag count, line breaks, length a little out of range) get repaired automatically and no longer go to review
  - known AI phrases get swapped automatically rather than flagged
  - phrases that just look like claims ("free consultation", "made to measure", facts already in the Brand DNA) are checked against saved workspace facts before being flagged
- Real unsupported facts (invented prices, numbers, testimonials, contact details) still go to review.
- Report the before and after counts.

## 3. Keep the global banned list tight
- Go through the global list. Only generic AI constructions and clichés stay. Ordinary marketing words (for example "transform") come off.
- Each workspace's own banned words stay in its Brand DNA.

## 4. Feature and offer availability
- Add an availability marker to the existing Products & services field, so no new system is needed. Each line can be tagged Available / Beta / Coming soon / Unavailable. Untagged lines count as Available, so existing data still works.
- Add one optional "Coming soon / not offered" box under Products & services in Brand DNA. Owners list planned features, integrations and services here.
- The shared brand context gets a clear block: AVAILABLE NOW, IN BETA (say "in beta"), COMING SOON (never present as live), NOT OFFERED (never mention). If the status is unknown, the wording stays cautious.
- Fill in Haaylo's entry: Canva and Mailchimp listed as coming soon. This is a data update and needs your OK on the list.

## 5. Check product and service claims
Add a check to the compliance engine that compares the copy with the availability lists:
- a coming-soon or not-offered item described as available now ("connect your Mailchimp", "now includes") is flagged. The engine rewrites it once, and if that fails it goes to review
- integrations not on the available list are flagged
- "included" or "free" services that aren't in the saved offers are flagged
- delivery or turnaround promises ("in 48 hours", "within 2 weeks") that don't match a saved fact are flagged
This runs everywhere the engine already runs, including campaign guides and landing pages.

## 6. Better first drafts
- Count which repairs and flags happened most often across recent drafts, using stored compliance data.
- Turn the top recurring ones into a short "avoid these" block in the shared brand context. Every writer then gets it once, without its own copy of the rules.
- Compliance stays as the final check.

## 7. Final live tests
Run Haaylo (Recruit 25 Founding Members) and Very Nice Blinds & Shutters (Drive autumn enquiries). For each, report: total assets, passed first time, auto-repaired, needs review, images needing approval, repeated angles, channel mismatches, unsupported claims caught, and planned-vs-live confusion. Confirm that nothing was scheduled or published.

## 8. Readiness report
Answer the four questions: beta ready, what still needs your judgement, whether quality is good enough for weekly preparation, and the risks left to deal with first.

## Technical details
- `brand-compliance.server.ts`: split `PLATFORM_RULES` failures into repairable (auto-fix: trim hashtags, insert breaks) and blocking. Add a `knownFacts` allow-list from the brain to the claim detector. Add `checkAvailability(text, brain)`. Trim the global banned list.
- `brain-schema.ts`: add an optional `business.unavailable_or_planned` field plus a `parseOffers()` helper that reads `[beta]`/`[coming soon]`/`[unavailable]` tags in products_services.
- `brand-context.server.ts`: add the availability block, and a "common slips" block built from recent `meta.compliance` violations (cached per request, top 8).
- Results are stored as test scripts in /tmp. No schema migration is needed, because the brain is JSON.
